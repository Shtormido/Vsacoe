"""Глобальный ограничитель скорости (token bucket), общий для всех потоков."""

from __future__ import annotations

import threading
import time


class RateLimiter:
    def __init__(self, rate: float, burst: int | None = None):
        self.rate = max(rate, 0.01)
        self.capacity = burst or max(1, int(rate))
        self.tokens = float(self.capacity)
        self.updated = time.monotonic()
        self.lock = threading.Lock()

    def acquire(self) -> None:
        while True:
            with self.lock:
                now = time.monotonic()
                self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
                self.updated = now
                if self.tokens >= 1:
                    self.tokens -= 1
                    return
                wait = (1 - self.tokens) / self.rate
            time.sleep(wait)
