import importlib.util
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest import mock

MODULE_PATH = Path(__file__).resolve().parents[1] / "pipeline" / "agent" / "pattern_memory.py"
MODULE_SPEC = importlib.util.spec_from_file_location("test_pattern_memory_module", MODULE_PATH)
assert MODULE_SPEC is not None and MODULE_SPEC.loader is not None
pattern_memory_module = importlib.util.module_from_spec(MODULE_SPEC)
MODULE_SPEC.loader.exec_module(pattern_memory_module)
KnownPatternMemory = pattern_memory_module.KnownPatternMemory


def make_event(message: str) -> dict:
    return {
        "source": "dummy-app",
        "level": "error",
        "message": message,
        "pipeline": {"tier": "high"},
    }


class KnownPatternMemorySnapshotTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)
        self.snapshot_dir = self.root / "snapshots"
        self.patches = [
            mock.patch.object(pattern_memory_module, "snapshot_backend", return_value="local"),
            mock.patch.object(pattern_memory_module, "snapshot_local_dir", return_value=str(self.snapshot_dir)),
            mock.patch.object(pattern_memory_module, "snapshot_gcs_bucket", return_value=""),
            mock.patch.object(pattern_memory_module, "snapshot_gcs_prefix", return_value="snapshots"),
        ]
        for patcher in self.patches:
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_save_and_restore_snapshot(self) -> None:
        db_path = self.root / "runtime" / "known_patterns.db"
        memory = KnownPatternMemory(db_path=str(db_path))
        memory.remember(
            [make_event("Database connection refused for tenant 42")],
            decision="benign",
            action="investigation_dismissed",
            reason="known flake",
            urgency="low",
        )

        self.assertTrue(memory.save_snapshot())
        memory.close()
        db_path.unlink()

        restored = KnownPatternMemory(db_path=str(db_path))
        row = restored._connection.execute(
            "SELECT fingerprint, reason, seen_count FROM known_patterns"
        ).fetchone()

        self.assertIsNotNone(row)
        self.assertEqual(row["reason"], "known flake")
        self.assertEqual(row["seen_count"], 1)
        restored.close()

    def test_restore_skips_existing_populated_db(self) -> None:
        seed_db_path = self.root / "seed" / "known_patterns.db"
        seed_memory = KnownPatternMemory(db_path=str(seed_db_path))
        seed_memory.remember(
            [make_event("Seed snapshot message")],
            decision="benign",
            action="investigation_dismissed",
            reason="snapshot copy",
            urgency="low",
        )
        self.assertTrue(seed_memory.save_snapshot())
        seed_memory.close()

        target_db_path = self.root / "runtime" / "known_patterns.db"
        target_db_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(target_db_path)
        connection.execute(
            """
            CREATE TABLE known_patterns (
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
        connection.execute(
            """
            INSERT INTO known_patterns (
                fingerprint, decision, action, reason, urgency, source, level,
                message_template, first_seen_ts, last_seen_ts, seen_count, suppressed_count
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "existing-row",
                "benign",
                "investigation_dismissed",
                "keep-local",
                "low",
                "dummy-app",
                "error",
                "existing message",
                1.0,
                1.0,
                1,
                0,
            ),
        )
        connection.commit()
        connection.close()

        restored = KnownPatternMemory(db_path=str(target_db_path))
        rows = restored._connection.execute(
            "SELECT fingerprint, reason FROM known_patterns ORDER BY fingerprint"
        ).fetchall()

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["fingerprint"], "existing-row")
        self.assertEqual(rows[0]["reason"], "keep-local")
        restored.close()


if __name__ == "__main__":
    unittest.main()
