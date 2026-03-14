# Person 2: LLM Cascade + Agent Framework

## Sherlog | HackTheBreak 2026

---

## You own

The intelligence layer. You consume `log:scored` events, route them through the LLM cascade, and produce `incident:created` events with full reports. You also emit `agent:tool_call` events so Person 3 can show real-time agent reasoning.

## Deliverables

1. Tier router — subscribes to `log:scored`, routes by tier
2. Log batcher — batches medium logs by source (30s window or 20 logs)
3. Cheap model triage — quick escalate/dismiss via Gemini Flash or Haiku
4. Reasoning model investigation — full agent loop with tool use
5. Agent tools — read_file, grep_code, git_blame, git_log, list_files, search_logs
6. System prompts for both tiers

---

## Routing flow

```
log:scored event
  ├── filtered → skip
  ├── low → emit log:archived
  ├── medium → add to batcher → on flush: cheap model triage
  │                                  ├── escalate: false → emit log:triaged
  │                                  └── escalate: true ──┐
  └── high ────────────────────────────────────────────────┤
                                                           ▼
                                              Single investigation
                                              (entire batch as context)
                                                           ↓
                                              emit incident:created
```

**Key fix from v2:** When a batch escalates, run ONE investigation with all batch logs as context — not N separate investigations.

---

## Cheap model triage

Call OpenRouter with the cheap model. System prompt instructs: respond with JSON `{"escalate": bool, "reason": str, "urgency": str}`.

Escalate if: DB connection errors, resource exhaustion, auth failure patterns, stack traces, cascading errors.
Don't escalate: single transient errors, expected validation failures, noise.

---

## Reasoning model investigation

**Agent loop:**
1. Build prompt with log(s) + triage context
2. Call OpenRouter with tool definitions
3. If model returns tool_calls → execute each tool → append results → emit `agent:tool_call` → loop
4. If model returns text → parse as incident report JSON → emit `incident:created`
5. Max 10 iterations, 60s total timeout. On timeout, emit partial report.

**Report parsing:** Try JSON directly, then try extracting JSON from markdown code blocks, then fallback to raw text.

---

## Agent tools

All tools execute against `REPO_PATH` (mounted read-only). All use `subprocess.run` with 10s timeout.

| Tool | Description | Security |
|---|---|---|
| `read_file(path, start_line?, end_line?)` | Read file with line numbers | Path traversal check |
| `grep_code(pattern, file_glob?)` | Search codebase with regex | Runs grep subprocess |
| `git_blame(path, start_line?, end_line?)` | Who changed what, when | Full history available (no --depth 1) |
| `git_log(path?, n?)` | Recent commits | Default 10 |
| `list_files(path?)` | Directory listing | Excludes node_modules, .git, .next |
| `search_logs(pattern, minutes?)` | Search in-memory log buffer | **Depends on Person 1 calling `add_to_log_buffer()`** |

**Path sanitization:** Resolve path against REPO_PATH, reject if resolved path doesn't start with REPO_PATH.

**Log buffer:** An in-memory deque (max 5000 entries) that Person 1's ingestion route populates. Consider putting this in `shared/` so both Person 1 and Person 2 can access it cleanly.

---

## Prompts

**Triage prompt:** "You are a log triage system. Respond ONLY with JSON. Escalate if [criteria]. Don't escalate if [criteria]."

**Investigation prompt:** "You are an expert SRE investigating a production incident. Strategy: grep for keywords → read suspicious files → git blame for recent changes → search related logs. When done, respond with JSON: {report, root_cause, severity, code_refs[], suggested_fix}. Be concise — developers read this at 3 AM."

---

## Testing

Test with hardcoded events — don't wait for Person 1:

```python
test_high = {
    "id": "test-1", "level": "error",
    "message": "FATAL: too many connections for role 'postgres'",
    "pipeline": {"anomaly_score": 0.92, "tier": "high", "filtered": False},
}
```

Clone the dummy app repo locally, point `REPO_PATH` at it, send a test event, verify the agent finds the chaos code.

---

## Priority order

1. OpenRouter API working for both models (30 min)
2. Tier router with event subscription (30 min)
3. Cheap model triage + prompt (45 min)
4. Agent tool definitions + executor with path sanitization (1.5 hours)
5. Investigation prompt (30 min)
6. Investigation loop with tool use (1.5 hours)
7. Report parsing with fallbacks (30 min)
8. Batcher with single-investigation escalation (30 min)
9. End-to-end test against dummy app repo (remaining time)
