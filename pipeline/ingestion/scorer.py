"""Heuristic fallback scorer — works without a trained model.

Scores based on log level, message keywords, message length, and stack trace presence.
Returns 0.0 (normal) → 1.0 (anomalous). Used until IsolationForest model is trained.
"""

from __future__ import annotations

import json
import re

from shared.config import scoring_boosts, scoring_level_base, scoring_long_message_threshold, tier_high, tier_medium
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
    r"typeerror|referenceerror|attributeerror|keyerror|indexerror|"
    r"cannot read properties of null|undefined is not a function|"
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

def heuristic_score(event: LogEvent) -> float:
    """Score a log event using heuristics. Returns 0.0-1.0."""
    level_base = scoring_level_base()
    boosts = scoring_boosts()

    score = level_base.get(event.level.value, 0.15)
    evidence = _build_scoring_evidence(event)

    # Keyword boosts
    if _CRITICAL_KEYWORDS.search(evidence):
        score += boosts.get("critical_keywords", 0.25)
    elif _ERROR_KEYWORDS.search(evidence):
        score += boosts.get("error_keywords", 0.15)
    elif _WARN_KEYWORDS.search(evidence):
        score += boosts.get("warn_keywords", 0.10)

    # Stack traces often live in raw payloads rather than the short message field.
    if "\n" in evidence and (re.search(r"^\s+at ", evidence, re.MULTILINE) or "Traceback" in evidence):
        score += boosts.get("stack_trace", 0.10)

    # Long messages tend to be more interesting (errors have details)
    if len(evidence) > scoring_long_message_threshold():
        score += boosts.get("long_message", 0.05)

    return min(score, 1.0)


def _build_scoring_evidence(event: LogEvent) -> str:
    parts = [event.message, event.raw or ""]
    metadata = event.metadata.extra or {}
    if metadata:
        parts.append(json.dumps(metadata, sort_keys=True, default=str))
    return "\n".join(part for part in parts if part)


def assign_tier(score: float) -> Tier:
    """Map anomaly score to tier."""
    if score > tier_high():
        return Tier.HIGH
    if score >= tier_medium():
        return Tier.MEDIUM
    return Tier.LOW
