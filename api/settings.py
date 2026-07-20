"""Runtime settings from environment, with repo-relative defaults."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

_ROOT = Path(__file__).resolve().parent.parent

#: LiveKit vars the browser handoff needs. Without all three, `/api/sessions`
#: cannot create a room or mint a join token.
LIVEKIT_VARS = ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET")


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

    def missing_livekit_vars(self) -> tuple[str, ...]:
        """Names of the LiveKit vars that are unset, in LIVEKIT_VARS order."""
        values = (self.livekit_url, self.livekit_key, self.livekit_secret)
        return tuple(
            name for name, value in zip(LIVEKIT_VARS, values) if not value.strip()
        )


def load_settings(env_file: Path | None = None) -> Settings:
    # Secrets live in .env.local (gitignored), matching src/agent.py. Without
    # this the API only worked when uvicorn happened to inherit the vars from
    # the shell, so a fresh terminal produced an unconfigured API and the
    # roleplay page hung on "Waiting for the prospect…".
    # override=False keeps an explicitly exported var authoritative.
    load_dotenv(
        env_file or Path(os.environ.get("API_ENV_FILE", _ROOT / ".env.local")),
        override=False,
    )
    data = _ROOT / "data" / "cleaned_data"
    origins = os.environ.get("API_CORS_ORIGINS", "http://localhost:3000")
    return Settings(
        rep_csv=Path(os.environ.get("REP_CSV", data / "Sale-Rep-Profile.csv")),
        objection_csv=Path(
            os.environ.get("OBJECTION_CSV", data / "Objection_data.csv")
        ),
        sessions_db=Path(os.environ.get("SESSIONS_DB", _ROOT / "data" / "sessions.db")),
        prompts_dir=Path(
            os.environ.get("PROMPTS_DIR", _ROOT / "context" / "data")
        ),
        cors_origins=tuple(o.strip() for o in origins.split(",") if o.strip()),
        livekit_url=os.environ.get("LIVEKIT_URL", ""),
        livekit_key=os.environ.get("LIVEKIT_API_KEY", ""),
        livekit_secret=os.environ.get("LIVEKIT_API_SECRET", ""),
    )
