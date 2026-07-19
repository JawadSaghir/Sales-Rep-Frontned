"""Rep endpoints — aggregated from the Sale-Rep-Profile CSV."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from api import rep_store
from api.schemas import ok
from api.settings import load_settings

router = APIRouter(prefix="/api")


def _rows() -> list[dict]:
    return rep_store.load_rows(load_settings().rep_csv)


@router.get("/reps")
def reps() -> dict:
    return ok(rep_store.rep_summaries(_rows()))


@router.get("/reps/{slug}")
def rep_detail(slug: str) -> dict:
    prof = rep_store.rep_profile(_rows(), slug)
    if prof is None:
        raise HTTPException(status_code=404, detail=f"no rep {slug!r}")
    return ok(prof)


@router.get("/reps/{slug}/drill-plan")
def drill_plan(slug: str) -> dict:
    return ok(rep_store.rep_drill_plan(_rows(), slug))
