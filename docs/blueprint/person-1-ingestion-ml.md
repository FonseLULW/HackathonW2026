# Person 1: Ingestion + ML Scoring + CLI — Implementation Spec

## InteliLog | HackTheBreak 2026

---

## Your role

You own everything from raw log input to a scored log event. By the time a log leaves your system, it has been parsed into the shared Pydantic schema, passed through rule-based filters, and assigned an anomaly score between 0.0 and 1.0. You also build the CLI tool — the primary integration interface. You feed Person 2 (LLM cascade).

---

## Deliverables

1. **Log ingestion routes** — FastAPI endpoints accepting logs in multiple formats
2. **Log parser** — normalizes raw logs into the shared schema
3. **Rule-based pre-filter** — drops known noise before ML scoring
4. **ML anomaly scorer** — isolation forest that scores each log directly via scikit-learn
5. **Event emitter** — pushes scored logs to the event bus
6. **CLI tool** — `intelilog watch` command that pipes logs to the pipeline

---

## 1. Log ingestion routes

### Structured JSON endpoint

```python
# pipeline/ingestion/server.py
from fastapi import APIRouter, Request
from shared.models import LogEvent, LogMetadata, PipelineState
from shared.events import bus
from pipeline.ingestion.parser import parse_log
from pipeline.ingestion.filters import apply_filters
from pipeline.scoring.scorer import score_log
from uuid import uuid4

router = APIRouter(prefix="/api")

class IngestPayload(BaseModel):
    source: str
    logs: list[dict]

@router.post("/ingest")
async def ingest_logs(payload: IngestPayload):
    results = []
    for raw_log in payload.logs:
        # Parse → filter → score → emit
        event = parse_log(raw_log, source=payload.source)
        event = apply_filters(event)

        if not event.pipeline.filtered:
            event = await score_log(event)

        await bus.emit("log:scored", event.model_dump())
        results.append({"id": event.id, "score": event.pipeline.anomaly_score, "tier": event.pipeline.tier})

    return {"processed": len(results), "results": results}
```

### Raw text endpoint

```python
@router.post("/ingest/raw")
async def ingest_raw(request: Request):
    body = await request.body()
    lines = body.decode("utf-8").strip().split("\n")
    source = request.headers.get("X-Intelilog-Source", "unknown")

    results = []
    for line in lines:
        if not line.strip():
            continue
        event = parse_log(line, source=source)
        event = apply_filters(event)

        if not event.pipeline.filtered:
            event = await score_log(event)

        await bus.emit("log:scored", event.model_dump())
        results.append({"id": event.id, "score": event.pipeline.anomaly_score})

    return {"processed": len(results)}
```

---

## 2. Log parser

Normalize incoming logs regardless of format.

```python
# pipeline/ingestion/parser.py
import re
import json
from uuid import uuid4
from datetime import datetime, timezone
from shared.models import LogEvent, LogMetadata, PipelineState

# Regex for common log format: TIMESTAMP LEVEL [SERVICE] MESSAGE
LOG_PATTERN = re.compile(
    r'^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s+'
    r'(DEBUG|INFO|WARN|WARNING|ERROR|FATAL)\s+'
    r'\[([^\]]+)\]\s+'
    r'(.+)$',
    re.IGNORECASE
)

def parse_log(raw, source: str = "unknown") -> LogEvent:
    # If it's already a dict with expected fields, normalize directly
    if isinstance(raw, dict):
        return LogEvent(
            id=str(uuid4()),
            timestamp=raw.get("timestamp", datetime.now(timezone.utc).isoformat()),
            source=raw.get("service", raw.get("source", source)),
            level=raw.get("level", "info").lower(),
            message=raw.get("message", json.dumps(raw)),
            raw=json.dumps(raw),
            metadata=LogMetadata(**raw.get("metadata", {})),
            pipeline=PipelineState(),
        )

    # Try regex on string input
    if isinstance(raw, str):
        match = LOG_PATTERN.match(raw.strip())
        if match:
            return LogEvent(
                id=str(uuid4()),
                timestamp=match.group(1),
                source=match.group(3),
                level=match.group(2).lower(),
                message=match.group(4),
                raw=raw,
                metadata=LogMetadata(),
                pipeline=PipelineState(),
            )

        # Try parsing as JSON string
        try:
            data = json.loads(raw)
            return parse_log(data, source=source)
        except json.JSONDecodeError:
            pass

        # Fallback: entire line as message
        return LogEvent(
            id=str(uuid4()),
            timestamp=datetime.now(timezone.utc).isoformat(),
            source=source,
            level="unknown",
            message=raw.strip(),
            raw=raw,
            metadata=LogMetadata(),
            pipeline=PipelineState(),
        )

    raise ValueError(f"Cannot parse log of type {type(raw)}")
```

---

## 3. Rule-based pre-filter

```python
# pipeline/ingestion/filters.py
import re
from shared.models import LogEvent

FILTER_RULES = [
    {
        "name": "health-check",
        "match": lambda log: bool(re.search(r'health[-_]?check|/health|readiness|liveness', log.message, re.I)),
    },
    {
        "name": "debug-level",
        "match": lambda log: log.level == "debug",
    },
    {
        "name": "static-assets",
        "match": lambda log: bool(re.search(r'\.(css|js|png|jpg|ico|svg|woff)', log.message, re.I)),
    },
    {
        "name": "kubernetes-probes",
        "match": lambda log: bool(re.search(r'kube-probe|GoogleHC', log.message, re.I)),
    },
]

def apply_filters(event: LogEvent) -> LogEvent:
    for rule in FILTER_RULES:
        if rule["match"](event):
            event.pipeline.filtered = True
            event.pipeline.filter_reason = rule["name"]
            return event
    return event
```

When a log is filtered, still emit it (Person 3 needs it for dashboard stats) but mark it so Person 2 skips it.

---

## 4. ML anomaly scorer

No ONNX needed — scikit-learn runs natively in Python. Train with `joblib.dump()`, load with `joblib.load()`.

### Feature extraction

```python
# pipeline/scoring/features.py
import math
import re
from collections import deque
from time import time

# Rolling state for contextual features
_recent_errors = deque(maxlen=1000)
_seen_templates = set()

LEVEL_MAP = {"debug": 0, "info": 1, "warn": 2, "warning": 2, "error": 3, "fatal": 4, "unknown": 2}

def extract_template(message: str) -> str:
    """Strip variable parts to get a log template."""
    t = re.sub(r'\b[0-9a-f]{8,}\b', '<ID>', message, flags=re.I)
    t = re.sub(r'\b\d+\b', '<NUM>', t)
    t = re.sub(r'\d{4}-\d{2}-\d{2}T[^\s]+', '<TS>', t)
    return t.strip()

def shannon_entropy(text: str) -> float:
    """Calculate Shannon entropy of a string."""
    if not text:
        return 0.0
    freq = {}
    for c in text:
        freq[c] = freq.get(c, 0) + 1
    length = len(text)
    return -sum((count / length) * math.log2(count / length) for count in freq.values())

def extract_features(event) -> list[float]:
    """Convert a log event into a numeric feature vector."""
    now = time()
    template = extract_template(event.message)
    is_new = template not in _seen_templates
    _seen_templates.add(template)

    # Track error timestamps
    if event.level in ("error", "fatal"):
        _recent_errors.append(now)

    # Error rate in last 60 seconds
    cutoff = now - 60
    recent_error_count = sum(1 for t in _recent_errors if t > cutoff)

    # Time since last error
    if _recent_errors:
        time_since_last_error = now - _recent_errors[-1]
    else:
        time_since_last_error = 9999

    # Burst detection: errors in last 5 seconds
    burst_cutoff = now - 5
    burst_count = sum(1 for t in _recent_errors if t > burst_cutoff)

    return [
        LEVEL_MAP.get(event.level, 2),            # 0: log level numeric
        len(event.message),                         # 1: message length
        1.0 if is_new else 0.0,                    # 2: new pattern flag
        float(recent_error_count),                  # 3: errors in last 60s
        min(time_since_last_error, 9999),          # 4: seconds since last error
        shannon_entropy(event.message),             # 5: message entropy
        1.0 if "stack" in event.message.lower() or "traceback" in event.message.lower() else 0.0,  # 6: stack trace present
        float(burst_count),                         # 7: error burst (last 5s)
    ]
```

### Training script

Run this once against healthy logs to create the baseline model:

```python
# training/train_model.py
import json
import joblib
import numpy as np
from sklearn.ensemble import IsolationForest
from pipeline.scoring.features import extract_features, _seen_templates

def train(healthy_logs_path: str, output_dir: str = "models"):
    with open(healthy_logs_path) as f:
        logs = json.load(f)

    # Build a fake LogEvent-like object for feature extraction
    class FakeEvent:
        def __init__(self, log):
            self.level = log.get("level", "info")
            self.message = log.get("message", "")

    features = np.array([extract_features(FakeEvent(log)) for log in logs])

    model = IsolationForest(
        n_estimators=100,
        contamination=0.05,
        random_state=42,
    )
    model.fit(features)

    joblib.dump(model, f"{output_dir}/anomaly_scorer.joblib")

    config = {
        "feature_count": features.shape[1],
        "training_samples": len(logs),
        "feature_means": features.mean(axis=0).tolist(),
        "feature_stds": features.std(axis=0).tolist(),
    }
    with open(f"{output_dir}/baseline_config.json", "w") as f:
        json.dump(config, f, indent=2)

    print(f"Model trained on {len(logs)} logs, saved to {output_dir}/")

if __name__ == "__main__":
    import sys
    train(sys.argv[1] if len(sys.argv) > 1 else "training/healthy_logs.json")
```

### Scorer

```python
# pipeline/scoring/scorer.py
import joblib
import numpy as np
from pathlib import Path
from shared.models import LogEvent
from pipeline.scoring.features import extract_features

MODEL_PATH = Path("models/anomaly_scorer.joblib")
_model = None

def load_model():
    global _model
    if MODEL_PATH.exists():
        _model = joblib.load(MODEL_PATH)
        print(f"ML model loaded from {MODEL_PATH}")
    else:
        print("WARNING: No ML model found. Using fallback heuristic scoring.")

def _heuristic_score(event: LogEvent) -> float:
    """Fallback scoring when no ML model is available."""
    score = 0.0
    if event.level in ("error", "fatal"):
        score += 0.4
    if event.level == "fatal":
        score += 0.2
    if len(event.message) > 500:
        score += 0.1
    if "stack" in event.message.lower() or "traceback" in event.message.lower():
        score += 0.2
    if "FATAL" in event.message or "ECONNREFUSED" in event.message:
        score += 0.3
    return min(score, 1.0)

async def score_log(event: LogEvent) -> LogEvent:
    if _model is not None:
        features = np.array([extract_features(event)])
        raw_score = _model.score_samples(features)[0]
        # IsolationForest: more negative = more anomalous
        # Normalize to 0.0 (normal) to 1.0 (anomalous)
        normalized = max(0.0, min(1.0, (0.5 - raw_score)))
    else:
        normalized = _heuristic_score(event)

    event.pipeline.anomaly_score = round(normalized, 4)

    if normalized < 0.3:
        event.pipeline.tier = "low"
    elif normalized <= 0.7:
        event.pipeline.tier = "medium"
    else:
        event.pipeline.tier = "high"

    return event

# Load model on import
load_model()
```

The heuristic fallback is important — it means the pipeline works even before you've trained the ML model. During early development and testing, everyone can use the heuristic scorer while you work on the real model.

---

## 5. Event emission

After scoring, emit via the shared event bus:

```python
# Inside the ingestion route (already shown in section 1)
await bus.emit("log:scored", event.model_dump())
```

Person 2 subscribes to `log:scored` for logs where `tier` is `medium` or `high`.
Person 3 receives ALL events via WebSocket for dashboard display.

---

## 6. CLI tool

The primary integration interface. Zero code changes to the user's app.

```python
# cli/intelilog.py
import sys
import json
import time
import typer
import httpx
from pathlib import Path

app = typer.Typer(help="InteliLog CLI — AI-powered log intelligence")

DEFAULT_CONFIG_PATH = Path(".intelilog.yml")

@app.command()
def init():
    """Initialize InteliLog configuration."""
    endpoint = typer.prompt("InteliLog endpoint URL", default="http://localhost:3001")
    source = typer.prompt("Application name", default=Path.cwd().name)

    config = f"""endpoint: {endpoint}
source: {source}
filters:
  - health-check
  - debug
"""
    DEFAULT_CONFIG_PATH.write_text(config)
    typer.echo(f"Config written to {DEFAULT_CONFIG_PATH}")

@app.command()
def watch(
    file: str = typer.Option(None, "--file", "-f", help="Log file to watch"),
    endpoint: str = typer.Option(None, "--endpoint", "-e", help="InteliLog endpoint URL"),
    source: str = typer.Option(None, "--source", "-s", help="Application name"),
    batch_size: int = typer.Option(10, "--batch-size", help="Logs per batch"),
    flush_interval: float = typer.Option(2.0, "--flush-interval", help="Seconds between flushes"),
):
    """Watch logs and forward to InteliLog. Reads from stdin if no --file is given."""
    # Load config file if it exists
    config = _load_config()
    endpoint = endpoint or config.get("endpoint", "http://localhost:3001")
    source = source or config.get("source", "unknown")

    typer.echo(f"Watching logs → {endpoint} (source: {source})")
    typer.echo("Reading from stdin... (pipe your logs here)")

    batch = []
    last_flush = time.time()
    client = httpx.Client(timeout=5.0)

    input_stream = open(file) if file else sys.stdin

    try:
        for line in input_stream:
            line = line.strip()
            if not line:
                continue

            # Try to parse as JSON, otherwise treat as raw text
            try:
                log_entry = json.loads(line)
            except json.JSONDecodeError:
                log_entry = {"message": line, "level": "info"}

            batch.append(log_entry)

            # Flush if batch is full or interval elapsed
            if len(batch) >= batch_size or (time.time() - last_flush) >= flush_interval:
                _flush(client, endpoint, source, batch)
                batch = []
                last_flush = time.time()
    except KeyboardInterrupt:
        if batch:
            _flush(client, endpoint, source, batch)
        typer.echo("\nStopped.")
    finally:
        client.close()
        if file and input_stream != sys.stdin:
            input_stream.close()

def _flush(client: httpx.Client, endpoint: str, source: str, batch: list):
    try:
        resp = client.post(
            f"{endpoint}/api/ingest",
            json={"source": source, "logs": batch},
        )
        if resp.status_code == 200:
            data = resp.json()
            # Print a compact summary
            high = sum(1 for r in data.get("results", []) if r.get("tier") == "high")
            med = sum(1 for r in data.get("results", []) if r.get("tier") == "medium")
            if high or med:
                typer.echo(f"  ⚡ {data['processed']} logs sent — {high} high, {med} medium anomaly")
        else:
            typer.echo(f"  ⚠ Server returned {resp.status_code}", err=True)
    except httpx.RequestError as e:
        typer.echo(f"  ✗ Connection failed: {e}", err=True)

def _load_config() -> dict:
    if DEFAULT_CONFIG_PATH.exists():
        import yaml
        return yaml.safe_load(DEFAULT_CONFIG_PATH.read_text()) or {}
    return {}

if __name__ == "__main__":
    app()
```

### CLI usage examples for the demo

```bash
# Basic: pipe Docker logs
docker logs -f dummy-app | python cli/intelilog.py watch

# With explicit options
docker logs -f dummy-app | python cli/intelilog.py watch \
  --endpoint http://35.x.x.x:3001 \
  --source my-ecommerce-app

# From a log file
python cli/intelilog.py watch --file /var/log/app.log

# Initialize config first, then just pipe
python cli/intelilog.py init
docker logs -f dummy-app | python cli/intelilog.py watch
```

---

## File structure

```
pipeline/
  ingestion/
    server.py          # FastAPI routes (/api/ingest, /api/ingest/raw)
    parser.py          # Log parsing + normalization
    filters.py         # Rule-based pre-filter
  scoring/
    scorer.py          # IsolationForest wrapper + heuristic fallback
    features.py        # Feature extraction
    patterns.py        # Template extraction and tracking
cli/
  intelilog.py         # CLI tool (typer)
models/
  anomaly_scorer.joblib    # Pre-trained model (after training)
  baseline_config.json     # Feature stats
training/
  train_model.py           # Training script
  generate_healthy.py      # Generate healthy logs from dummy app
```

---

## Testing strategy

### Test without ML model first

The heuristic fallback scorer means you can test the entire ingestion pipeline before the ML model exists. Just start the server and POST logs — errors will score higher than info logs automatically.

### Quick smoke test

```bash
# Healthy log — should score low
curl -X POST http://localhost:3001/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"source":"test","logs":[{"level":"info","message":"GET /api/products 200 12ms"}]}'

# Anomalous log — should score high
curl -X POST http://localhost:3001/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"source":"test","logs":[{"level":"error","message":"FATAL: too many connections for role postgres - connection pool exhausted after 500 retries"}]}'

# Filtered log — should be marked as filtered
curl -X POST http://localhost:3001/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"source":"test","logs":[{"level":"debug","message":"GET /health 200"}]}'
```

### Train the model once Person 4's dummy app is producing logs

1. Run the dummy app with traffic generator for 5 minutes (healthy mode)
2. Collect logs: `docker logs dummy-app > training/healthy_logs.json`
3. Run `python training/train_model.py training/healthy_logs.json`
4. Restart the pipeline — it auto-loads the model from `models/`

---

## Coordination

- **Person 2** consumes your `log:scored` events. They can work independently with hardcoded events.
- **Person 3** consumes ALL events via WebSocket. No coordination needed beyond the event format.
- **Person 4** POSTs logs from the dummy app to your `/api/ingest` endpoint.

Get the ingestion endpoint working first (even without scoring) so Person 4 can start testing against it immediately.

---

## Priority order

1. Ingestion endpoint accepting JSON logs + parser (45 min)
2. Wire up event bus emission so Person 2 and 3 can receive data (15 min)
3. Heuristic fallback scorer — pipeline works end-to-end without ML (30 min)
4. Rule-based filters (30 min)
5. CLI tool with `watch` command (1 hour)
6. Feature extraction module (45 min)
7. Training script + train model on dummy app logs (45 min)
8. Replace heuristic with real ML scorer (30 min)
9. Raw text endpoint + CLI `init` command (remaining time)
