"""Central config loader for SnoopLog.

Reads snooplog.yaml from the project root and exposes typed accessors.
Every value has a sensible default so the app works without any config file.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

# Walk up from shared/ to find project root
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_CONFIG_PATH = _PROJECT_ROOT / "snooplog.yaml"


def _load_raw() -> dict[str, Any]:
    """Load the raw YAML config dict. Returns empty dict if file missing."""
    if _CONFIG_PATH.exists():
        return yaml.safe_load(_CONFIG_PATH.read_text()) or {}
    return {}


@lru_cache(maxsize=1)
def get_config() -> dict[str, Any]:
    """Return the full config dict (cached after first call)."""
    return _load_raw()


def reload_config() -> dict[str, Any]:
    """Force-reload config from disk (clears cache)."""
    get_config.cache_clear()
    return get_config()


# ── Typed accessors ─────────────────────────────────────────

def _section(name: str) -> dict[str, Any]:
    return get_config().get(name, {}) or {}


# --- ML ---
def ml_n_trees() -> int:
    return _section("ml").get("n_trees", 25)

def ml_tree_height() -> int:
    return _section("ml").get("tree_height", 6)

def ml_window_size() -> int:
    return _section("ml").get("window_size", 10_000)

def ml_max_weight() -> float:
    return _section("ml").get("max_weight", 0.4)

def ml_snapshot_interval() -> int:
    return _section("ml").get("snapshot_interval", 1000)


# --- Snapshots ---
def snapshot_backend() -> str:
    return _section("snapshots").get("backend", "local")

def snapshot_local_dir() -> str:
    return _section("snapshots").get("local_dir", "data/snapshots")

def snapshot_gcs_bucket() -> str:
    return _section("snapshots").get("gcs_bucket", "")

def snapshot_gcs_prefix() -> str:
    return _section("snapshots").get("gcs_prefix", "snapshots")


# --- Features ---
def feat_error_window_maxlen() -> int:
    return _section("features").get("error_window_maxlen", 1000)

def feat_secs_since_error_cap() -> float:
    return _section("features").get("secs_since_error_cap", 300.0)

def feat_error_burst_window() -> int:
    return _section("features").get("error_burst_window", 5)


# --- Scoring ---
def scoring_level_base() -> dict[str, float]:
    defaults = {"fatal": 0.85, "error": 0.55, "warn": 0.25, "info": 0.05, "debug": 0.02, "unknown": 0.15}
    return _section("scoring").get("level_base", defaults) or defaults

def scoring_boosts() -> dict[str, float]:
    defaults = {"critical_keywords": 0.25, "error_keywords": 0.15, "warn_keywords": 0.10, "stack_trace": 0.10, "long_message": 0.05}
    return _section("scoring").get("boosts", defaults) or defaults

def scoring_long_message_threshold() -> int:
    return _section("scoring").get("long_message_threshold", 200)


# --- Tiers ---
def tier_high() -> float:
    return _section("tiers").get("high", 0.7)

def tier_medium() -> float:
    return _section("tiers").get("medium", 0.3)


# --- Filters ---
def filter_debug_level() -> bool:
    return _section("filters").get("debug_level", True)

def filter_health_checks() -> bool:
    return _section("filters").get("health_checks", True)

def filter_static_assets() -> bool:
    return _section("filters").get("static_assets", True)

def filter_k8s_probes() -> bool:
    return _section("filters").get("k8s_probes", True)


# --- Buffer ---
def buffer_max_size() -> int:
    return _section("buffer").get("max_size", 5000)


# --- CLI ---
def cli_default_endpoint() -> str:
    return _section("cli").get("default_endpoint", "http://localhost:3001")

def cli_batch_size() -> int:
    return _section("cli").get("batch_size", 50)

def cli_flush_interval() -> float:
    return _section("cli").get("flush_interval", 2.0)

def cli_http_timeout() -> int:
    return _section("cli").get("http_timeout", 5)
