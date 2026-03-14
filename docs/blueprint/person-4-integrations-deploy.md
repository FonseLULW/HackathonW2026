# Person 4: Integrations + Deployment + Dummy App

## Sherlog | HackTheBreak 2026

---

## You own

The dummy app, output integrations, deployment, and the demo script. If the demo doesn't work live, nothing else matters. Get things running early and keep them stable.

## Deliverables

1. Dummy e-commerce app (Next.js) with chaos endpoints
2. Log-forwarder sidecar (reads dummy-app stdout → POSTs to pipeline)
3. Discord webhook integration
4. Repo-sync sidecar (GitHub webhook → git pull)
5. Caddy reverse proxy (TLS termination)
6. Docker Compose with all services
7. GCP Compute Engine deployment
8. Traffic generator
9. Demo script (rehearsed)

---

## Dummy app

Next.js API with structured JSON logging to stdout.

**Endpoints:**
- `GET /api/products` — list products
- `POST /api/orders` — create order (affected by chaos modes)
- `GET /api/health` — health check
- `POST /api/chaos/[mode]` — activate: `db-leak`, `slow-query`, `auth-fail`, `memory`, `reset`

**Chaos: db-leak** (primary demo mode):
- Increments pool usage by 5% per order request
- Logs warnings at each step ("pool at X% capacity")
- At 95%+: logs FATAL error, returns 503
- Reset returns pool to 30%

**Logger:** Writes JSON to stdout with timestamp, level, service, message, metadata. Nothing else — no internal forwarding.

---

## Log-forwarder sidecar

**Fix from v2:** The forwarder is a separate container, NOT piped inside the dummy-app CMD. This avoids double-ingestion and keeps `docker logs` clean.

Approach: the sidecar reads from a shared log volume or uses Docker's logging driver. Simplest for hackathon: the dummy app writes to a shared file, the sidecar tails it and POSTs batches to `http://pipeline:3001/api/ingest`.

Alternatively, use Docker's `json-file` log driver and have the sidecar read from `/var/lib/docker/containers/<id>/*.log` — but this requires Docker socket access which complicates permissions.

**Simplest approach:** Dummy app writes to both stdout AND a shared volume file. Sidecar tails the file.

```yaml
dummy-app:
  volumes:
    - app-logs:/app/logs
  # App writes to /app/logs/app.log AND stdout

log-forwarder:
  volumes:
    - app-logs:/logs:ro
  command: ["python", "forwarder.py", "--file", "/logs/app.log"]
```

---

## Discord webhook

Python module in `pipeline/integrations/discord.py`. Subscribes to `incident:created` events. Formats rich embeds with severity emoji/color, report summary, root cause, code refs, suggested fix.

---

## Repo-sync sidecar

**Fix from v2:** Pipeline container is read-only and cannot git pull. A separate sidecar handles repo updates.

```yaml
repo-sync:
  image: alpine/git
  ports:
    - "3002:3002"
  volumes:
    - repo-data:/repo  # Write access (no :ro)
  command: ["sh", "-c", "... lightweight HTTP server that runs git pull on POST"]
```

For hackathon: a 20-line Python/shell HTTP server that listens on 3002 and runs `git -C /repo pull` when it receives a POST. The GitHub webhook points here.

---

## Caddy reverse proxy

**Fix from v2:** Dashboard on Vercel (HTTPS) cannot connect to `ws://` on a raw IP. Caddy provides automatic TLS.

```
# Caddyfile
Sherlog.example.com {
    reverse_proxy pipeline:3001
}
```

For hackathon: use a free domain (e.g., `<ip>.nip.io` with self-signed cert) or get a cheap domain and point it at the GCP IP. Caddy auto-provisions Let's Encrypt certs.

```yaml
caddy:
  image: caddy:2
  ports:
    - "443:443"
    - "80:80"
  volumes:
    - ./Caddyfile:/etc/caddy/Caddyfile
    - caddy-data:/data
  networks:
    - Sherlog
```

---

## Docker Compose summary

| Service | Base | Ports | Volumes |
|---|---|---|---|
| caddy | caddy:2 | 443, 80 | Caddyfile, caddy-data |
| pipeline | python:3.12-slim | 3001 (internal) | repo-data:ro |
| dummy-app | node:20-slim | 3000 | app-logs (shared) |
| log-forwarder | python:3.12-slim | — | app-logs:ro |
| traffic-gen | node:20-slim | — | — |
| repo-init | alpine/git | — | repo-data (write, runs once) |
| repo-sync | alpine/git | 3002 | repo-data (write) |

**Security on pipeline:** `read_only: true`, `cap_drop: ALL`, `no-new-privileges`, non-root user, memory limit 512M.

**Repo clone:** NO `--depth 1` — agent needs full git history for blame.

---

## GCP deployment

```bash
# Create VM
gcloud compute instances create Sherlog-demo \
  --zone=us-west1-b --machine-type=e2-medium \
  --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud

# Firewall
gcloud compute firewall-rules create Sherlog-allow \
  --allow tcp:80,tcp:443,tcp:3002

# SSH → install Docker → clone repo → set .env → docker compose up -d
```

Dashboard: deploy to Vercel with `NEXT_PUBLIC_WS_URL=wss://<domain>/ws`

---

## Demo script (5-7 min)

**Primary path: Docker sidecar ingestion.** CLI shown separately.

1. **Intro** (1 min) — "Sherlog tells you what went wrong, why, and where in your code"
2. **Healthy state** (1 min) — dashboard shows green, filters working, no LLM calls
3. **Trigger chaos** (30s) — `curl -X POST .../api/chaos/db-leak`
4. **Watch cascade** (2 min) — scores climb, cheap model triages, agent investigates, tool calls visible
5. **Incident report** (1 min) — appears on dashboard + Discord, walk through root cause and code refs
6. **CLI demo** (30s) — "Here's how you'd add this to your own app: one pipe command"
7. **Architecture** (1 min) — tiered cascade, cost savings, security model
8. **Q&A**

**Backup:** Record a successful run Saturday night. If live demo fails, play recording while explaining.

---

## Priority order

1. Dummy app with logger + products + health (45 min)
2. Chaos endpoints — db-leak first (30 min)
3. Log-forwarder sidecar (30 min)
4. Docker Compose with pipeline + dummy-app working (1 hour)
5. Deploy to GCP (1 hour)
6. Caddy + TLS setup (30 min)
7. Discord webhook (45 min)
8. Traffic generator (30 min)
9. Repo-sync sidecar (30 min)
10. Demo script + rehearsal + backup recording (remaining time)
