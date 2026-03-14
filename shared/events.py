"""Non-blocking event bus with WebSocket broadcasting."""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import Any, Callable

from fastapi import WebSocket

logger = logging.getLogger("snooplog.events")


class EventBus:
    """Async event bus. emit() is non-blocking — async subscribers run as background tasks."""

    def __init__(self) -> None:
        self._subscribers: dict[str, list[Callable]] = defaultdict(list)
        self._ws_clients: list[WebSocket] = []

    def subscribe(self, event_type: str, callback: Callable) -> None:
        self._subscribers[event_type].append(callback)

    def unsubscribe(self, event_type: str, callback: Callable) -> None:
        self._subscribers[event_type] = [
            cb for cb in self._subscribers[event_type] if cb is not callback
        ]

    async def emit(self, event_type: str, data: dict[str, Any]) -> None:
        """Non-blocking: wraps async subscribers in create_task()."""
        for callback in self._subscribers.get(event_type, []):
            if asyncio.iscoroutinefunction(callback):
                asyncio.create_task(callback(data))
            else:
                try:
                    callback(data)
                except Exception:
                    logger.exception("Sync subscriber error for %s", event_type)

        # Broadcast to WebSocket clients
        stale: list[WebSocket] = []
        for ws in self._ws_clients:
            try:
                await ws.send_json({"type": event_type, "data": data})
            except Exception:
                stale.append(ws)
        for ws in stale:
            self._ws_clients.remove(ws)

    def register_ws(self, ws: WebSocket) -> None:
        self._ws_clients.append(ws)

    def unregister_ws(self, ws: WebSocket) -> None:
        if ws in self._ws_clients:
            self._ws_clients.remove(ws)


# Singleton instance used across the pipeline
bus = EventBus()
