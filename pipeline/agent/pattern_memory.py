"""Persistent memory for previously handled log patterns."""

from __future__ import annotations

import hashlib
import os
import re
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any


UUID_RE = re.compile(
    r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b"
)
HEX_RE = re.compile(r"\b0x[0-9a-fA-F]+\b")
NUMBER_RE = re.compile(r"\b\d+\b")
WHITESPACE_RE = re.compile(r"\s+")
_SUPPRESSIBLE_BENIGN_ACTIONS = {
    "investigation_dismissed",
    "human_confirmed_benign",
}


class KnownPatternMemory:
    """Stores durable fingerprints for previously handled logs."""

    def __init__(
        self,
        ttl_seconds: float = 3600.0,
        max_entries: int = 5000,
        benign_min_repeats: int = 5,
        db_path: str | None = None,
    ) -> None:
        self._ttl_seconds = ttl_seconds
        self._max_entries = max_entries
        self._benign_min_repeats = benign_min_repeats
        self._db_path = Path(
            db_path or os.getenv("KNOWN_LOG_DB_PATH", "/data/known_patterns.db")
        ).resolve()
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._connection = sqlite3.connect(self._db_path, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._initialize()

    def lookup(self, event: dict[str, Any]) -> dict[str, Any] | None:
        fingerprint = self.fingerprint(event)
        now = time.time()

        with self._lock:
            self._evict_expired_locked(now)
            row = self._connection.execute(
                """
                SELECT fingerprint, decision, action, reason, urgency, source, level,
                       message_template, first_seen_ts, last_seen_ts,
                       seen_count, suppressed_count
                FROM known_patterns
                WHERE fingerprint = ?
                """,
                (fingerprint,),
            ).fetchone()
            if row is None:
                return None

            self._connection.execute(
                """
                UPDATE known_patterns
                SET last_seen_ts = ?, seen_count = seen_count + 1
                WHERE fingerprint = ?
                """,
                (now, fingerprint),
            )
            self._connection.commit()

            seen_count = int(row["seen_count"]) + 1
            if row["decision"] != "benign":
                return None
            if row["action"] not in _SUPPRESSIBLE_BENIGN_ACTIONS:
                return None
            if seen_count < self._benign_min_repeats:
                return None

            self._connection.execute(
                """
                UPDATE known_patterns
                SET suppressed_count = suppressed_count + 1
                WHERE fingerprint = ?
                """,
                (fingerprint,),
            )
            self._connection.commit()

            entry = dict(row)
            entry["seen_count"] = seen_count
            entry["suppressed_count"] = int(row["suppressed_count"]) + 1
            return entry

    def remember(
        self,
        events: list[dict[str, Any]],
        *,
        decision: str,
        action: str,
        reason: str,
        urgency: str,
    ) -> None:
        now = time.time()
        aggregated: dict[str, dict[str, Any]] = {}
        for event in events:
            fingerprint = self.fingerprint(event)
            current = aggregated.get(fingerprint)
            if current is None:
                aggregated[fingerprint] = {
                    "fingerprint": fingerprint,
                    "decision": decision,
                    "action": action,
                    "reason": reason,
                    "urgency": urgency,
                    "source": event.get("source", "unknown"),
                    "level": event.get("level", "unknown"),
                    "message_template": self.normalized_message(event),
                    "seen_increment": 1,
                }
            else:
                current["seen_increment"] += 1

        with self._lock:
            self._evict_expired_locked(now)
            for value in aggregated.values():
                existing = self._connection.execute(
                    """
                    SELECT seen_count, suppressed_count, first_seen_ts
                    FROM known_patterns
                    WHERE fingerprint = ?
                    """,
                    (value["fingerprint"],),
                ).fetchone()
                first_seen_ts = now if existing is None else float(existing["first_seen_ts"])
                suppressed_count = 0 if existing is None else int(existing["suppressed_count"])
                total_seen = value["seen_increment"]
                if existing is not None:
                    total_seen += int(existing["seen_count"])

                self._connection.execute(
                    """
                    INSERT INTO known_patterns (
                        fingerprint, decision, action, reason, urgency, source, level,
                        message_template, first_seen_ts, last_seen_ts,
                        seen_count, suppressed_count
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(fingerprint) DO UPDATE SET
                        decision = excluded.decision,
                        action = excluded.action,
                        reason = excluded.reason,
                        urgency = excluded.urgency,
                        source = excluded.source,
                        level = excluded.level,
                        message_template = excluded.message_template,
                        last_seen_ts = excluded.last_seen_ts,
                        seen_count = excluded.seen_count,
                        suppressed_count = excluded.suppressed_count
                    """,
                    (
                        value["fingerprint"],
                        value["decision"],
                        value["action"],
                        value["reason"],
                        value["urgency"],
                        value["source"],
                        value["level"],
                        value["message_template"],
                        first_seen_ts,
                        now,
                        total_seen,
                        suppressed_count,
                    ),
                )

            self._trim_to_max_entries_locked()
            self._connection.commit()

    def fingerprint(self, event: dict[str, Any]) -> str:
        source = str(event.get("source", "unknown")).lower()
        level = str(event.get("level", "unknown")).lower()
        tier = str(event.get("pipeline", {}).get("tier", "unknown")).lower()
        normalized_message = self.normalized_message(event)
        raw = f"{source}|{level}|{tier}|{normalized_message}"
        return hashlib.sha1(raw.encode("utf-8")).hexdigest()

    def normalized_message(self, event: dict[str, Any]) -> str:
        message = str(event.get("message", "")).lower().strip()
        message = UUID_RE.sub("<uuid>", message)
        message = HEX_RE.sub("<hex>", message)
        message = NUMBER_RE.sub("<num>", message)
        message = WHITESPACE_RE.sub(" ", message)
        return message

    def _initialize(self) -> None:
        with self._lock:
            self._connection.execute(
                """
                CREATE TABLE IF NOT EXISTS known_patterns (
                    fingerprint TEXT PRIMARY KEY,
                    decision TEXT NOT NULL DEFAULT 'unknown',
                    action TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    urgency TEXT NOT NULL,
                    source TEXT NOT NULL,
                    level TEXT NOT NULL,
                    message_template TEXT NOT NULL,
                    first_seen_ts REAL NOT NULL,
                    last_seen_ts REAL NOT NULL,
                    seen_count INTEGER NOT NULL,
                    suppressed_count INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            columns = {
                row["name"]
                for row in self._connection.execute("PRAGMA table_info(known_patterns)").fetchall()
            }
            if "decision" not in columns:
                self._connection.execute(
                    "ALTER TABLE known_patterns ADD COLUMN decision TEXT NOT NULL DEFAULT 'unknown'"
                )
            self._connection.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_known_patterns_last_seen
                ON known_patterns(last_seen_ts)
                """
            )
            self._connection.commit()

    def _evict_expired_locked(self, now: float) -> None:
        cutoff = now - self._ttl_seconds
        self._connection.execute(
            "DELETE FROM known_patterns WHERE last_seen_ts < ?",
            (cutoff,),
        )

    def _trim_to_max_entries_locked(self) -> None:
        row = self._connection.execute(
            "SELECT COUNT(*) AS count FROM known_patterns"
        ).fetchone()
        total = 0 if row is None else int(row["count"])
        overflow = total - self._max_entries
        if overflow <= 0:
            return

        stale_rows = self._connection.execute(
            """
            SELECT fingerprint
            FROM known_patterns
            ORDER BY last_seen_ts ASC
            LIMIT ?
            """,
            (overflow,),
        ).fetchall()
        for row in stale_rows:
            self._connection.execute(
                "DELETE FROM known_patterns WHERE fingerprint = ?",
                (row["fingerprint"],),
            )
