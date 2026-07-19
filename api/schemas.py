"""Response envelope helpers."""

from __future__ import annotations

from typing import Any


def ok(data: Any) -> dict:
    return {"success": True, "data": data, "error": None}


def fail(error: str) -> dict:
    return {"success": False, "data": None, "error": error}
