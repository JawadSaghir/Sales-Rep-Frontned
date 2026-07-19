"""Runtime settings from environment, with repo-relative defaults."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    rep_csv: Path
    objection_csv: Path
    sessions_db: Path
    prompts_dir: Path
    cors_origins: tuple[str, ...]
    livekit_url: str
    livekit_key: str
    livekit_secret: str


def load_settings() -> Settings:
    data = _ROOT / "data" / "cleaned_data"
    origins = os.environ.get("API_CORS_ORIGINS", "http://localhost:3000")
    return Settings(
        rep_csv=Path(os.environ.get("REP_CSV", data / "Sale-Rep-Profile.csv")),
        objection_csv=Path(os.environ.get("OBJECTION_CSV", data / "Objection_data.csv")),
        sessions_db=Path(os.environ.get("SESSIONS_DB", _ROOT / "data" / "sessions.db")),
        prompts_dir=Path(os.environ.get("PROMPTS_DIR", _ROOT / "prompts")),
        cors_origins=tuple(o.strip() for o in origins.split(",") if o.strip()),
        livekit_url=os.environ.get("LIVEKIT_URL", ""),
        livekit_key=os.environ.get("LIVEKIT_API_KEY", ""),
        livekit_secret=os.environ.get("LIVEKIT_API_SECRET", ""),
    )
