"""Analytics endpoints — team objection ranking from Objection_data.csv."""

from __future__ import annotations

from fastapi import APIRouter

from api import objection_store
from api.schemas import ok
from api.settings import load_settings

router = APIRouter(prefix="/api")


@router.get("/analytics/team-weaknesses")
def team_weaknesses() -> dict:
    """Return team ranking of objections by frequency."""
    rows = objection_store.load_rows(load_settings().objection_csv)
    return ok(objection_store.team_ranking(rows))
