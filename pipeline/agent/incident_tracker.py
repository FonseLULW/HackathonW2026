"""Correlate repeated incidents so one investigation can absorb follow-up logs."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import time
from collections import deque
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


def _event_summary(event: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": event.get("id"),
        "level": event.get("level"),
        "message": event.get("message"),
        "score": event.get("pipeline", {}).get("anomaly_score"),
        "tier": event.get("pipeline", {}).get("tier"),
    }


@dataclass
class _TrackedIncident:
    key: str
    source: str
    first_seen_at: str
    last_seen_at: str
    occurrence_count: int = 0
    trigger_count: int = 0
    related_log_ids: deque[str] = field(default_factory=lambda: deque(maxlen=50))
    context_events: deque[dict[str, Any]] = field(default_factory=lambda: deque(maxlen=10))
    incident_payload: dict[str, Any] | None = None
    investigation_in_progress: bool = True


class IncidentCorrelationTracker:
    """Tracks active incidents and folds duplicate logs into them."""

    def __init__(
        self,
        *,
        pattern_memory=None,
        stale_after_seconds: float | None = None,
    ) -> None:
        self._pattern_memory = pattern_memory
        self._stale_after_seconds = stale_after_seconds or float(
            os.getenv("INCIDENT_CORRELATION_TTL_SECONDS", "1800")
        )
        self._incidents: dict[str, _TrackedIncident] = {}
        self._lock = asyncio.Lock()

    async def begin_or_attach(
        self,
        logs: list[dict[str, Any]],
    ) -> tuple[bool, dict[str, Any] | None]:
        """Reserve a new investigation or attach logs to an existing incident."""
        key = self.correlation_key(logs)

        async with self._lock:
            self._evict_stale_locked()
            entry = self._incidents.get(key)
            if entry is None:
                entry = _TrackedIncident(
                    key=key,
                    source=logs[0].get("source", "unknown"),
                    first_seen_at=str(logs[0].get("timestamp", "")),
                    last_seen_at=str(logs[-1].get("timestamp", "")),
                )
                self._incidents[key] = entry
                self._append_logs_locked(entry, logs)
                return True, None

            self._append_logs_locked(entry, logs)
            if entry.incident_payload is None:
                return False, None

            return False, self._build_payload_locked(entry)

    async def mark_created(
        self,
        logs: list[dict[str, Any]],
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Mark an incident as created and enrich the payload with correlation state."""
        key = self.correlation_key(logs)

        async with self._lock:
            self._evict_stale_locked()
            entry = self._incidents.get(key)
            if entry is None:
                entry = _TrackedIncident(
                    key=key,
                    source=payload.get("source", logs[0].get("source", "unknown")),
                    first_seen_at=str(payload.get("timestamp", logs[0].get("timestamp", ""))),
                    last_seen_at=str(payload.get("timestamp", logs[-1].get("timestamp", ""))),
                )
                self._append_logs_locked(entry, logs)
                self._incidents[key] = entry

            entry.investigation_in_progress = False
            entry.incident_payload = deepcopy(payload)
            return self._build_payload_locked(entry)

    def correlation_key(self, logs: list[dict[str, Any]]) -> str:
        fingerprints = sorted({self._event_fingerprint(log) for log in logs})
        raw = json.dumps(
            {
                "source": logs[0].get("source", "unknown"),
                "fingerprints": fingerprints,
            },
            sort_keys=True,
        )
        return hashlib.sha1(raw.encode("utf-8")).hexdigest()

    def _event_fingerprint(self, event: dict[str, Any]) -> str:
        if self._pattern_memory is not None and hasattr(self._pattern_memory, "fingerprint"):
            return str(self._pattern_memory.fingerprint(event))

        source = str(event.get("source", "unknown")).lower()
        level = str(event.get("level", "unknown")).lower()
        tier = str(event.get("pipeline", {}).get("tier", "unknown")).lower()
        message = str(event.get("message", "")).strip().lower()
        raw = f"{source}|{level}|{tier}|{message}"
        return hashlib.sha1(raw.encode("utf-8")).hexdigest()

    def _append_logs_locked(self, entry: _TrackedIncident, logs: list[dict[str, Any]]) -> None:
        entry.occurrence_count += len(logs)
        entry.trigger_count += 1
        entry.last_seen_at = str(logs[-1].get("timestamp", entry.last_seen_at))
        for log in logs:
            log_id = log.get("id")
            if log_id:
                entry.related_log_ids.append(str(log_id))
            entry.context_events.append(_event_summary(log))

    def _build_payload_locked(self, entry: _TrackedIncident) -> dict[str, Any]:
        payload = deepcopy(entry.incident_payload) if entry.incident_payload is not None else {}
        payload["id"] = entry.key
        payload["incident_id"] = entry.key
        payload["correlation_key"] = entry.key
        payload["timestamp"] = entry.last_seen_at or payload.get("timestamp", "")
        payload["first_seen_timestamp"] = entry.first_seen_at
        payload["last_seen_timestamp"] = entry.last_seen_at
        payload["occurrence_count"] = entry.occurrence_count
        payload["trigger_count"] = entry.trigger_count
        payload["related_log_ids"] = list(entry.related_log_ids)
        payload["log_count"] = entry.occurrence_count
        payload["context_events"] = list(entry.context_events)
        if entry.context_events:
            payload["latest_event"] = entry.context_events[-1]
        return payload

    def _evict_stale_locked(self) -> None:
        now = time.time()
        stale_keys = [
            key
            for key, entry in self._incidents.items()
            if now - _parse_timestamp(entry.last_seen_at) > self._stale_after_seconds
        ]
        for key in stale_keys:
            self._incidents.pop(key, None)


def _parse_timestamp(value: str) -> float:
    if not value:
        return time.time()
    try:
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.timestamp()
    except Exception:
        return time.time()
