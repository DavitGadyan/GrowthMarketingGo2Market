"""In-memory pub/sub for live updates. One process, one event loop.

Channels: "run:{run_id}" and "chat:{company_id}". Every message is an
envelope {"type": ..., "data": {...}} - the frontend switches on `type`.
"""
from __future__ import annotations

import asyncio
from collections import defaultdict
from collections.abc import AsyncIterator
from typing import Any

_subscribers: dict[str, set[asyncio.Queue]] = defaultdict(set)
_loop: asyncio.AbstractEventLoop | None = None


def bind_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


def publish(channel: str, envelope: dict[str, Any]) -> None:
    """Thread-safe-ish: if called from a worker thread we hop to the bound loop."""
    queues = list(_subscribers.get(channel, ()))
    if not queues:
        return
    try:
        running = asyncio.get_running_loop()
    except RuntimeError:
        running = None
    if running is None and _loop is not None:
        for q in queues:
            _loop.call_soon_threadsafe(q.put_nowait, envelope)
        return
    for q in queues:
        q.put_nowait(envelope)


async def subscribe(channel: str) -> AsyncIterator[dict[str, Any]]:
    q: asyncio.Queue = asyncio.Queue()
    _subscribers[channel].add(q)
    try:
        while True:
            item = await q.get()
            yield item
    finally:
        _subscribers[channel].discard(q)
        if not _subscribers[channel]:
            _subscribers.pop(channel, None)


def subscriber_count(channel: str) -> int:
    return len(_subscribers.get(channel, ()))


class Subscription:
    """Register first, replay history, then drain - no gap in between."""

    def __init__(self, channel: str):
        self.channel = channel
        self.queue: asyncio.Queue = asyncio.Queue()
        _subscribers[channel].add(self.queue)

    async def get(self) -> dict[str, Any]:
        return await self.queue.get()

    def close(self) -> None:
        _subscribers[self.channel].discard(self.queue)
        if not _subscribers[self.channel]:
            _subscribers.pop(self.channel, None)
