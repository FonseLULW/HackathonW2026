# SnoopLog Configuration

All pipeline settings live in a single file: `snooplog.yaml` at the project root.

Every value has a built-in default, so the pipeline works without any config file. Change only what you need.

---

## Config File Location

The loader walks up from `shared/` to find the project root automatically. No environment variable needed.

```
HackathonW2026/
  snooplog.yaml      <-- this file
  shared/config.py   <-- loader
  pipeline/
  ...
```

---

## Sections

### `ml` — Half-Space Trees Model

Controls the streaming anomaly detection model.

| Key | Default | Description |
|---|---|---|
| `n_trees` | `25` | Number of trees in the HST ensemble. More trees = more accurate but slower |
| `tree_height` | `6` | Depth of each tree. Deeper = finer-grained anomaly detection |
| `window_size` | `10000` | Sliding window (in logs). Model forgets patterns older than this. Increase for apps with high log volume |
| `max_weight` | `0.4` | Maximum ML influence in the blended score (0.0-1.0). Ramps up from 0 over `window_size` logs. Heuristic handles the rest |

**Why `max_weight` caps at 0.4:** The heuristic scorer is reliable from log one. ML needs data to learn, so it starts at 0% influence and ramps up. Capping at 40% ensures heuristics always have majority vote, preventing the model from overriding obvious errors/fatals.

### `features` — Feature Extraction

Tunes the 8-dimensional feature vector fed to the model.

| Key | Default | Description |
|---|---|---|
| `error_window_maxlen` | `1000` | Max error timestamps kept in memory for rate calculation |
| `secs_since_error_cap` | `300` | Cap "seconds since last error" at this value (seconds). Prevents unbounded values for apps that rarely error |
| `error_burst_window` | `5` | Seconds to look back when counting error bursts |

### `scoring` — Heuristic Scorer

The heuristic scorer assigns a base score by log level, then adds keyword/pattern boosts.

#### `level_base` — Base score per level

| Level | Default | Rationale |
|---|---|---|
| `fatal` | `0.85` | Almost always HIGH tier |
| `error` | `0.55` | MEDIUM by default, keywords push to HIGH |
| `warn` | `0.25` | Just below MEDIUM threshold |
| `info` | `0.05` | LOW unless something unusual |
| `debug` | `0.02` | Normally filtered before scoring |
| `unknown` | `0.15` | Conservative -- could be anything |

#### `boosts` — Keyword/pattern boosts

| Key | Default | Triggers |
|---|---|---|
| `critical_keywords` | `0.25` | FATAL, ECONNREFUSED, OOM, SIGSEGV, panic, etc. |
| `error_keywords` | `0.15` | traceback, exception, timeout, permission denied, etc. |
| `warn_keywords` | `0.10` | slow query, rate limit, deprecated, pool exhausted, etc. |
| `stack_trace` | `0.10` | Multi-line message with `at ...` or `Traceback` |
| `long_message` | `0.05` | Message exceeds `long_message_threshold` chars |

#### `long_message_threshold`

| Key | Default | Description |
|---|---|---|
| `long_message_threshold` | `200` | Character count above which a message gets the long_message boost |

### `tiers` — Tier Thresholds

Maps the final blended score to a tier that determines what happens next.

| Key | Default | Tier | Action |
|---|---|---|---|
| `high` | `0.7` | Score > 0.7 = **HIGH** | Sent to reasoning model (Sonnet/GPT-4o) |
| `medium` | `0.3` | Score >= 0.3 = **MEDIUM** | Sent to cheap model (Flash/Haiku) |
| -- | -- | Score < 0.3 = **LOW** | Archived, no LLM call |

### `filters` — Pre-Filters

Toggle individual filter rules on/off. Filtered logs are still emitted to the dashboard (for stats) but scored 0.0 and marked `filtered: true`.

| Key | Default | What it filters |
|---|---|---|
| `debug_level` | `true` | All debug-level logs |
| `health_checks` | `true` | `/health`, `/readiness`, `/liveness`, etc. |
| `static_assets` | `true` | `GET /static/app.css`, `GET /img/logo.png`, etc. (HTTP-method-aware to avoid false positives on stack traces with .js paths) |
| `k8s_probes` | `true` | `kube-probe/1.28`, `GoogleHC/1.0`, `ELB-HealthChecker` |

### `buffer` — Log Buffer

| Key | Default | Description |
|---|---|---|
| `max_size` | `5000` | Max log events kept in memory for the `search_logs` agent tool |

### `cli` — CLI Defaults

These are defaults for the `snooplog watch` command. Can be overridden with CLI flags or `.snooplog.yml`.

| Key | Default | Description |
|---|---|---|
| `default_endpoint` | `http://localhost:3001` | Pipeline URL |
| `batch_size` | `50` | Logs per batch before flush |
| `flush_interval` | `2.0` | Max seconds between flushes |
| `http_timeout` | `5` | HTTP request timeout (seconds) |

---

## Accessing Config in Code

```python
from shared.config import ml_window_size, tier_high, scoring_level_base

# Simple values
window = ml_window_size()       # -> 10000
threshold = tier_high()          # -> 0.7

# Dict values
bases = scoring_level_base()     # -> {"fatal": 0.85, "error": 0.55, ...}

# Force reload from disk (useful after hot-editing snooplog.yaml)
from shared.config import reload_config
reload_config()
```

---

## Commented Sections

The config file includes commented-out placeholders for other pipeline components (triage, dashboard, dummy app). These are not wired yet -- they exist so the team knows where to put their config when integrating.
