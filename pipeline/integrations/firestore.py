"""Firestore integration — persists logs, incidents, and stats for the dashboard.

Same pattern as discord.py: subscribes to bus events, writes to Firestore.
The dashboard reads from Firestore directly (client-side SDK, public reads).
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger("snooplog.integrations.firestore")

_db = None
_stats_ref = None

LOG_COLLECTION = "snooplog-logs"
INCIDENT_COLLECTION = "snooplog-incidents"
STATS_COLLECTION = "snooplog-stats"


def _get_db():
    global _db, _stats_ref
    if _db is None:
        from google.cloud import firestore  # lazy import

        _db = firestore.Client()
        _stats_ref = _db.collection(STATS_COLLECTION).document("current")
        if not _stats_ref.get().exists:
            _stats_ref.set({
                "logs_scored": 0,
                "triaged_batches": 0,
                "incidents_raised": 0,
                "tool_calls": 0,
                "logs_suppressed": 0,
            })
    return _db


def _on_log_scored(data: dict[str, Any]) -> None:
    try:
        from google.cloud import firestore

        db = _get_db()
        pipeline = data.get("pipeline", {})
        doc = {
            "id": data.get("id", ""),
            "timestamp": data.get("timestamp", ""),
            "level": data.get("level", ""),
            "message": data.get("message", ""),
            "source": data.get("source", ""),
            "score": pipeline.get("anomaly_score", 0),
            "tier": pipeline.get("tier", ""),
            "filtered": pipeline.get("filtered", False),
        }
        db.collection(LOG_COLLECTION).add(doc)
        _stats_ref.update({"logs_scored": firestore.Increment(1)})
    except Exception:
        logger.warning("Failed to write log to Firestore", exc_info=True)


def _on_incident_created(data: dict[str, Any]) -> None:
    try:
        from google.cloud import firestore

        db = _get_db()
        incident = data.get("incident", data)
        if not isinstance(incident, dict):
            incident = data
        doc = {
            "id": data.get("id", ""),
            "timestamp": data.get("timestamp", ""),
            "severity": incident.get("severity", "medium"),
            "source": data.get("source", ""),
            "report": incident.get("report", ""),
            "root_cause": incident.get("root_cause", ""),
            "suggested_fix": incident.get("suggested_fix", ""),
            "code_refs": incident.get("code_refs", []),
            "context_events": data.get("context_events", []),
            "log_count": data.get("log_count", 0),
            "investigation_reason": data.get("investigation_reason", ""),
            "primary_event": data.get("primary_event", {}),
            "related_log_ids": data.get("related_log_ids", []),
        }
        db.collection(INCIDENT_COLLECTION).add(doc)
        _stats_ref.update({"incidents_raised": firestore.Increment(1)})
    except Exception:
        logger.warning("Failed to write incident to Firestore", exc_info=True)


def _on_triaged(_data: dict[str, Any]) -> None:
    try:
        from google.cloud import firestore

        _get_db()
        _stats_ref.update({"triaged_batches": firestore.Increment(1)})
    except Exception:
        pass


def _on_tool_call(_data: dict[str, Any]) -> None:
    try:
        from google.cloud import firestore

        _get_db()
        _stats_ref.update({"tool_calls": firestore.Increment(1)})
    except Exception:
        pass


def _on_suppressed(_data: dict[str, Any]) -> None:
    try:
        from google.cloud import firestore

        _get_db()
        _stats_ref.update({"logs_suppressed": firestore.Increment(1)})
    except Exception:
        pass


def configure_firestore_integration() -> None:
    """Subscribe to bus events. Call during app startup."""
    from shared.events import bus

    if os.getenv("FIRESTORE_ENABLED", "").lower() not in ("1", "true", "yes"):
        logger.info("Firestore integration disabled (set FIRESTORE_ENABLED=true to enable)")
        return

    logger.info("Firestore integration enabled — subscribing to bus events")
    bus.subscribe("log:scored", _on_log_scored)
    bus.subscribe("incident:created", _on_incident_created)
    bus.subscribe("log:triaged", _on_triaged)
    bus.subscribe("agent:tool_call", _on_tool_call)
    bus.subscribe("log:suppressed", _on_suppressed)
