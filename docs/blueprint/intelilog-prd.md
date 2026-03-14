# InteliLog — Product Requirements Document (v2)

## HackTheBreak 2026 | March 13–15

---

## Overview

InteliLog is a self-contained, AI-powered log intelligence pipeline that ingests application logs, scores them for anomalies using a built-in ML model, and routes significant events through a tiered LLM cascade. The top-tier model has agent capabilities to explore the application's source code — running git blame, grepping files, and reading code — to produce full incident reports with root cause analysis, delivered to developers via Discord before they even know something is wrong.

### The problem

Developers drown in logs and alerts. Traditional monitoring tools (Grafana, Datadog, Prometheus) are great at collecting data and detecting that something is unusual, but they leave interpretation to humans. A developer gets woken up at 3 AM with "pod-xyz memory exceeded threshold" and spends 20 minutes digging through logs, correlating events, and reading code to figure out what happened.

### Our approach

We separate **detection** from **interpretation**. A lightweight ML model handles anomaly detection (is this unusual?), and an LLM cascade handles reasoning (what does this mean, what caused it, and who needs to know?). The key architectural idea is a **tiered model cascade** that's cost-conscious — most logs get filtered before touching an LLM, medium-anomaly logs go through a cheap/fast model, and only serious events reach a powerful reasoning model with agent capabilities.

### What makes this different

Enterprise tools like Rootly, IncidentFox, and Coroot exist in this space, but they're designed for large SRE teams with mature observability stacks requiring PagerDuty, Datadog, and complex integrations. InteliLog is **self-contained** — it needs nothing but raw log input. No existing tool combines built-in ML scoring with a tiered LLM agent that can investigate your codebase, packaged as a single deployable unit.

### Integration philosophy

InteliLog meets developers where they are with three integration tiers:

- **CLI (zero code changes)** — pipe any log source into `intelilog watch`. Works for VPS, Docker, Kubernetes, local dev.
- **SDK (3 lines of code)** — lightweight HTTP wrapper for serverless environments (Firebase Functions, AWS Lambda, Vercel Functions).
- **Webhook (any HTTP client)** — generic `POST /api/ingest` endpoint. Wire it into GitHub Actions, CI/CD pipelines, or any tool that can make an HTTP POST.

---

## Target user

Indie developers, small teams, and startups running applications without enterprise monitoring budgets. Anyone who has a deployed app producing logs and wants intelligent alerting without setting up a full observability stack.

---

## System architecture

```
                        ┌──────────────────────────┐
                        │      Integration tier     │
                        │                           │
                        │  CLI:  app | intelilog    │
                        │  SDK:  log.error(...)     │
                        │  Hook: POST /api/ingest   │
                        └────────────┬─────────────┘
                                     │
                                     ▼
                   ┌─────────────────────────────────┐
                   │   Log ingestion + parsing        │
                   │   (FastAPI, Pydantic validation)  │
                   └─────────────────┬───────────────┘
                                     │
                                     ▼
                   ┌─────────────────────────────────┐
                   │   Rule-based pre-filter          │
                   │   (health checks, debug, noise)  │
                   └─────────────────┬───────────────┘
                                     │
                                     ▼
                   ┌─────────────────────────────────┐
                   │   ML anomaly scorer              │
                   │   (scikit-learn isolation forest) │
                   └─────────────────┬───────────────┘
                                     │
                    ┌────────────────┼───────────────┐
                    ▼                ▼               ▼
                 ARCHIVE        CHEAP LLM      REASONING LLM
                (score<0.3)   (Flash/Haiku)   (Sonnet/GPT-4o)
                              0.3 – 0.7         score>0.7
                                  │                 │
                                  │ escalate?       ▼
                                  └──────►  Agent framework
                                            • read_file
                                            • grep_code
                                            • git_blame
                                            • git_log
                                            • list_files
                                            • search_logs
                                                │
                                                ▼
                                        Incident report
                                        ┌───────┴──────┐
                                        ▼              ▼
                                    Discord       Dashboard
                                    webhook       (Vercel)
```

---

## Foundational work (before splitting into tracks)

This section defines what the team builds together before anyone goes off to their individual track. Budget 2–3 hours for this phase. Everything here is a dependency for parallel work.

### 1. Shared data contract (30 min)

Agree on the exact JSON schema for a log event. Every component produces or consumes this shape. Define it as a Pydantic model so it's enforced at the API boundary.

```python
# shared/models.py
from pydantic import BaseModel, Field
from typing import Optional
from uuid import uuid4
from datetime import datetime

class LogMetadata(BaseModel):
    service: Optional[str] = None
    host: Optional[str] = None
    container_id: Optional[str] = None

class PipelineState(BaseModel):
    anomaly_score: Optional[float] = None
    tier: Optional[str] = None          # "low" | "medium" | "high"
    tier_model: Optional[str] = None
    filtered: bool = False
    filter_reason: Optional[str] = None

class CodeRef(BaseModel):
    file: str
    line: int
    blame_author: Optional[str] = None
    blame_date: Optional[str] = None
    blame_commit: Optional[str] = None

class IncidentReport(BaseModel):
    report: str
    root_cause: Optional[str] = None
    severity: str = "unknown"           # "low" | "medium" | "high" | "critical"
    code_refs: list[CodeRef] = []
    suggested_fix: Optional[str] = None

class LogEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    source: str = "unknown"
    level: str = "info"
    message: str
    raw: Optional[str] = None
    metadata: LogMetadata = LogMetadata()
    pipeline: PipelineState = PipelineState()
    incident: Optional[IncidentReport] = None
```

Put this in a `shared/` directory that all components import from.

### 2. Event bus (30 min)

Set up the internal pub/sub mechanism that connects Person 1 → Person 2 → Person 3 → Person 4. For the hackathon, use an `asyncio.Queue` based approach with named channels.

```python
# shared/events.py
import asyncio
from typing import Callable, Dict, List

class EventBus:
    def __init__(self):
        self._subscribers: Dict[str, List[Callable]] = {}
        self._ws_clients: list = []

    def subscribe(self, event_type: str, callback: Callable):
        if event_type not in self._subscribers:
            self._subscribers[event_type] = []
        self._subscribers[event_type].append(callback)

    async def emit(self, event_type: str, data: dict):
        # Call local subscribers
        for callback in self._subscribers.get(event_type, []):
            if asyncio.iscoroutinefunction(callback):
                await callback(data)
            else:
                callback(data)

        # Push to all WebSocket clients (for dashboard)
        message = {"type": event_type, "data": data}
        for ws in self._ws_clients:
            try:
                await ws.send_json(message)
            except:
                self._ws_clients.remove(ws)

    def register_ws(self, ws):
        self._ws_clients.append(ws)

    def unregister_ws(self, ws):
        if ws in self._ws_clients:
            self._ws_clients.remove(ws)

bus = EventBus()
```

### 3. FastAPI app skeleton (30 min)

Set up the main FastAPI application with the WebSocket endpoint, CORS for the Vercel dashboard, and the basic route structure.

```python
# main.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from shared.events import bus

app = FastAPI(title="InteliLog")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Lock down in production
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    bus.register_ws(ws)
    try:
        while True:
            await ws.receive_text()  # Keep connection alive
    except WebSocketDisconnect:
        bus.unregister_ws(ws)

# Person 1 mounts their ingestion routes
# Person 2 mounts their cascade routes (if needed)
# Person 4 mounts their webhook routes
```

### 4. Repository structure (30 min)

Set up the monorepo and make sure everyone can run the stack locally.

```
intelilog/
├── shared/
│   ├── models.py          # Pydantic schema (LogEvent, IncidentReport)
│   ├── events.py          # EventBus
│   └── config.py          # Environment variables, constants
├── pipeline/
│   ├── ingestion/         # Person 1
│   │   ├── server.py      # FastAPI routes for /api/ingest
│   │   ├── parser.py      # Log parsing + normalization
│   │   └── filters.py     # Rule-based pre-filter
│   ├── scoring/           # Person 1
│   │   ├── scorer.py      # IsolationForest wrapper
│   │   ├── features.py    # Feature extraction
│   │   └── patterns.py    # Log template tracking
│   ├── cascade/           # Person 2
│   │   ├── router.py      # Tier routing logic
│   │   ├── batcher.py     # Log batching for cheap model
│   │   ├── triage.py      # Cheap model triage
│   │   └── investigator.py # Reasoning model + agent loop
│   ├── agent/             # Person 2
│   │   ├── tools.py       # Tool definitions
│   │   ├── executor.py    # Sandboxed tool execution
│   │   └── prompts.py     # System prompts
│   └── integrations/      # Person 4
│       ├── discord.py     # Discord webhook
│       └── github.py      # Repo sync webhook
├── cli/                   # Person 1
│   └── intelilog.py       # CLI tool (typer)
├── dummy-app/             # Person 4 (Next.js)
│   ├── app/api/...
│   ├── lib/
│   ├── scripts/
│   └── Dockerfile
├── dashboard/             # Person 3 (Next.js on Vercel)
│   ├── app/
│   ├── components/
│   ├── hooks/
│   └── lib/
├── models/                # Pre-trained ML model
│   ├── anomaly_scorer.joblib
│   └── baseline_config.json
├── training/              # Python scripts for model training
│   └── train_model.py
├── main.py                # FastAPI entrypoint
├── requirements.txt
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

### 5. Docker Compose skeleton (30 min)

Get a minimal docker-compose.yml running so everyone can `docker compose up` and see the stack start, even if the services are mostly stubs.

### 6. Deploy skeleton to GCP (30 min)

Person 4 gets a Compute Engine instance running with Docker Compose so the team has a live URL to test against throughout the day.

---

## Tech stack

| Component | Technology |
|---|---|
| Core pipeline | Python 3.12, FastAPI, Pydantic |
| ML anomaly scorer | scikit-learn (IsolationForest), joblib for serialization |
| LLM access | OpenRouter (single API for cheap + expensive tiers) |
| Agent framework | Custom tool-use loop with httpx + subprocess |
| CLI | Python, typer |
| Dashboard | Next.js (App Router) on Vercel |
| Integrations | Discord webhooks, GitHub push webhook |
| Dummy app | Next.js (e-commerce API with deliberate failure modes) |
| Deployment | Docker Compose on GCP Compute Engine |
| ML model storage | joblib file in Docker image |

---

## Security: agent sandboxing

The agent has read access to the application's source code. This is powerful but must be contained.

### Docker-based isolation

```yaml
# docker-compose.yml (pipeline service)
pipeline:
  build: .
  user: "1000:1000"
  read_only: true
  security_opt:
    - no-new-privileges:true
  cap_drop:
    - ALL
  volumes:
    - repo-data:/repo:ro       # Source code: READ-ONLY
    - /tmp                     # Writable scratch for agent
  environment:
    - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
    - DISCORD_WEBHOOK_URL=${DISCORD_WEBHOOK_URL}
    - REPO_PATH=/repo
```

### Agent access rules

- Can ONLY read files, run grep, and run git commands against the mounted repo volume
- CANNOT execute arbitrary code, write to the repo, or make network requests beyond OpenRouter
- All tool calls have a 10-second subprocess timeout
- Full investigation has a 60-second total timeout
- All agent tool calls are logged and emitted to the dashboard

### Repo sync

The repo is cloned into a Docker volume at startup. A GitHub push webhook (`POST /api/hooks/github`) triggers a re-clone so the agent always investigates against the latest deployed code.

---

## LLM tier routing

| Anomaly score | Tier | Model (via OpenRouter) | Action |
|---|---|---|---|
| < 0.3 | Low | None | Archive, no LLM call |
| 0.3 – 0.7 | Medium | Gemini Flash / Haiku | Quick triage: escalate or dismiss? |
| > 0.7 | High | Claude Sonnet / GPT-4o | Full investigation with agent tools |

Cheap model returns:
```json
{"escalate": true, "reason": "Connection pool errors escalating", "urgency": "high"}
```

If `escalate: true`, forward to reasoning model with triage context.

---

## Integration tiers

### Tier 1: CLI (zero code changes)

```bash
pip install intelilog

# Pipe any log source
tail -f /var/log/app.log | intelilog watch

# Docker container logs
docker logs -f my-app | intelilog watch

# File watching
intelilog watch --file ./logs/app.log

# First-time config
intelilog init
# → writes .intelilog.yml with endpoint + source name
```

### Tier 2: SDK (3 lines for serverless)

```typescript
import { intelilog } from 'intelilog';
const log = intelilog({ endpoint: 'https://your-intelilog.com', source: 'my-app' });

// Use anywhere
log.error('order-service', 'Payment failed', { order_id: '123' });
```

Works for Firebase Functions, AWS Lambda, Vercel Functions, Cloudflare Workers — any environment where you can't tail stdout.

### Tier 3: Generic webhook

```bash
curl -X POST https://your-intelilog.com/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"source":"github-actions","logs":[{"level":"error","message":"Build failed on main"}]}'
```

Wire into GitHub Actions, CI/CD, or any tool that makes HTTP requests.

**For the hackathon**: build the CLI and webhook endpoint. Mention the SDK in the presentation as a roadmap item.

---

## Dummy app specification

A Next.js e-commerce API with triggerable failure modes:

### Endpoints

- `GET /api/products` — list products
- `POST /api/orders` — create order (uses simulated DB)
- `GET /api/health` — health check
- `POST /api/chaos/[mode]` — trigger failure mode (db-leak, memory, slow-query, auth-fail, reset)

### Chaos modes

- **db-leak** — simulates connection pool exhaustion, escalating from warnings to fatal errors
- **memory** — allocates memory gradually until OOM-like conditions
- **slow-query** — introduces 3-5 second delays on DB operations
- **auth-fail** — randomly returns 401s on requests
- **reset** — restores normal operation

### Log output

Structured JSON to stdout with timestamp, level, service, message, and request metadata.

---

## Dashboard requirements

Next.js on Vercel with four sections:

1. **Live pipeline view** — logs streaming via WebSocket with anomaly scores and tier routing as they happen
2. **Incident feed** — cards with severity, timestamp, root cause summary, code references
3. **Incident detail** — full report with agent reasoning chain (tool calls shown step-by-step)
4. **Pipeline stats** — total processed, filtered count, tier distribution, estimated cost savings

---

## Team breakdown

| Person | Track | Primary deliverables |
|---|---|---|
| Person 1 | Ingestion + ML + CLI | FastAPI ingestion routes, log parser, pre-filters, isolation forest scorer, CLI tool |
| Person 2 | LLM cascade + agent | Tier router, cheap model triage, reasoning model investigation loop, agent tools, prompts |
| Person 3 | Dashboard | Next.js app, WebSocket client, live pipeline view, incident feed/detail, stats bar |
| Person 4 | Integrations + deploy + dummy app | Discord webhooks, GitHub repo sync, Docker Compose, GCP deployment, dummy app, demo script |

---

## Parallel work plan

After the foundational phase, all 4 people can work independently because:

- **Person 1** builds ingestion + scoring. Tests with curl and hardcoded logs. Outputs `log:scored` events to the bus.
- **Person 2** builds cascade + agent. Tests with hardcoded scored log events (doesn't need Person 1 running). Outputs `incident:created` events.
- **Person 3** builds dashboard with mock data generators. Switches to real WebSocket when backend is live. Consumes all event types.
- **Person 4** builds dummy app and Discord integration independently. Docker Compose wires everything together at the end.

The only hard dependency is the foundational work (data contract, event bus, repo structure). After that, everyone works against the shared interfaces.

```
Foundation (together)
        │
        ├── Person 1 ──► ingestion + scoring ──► emits log:scored
        │
        ├── Person 2 ──► cascade + agent    ──► emits incident:created
        │                                       (consumes log:scored)
        │
        ├── Person 3 ──► dashboard           ──► consumes all events
        │                (mock data first)       (WebSocket)
        │
        └── Person 4 ──► dummy app + discord ──► produces logs
                         + docker + GCP          consumes incident:created
                                    │
                              Integration phase
                         (wire everything together)
```

---

## Milestones

### Saturday morning (first 3 hours)
- [ ] Foundational work complete: schema, event bus, FastAPI skeleton, repo structure
- [ ] Docker Compose skeleton running locally
- [ ] GCP instance provisioned with Docker
- [ ] Everyone working on their track independently

### Saturday evening
- [ ] Person 1: logs flowing through ingestion, ML scoring returning scores
- [ ] Person 2: LLM cascade routing logs, agent can read files from test repo
- [ ] Person 3: dashboard rendering mock data via WebSocket
- [ ] Person 4: dummy app running with chaos endpoints, Discord webhook sending test messages

### Saturday night
- [ ] Integration: wire dummy app → pipeline → dashboard + Discord
- [ ] End-to-end smoke test: trigger chaos → see incident report

### Sunday morning
- [ ] Full demo flow working reliably
- [ ] CLI tool working (`docker logs -f dummy-app | intelilog watch`)
- [ ] Edge cases handled, error states graceful
- [ ] Demo script rehearsed 2-3 times
- [ ] Backup demo video recorded

### Sunday 11 AM
- [ ] Devpost submission with description, screenshots, GitHub link

---

## Demo flow (for judging)

1. **Show the dashboard** — empty, waiting for logs
2. **Start the dummy app** — healthy logs flow in, dashboard shows green, low anomaly scores, logs being filtered
3. **Show the CLI integration** — `docker logs -f dummy-app | intelilog watch` — one command
4. **Trigger chaos** — `curl -X POST .../api/chaos/db-leak`
5. **Watch the cascade** — anomaly scores climb, cheap model triages, then escalation to reasoning model
6. **Agent investigates** — agent activity feed shows tool calls in real-time (grep, read_file, git_blame)
7. **Incident report arrives** — simultaneously on dashboard AND in Discord
8. **Walk through the report** — root cause, code references, suggested fix
9. **Architecture explanation** — tiered cascade, cost efficiency, security model
10. **Integration story** — CLI for servers, SDK for serverless, webhook for CI/CD
