"""Shared payload builders for Person 2 event emissions."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from shared.models import IncidentReport


def build_triage_event_payload(
    source: str,
    batch: list[dict[str, Any]],
    triage: dict[str, Any],
) -> dict[str, Any]:
    return {
        "source": source,
        "count": len(batch),
        "log_ids": [event.get("id") for event in batch],
        "escalated": bool(triage.get("escalate")),
        "reason": triage.get("reason", ""),
        "urgency": triage.get("urgency", "low"),
        "triage": triage,
        "events": [
            {
                "id": event.get("id"),
                "level": event.get("level"),
                "message": event.get("message"),
                "score": event.get("pipeline", {}).get("anomaly_score"),
                "tier": event.get("pipeline", {}).get("tier"),
            }
            for event in batch[:10]
        ],
    }


def build_tool_call_event_payload(
    *,
    tool_name: str,
    tool_args: dict[str, Any],
    result: str,
    log_ids: list[str | None],
    source: str,
    tool_call_id: str | None = None,
) -> dict[str, Any]:
    summary = ""
    try:
        parsed = json.loads(result)
        if isinstance(parsed, dict):
            summary = parsed.get("summary", "")
    except json.JSONDecodeError:
        pass

    return {
        "stage": "investigation",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "tool": tool_name,
        "tool_call_id": tool_call_id,
        "args": tool_args,
        "ok": not result.startswith("Tool failed:"),
        "summary": summary,
        "result": result,
        "result_preview": result[:200],
        "related_log_ids": log_ids,
    }


def build_incident_event_payload(
    *,
    logs: list[dict[str, Any]],
    incident: IncidentReport,
    reason: str,
    urgency: str,
) -> dict[str, Any]:
    primary = dict(logs[0])
    incident_data = incident.model_dump()
    primary["incident"] = incident_data
    # Flatten incident fields to top level so dashboard normalizers find them
    primary.update(incident_data)
    primary["source"] = primary.get("source", logs[0].get("source", "unknown"))
    primary["primary_log_id"] = logs[0].get("id")
    primary["related_log_ids"] = [log.get("id") for log in logs]
    primary["log_count"] = len(logs)
    primary["investigation_reason"] = reason
    primary["investigation_urgency"] = urgency
    primary["primary_event"] = {
        "id": logs[0].get("id"),
        "level": logs[0].get("level"),
        "message": logs[0].get("message"),
        "score": logs[0].get("pipeline", {}).get("anomaly_score"),
        "tier": logs[0].get("pipeline", {}).get("tier"),
    }
    primary["context_events"] = [
        {
            "id": log.get("id"),
            "level": log.get("level"),
            "message": log.get("message"),
            "score": log.get("pipeline", {}).get("anomaly_score"),
            "tier": log.get("pipeline", {}).get("tier"),
        }
        for log in logs[:10]
    ]
    return primary


def build_suppressed_event_payload(
    *,
    event: dict[str, Any],
    memory_entry: dict[str, Any],
) -> dict[str, Any]:
    return {
        "source": event.get("source", "unknown"),
        "log_id": event.get("id"),
        "level": event.get("level"),
        "message": event.get("message"),
        "fingerprint": memory_entry.get("fingerprint"),
        "previous_decision": memory_entry.get("decision", "unknown"),
        "previous_action": memory_entry.get("action"),
        "previous_reason": memory_entry.get("reason"),
        "previous_urgency": memory_entry.get("urgency"),
        "seen_count": memory_entry.get("seen_count", 1),
        "suppressed_count": memory_entry.get("suppressed_count", 0),
        "message_template": memory_entry.get("message_template", ""),
    }
