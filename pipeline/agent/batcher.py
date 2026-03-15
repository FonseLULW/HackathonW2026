"""Medium-tier log batching for cheap triage."""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import Any

from pipeline.agent.payloads import build_triage_event_payload
from shared.events import bus

logger = logging.getLogger("snooplog.agent.batcher")


class MediumLogBatcher:
    """Batch medium-tier logs by source before triage."""

    def __init__(
        self,
        triage_client,
        investigator,
        pattern_memory=None,
        incident_tracker=None,
        flush_window_seconds: float = 30.0,
        max_batch_size: int = 20,
    ) -> None:
        self._triage_client = triage_client
        self._investigator = investigator
        self._pattern_memory = pattern_memory
        self._incident_tracker = incident_tracker
        self._flush_window_seconds = flush_window_seconds
        self._max_batch_size = max_batch_size
        self._batches: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self._flush_tasks: dict[str, asyncio.Task[None]] = {}
        self._lock = asyncio.Lock()

    async def add(self, event: dict[str, Any]) -> None:
        source = event.get("source", "unknown")
        should_flush = False

        async with self._lock:
            self._batches[source].append(event)
            if source not in self._flush_tasks:
                self._flush_tasks[source] = asyncio.create_task(self._delayed_flush(source))
            if len(self._batches[source]) >= self._max_batch_size:
                should_flush = True

        if should_flush:
            await self.flush_source(source)

    async def flush_source(self, source: str) -> None:
        batch = await self._pop_batch(source)
        if not batch:
            return

        triage = await self._triage_client.triage(batch)
        triage_payload = build_triage_event_payload(source, batch, triage.model_dump())
        await bus.emit("log:triaged", triage_payload)

        if triage.escalate:
            logger.warning(
                "Triage ESCALATED %d logs from %s → investigation | reason: %s",
                len(batch), source, triage.reason,
            )
        else:
            logger.info(
                "Triage dismissed %d logs from %s | reason: %s",
                len(batch), source, triage.reason,
            )

        if triage.escalate:
            if self._incident_tracker is not None:
                should_investigate, updated_payload = await self._incident_tracker.begin_or_attach(batch)
                if not should_investigate:
                    if updated_payload is not None:
                        logger.info(
                            "Attached %d escalated log(s) from %s to incident %s (occurrences=%s)",
                            len(batch),
                            source,
                            updated_payload.get("id", "?")[:8],
                            updated_payload.get("occurrence_count", 0),
                        )
                        await bus.emit("incident:updated", updated_payload)
                    else:
                        logger.info(
                            "Attached %d escalated log(s) from %s to in-flight incident investigation",
                            len(batch),
                            source,
                        )
                    return
            await self._investigator.investigate(
                batch,
                reason=triage.reason,
                urgency=triage.urgency,
            )

    async def shutdown(self) -> None:
        async with self._lock:
            sources = list(self._batches.keys())
            tasks = list(self._flush_tasks.values())
            self._flush_tasks.clear()

        for task in tasks:
            task.cancel()

        for source in sources:
            await self.flush_source(source)

    async def _delayed_flush(self, source: str) -> None:
        try:
            await asyncio.sleep(self._flush_window_seconds)
            await self.flush_source(source)
        except asyncio.CancelledError:
            logger.debug("Flush task cancelled for source=%s", source)
            raise

    async def _pop_batch(self, source: str) -> list[dict[str, Any]]:
        async with self._lock:
            batch = list(self._batches.pop(source, []))
            task = self._flush_tasks.pop(source, None)

        if task is not None and task is not asyncio.current_task():
            task.cancel()

        return batch
