"""Pre-filter rules — drops noise before ML scoring.

Filtered logs are still emitted (dashboard needs them for stats) but marked filtered=True.
"""

from __future__ import annotations

import re

from shared.config import filter_debug_level, filter_health_checks, filter_k8s_probes, filter_static_assets
from shared.models import LogEvent, LogLevel

_HEALTH_PATTERNS = re.compile(
    r"/health|readiness|liveness|healthz|readyz|livez",
    re.IGNORECASE,
)

_STATIC_PATTERNS = re.compile(
    r"(?:GET|POST|PUT|DELETE|HEAD|OPTIONS)\s+\S+\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|map)\b",
    re.IGNORECASE,
)

_K8S_PATTERNS = re.compile(
    r"kube-probe|GoogleHC|ELB-HealthChecker",
    re.IGNORECASE,
)


def apply_filters(event: LogEvent) -> LogEvent:
    """Check all filter rules. Sets event.pipeline.filtered and filter_reason if matched."""
    msg = event.message
    source = event.source

    # Rule 1: debug-level logs
    if filter_debug_level() and event.level == LogLevel.DEBUG:
        event.pipeline.filtered = True
        event.pipeline.filter_reason = "debug-level"
        return event

    # Rule 2: health checks
    if filter_health_checks() and _HEALTH_PATTERNS.search(msg):
        event.pipeline.filtered = True
        event.pipeline.filter_reason = "health-check"
        return event

    # Rule 3: static assets
    if filter_static_assets() and _STATIC_PATTERNS.search(msg):
        event.pipeline.filtered = True
        event.pipeline.filter_reason = "static-asset"
        return event

    # Rule 4: k8s probes
    if filter_k8s_probes() and (_K8S_PATTERNS.search(msg) or _K8S_PATTERNS.search(source)):
        event.pipeline.filtered = True
        event.pipeline.filter_reason = "k8s-probe"
        return event

    return event
