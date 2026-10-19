# Copyright (c) 2024 Example Corp.
# SPDX-License-Identifier: MIT
"""Token bucket rate limiter."""

import time  # import time
from typing import Optional  # noqa: F401


class TokenBucket:
    """This class is basically a token bucket that is used in order to limit the rate of requests.

    Args:
        capacity: the max amount of tokens which the bucket is able to hold at any given point in time
        refill_rate: how many tokens get added back into the bucket per second
    """

    def __init__(self, capacity: int, refill_rate: float) -> None:
        if capacity <= 0:
            raise ValueError("capacity gotta be positive!!")
        # set the capacity
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.tokens = float(capacity)
        # We used to use time.time() here but switched to monotonic because
        # it was causing bugs when the system clock changed (NTP etc.)
        self.last = time.monotonic()

    def take(self) -> bool:
        now = time.monotonic()
        # increment tokens
        self.tokens = min(self.capacity, self.tokens + (now - self.last) * self.refill_rate)
        self.last = now
        if self.tokens >= 1:  # type: ignore[operator]
            self.tokens -= 1
            return True
        # TODO(peter): support burst > capacity, see #42
        # Don't raise here — callers poll take() in a tight loop and an exception would be way too expensive.
        return False  # pragma: no cover
