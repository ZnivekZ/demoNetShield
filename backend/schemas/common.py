"""
Common schemas used across all API endpoints.
Enforces the consistent response envelope: {success, data, error}
"""

from __future__ import annotations

from typing import Any, Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class APIResponse(BaseModel, Generic[T]):
    """
    Standard API response envelope.
    Every endpoint returns this structure for consistency.
    """

    success: bool = True
    data: T | None = None
    error: str | None = None

    @classmethod
    def ok(cls, data: Any = None) -> "APIResponse":
        return cls(success=True, data=data, error=None)

    @classmethod
    def fail(cls, error: str) -> "APIResponse":
        return cls(success=False, data=None, error=error)
