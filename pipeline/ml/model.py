"""Half-Space Trees streaming anomaly scorer.

Uses river's HalfSpaceTrees -- an online variant of IsolationForest that
learns from every log event. No offline training step needed.

The model starts empty and ramps up its influence via a dynamic blend weight.
"""

from __future__ import annotations

import logging
import pickle

from river.anomaly import HalfSpaceTrees

from shared.config import (
    feat_secs_since_error_cap,
    ml_max_weight,
    ml_n_trees,
    ml_snapshot_interval,
    ml_tree_height,
    ml_window_size,
    snapshot_backend,
    snapshot_gcs_bucket,
    snapshot_gcs_prefix,
    snapshot_local_dir,
)
from shared.models import LogEvent
from shared.snapshot import SnapshotManager

from .features import extract_features, get_feature_state, restore_feature_state

logger = logging.getLogger("snooplog.ml")

# Feature space boundaries -- HST needs these to partition effectively
FEATURE_LIMITS = {
    "level": (0, 4),            # debug=0 to fatal=4
    "msg_len": (0, 2000),       # typical log messages
    "new_template": (0, 1),     # binary
    "err_rate_60s": (0, 100),   # errors in last 60s
    "secs_since_err": (0, float(feat_secs_since_error_cap())),
    "entropy": (0, 6),          # Shannon entropy range for text
    "stack_trace": (0, 1),      # binary
    "err_burst_5s": (0, 50),    # errors in last 5s
}


class AnomalyScorer:
    """Streaming anomaly scorer using Half-Space Trees."""

    def __init__(self, window_size: int | None = None, enable_snapshots: bool = True):
        self._window_size = window_size or ml_window_size()
        self._max_weight = ml_max_weight()
        self._snapshot_interval = ml_snapshot_interval() if enable_snapshots else 0
        self._snapshots: SnapshotManager | None = None
        if enable_snapshots:
            self._snapshots = SnapshotManager(
                backend=snapshot_backend(),
                local_dir=snapshot_local_dir(),
                gcs_bucket=snapshot_gcs_bucket(),
                gcs_prefix=snapshot_gcs_prefix(),
            )
        self._model = HalfSpaceTrees(
            n_trees=ml_n_trees(),
            height=ml_tree_height(),
            window_size=self._window_size,
            limits=FEATURE_LIMITS,
            seed=42,
        )
        self._logs_seen: int = 0

        # Try to load existing snapshot on startup
        if enable_snapshots:
            self._load_snapshot()

    @property
    def logs_seen(self) -> int:
        return self._logs_seen

    @property
    def ml_weight(self) -> float:
        """Dynamic blend weight -- ramps from 0 to max_weight over first window_size logs."""
        return min(self._max_weight, self._logs_seen / self._window_size * self._max_weight)

    def score(self, event: LogEvent) -> float:
        """Score a log event and learn from it.

        Returns 0.0 (normal) to 1.0 (anomalous).
        """
        features = extract_features(event)

        # Score first, then learn (so we score against the existing baseline)
        raw = self._model.score_one(features)
        self._model.learn_one(features)
        self._logs_seen += 1

        # Auto-save snapshot every N logs
        if self._snapshot_interval and self._logs_seen % self._snapshot_interval == 0:
            self.save_snapshot()

        # river's score_one returns 0.0 (normal) to 1.0 (anomalous) already
        return round(raw, 3)

    def save_snapshot(self) -> bool:
        """Save model + feature state via snapshot manager."""
        if not self._snapshots:
            return False
        try:
            state = {
                "model": self._model,
                "logs_seen": self._logs_seen,
                "window_size": self._window_size,
                "max_weight": self._max_weight,
                "feature_state": get_feature_state(),
            }
            data = pickle.dumps(state)
            return self._snapshots.save("scorer.pkl", data)
        except Exception as e:
            logger.warning("Failed to save snapshot: %s", e)
            return False

    def _load_snapshot(self) -> bool:
        """Load model + feature state via snapshot manager."""
        if not self._snapshots:
            return False
        data = self._snapshots.load("scorer.pkl")
        if data is None:
            return False
        try:
            state = pickle.loads(data)
            self._model = state["model"]
            self._logs_seen = state["logs_seen"]
            self._window_size = state.get("window_size", self._window_size)
            self._max_weight = state.get("max_weight", self._max_weight)
            restore_feature_state(state.get("feature_state", {}))
            logger.info("Snapshot restored (%d logs seen)", self._logs_seen)
            return True
        except Exception as e:
            logger.warning("Failed to load snapshot, starting fresh: %s", e)
            return False


# Singleton (snapshots enabled for production, tests create their own with enable_snapshots=False)
scorer = AnomalyScorer()
