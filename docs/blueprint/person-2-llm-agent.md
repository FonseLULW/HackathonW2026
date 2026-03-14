# Person 2: LLM Cascade + Agent Framework — Implementation Spec

## InteliLog | HackTheBreak 2026

---

## Your role

You own the intelligence layer. You receive scored log events from Person 1 and decide what to do with them: send medium-anomaly logs through a cheap model for quick triage, and high-anomaly logs (or escalated medium logs) through a reasoning model with agent capabilities that can investigate the codebase. Your output is structured incident reports that Person 3 displays and Person 4 delivers.

This is the hardest track — the agent framework, prompt engineering, and routing logic are the core of what makes InteliLog novel.

---

## Deliverables

1. **Tier router** — routes scored logs to the correct LLM tier
2. **Cheap model triage** — fast yes/no escalation decision
3. **Reasoning model investigation** — deep analysis with agent tool use
4. **Agent framework** — lightweight tool-use loop for codebase exploration
5. **Report generator** — structures findings into an incident report

---

## 1. Tier router

Subscribe to scored events from Person 1 and route by tier.

```python
# pipeline/cascade/router.py
from shared.events import bus
from pipeline.cascade.triage import triage_cheap_model
from pipeline.cascade.investigator import investigate
from pipeline.cascade.batcher import LogBatcher

batcher = LogBatcher(max_size=20, max_wait_seconds=30, on_flush=triage_cheap_model)

async def on_log_scored(data: dict):
    if data.get("pipeline", {}).get("filtered"):
        return

    tier = data.get("pipeline", {}).get("tier")

    if tier == "low":
        await bus.emit("log:archived", data)

    elif tier == "medium":
        await batcher.add(data)

    elif tier == "high":
        await investigate(data)

# Register on startup
bus.subscribe("log:scored", on_log_scored)
```

### Log batcher

Don't send every medium log individually — batch by source within a time window to reduce API costs.

```python
# pipeline/cascade/batcher.py
import asyncio
from typing import Callable
from collections import defaultdict

class LogBatcher:
    def __init__(self, max_size: int = 20, max_wait_seconds: float = 30, on_flush: Callable = None):
        self.max_size = max_size
        self.max_wait = max_wait_seconds
        self.on_flush = on_flush
        self._buffers: dict[str, list] = defaultdict(list)
        self._timers: dict[str, asyncio.Task] = {}

    async def add(self, event: dict):
        source = event.get("source", "unknown")
        self._buffers[source].append(event)

        if len(self._buffers[source]) >= self.max_size:
            await self._flush(source)
        elif source not in self._timers:
            self._timers[source] = asyncio.create_task(self._timer(source))

    async def _timer(self, source: str):
        await asyncio.sleep(self.max_wait)
        await self._flush(source)

    async def _flush(self, source: str):
        if source in self._timers:
            self._timers[source].cancel()
            del self._timers[source]

        events = self._buffers.pop(source, [])
        if events and self.on_flush:
            await self.on_flush(events)
```

---

## 2. Cheap model triage

Use a fast, cheap model via OpenRouter to make a quick escalation decision.

```python
# pipeline/cascade/triage.py
import httpx
import json
from shared.events import bus
from shared.config import OPENROUTER_API_KEY, CHEAP_MODEL
from pipeline.cascade.investigator import investigate
from pipeline.agent.prompts import TRIAGE_SYSTEM_PROMPT

async def triage_cheap_model(events: list[dict]):
    """Triage a batch of medium-anomaly logs."""
    logs_text = "\n".join(
        f"[{e.get('level', '?')}] {e.get('timestamp', '?')} — {e.get('message', '')}"
        for e in events
    )

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": CHEAP_MODEL,
                "messages": [
                    {"role": "system", "content": TRIAGE_SYSTEM_PROMPT},
                    {"role": "user", "content": f"Triage these logs:\n\n{logs_text}"},
                ],
                "max_tokens": 300,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    content = data["choices"][0]["message"]["content"]

    try:
        decision = json.loads(content)
    except json.JSONDecodeError:
        decision = {"escalate": False, "reason": "Could not parse triage response", "urgency": "low"}

    if decision.get("escalate"):
        for event in events:
            event["pipeline"]["tier_model"] = CHEAP_MODEL
            await investigate(event, triage_context=decision.get("reason"))
    else:
        for event in events:
            event["pipeline"]["tier_model"] = CHEAP_MODEL
            await bus.emit("log:triaged", {**event, "triage": decision})
```

---

## 3. Reasoning model investigation

The core of the system. The reasoning model gets the anomalous log, context, and access to agent tools.

```python
# pipeline/cascade/investigator.py
import httpx
import json
import time
from shared.events import bus
from shared.config import OPENROUTER_API_KEY, REASONING_MODEL
from pipeline.agent.tools import TOOL_DEFINITIONS
from pipeline.agent.executor import execute_tool
from pipeline.agent.prompts import INVESTIGATION_SYSTEM_PROMPT

MAX_ITERATIONS = 10
TIMEOUT_SECONDS = 60

async def investigate(event: dict, triage_context: str = None):
    """Run the full agent investigation loop."""
    log_summary = (
        f"Anomalous log detected (score: {event['pipeline'].get('anomaly_score', '?')}):\n"
        f"  Timestamp: {event.get('timestamp')}\n"
        f"  Level: {event.get('level')}\n"
        f"  Source: {event.get('source')}\n"
        f"  Message: {event.get('message')}\n"
    )
    if triage_context:
        log_summary += f"\n  Triage context: {triage_context}\n"

    messages = [
        {"role": "system", "content": INVESTIGATION_SYSTEM_PROMPT},
        {"role": "user", "content": log_summary},
    ]

    start_time = time.time()
    iteration = 0

    async with httpx.AsyncClient(timeout=60.0) as client:
        while iteration < MAX_ITERATIONS and (time.time() - start_time) < TIMEOUT_SECONDS:
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": REASONING_MODEL,
                    "messages": messages,
                    "tools": TOOL_DEFINITIONS,
                    "max_tokens": 2000,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            choice = data["choices"][0]
            message = choice["message"]

            # If model wants to use tools
            tool_calls = message.get("tool_calls")
            if tool_calls:
                messages.append(message)

                for tool_call in tool_calls:
                    fn_name = tool_call["function"]["name"]
                    fn_args = json.loads(tool_call["function"]["arguments"])

                    result = await execute_tool(fn_name, fn_args)

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call["id"],
                        "content": result,
                    })

                    # Emit for real-time dashboard
                    await bus.emit("agent:tool_call", {
                        "logId": event.get("id"),
                        "tool": fn_name,
                        "args": fn_args,
                        "result": result[:500],
                    })

                iteration += 1
                continue

            # Model is done — parse the report
            report = _parse_report(message.get("content", ""))
            event["incident"] = report
            event["pipeline"]["tier_model"] = REASONING_MODEL
            await bus.emit("incident:created", event)
            return

    # Timeout — emit partial report
    event["incident"] = {
        "report": "Investigation timed out or reached max iterations.",
        "severity": "unknown",
        "root_cause": None,
        "code_refs": [],
        "suggested_fix": None,
    }
    await bus.emit("incident:created", event)


def _parse_report(content: str) -> dict:
    """Extract structured report from model output."""
    # Try parsing as JSON
    try:
        report = json.loads(content)
        return {
            "report": report.get("report", content),
            "root_cause": report.get("root_cause"),
            "severity": report.get("severity", "unknown"),
            "code_refs": report.get("code_refs", []),
            "suggested_fix": report.get("suggested_fix"),
        }
    except json.JSONDecodeError:
        pass

    # Try extracting JSON from markdown code block
    import re
    json_match = re.search(r'```json?\s*\n?(.*?)\n?```', content, re.DOTALL)
    if json_match:
        try:
            report = json.loads(json_match.group(1))
            return {
                "report": report.get("report", content),
                "root_cause": report.get("root_cause"),
                "severity": report.get("severity", "unknown"),
                "code_refs": report.get("code_refs", []),
                "suggested_fix": report.get("suggested_fix"),
            }
        except json.JSONDecodeError:
            pass

    # Fallback: treat entire response as the report text
    return {
        "report": content,
        "root_cause": None,
        "severity": "unknown",
        "code_refs": [],
        "suggested_fix": None,
    }
```

---

## 4. Agent framework — tools

### Tool definitions (OpenAI function calling format, used by OpenRouter)

```python
# pipeline/agent/tools.py

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read contents of a file from the application source code with line numbers.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path relative to repo root (e.g. 'src/db/pool.ts')"},
                    "start_line": {"type": "integer", "description": "Optional: start line number"},
                    "end_line": {"type": "integer", "description": "Optional: end line number"},
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "grep_code",
            "description": "Search for a pattern in the codebase. Returns matching lines with file paths and line numbers.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "Search pattern (supports regex)"},
                    "file_glob": {"type": "string", "description": "Optional: restrict to files matching glob (e.g. '*.ts')"},
                },
                "required": ["pattern"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "git_blame",
            "description": "Show git blame for a file — who changed each line and when.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path relative to repo root"},
                    "start_line": {"type": "integer", "description": "Optional: start line"},
                    "end_line": {"type": "integer", "description": "Optional: end line"},
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "git_log",
            "description": "Show recent git commits, optionally filtered to a specific file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Optional: file path to filter commits"},
                    "n": {"type": "integer", "description": "Number of commits (default 10)"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_files",
            "description": "List files and directories in the codebase.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Directory path relative to repo root (default: root)"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_logs",
            "description": "Search recent logs for a pattern. Useful for finding related errors.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "Pattern to match against log messages"},
                    "minutes": {"type": "integer", "description": "How many minutes back to search (default 5)"},
                },
                "required": ["pattern"],
            },
        },
    },
]
```

### Tool executor

All tools run against the mounted repo volume with strict sandboxing.

```python
# pipeline/agent/executor.py
import subprocess
import os
from pathlib import Path

REPO_PATH = Path(os.environ.get("REPO_PATH", "/repo"))
MAX_OUTPUT = 5000  # Truncate to keep context manageable
TOOL_TIMEOUT = 10  # seconds

# In-memory log buffer (populated by ingestion, read by search_logs)
_log_buffer: list[dict] = []
LOG_BUFFER_MAX = 5000

def add_to_log_buffer(event: dict):
    _log_buffer.append(event)
    if len(_log_buffer) > LOG_BUFFER_MAX:
        _log_buffer.pop(0)

def _sanitize_path(input_path: str) -> Path:
    """Prevent path traversal attacks."""
    resolved = (REPO_PATH / input_path).resolve()
    if not str(resolved).startswith(str(REPO_PATH.resolve())):
        raise ValueError("Path traversal detected")
    return resolved

def _truncate(text: str) -> str:
    if len(text) > MAX_OUTPUT:
        return text[:MAX_OUTPUT] + "\n... (truncated)"
    return text

def _run_cmd(cmd: list[str], **kwargs) -> str:
    """Run a subprocess with timeout and return stdout."""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=TOOL_TIMEOUT,
            **kwargs,
        )
        return result.stdout or result.stderr or "(no output)"
    except subprocess.TimeoutExpired:
        return "Tool execution timed out"
    except Exception as e:
        return f"Tool error: {e}"

async def execute_tool(name: str, args: dict) -> str:
    """Execute an agent tool and return the result string."""
    try:
        if name == "read_file":
            file_path = _sanitize_path(args["path"])
            if not file_path.exists():
                return f"File not found: {args['path']}"

            lines = file_path.read_text(encoding="utf-8", errors="replace").split("\n")
            start = (args.get("start_line") or 1) - 1
            end = args.get("end_line") or len(lines)
            numbered = "\n".join(
                f"{start + i + 1}: {line}"
                for i, line in enumerate(lines[start:end])
            )
            return _truncate(numbered)

        elif name == "grep_code":
            cmd = ["grep", "-rn"]
            if args.get("file_glob"):
                cmd += [f"--include={args['file_glob']}"]
            cmd += [args["pattern"], str(REPO_PATH)]
            output = _run_cmd(cmd)
            # Strip repo path prefix for cleaner output
            return _truncate(output.replace(str(REPO_PATH) + "/", ""))

        elif name == "git_blame":
            file_path = _sanitize_path(args["path"])
            cmd = ["git", "-C", str(REPO_PATH), "blame", "--date=short"]
            if args.get("start_line") and args.get("end_line"):
                cmd += [f"-L{args['start_line']},{args['end_line']}"]
            cmd.append(str(file_path))
            return _truncate(_run_cmd(cmd))

        elif name == "git_log":
            n = args.get("n", 10)
            cmd = [
                "git", "-C", str(REPO_PATH), "log",
                "--oneline", "--date=short",
                f"--format=%h %ad %an %s",
                f"-n{n}",
            ]
            if args.get("path"):
                cmd += ["--", args["path"]]
            return _truncate(_run_cmd(cmd))

        elif name == "list_files":
            dir_path = _sanitize_path(args.get("path", "."))
            cmd = [
                "find", str(dir_path),
                "-maxdepth", "2",
                "-not", "-path", "*/node_modules/*",
                "-not", "-path", "*/.git/*",
                "-not", "-path", "*/.next/*",
            ]
            output = _run_cmd(cmd)
            return _truncate(output.replace(str(REPO_PATH) + "/", ""))

        elif name == "search_logs":
            pattern = args["pattern"]
            minutes = args.get("minutes", 5)
            from datetime import datetime, timedelta, timezone
            cutoff = datetime.now(timezone.utc) - timedelta(minutes=minutes)

            matches = []
            for log in _log_buffer:
                try:
                    ts = datetime.fromisoformat(log.get("timestamp", "").replace("Z", "+00:00"))
                    if ts > cutoff and pattern.lower() in log.get("message", "").lower():
                        matches.append(log)
                except (ValueError, TypeError):
                    continue

            import json
            return _truncate(json.dumps(matches[-20:], indent=2))

        else:
            return f"Unknown tool: {name}"

    except ValueError as e:
        return f"Security error: {e}"
    except Exception as e:
        return f"Tool error: {e}"
```

---

## 5. Prompts

```python
# pipeline/agent/prompts.py

TRIAGE_SYSTEM_PROMPT = """You are a log triage system. You receive application logs flagged as potentially anomalous by an ML model.

Your job: quickly decide if this should be escalated to a detailed investigation, or if it's a false alarm.

Respond ONLY with JSON:
{"escalate": true/false, "reason": "one sentence", "urgency": "low"/"medium"/"high"}

Escalate if you see:
- Database connection errors or pool exhaustion
- Memory/resource exhaustion indicators
- Authentication failures in unusual patterns
- Stack traces from unhandled exceptions
- Error rates suggesting cascading failures
- Patterns that could indicate data loss

Do NOT escalate:
- Single transient errors (one timeout, one 404)
- Expected errors (rate limiting, validation)
- Informational warnings with no impact
- Normal operation noise"""

INVESTIGATION_SYSTEM_PROMPT = """You are an expert SRE investigating a production incident. You have tools to explore the application's source code.

Investigation strategy:
1. Read the log message. Identify keywords, service names, error codes.
2. Use grep_code to search for relevant patterns in the codebase.
3. Use read_file to examine suspicious files.
4. Use git_blame to check recent changes to those files.
5. Use search_logs to find related log entries around the same time.

When you have enough evidence, write your final report as JSON:
{
  "report": "2-3 sentence summary of what happened",
  "root_cause": "The specific cause with evidence",
  "severity": "low" | "medium" | "high" | "critical",
  "code_refs": [
    {
      "file": "path/to/file.ts",
      "line": 42,
      "blame_author": "author",
      "blame_date": "2026-03-13",
      "blame_commit": "abc1234"
    }
  ],
  "suggested_fix": "Specific actionable recommendation"
}

Be concise. Developers read this at 3 AM. Lead with what matters."""
```

---

## File structure

```
pipeline/
  cascade/
    router.py           # Tier routing + event subscription
    batcher.py          # Log batching for cheap model
    triage.py           # Cheap model triage call
    investigator.py     # Reasoning model + agent loop
  agent/
    tools.py            # Tool definitions (OpenAI format)
    executor.py         # Sandboxed tool execution
    prompts.py          # System prompts for both tiers
```

---

## Testing strategy

### Test with hardcoded events — don't wait for Person 1

```python
# tests/test_cascade.py
test_events = {
    "medium_log": {
        "id": "test-1",
        "timestamp": "2026-03-14T03:22:15Z",
        "source": "dummy-ecommerce-api",
        "level": "warn",
        "message": "Connection pool at 90% capacity",
        "pipeline": {"anomaly_score": 0.55, "tier": "medium", "filtered": False},
    },
    "high_log": {
        "id": "test-2",
        "timestamp": "2026-03-14T03:22:20Z",
        "source": "dummy-ecommerce-api",
        "level": "error",
        "message": "FATAL: too many connections for role 'postgres' - pool exhausted after 500 retries",
        "pipeline": {"anomaly_score": 0.92, "tier": "high", "filtered": False},
    },
}
```

### Test agent against dummy app repo

Clone Person 4's dummy app locally and point `REPO_PATH` at it. Send a test high-anomaly log and verify the agent finds the chaos endpoint code.

---

## Coordination

- **Person 1** emits `log:scored` events. You subscribe to these. You can develop independently using test fixtures.
- **Person 3** listens for `agent:tool_call` (real-time reasoning) and `incident:created` (final reports).
- **Person 4** provides the repo volume and consumes `incident:created` for Discord delivery.

Wire into Person 1's event bus once both are working — until then, hardcoded events are fine.

---

## Priority order

1. Set up OpenRouter API calls, verify both cheap and expensive models work (30 min)
2. Implement tier router with event subscription (30 min)
3. Cheap model triage with system prompt (45 min)
4. Agent tool definitions and executor with path sanitization (1.5 hours)
5. Investigation system prompt (30 min)
6. Investigation loop with tool use (1.5 hours)
7. Report parsing with JSON extraction fallbacks (30 min)
8. Log batcher for medium-tier cost optimization (30 min)
9. Test end-to-end against dummy app repo (remaining time)
