# Sherlog — PRD v3

## HackTheBreak 2026 | March 13–15

---

## One-liner

Self-contained AI log intelligence pipeline: ingest logs → ML anomaly scoring → tiered LLM cascade → agent investigates your codebase → incident report delivered to Discord before you know something's wrong.

## What makes this different

Enterprise tools (Rootly, IncidentFox, Coroot) require mature observability stacks. Sherlog needs nothing but raw log input. No existing tool combines built-in ML scoring with a tiered LLM agent that reads your codebase, packaged as a single `docker compose up`.

## Integration tiers

- **CLI (zero code changes)** — `tail -f app.log | Sherlog watch`
- **SDK (3 lines)** — lightweight HTTP wrapper for serverless (Firebase, Lambda)
- **Webhook** — generic `POST /api/ingest` for CI/CD, GitHub Actions, anything

---

## Architecture

```
Log sources → Ingestion (FastAPI + Pydantic) → Pre-filter → ML scorer (IsolationForest)
  ↓                                                              ↓
  All events via WebSocket → Dashboard (Vercel)         Tier routing:
                                                    <0.3: archive
                                                  0.3-0.7: cheap model (Flash/Haiku)
                                                    >0.7: reasoning model (Sonnet/GPT-4o)
                                                              ↓
                                                     Agent framework
                                                   (read_file, grep, git_blame, search_logs)
                                                              ↓
                                                     Incident report → Discord + Dashboard
```

---

## Shared data contract

```python
# shared/models.py — Pydantic models
class LogEvent(BaseModel):
    id: str                          # uuid4
    timestamp: str                   # ISO 8601
    source: str
    level: str                       # debug|info|warn|error|fatal
    message: str
    raw: Optional[str]
    metadata: LogMetadata            # service, host, container_id
    pipeline: PipelineState          # anomaly_score, tier, filtered, filter_reason, tier_model
    incident: Optional[IncidentReport]  # report, root_cause, severity, code_refs[], suggested_fix
```

---

## Event bus (non-blocking)

**Fix from v2:** `bus.emit()` must NOT block the ingestion request. Long-running subscribers (investigation) run as background tasks.

```python
# shared/events.py
class EventBus:
    async def emit(self, event_type: str, data: dict):
        """Non-blocking: wraps async subscribers in create_task()."""
        for callback in self._subscribers.get(event_type, []):
            if asyncio.iscoroutinefunction(callback):
                asyncio.create_task(callback(data))  # Fire and forget
            else:
                callback(data)
        # Push to WebSocket clients
        for ws in self._ws_clients:
            try: await ws.send_json({"type": event_type, "data": data})
            except: self._ws_clients.remove(ws)
```

Ingestion returns immediately after scoring. The cascade runs in the background.

---

## LLM tier routing

| Score | Tier | Model | Action |
|---|---|---|---|
| < 0.3 | Low | None | Archive |
| 0.3–0.7 | Medium | Gemini Flash / Haiku | Triage: escalate or dismiss |
| > 0.7 | High | Sonnet / GPT-4o | Full investigation with agent |

**Fix from v2:** When a batch of medium logs escalates, send ONE investigation with all logs as context — not N separate investigations.

---

## Agent security (Docker isolation)

Pipeline container: `read_only: true`, `cap_drop: ALL`, `no-new-privileges`, non-root user, repo volume mounted `:ro`.

Agent tools: `subprocess.run` with 10s timeout, path traversal prevention, 60s total investigation timeout.

**Fix from v2:** Repo sync does NOT happen inside the pipeline container. A separate `repo-sync` sidecar has write access to the volume.

---

## Docker Compose services

| Service | Image | Purpose | Notes |
|---|---|---|---|
| `caddy` | caddy:2 | Reverse proxy + auto TLS | Exposes :443, proxies to pipeline:3001 |
| `pipeline` | python:3.12-slim | FastAPI, ML, LLM cascade, agent | Read-only, non-root, repo volume :ro |
| `dummy-app` | node:20-slim | Next.js e-commerce with chaos modes | Writes JSON logs to stdout |
| `log-forwarder` | python:3.12-slim | Sidecar: reads dummy-app logs → POSTs to pipeline | Keeps ingestion path clean |
| `traffic-gen` | node:20-slim | Simulates user traffic | Hits dummy-app endpoints |
| `repo-init` | alpine/git | Clones repo into volume (no --depth 1) | Runs once at startup |
| `repo-sync` | alpine/git | GitHub webhook → git pull | Write access to repo volume |

**Fix from v2:** Caddy handles TLS so dashboard can connect via `wss://`. Log forwarder is a sidecar, not baked into dummy-app's CMD. Repo clone has full history for git blame.

---

## Foundational work (team together, ~2 hours)

1. **Shared schema** — `shared/models.py` with Pydantic models (30 min)
2. **Event bus** — `shared/events.py` with non-blocking emit (30 min)
3. **FastAPI skeleton** — main.py with WebSocket, CORS, route mounting (30 min)
4. **Repo structure** — monorepo with directories per person (15 min)
5. **Docker Compose skeleton** — all services as stubs, `docker compose up` works (30 min)
6. **GCP instance** — Compute Engine with Docker, firewall rules open (30 min)

After this, everyone works independently against the shared interfaces.

---

## Team breakdown

| Person | Track | Delivers |
|---|---|---|
| 1 | Ingestion + ML + CLI | FastAPI routes, parser, filters, IsolationForest scorer, heuristic fallback, CLI tool, **wires log buffer for Person 2** |
| 2 | LLM cascade + agent | Tier router, cheap triage, reasoning investigation loop, agent tools (read/grep/blame/log search), prompts |
| 3 | Dashboard | Next.js on Vercel, WebSocket client (`wss://`), log stream, incident feed/detail, agent activity, stats bar |
| 4 | Integrations + deploy + dummy app | Dummy app with chaos modes, log-forwarder sidecar, Caddy config, Discord webhook, repo-sync sidecar, Docker Compose, GCP deploy, demo script |

**Dependency note:** Person 1 imports `add_to_log_buffer` from Person 2's executor (or move buffer to `shared/`) so `search_logs` tool works.

---

## Demo flow

**Primary path:** Docker sidecar ingestion (self-contained, reliable).

1. Show dashboard — empty, connected via `wss://`
2. Start stack — healthy logs flow, all green, filters working
3. Trigger chaos: `curl -X POST .../api/chaos/db-leak`
4. Watch cascade: scores climb → cheap model triages → escalation → agent investigates
5. Incident report appears on dashboard AND Discord simultaneously
6. Walk through report: root cause, code refs, suggested fix
7. **Separately** show CLI: "Here's how you'd add this to your own app: `docker logs -f my-app | Sherlog watch`"
8. Architecture explanation: tiered cascade, cost savings, security model

---

## Milestones

- **Sat morning:** Foundation done, everyone working independently
- **Sat evening:** Each track has core functionality working in isolation
- **Sat night:** Integration — wire everything together, end-to-end smoke test
- **Sun morning:** Full demo working, CLI working, rehearsed 2-3x, backup video recorded
- **Sun 11 AM:** Devpost submission
