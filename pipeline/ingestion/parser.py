"""Log parser — normalizes any input format to LogEvent.

Handles three input types:
1. Structured JSON dict — extract fields directly
2. Text matching regex — TIMESTAMP LEVEL [SERVICE] MESSAGE
3. Fallback — entire line as message, level=unknown
"""

from __future__ import annotations

import re
from typing import Any

from shared.models import LogEvent, LogLevel, LogMetadata

# Matches: 2026-03-14T10:01:00.000Z INFO [dummy-app] Server started
_TEXT_PATTERN = re.compile(
    r"^(?P<timestamp>\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s+"
    r"(?P<level>\w+)\s+"
    r"\[(?P<service>[^\]]+)\]\s+"
    r"(?P<message>.+)$",
    re.DOTALL,
)

_VALID_LEVELS = {lvl.value for lvl in LogLevel}


def parse_log(raw: dict[str, Any] | str) -> LogEvent:
    """Parse a raw log entry into a LogEvent."""
    if isinstance(raw, dict):
        return _parse_structured(raw)
    return _parse_text(raw)


def _parse_structured(raw: dict[str, Any]) -> LogEvent:
    """Parse a structured JSON dict into a LogEvent."""
    level = _normalize_level(raw.get("level", ""))
    metadata = raw.get("metadata", {})

    return LogEvent(
        timestamp=raw.get("timestamp", ""),
        source=raw.get("source") or raw.get("service") or "unknown",
        level=level,
        message=raw.get("message", ""),
        raw=raw.get("raw"),
        metadata=LogMetadata(
            service=raw.get("service") or raw.get("source") or "unknown",
            host=metadata.get("host"),
            container_id=metadata.get("container_id"),
            extra={k: v for k, v in metadata.items() if k not in ("host", "container_id")},
        ),
    )


def _parse_text(line: str) -> LogEvent:
    """Parse a plain-text log line. Try regex first, then fallback."""
    line = line.strip()
    match = _TEXT_PATTERN.match(line)
    if match:
        return LogEvent(
            timestamp=match.group("timestamp"),
            source=match.group("service"),
            level=_normalize_level(match.group("level")),
            message=match.group("message"),
            raw=line,
            metadata=LogMetadata(service=match.group("service")),
        )

    # Fallback: entire line as message
    return LogEvent(
        source="unknown",
        level=LogLevel.UNKNOWN,
        message=line,
        raw=line,
    )


def _normalize_level(level_str: str) -> LogLevel:
    """Normalize a level string to LogLevel enum."""
    normalized = level_str.strip().lower()
    # Handle common aliases
    if normalized in ("warning", "wrn"):
        normalized = "warn"
    elif normalized in ("err",):
        normalized = "error"
    elif normalized in ("crit", "critical", "emerg", "emergency", "panic"):
        normalized = "fatal"
    elif normalized in ("dbg", "trace", "verbose"):
        normalized = "debug"

    if normalized in _VALID_LEVELS:
        return LogLevel(normalized)
    return LogLevel.UNKNOWN
