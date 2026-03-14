"""In-memory log buffer for the search_logs agent tool."""

from __future__ import annotations

import re
from collections import deque
from typing import Any

MAX_BUFFER_SIZE = 5000

_buffer: deque[dict[str, Any]] = deque(maxlen=MAX_BUFFER_SIZE)


def add_to_log_buffer(log_event: dict[str, Any]) -> None:
    """Called by ingestion after scoring. Stores log for search_logs tool."""
    _buffer.append(log_event)


def search_logs(pattern: str, minutes: int | None = None) -> list[dict[str, Any]]:
    """Search the in-memory log buffer by regex pattern, optionally within a time window."""
    from datetime import datetime, timedelta

    results = []
    cutoff = None
    if minutes:
        cutoff = datetime.utcnow() - timedelta(minutes=minutes)

    compiled = re.compile(pattern, re.IGNORECASE)
    for entry in _buffer:
        if cutoff:
            try:
                ts = datetime.fromisoformat(entry.get("timestamp", ""))
                if ts < cutoff:
                    continue
            except (ValueError, TypeError):
                pass
        if compiled.search(entry.get("message", "")):
            results.append(entry)
    return results
