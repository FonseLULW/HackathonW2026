"""Prompt templates and JSON schemas for LLM integration."""

from __future__ import annotations

import json

TRIAGE_SYSTEM_PROMPT = """
You are a production log triage system.
Decide whether a batch of medium-anomaly logs should be escalated.
Escalate for repeated infrastructure failures, auth failures, resource exhaustion,
stack traces, cascading errors, or anything user-facing.
Treat caught exceptions on live request paths as escalation candidates when they repeat,
include stack traces, or hide a broken user flow even if the message says "captured",
"handled", or "silent".
Do not escalate for expected noise, isolated validation failures, or low-signal chatter.
Weigh the entire batch, not just one line.
Prefer escalation when several logs suggest the same underlying failure.
Respond with JSON only. Do not wrap it in markdown.
""".strip()

INVESTIGATION_SYSTEM_PROMPT = """
You are an expert SRE investigating a production incident from application logs.
Use available tools to inspect code, recent log history, and git history.
Strategy:
1. Form a hypothesis from the log pattern.
2. Use targeted tools to confirm or reject the hypothesis. Start broad, then narrow down.
3. Prefer this tool order when relevant: grep_code -> read_file -> git_blame or git_log -> search_logs.
4. Stop once you have enough evidence. Do not keep calling tools without learning something new.
5. Use only facts supported by logs or tool results. If uncertain, say that uncertainty explicitly.
6. When you are done, return a concise incident report as JSON only.

The final JSON must include:
- report
- root_cause
- severity
- code_refs
- suggested_fix

Keep the report actionable for developers responding to a live incident.
Tool results arrive as JSON strings with fields like tool, ok, summary, data, and optional error.
Only add code_refs when the tool output includes concrete file evidence.
Do not wrap the final JSON in markdown.
""".strip()

TRIAGE_SCHEMA = {
    "name": "triage_result",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "escalate": {
                "type": "boolean",
                "description": "Whether the batch needs a deeper investigation.",
            },
            "reason": {
                "type": "string",
                "description": "Short explanation for the decision.",
            },
            "urgency": {
                "type": "string",
                "enum": ["low", "medium", "high"],
                "description": "Urgency level for follow-up work.",
            },
        },
        "required": ["escalate", "reason", "urgency"],
        "additionalProperties": False,
    },
}

INCIDENT_REPORT_SCHEMA = {
    "name": "incident_report",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "report": {"type": "string"},
            "root_cause": {"type": "string"},
            "severity": {
                "type": "string",
                "enum": ["low", "medium", "high", "critical"],
            },
            "code_refs": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "file": {"type": "string"},
                        "line": {"type": "integer"},
                        "snippet": {"type": "string"},
                        "blame": {"type": "string"},
                    },
                    "required": ["file"],
                    "additionalProperties": False,
                },
            },
            "suggested_fix": {"type": "string"},
        },
        "required": ["report", "root_cause", "severity", "code_refs", "suggested_fix"],
        "additionalProperties": False,
    },
}


def build_triage_user_prompt(logs: list[dict]) -> str:
    rendered_logs = "\n\n".join(_render_log_context(log) for log in logs)
    return (
        "Evaluate this medium-tier log batch and decide whether it should be escalated.\n"
        "Fields like route, scenario, error_name, error_message, and raw_preview carry real evidence.\n"
        "Return only JSON matching the schema.\n"
        f"Logs:\n{rendered_logs}"
    )


def build_investigation_user_prompt(
    logs: list[dict],
    reason: str,
    urgency: str,
) -> str:
    rendered_logs = "\n\n".join(_render_log_context(log) for log in logs)
    return (
        f"Investigation reason: {reason}\n"
        f"Urgency: {urgency}\n"
        f"Logs:\n{rendered_logs}\n"
        "Use tools when needed. Avoid repeated identical tool calls. "
        "Return only the final JSON object once you have enough evidence."
    )


def _render_log_context(log: dict) -> str:
    metadata = log.get("metadata", {}) or {}
    extra = metadata.get("extra", {}) if isinstance(metadata, dict) else {}
    raw_preview = _truncate(str(log.get("raw") or ""), 500)
    extra_summary = {
        key: extra.get(key)
        for key in ("route", "scenario", "productId", "productName", "errorName", "errorMessage")
        if extra.get(key) not in (None, "")
    }
    if extra and not extra_summary:
        extra_summary = extra

    lines = [
        f"- id={log.get('id')} level={log.get('level')} source={log.get('source')} "
        f"score={log.get('pipeline', {}).get('anomaly_score')} tier={log.get('pipeline', {}).get('tier')}",
        f"  message={log.get('message')}",
    ]
    if extra_summary:
        lines.append(f"  metadata={json.dumps(extra_summary, sort_keys=True, default=str)}")
    if raw_preview:
        lines.append(f"  raw_preview={raw_preview}")
    return "\n".join(lines)


def _truncate(value: str, limit: int) -> str:
    normalized = " ".join(value.split())
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[: limit - 3]}..."
