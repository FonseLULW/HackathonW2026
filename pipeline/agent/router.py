"""Tier routing for scored log events."""

from __future__ import annotations

import logging
from typing import Any

from pipeline.agent.payloads import build_suppressed_event_payload
from shared.events import bus

logger = logging.getLogger("snooplog.agent.router")


class TierRouter:
    """Routes scored logs to archive, triage, or investigation paths."""

    def __init__(self, batcher, investigator, pattern_memory=None, incident_tracker=None) -> None:
        self._batcher = batcher
        self._investigator = investigator
        self._pattern_memory = pattern_memory
        self._incident_tracker = incident_tracker

    async def handle(self, event: dict[str, Any]) -> None:
        pipeline_state = event.get("pipeline", {})
        tier = pipeline_state.get("tier", "low")

        if pipeline_state.get("filtered"):
            logger.debug("Skipping filtered log %s", event.get("id"))
            return

        if tier in {"medium", "high"} and self._pattern_memory is not None:
            memory_entry = self._pattern_memory.lookup(event)
            if memory_entry is not None:
                logger.info(
                    "Suppressing known-benign pattern %s (seen=%s, suppressed=%s) | reason: %s | template: %s",
                    event.get("id", "?")[:8],
                    memory_entry.get("seen_count"),
                    memory_entry.get("suppressed_count"),
                    memory_entry.get("reason", "unknown"),
                    (memory_entry.get("message_template") or "")[:80],
                )
                await bus.emit(
                    "log:suppressed",
                    build_suppressed_event_payload(
                        event=event,
                        memory_entry=memory_entry,
                    ),
                )
                return

        if tier == "low":
            await bus.emit("log:archived", event)
            return

        if tier == "medium":
            logger.info(
                "MEDIUM tier log %s (score=%.3f) → batching for triage | %s",
                event.get("id", "?")[:8],
                pipeline_state.get("anomaly_score", 0),
                (event.get("message") or "")[:80],
            )
            await self._batcher.add(event)
            return

        if self._incident_tracker is not None:
            should_investigate, updated_payload = await self._incident_tracker.begin_or_attach([event])
            if not should_investigate:
                if updated_payload is not None:
                    logger.info(
                        "Attached duplicate HIGH tier log %s to incident %s (occurrences=%s)",
                        event.get("id", "?")[:8],
                        updated_payload.get("id", "?")[:8],
                        updated_payload.get("occurrence_count", 0),
                    )
                    await bus.emit("incident:updated", updated_payload)
                else:
                    logger.info(
                        "Attached HIGH tier log %s to in-flight incident investigation",
                        event.get("id", "?")[:8],
                    )
                return
        logger.warning(
            "HIGH tier log %s (score=%.3f) → immediate investigation | %s",
            event.get("id", "?")[:8],
            pipeline_state.get("anomaly_score", 0),
            (event.get("message") or "")[:80],
        )
        await self._investigator.investigate(
            [event],
            reason="high anomaly score",
            urgency="high",
        )
