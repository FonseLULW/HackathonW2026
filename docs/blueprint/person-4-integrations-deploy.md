# Person 4: Integrations + Deployment + Dummy App — Implementation Spec

## InteliLog | HackTheBreak 2026

---

## Your role

You own three critical things: the output integrations (Discord webhooks, GitHub repo sync), the deployment infrastructure (Docker Compose on GCP), and the dummy app that generates realistic logs for the demo. You also own the demo script — the end-to-end experience during judging. This role is make-or-break: if the demo doesn't work live, nothing else matters.

---

## Deliverables

1. **Dummy e-commerce app** — Next.js API with triggerable failures and structured logging
2. **Discord webhook integration** — formatted incident reports
3. **GitHub repo sync webhook** — keeps agent's code view up to date
4. **Docker Compose setup** — full stack containerized
5. **GCP deployment** — everything running on Compute Engine
6. **Demo script** — reliable, rehearsed sequence for judging

---

## 1. Dummy e-commerce app

A Next.js API that simulates an e-commerce backend with triggerable chaos modes.

### Logger utility

```typescript
// dummy-app/lib/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export function log(level: LogLevel, service: string, message: string, meta?: object) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service,
    message,
    ...(meta && { metadata: meta }),
  };
  process.stdout.write(JSON.stringify(entry) + '\n');
}
```

### Chaos system

```typescript
// dummy-app/lib/chaos.ts
export const chaosState = {
  dbLeak: false,
  poolUsage: 30,
  slowQuery: false,
  authFail: false,
  memoryLeak: false,
  memoryUsageMB: 128,
};

export function activateChaos(mode: string) {
  switch (mode) {
    case 'db-leak':
      chaosState.dbLeak = true;
      chaosState.poolUsage = 30;
      break;
    case 'slow-query':
      chaosState.slowQuery = true;
      break;
    case 'auth-fail':
      chaosState.authFail = true;
      break;
    case 'memory':
      chaosState.memoryLeak = true;
      const leak: Buffer[] = [];
      const interval = setInterval(() => {
        leak.push(Buffer.alloc(1024 * 1024 * 10));
        chaosState.memoryUsageMB += 10;
      }, 2000);
      setTimeout(() => clearInterval(interval), 60000);
      break;
    case 'reset':
      Object.assign(chaosState, {
        dbLeak: false, poolUsage: 30, slowQuery: false,
        authFail: false, memoryLeak: false, memoryUsageMB: 128,
      });
      break;
  }
}
```

### API routes

```typescript
// dummy-app/app/api/products/route.ts
import { log } from '@/lib/logger';

const products = [
  { id: 1, name: 'Mechanical Keyboard', price: 149.99 },
  { id: 2, name: 'USB-C Hub', price: 49.99 },
  { id: 3, name: 'Monitor Arm', price: 89.99 },
];

export async function GET() {
  const start = Date.now();
  log('info', 'product-service', `GET /api/products 200 ${Date.now() - start}ms`);
  return Response.json(products);
}
```

```typescript
// dummy-app/app/api/orders/route.ts
import { log } from '@/lib/logger';
import { chaosState } from '@/lib/chaos';

export async function POST(req: Request) {
  const body = await req.json();
  const start = Date.now();

  if (chaosState.dbLeak) {
    chaosState.poolUsage = Math.min(100, chaosState.poolUsage + 5);
    log('warn', 'order-service', `Connection pool at ${chaosState.poolUsage}% capacity`, {
      pool_size: 20, active: Math.floor(chaosState.poolUsage / 5),
    });

    if (chaosState.poolUsage >= 95) {
      log('error', 'order-service',
        'FATAL: too many connections for role "postgres" - connection pool exhausted after 500 retries', {
        pool_size: 20, active_connections: 20, waiting_queries: 47,
      });
      return Response.json({ error: 'Service unavailable' }, { status: 503 });
    }
  }

  if (chaosState.slowQuery) {
    const delay = 3000 + Math.random() * 5000;
    await new Promise(r => setTimeout(r, delay));
    log('warn', 'order-service', `Slow query: INSERT INTO orders took ${delay.toFixed(0)}ms`, {
      query_time_ms: delay, threshold_ms: 1000,
    });
  }

  if (chaosState.authFail && Math.random() > 0.5) {
    log('error', 'auth-service', 'JWT verification failed: token signature invalid', {
      user_id: body.user_id, endpoint: '/api/orders',
    });
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const orderId = crypto.randomUUID();
  log('info', 'order-service', `POST /api/orders 201 ${Date.now() - start}ms`, {
    order_id: orderId, items: body.items?.length || 0,
  });
  return Response.json({ order_id: orderId, status: 'created' }, { status: 201 });
}
```

```typescript
// dummy-app/app/api/health/route.ts
import { log } from '@/lib/logger';

export async function GET() {
  log('debug', 'health-check', 'GET /api/health 200');
  return Response.json({ status: 'ok' });
}
```

```typescript
// dummy-app/app/api/chaos/[mode]/route.ts
import { activateChaos, chaosState } from '@/lib/chaos';
import { log } from '@/lib/logger';

export async function POST(_req: Request, { params }: { params: { mode: string } }) {
  activateChaos(params.mode);
  log('info', 'chaos-controller', `Chaos mode activated: ${params.mode}`);
  return Response.json({ mode: params.mode, state: chaosState });
}
```

### Traffic generator

Simulates normal users hitting the API:

```typescript
// dummy-app/scripts/traffic.ts
const BASE_URL = process.env.DUMMY_APP_URL || 'http://localhost:3000';

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min) + min);
}

async function run() {
  console.log(`Traffic generator targeting ${BASE_URL}`);
  while (true) {
    try {
      await fetch(`${BASE_URL}/api/products`);
      await sleep(rand(500, 2000));

      await fetch(`${BASE_URL}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: `user-${rand(1, 100)}`,
          items: [{ product_id: rand(1, 3), qty: 1 }],
        }),
      });
      await sleep(rand(1000, 3000));

      await fetch(`${BASE_URL}/api/health`);
      await sleep(rand(200, 500));
    } catch (err) {
      console.error('Traffic error:', err);
      await sleep(5000);
    }
  }
}

run();
```

### Log forwarder

Reads the dummy app's stdout and POSTs batches to InteliLog:

```typescript
// dummy-app/scripts/log-forwarder.ts
import { createInterface } from 'readline';

const INTELILOG_URL = process.env.INTELILOG_URL || 'http://localhost:3001/api/ingest';
const BATCH_SIZE = 10;
const FLUSH_INTERVAL = 2000;

let batch: any[] = [];

const rl = createInterface({ input: process.stdin });

rl.on('line', (line) => {
  try {
    batch.push(JSON.parse(line));
    if (batch.length >= BATCH_SIZE) flush();
  } catch {}
});

setInterval(flush, FLUSH_INTERVAL);

async function flush() {
  if (batch.length === 0) return;
  const logs = batch.splice(0);
  try {
    await fetch(INTELILOG_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'dummy-ecommerce-api', logs }),
    });
  } catch (err) {
    console.error('Forward failed:', err);
  }
}
```

---

## 2. Discord webhook integration

```python
# pipeline/integrations/discord.py
import httpx
from shared.events import bus
from shared.config import DISCORD_WEBHOOK_URL

SEVERITY_COLORS = {
    "critical": 0xFF0000,
    "high": 0xFF6600,
    "medium": 0xFFAA00,
    "low": 0x00CC00,
    "unknown": 0x808080,
}

SEVERITY_EMOJI = {
    "critical": "🔴",
    "high": "🟠",
    "medium": "🟡",
    "low": "🟢",
    "unknown": "⚪",
}

async def send_to_discord(event: dict):
    if not DISCORD_WEBHOOK_URL:
        return

    incident = event.get("incident", {})
    severity = incident.get("severity", "unknown")

    embed = {
        "title": f"{SEVERITY_EMOJI.get(severity, '⚪')} Incident: {severity.upper()}",
        "description": incident.get("report", "No details available"),
        "color": SEVERITY_COLORS.get(severity, 0x808080),
        "fields": [
            {
                "name": "Root cause",
                "value": incident.get("root_cause") or "Still investigating...",
                "inline": False,
            },
            {
                "name": "Source",
                "value": f"`{event.get('source', '?')}` at {event.get('timestamp', '?')}",
                "inline": True,
            },
            {
                "name": "Anomaly score",
                "value": str(round(event.get("pipeline", {}).get("anomaly_score", 0), 2)),
                "inline": True,
            },
        ],
        "timestamp": event.get("timestamp"),
    }

    # Code references
    code_refs = incident.get("code_refs", [])
    if code_refs:
        refs_text = "\n".join(
            f"`{ref['file']}:{ref.get('line', '?')}` — {ref.get('blame_author', '?')} ({ref.get('blame_date', '?')})"
            for ref in code_refs
        )
        embed["fields"].append({"name": "Code references", "value": refs_text, "inline": False})

    # Suggested fix
    if incident.get("suggested_fix"):
        embed["fields"].append({"name": "Suggested fix", "value": incident["suggested_fix"], "inline": False})

    async with httpx.AsyncClient() as client:
        await client.post(DISCORD_WEBHOOK_URL, json={"embeds": [embed]})

# Subscribe to incidents
bus.subscribe("incident:created", send_to_discord)
```

---

## 3. GitHub repo sync webhook

When code is pushed, re-clone the repo so the agent always investigates the latest code.

```python
# pipeline/integrations/github.py
import subprocess
import hmac
import hashlib
from fastapi import APIRouter, Request, HTTPException
from shared.config import REPO_PATH, GITHUB_WEBHOOK_SECRET

router = APIRouter()

@router.post("/api/hooks/github")
async def github_push_hook(request: Request):
    body = await request.body()

    # Verify webhook signature (if secret is configured)
    if GITHUB_WEBHOOK_SECRET:
        signature = request.headers.get("X-Hub-Signature-256", "")
        expected = "sha256=" + hmac.new(
            GITHUB_WEBHOOK_SECRET.encode(), body, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise HTTPException(status_code=403, detail="Invalid signature")

    # Pull latest code
    try:
        result = subprocess.run(
            ["git", "-C", str(REPO_PATH), "pull", "--ff-only"],
            capture_output=True, text=True, timeout=30,
        )
        return {
            "status": "updated",
            "output": result.stdout.strip(),
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
```

---

## 4. Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  # InteliLog pipeline (FastAPI — Person 1 + 2 code)
  pipeline:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3001:3001"
    user: "1000:1000"
    read_only: true
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    tmpfs:
      - /tmp
    environment:
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - DISCORD_WEBHOOK_URL=${DISCORD_WEBHOOK_URL}
      - REPO_PATH=/repo
      - GITHUB_WEBHOOK_SECRET=${GITHUB_WEBHOOK_SECRET:-}
    volumes:
      - repo-data:/repo:ro
    networks:
      - intelilog
    depends_on:
      repo-init:
        condition: service_completed_successfully
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "1.0"

  # Dummy e-commerce app (Next.js)
  dummy-app:
    build:
      context: ./dummy-app
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - INTELILOG_URL=http://pipeline:3001/api/ingest
    networks:
      - intelilog
    depends_on:
      - pipeline

  # Traffic simulator
  traffic-gen:
    build:
      context: ./dummy-app
      dockerfile: Dockerfile.traffic
    environment:
      - DUMMY_APP_URL=http://dummy-app:3000
    networks:
      - intelilog
    depends_on:
      - dummy-app
    restart: unless-stopped

  # Init container: clones dummy app repo for agent access
  repo-init:
    image: alpine/git
    command: >
      sh -c "
        if [ ! -d /repo/.git ]; then
          git clone --depth 1 https://github.com/YOUR_TEAM/dummy-app.git /repo;
        else
          echo 'Repo already cloned';
        fi
      "
    volumes:
      - repo-data:/repo

volumes:
  repo-data:

networks:
  intelilog:
    driver: bridge
```

### Pipeline Dockerfile

```dockerfile
# Dockerfile (pipeline)
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git grep \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY shared/ ./shared/
COPY pipeline/ ./pipeline/
COPY models/ ./models/
COPY main.py .

# Create non-root user
RUN useradd --create-home --shell /bin/bash intelilog
USER intelilog

EXPOSE 3001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3001"]
```

### Dummy app Dockerfile

```dockerfile
# dummy-app/Dockerfile
FROM node:20-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

EXPOSE 3000
# Pipe stdout through log forwarder
CMD ["sh", "-c", "node .next/standalone/server.js 2>&1 | node scripts/log-forwarder.js"]
```

### Traffic generator Dockerfile

```dockerfile
# dummy-app/Dockerfile.traffic
FROM node:20-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY scripts/traffic.ts ./scripts/
COPY tsconfig.json ./

CMD ["npx", "tsx", "scripts/traffic.ts"]
```

---

## 5. GCP deployment

### Provision and deploy

```bash
# Create VM
gcloud compute instances create intelilog-demo \
  --zone=us-west1-b \
  --machine-type=e2-medium \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB \
  --tags=http-server

# Open ports
gcloud compute firewall-rules create intelilog-allow \
  --allow tcp:3001,tcp:3000 \
  --target-tags=http-server

# SSH and setup
gcloud compute ssh intelilog-demo --zone=us-west1-b

# On the VM:
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in for group to take effect

git clone https://github.com/YOUR_TEAM/intelilog.git
cd intelilog

# Set env vars
cat > .env << EOF
OPENROUTER_API_KEY=your-key-here
DISCORD_WEBHOOK_URL=your-webhook-url-here
GITHUB_WEBHOOK_SECRET=your-secret-here
EOF

# Launch
docker compose up -d

# Check logs
docker compose logs -f pipeline
```

### Dashboard (Vercel)

Deploy dashboard separately. Set environment variable in Vercel:

```
NEXT_PUBLIC_WS_URL=ws://<GCP_EXTERNAL_IP>:3001/ws
```

---

## 6. Demo script

### Pre-demo checklist

- [ ] Docker Compose running on GCP (`docker compose ps` — all healthy)
- [ ] Dashboard live on Vercel and connected (green dot)
- [ ] Discord channel visible on screen
- [ ] Traffic generator running (healthy logs flowing)
- [ ] All chaos modes reset: `curl -X POST http://<IP>:3000/api/chaos/reset`

### Demo sequence (5-7 minutes)

**[0:00] Intro** (1 min)
"InteliLog is an AI log intelligence pipeline. Traditional monitoring tells you something is wrong. InteliLog tells you what went wrong, why, and where in your code."

**[1:00] Show healthy state** (1 min)
Point at dashboard. Logs streaming, all green. Stats showing filters working. "Our ML model scores every log. The tiered cascade saves money — nothing is hitting an LLM right now."

**[2:00] Show integration simplicity** (30 sec)
"Adding InteliLog to any app is one command: `docker logs -f my-app | intelilog watch`. Zero code changes."

**[2:30] Trigger chaos** (30 sec)
```bash
curl -X POST http://<GCP_IP>:3000/api/chaos/db-leak
```
"We just triggered a database connection leak."

**[3:00] Watch the cascade** (2 min)
Dashboard: scores climbing, warnings hit cheap model, then errors spike. High-anomaly → reasoning model. Agent activity feed lights up. "The cheap model triaged the first warnings. Now the reasoning model is investigating — watch it read the source code and check git blame."

**[5:00] Incident report** (1 min)
Report appears on dashboard AND Discord simultaneously. Walk through: root cause, code reference, suggested fix.

**[6:00] Architecture** (1 min)
Tiered cascade, ML + LLM separation, agent sandboxing, cost efficiency. "90% of logs never touch an LLM."

**[7:00] Q&A**

### Backup plan

Record a successful demo run the night before. If live demo fails, play the recording while explaining the architecture. Have screenshots for Devpost regardless.

```bash
# Record terminal (optional)
asciinema rec demo-backup.cast
```

---

## File structure

```
dummy-app/
  app/
    api/
      products/route.ts
      orders/route.ts
      health/route.ts
      chaos/[mode]/route.ts
  lib/
    logger.ts
    chaos.ts
  scripts/
    traffic.ts
    log-forwarder.ts
  Dockerfile
  Dockerfile.traffic
  package.json
pipeline/
  integrations/
    discord.py
    github.py
docker-compose.yml
Dockerfile
.env.example
```

---

## Coordination

- **Person 1** needs the dummy app producing logs ASAP so they can test ingestion and train the ML model. Get the dummy app working first.
- **Person 2** needs `repo-data` volume populated so the agent can read source code.
- **Person 3** needs the GCP external IP for the Vercel WebSocket URL.
- You need everyone's code to build the Docker images. Set up the repo structure early so people push to the right directories.

---

## Priority order

1. Scaffold dummy app: logger, products, health endpoints (45 min)
2. Add chaos endpoints — db-leak first, it's the best demo (30 min)
3. Log forwarder script (30 min)
4. Docker Compose skeleton with pipeline + dummy-app (1 hour)
5. Deploy to GCP, get the stack running (1 hour)
6. Discord webhook integration (45 min)
7. Traffic generator (30 min)
8. GitHub repo sync webhook (30 min)
9. Demo script + rehearsal (30 min)
10. Record backup demo video (remaining time)
