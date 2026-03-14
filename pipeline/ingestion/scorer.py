"""Heuristic fallback scorer — works without a trained model.

Scores based on log level, message keywords, message length, and stack trace presence.
Returns 0.0 (normal) → 1.0 (anomalous). Used until IsolationForest model is trained.
"""

from __future__ import annotations

import re

from shared.models import LogEvent, Tier

# Keywords that indicate serious problems
_CRITICAL_KEYWORDS = re.compile(
    r"FATAL|ECONNREFUSED|ENOMEM|OOM|out of memory|heap limit|"
    r"cannot recover|forcing shutdown|segfault|SIGSEGV|SIGKILL|"
    r"panic|core dump",
    re.IGNORECASE,
)

_ERROR_KEYWORDS = re.compile(
    r"traceback|stack trace|exception|unhandled|"
    r"connection refused|connection lost|connection terminated|"
    r"too many connections|permission denied|access denied|"
    r"timeout|timed out|deadline exceeded|"
    r"disk full|no space left|"
    r"webhook.*fail|signature.*fail",
    re.IGNORECASE,
)

_WARN_KEYWORDS = re.compile(
    r"slow query|rate limit|deprecated|"
    r"pool.*(low|exhaust)|disk usage.*(8\d|9\d)%|"
    r"retry|backoff|circuit.?breaker",
    re.IGNORECASE,
)

# Base scores by level
_LEVEL_BASE: dict[str, float] = {
    "fatal": 0.85,
    "error": 0.55,
    "warn": 0.25,
    "info": 0.05,
    "debug": 0.02,
    "unknown": 0.15,
}


def heuristic_score(event: LogEvent) -> float:
    """Score a log event using heuristics. Returns 0.0-1.0."""
    score = _LEVEL_BASE.get(event.level.value, 0.15)
    msg = event.message

    # Keyword boosts
    if _CRITICAL_KEYWORDS.search(msg):
        score += 0.25
    elif _ERROR_KEYWORDS.search(msg):
        score += 0.15
    elif _WARN_KEYWORDS.search(msg):
        score += 0.10

    # Stack trace presence (multi-line with "at " or "Traceback")
    if "\n" in msg and (re.search(r"^\s+at ", msg, re.MULTILINE) or "Traceback" in msg):
        score += 0.10

    # Long messages tend to be more interesting (errors have details)
    if len(msg) > 200:
        score += 0.05

    return min(score, 1.0)


def assign_tier(score: float) -> Tier:
    """Map anomaly score to tier."""
    if score > 0.7:
        return Tier.HIGH
    if score >= 0.3:
        return Tier.MEDIUM
    return Tier.LOW
