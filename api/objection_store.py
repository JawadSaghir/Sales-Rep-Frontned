"""Read Objection_data.csv → objection-type ranking. Pure over row lists."""

from __future__ import annotations

import csv
from collections import Counter
from pathlib import Path

from api.rep_store import clean


def load_rows(csv_path: str | Path) -> list[dict]:
    """Load rows from CSV file. Return [] if file missing."""
    p = Path(csv_path)
    if not p.is_file():
        return []
    csv.field_size_limit(10**9)
    with open(p, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def team_ranking(rows: list[dict]) -> list[dict]:
    """Count objection_type, drop blanks, return [{objection_type, count}] descending."""
    counts = Counter(clean(r.get("objection_type")) for r in rows)
    counts.pop("", None)
    return [{"objection_type": k, "count": n} for k, n in counts.most_common()]
