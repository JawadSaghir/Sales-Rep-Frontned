"""Dump all Mem0 long-term memories to the local ``memory/`` folder.

Mem0 stores memories in the cloud (api.mem0.ai), so there's no way to inspect
them without pulling them down. Run this any time to refresh a local, readable
mirror:

    uv run scripts/dump_memory.py

Outputs, into ``memory/``:
    memories.json  — full raw records (nothing dropped)
    index.md       — at-a-glance Markdown index

Requires ``MEM0_API_KEY`` (loaded from .env.local / .env).
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

# Make ``src`` importable when run as a plain script.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.memory_export import fetch_all, write_export  # noqa: E402

OUT_DIR = Path(__file__).resolve().parent.parent / "memory"


def main() -> int:
    # .env.local wins over .env for local secrets like MEM0_API_KEY.
    load_dotenv(".env.local")
    load_dotenv(".env")

    try:
        from mem0 import MemoryClient
    except ImportError:
        print("mem0ai is not installed. Run: uv sync", file=sys.stderr)
        return 1

    try:
        client = MemoryClient()
    except Exception as exc:  # network / missing-key / auth
        print(f"Could not connect to Mem0: {exc}", file=sys.stderr)
        return 1

    memories_by_user = fetch_all(client)
    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    snapshot = write_export(OUT_DIR, memories_by_user, generated_at=generated_at)

    print(
        f"Wrote {snapshot['total_memories']} memories across "
        f"{snapshot['user_count']} trainee(s) to {OUT_DIR}"
    )
    for user_id, data in snapshot["users"].items():
        print(f"  - {user_id}: {data['count']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
