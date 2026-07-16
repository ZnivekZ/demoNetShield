"""
Service resilience primitives — isolation, timeouts, and circuit breakers.

Goal: ensure that a failing external dependency (MikroTik, GLPI, Wazuh,
CrowdSec, …) cannot block the asyncio event loop, cannot saturate the
shared ThreadPoolExecutor, and cannot cascade failures to other services.

This module is intentionally small and dependency-free so it can be
imported from anywhere in the backend without circular dependency risk.

Three primitives:

  • IsolatedExecutor — a per-service ThreadPoolExecutor. Each service that
    needs to run blocking I/O gets its own pool, so a hung service can
    only starve its own threads, not the rest of the backend.

  • CircuitBreaker — per-service state machine. After
    `failure_threshold` consecutive failures the breaker opens for
    `cooldown_seconds`, during which calls short-circuit (return the
    supplied fallback without touching the underlying service). After the
    cooldown it goes to `half-open`: one probe call is allowed; if it
    succeeds the breaker resets, if it fails the breaker re-opens.

  • safe_call — convenience wrapper that combines:
      1. check the breaker
      2. run the call in the isolated executor with a hard timeout
      3. update the breaker based on the outcome
      4. return `fallback` on any failure

Configuration defaults (override per-instance as needed):
  failure_threshold = 3
  cooldown_seconds  = 30.0
  call_timeout      = 8.0
"""
from __future__ import annotations

import asyncio
import inspect
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from enum import Enum
from typing import Any, Awaitable, Callable, Optional, Union

import structlog

logger = structlog.get_logger(__name__)


# ── Circuit breaker ────────────────────────────────────────────────────────

class BreakerState(str, Enum):
    CLOSED = "closed"        # normal — calls run
    OPEN = "open"            # tripped — calls short-circuit
    HALF_OPEN = "half-open"  # probing — next call decides


class CircuitBreaker:
    """Lightweight circuit breaker keyed by service name (for logging)."""

    def __init__(
        self,
        name: str,
        failure_threshold: int = 3,
        cooldown_seconds: float = 30.0,
    ) -> None:
        self.name = name
        self.failure_threshold = failure_threshold
        self.cooldown_seconds = cooldown_seconds
        self._state: BreakerState = BreakerState.CLOSED
        self._failures: int = 0
        self._opened_at: float = 0.0
        self._half_open_in_flight: bool = False

    # ── Inspection helpers (used by health endpoint) ──────────────

    @property
    def state(self) -> str:
        return self._state.value

    @property
    def failures(self) -> int:
        return self._failures

    @property
    def seconds_until_retry(self) -> float:
        """Remaining cooldown, or 0.0 if not open."""
        if self._state != BreakerState.OPEN:
            return 0.0
        elapsed = time.monotonic() - self._opened_at
        return max(0.0, self.cooldown_seconds - elapsed)

    def snapshot(self) -> dict:
        return {
            "name": self.name,
            "state": self.state,
            "failures": self.failures,
            "cooldown_seconds": self.cooldown_seconds,
            "seconds_until_retry": round(self.seconds_until_retry, 2),
        }

    # ── Mutation ───────────────────────────────────────────────────

    def is_open(self) -> bool:
        """True if the breaker is currently short-circuiting calls.
        Transitions OPEN → HALF_OPEN automatically once the cooldown elapses.
        """
        if self._state == BreakerState.OPEN:
            if time.monotonic() - self._opened_at >= self.cooldown_seconds:
                logger.info("resilience_breaker_half_open", breaker=self.name)
                self._state = BreakerState.HALF_OPEN
                self._half_open_in_flight = False
                return False
            return True
        return False

    def allow_request(self) -> bool:
        """Reserve a probe slot in half-open state. Returns False if a
        probe is already running; callers should short-circuit in that case.
        """
        if self._state == BreakerState.HALF_OPEN:
            if self._half_open_in_flight:
                return False
            self._half_open_in_flight = True
            return True
        return True  # closed state always allows

    def record_success(self) -> None:
        if self._state != BreakerState.CLOSED:
            logger.info(
                "resilience_breaker_closed",
                breaker=self.name,
                previous_failures=self._failures,
            )
        self._state = BreakerState.CLOSED
        self._failures = 0
        self._half_open_in_flight = False

    def record_failure(self) -> None:
        self._failures += 1
        if self._state == BreakerState.HALF_OPEN:
            # probe failed → reopen immediately
            self._state = BreakerState.OPEN
            self._opened_at = time.monotonic()
            self._half_open_in_flight = False
            logger.warning(
                "resilience_breaker_reopened_from_probe",
                breaker=self.name,
                cooldown_seconds=self.cooldown_seconds,
            )
            return
        if self._failures >= self.failure_threshold:
            if self._state != BreakerState.OPEN:
                self._state = BreakerState.OPEN
                self._opened_at = time.monotonic()
                logger.warning(
                    "resilience_breaker_opened",
                    breaker=self.name,
                    failures=self._failures,
                    cooldown_seconds=self.cooldown_seconds,
                )


# ── Isolated executor ─────────────────────────────────────────────────────

class IsolatedExecutor:
    """A dedicated ThreadPoolExecutor for one service.

    Why: `asyncio.to_thread()` uses a global executor shared across the
    whole process. If one service blocks N threads (e.g. waiting on a
    dead remote), every other `to_thread` call has to wait for a worker
    to free up. With an isolated pool a hung service can only starve its
    own workers; other services are unaffected.

    Pool sizes are kept small (default 2): the goal is to bound the
    blast radius, not to parallelize aggressively. Services that need
    more parallelism can opt in by raising `max_workers`.
    """

    def __init__(self, name: str, max_workers: int = 2) -> None:
        self.name = name
        self._executor = ThreadPoolExecutor(
            max_workers=max_workers,
            thread_name_prefix=f"svc-{name}",
        )

    async def run(self, func: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        """Run a sync callable in this executor. Returns a coroutine."""
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, lambda: func(*args, **kwargs))

    def shutdown(self, wait: bool = False) -> None:
        try:
            self._executor.shutdown(wait=wait, cancel_futures=not wait)
        except Exception:  # pragma: no cover — shutdown best-effort
            pass


# ── safe_call: the one entry point for external service calls ─────────────

# Either an async coroutine function/callable, or a sync callable to be
# scheduled via the isolated executor.
SyncOrAsync = Union[
    Callable[..., Any],
    Callable[..., Awaitable[Any]],
]


async def safe_call(
    func: SyncOrAsync,
    *args: Any,
    fallback: Any = None,
    timeout_s: float = 8.0,
    breaker: Optional[CircuitBreaker] = None,
    executor: Optional[IsolatedExecutor] = None,
    service_name: Optional[str] = None,
    **kwargs: Any,
) -> Any:
    """Call an external dependency safely.

    Steps:
      1. If `breaker` is open (and not in half-open probe mode), skip the
         call and return `fallback`.
      2. Run the call:
           • if `func` is a coroutine function or returns a coroutine,
             schedule it directly on the loop (no executor, no thread);
           • otherwise, schedule it on `executor` (must be provided for
             sync callables).
      3. Wrap in `asyncio.wait_for(timeout_s)`. On timeout, cancel and
         propagate as a synthetic `safe_call_timeout` exception that the
         caller can choose to catch or treat as a normal failure.
      4. Update the breaker based on the outcome. Pass the breaker a
         success on return; a failure (exception, timeout, or open-circuit
         probe rejected) increments the failure counter.

    Returns the call result, or `fallback` if:
      • the circuit is open
      • the call timed out
      • the call raised
      • the half-open probe slot was already taken
    """
    name = service_name or breaker.name if breaker else (executor.name if executor else "unknown")

    # 1. Breaker check
    if breaker is not None and breaker.is_open():
        logger.debug("resilience_circuit_open_skip", service=name)
        return fallback
    if breaker is not None and not breaker.allow_request():
        # half-open probe already running
        logger.debug("resilience_probe_in_flight_skip", service=name)
        return fallback

    # 2. Determine how to schedule the call
    is_coro_factory = (
        inspect.iscoroutinefunction(func)
        or (callable(func) and asyncio.iscoroutinefunction(getattr(func, "__call__", None)))
    )

    try:
        if is_coro_factory:
            coro = func(*args, **kwargs)
            result = await asyncio.wait_for(coro, timeout=timeout_s)
        else:
            if executor is None:
                raise RuntimeError(
                    f"safe_call for sync func {name!r} needs an IsolatedExecutor"
                )
            result = await asyncio.wait_for(
                executor.run(func, *args, **kwargs),
                timeout=timeout_s,
            )
    except asyncio.TimeoutError:
        logger.warning(
            "resilience_call_timeout",
            service=name,
            timeout_s=timeout_s,
        )
        if breaker is not None:
            breaker.record_failure()
        return fallback
    except Exception as e:
        logger.warning(
            "resilience_call_failed",
            service=name,
            error=repr(e),
            error_type=type(e).__name__,
        )
        if breaker is not None:
            breaker.record_failure()
        return fallback

    if breaker is not None:
        breaker.record_success()
    return result


# ── Global registry (used by /api/health/services) ────────────────────────

class ResilienceRegistry:
    """Holds references to every breaker + executor in the process so the
    health endpoint can introspect them without each service having to
    register itself manually.

    Services should call `register()` in their `__init__`.
    """

    def __init__(self) -> None:
        self.breakers: dict[str, CircuitBreaker] = {}
        self.executors: dict[str, IsolatedExecutor] = {}

    def register(self, breaker: CircuitBreaker, executor: Optional[IsolatedExecutor] = None) -> None:
        self.breakers[breaker.name] = breaker
        if executor is not None:
            self.executors[executor.name] = executor

    def snapshot(self) -> dict:
        return {
            "breakers": {n: b.snapshot() for n, b in self.breakers.items()},
            "executors": {n: {"name": n, "max_workers": e._executor._max_workers}
                          for n, e in self.executors.items()},
        }


# Process-wide singleton
_registry: ResilienceRegistry = ResilienceRegistry()


def get_resilience_registry() -> ResilienceRegistry:
    return _registry


# ── Convenience: all the defaults in one object ────────────────────────────

def make_resilience(
    name: str,
    failure_threshold: int = 3,
    cooldown_seconds: float = 30.0,
    max_workers: int = 2,
) -> tuple[CircuitBreaker, IsolatedExecutor]:
    """Build a coupled breaker + executor pair for a service and register
    both in the global registry. This is the typical entry point for each
    service's `__init__`.
    """
    breaker = CircuitBreaker(
        name=name,
        failure_threshold=failure_threshold,
        cooldown_seconds=cooldown_seconds,
    )
    executor = IsolatedExecutor(name=name, max_workers=max_workers)
    _registry.register(breaker, executor)
    return breaker, executor