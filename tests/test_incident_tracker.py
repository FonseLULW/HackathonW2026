import importlib.util
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "pipeline" / "agent" / "incident_tracker.py"
MODULE_SPEC = importlib.util.spec_from_file_location("test_incident_tracker_module", MODULE_PATH)
assert MODULE_SPEC is not None and MODULE_SPEC.loader is not None
incident_tracker_module = importlib.util.module_from_spec(MODULE_SPEC)
sys.modules[MODULE_SPEC.name] = incident_tracker_module
MODULE_SPEC.loader.exec_module(incident_tracker_module)

IncidentCorrelationTracker = incident_tracker_module.IncidentCorrelationTracker


class _FakePatternMemory:
    def fingerprint(self, event: dict) -> str:
        return f"{event.get('source')}|{event.get('level')}|{event.get('message')}"


def make_event(event_id: str, message: str) -> dict:
    return {
        "id": event_id,
        "timestamp": "2026-03-15T11:00:00Z",
        "source": "dummy-app",
        "level": "error",
        "message": message,
        "pipeline": {"tier": "high", "anomaly_score": 0.91},
    }


class IncidentCorrelationTrackerTests(unittest.IsolatedAsyncioTestCase):
    async def test_duplicate_logs_attach_to_existing_incident(self) -> None:
        tracker = IncidentCorrelationTracker(
            pattern_memory=_FakePatternMemory(),
            stale_after_seconds=3600,
        )
        first = make_event("log-1", "Silent product selection error captured")
        second = make_event("log-2", "Silent product selection error captured")

        should_investigate, updated_payload = await tracker.begin_or_attach([first])
        self.assertTrue(should_investigate)
        self.assertIsNone(updated_payload)

        should_investigate, updated_payload = await tracker.begin_or_attach([second])
        self.assertFalse(should_investigate)
        self.assertIsNone(updated_payload)

        created = await tracker.mark_created(
            [first],
            {
                "id": first["id"],
                "timestamp": first["timestamp"],
                "source": first["source"],
                "incident": {"severity": "high", "report": "report"},
                "report": "report",
                "root_cause": "root",
                "suggested_fix": "fix",
                "primary_log_id": first["id"],
                "related_log_ids": [first["id"]],
                "context_events": [],
                "log_count": 1,
            },
        )

        self.assertEqual(created["id"], tracker.correlation_key([first]))
        self.assertEqual(created["occurrence_count"], 2)
        self.assertEqual(created["trigger_count"], 2)
        self.assertEqual(created["related_log_ids"], ["log-1", "log-2"])

        third = make_event("log-3", "Silent product selection error captured")
        should_investigate, updated_payload = await tracker.begin_or_attach([third])

        self.assertFalse(should_investigate)
        self.assertIsNotNone(updated_payload)
        assert updated_payload is not None
        self.assertEqual(updated_payload["id"], created["id"])
        self.assertEqual(updated_payload["occurrence_count"], 3)
        self.assertEqual(updated_payload["trigger_count"], 3)
        self.assertEqual(updated_payload["related_log_ids"], ["log-1", "log-2", "log-3"])

    async def test_distinct_messages_create_distinct_incidents(self) -> None:
        tracker = IncidentCorrelationTracker(
            pattern_memory=_FakePatternMemory(),
            stale_after_seconds=3600,
        )
        first = make_event("log-1", "Database pool exhausted")
        second = make_event("log-2", "Permission denied for token")

        first_result = await tracker.begin_or_attach([first])
        second_result = await tracker.begin_or_attach([second])

        self.assertTrue(first_result[0])
        self.assertTrue(second_result[0])
        self.assertNotEqual(
            tracker.correlation_key([first]),
            tracker.correlation_key([second]),
        )


if __name__ == "__main__":
    unittest.main()
