# Config & Data API (Spec A) — Design

**Date:** 2026-07-19
**Status:** Approved design → ready for implementation plan
**Branch:** feat/rep-trainer-runtime-loop

## Goal

A FastAPI backend that serves the **real** rep-trainer data the Next.js frontend
currently hardcodes in `frontend/lib/data.ts` (fake personas, 126 procedurally
generated reps, a canned script), and hands off live roleplay calls to the existing
LiveKit voice agent. It is a thin, read-mostly layer over already-built modules —
it exposes data, it does not re-implement logic.

## Scope

**In scope (Spec A)**
- REST endpoints for call-types, personas, difficulties, rep profiles, team analytics.
- `POST /api/sessions`: create a roleplay session — mint a LiveKit room + join token,
  set room metadata, persist a session record. This is the only real-time touchpoint.
- Wire the Next.js frontend to the API (typed client replacing `lib/data.ts`).

**Out of scope (separate specs / existing runtime)**
- The live call itself: WebRTC media, live transcript, turn-taking, in-call scoring —
  owned by the existing LiveKit voice agent (`src/agent.py`).
- Post-call scoring computation (the agent/scorer writes scores; the API only reads them).
- Authentication beyond v1 (see Decisions).

## Decisions

- **Auth v1: none.** Internal tool; the rep is identified by their profile `slug` passed
  in requests. Real per-user auth is a deferred v2 spec, required before any external exposure.
- **Deps:** `fastapi`, `uvicorn[standard]` go in a new `[dependency-groups] api` group
  (keep the voice-agent image lean). `livekit-api` is already available via `livekit-agents`.
- **Reuse over reimplement:** endpoints call existing `src/bot_config.py` and
  `cleaned_data/db.py` functions; the API adds HTTP + validation only.

## Architecture

FastAPI app in a new `api/` package, run beside Next.js (uvicorn :8000, Next :3000),
CORS restricted to the Next origin (env-configurable). Reads come straight from the
existing sources of truth; the only new persisted state is a `sessions` table.

```
api/
  __init__.py
  main.py             # app, CORS, routers, ApiResponse envelope, exception handlers
  settings.py         # env: DB path, LiveKit URL/key/secret, allowed CORS origins
  deps.py             # sqlite connection dependency (reuses cleaned_data.db.connect)
  schemas.py          # Pydantic v2 request/response models
  livekit_session.py  # mint join token + room metadata
  routers/
    catalog.py        # /call-types, /personas, /difficulties  (from prompts/*.yaml)
    reps.py           # /reps, /reps/{slug}, /reps/{slug}/drill-plan  (from rep_trainer.db)
    analytics.py      # /analytics/team-weaknesses
    sessions.py       # POST /sessions, GET /sessions/{id}
tests/
  test_api.py         # FastAPI TestClient over fixtures; LiveKit mint mocked
frontend/
  lib/api.ts          # typed fetch client (replaces the static lib/data.ts exports)
```

## Data sources (no duplication)

| Data | Source | Access |
|------|--------|--------|
| call-types | `prompts/call_types/*.yaml` | `bot_config.load_layer("call_types", slug)` |
| personas | `prompts/bots/*.yaml` + `prompts/personas/*.yaml` | `load_layer` |
| difficulties | `prompts/difficulty/*.yaml` | `load_layer` |
| rep list / profile | `cleaned_data/rep_trainer.db` | `db.build_profile_dict`, plain queries |
| drill plan | `rep_trainer.db` | `db.get_rep_drill_plan` |
| team analytics | `rep_trainer.db` | `db.team_weakness_ranking` |
| sessions | new `sessions` table in `rep_trainer.db` | new `db` helpers |

**Materialization dependency (operational, not a code blocker):** catalog endpoints work
today (YAML exists). `/reps` and `/analytics` return data only after the data-layer pipeline
runs — Stage 1 (offline) populates reps/calls; Stage 2 (needs `OPENROUTER_API_KEY`) populates
weakness detail. Until then those endpoints return an empty list with `success: true` (a valid
empty state, not an error).

## Endpoints

All responses use `ApiResponse<T> = {success: bool, data: T | None, error: str | None}`.

- `GET /api/call-types` → `[{slug, label, locked, rep_objective}]`
- `GET /api/personas` → `[{slug, character_name, business_name, industry, primary_objection}]`
- `GET /api/difficulties` → `[{level, skepticism_baseline}]`
- `GET /api/reps` → `[{slug, name, avg_total_score, grade_normalized, top_weakness}]`
- `GET /api/reps/{slug}` → full `build_profile_dict` shape; **404** if unknown slug
- `GET /api/reps/{slug}/drill-plan` → `[{weakness_type, frequency, coaching_fix}]`
- `GET /api/analytics/team-weaknesses` → `[{label, rep_count, call_count}]`
- `POST /api/sessions` — body `{rep_slug, call_type, persona_slug, difficulty}`:
  validates each against the catalog (**400** on unknown value), mints LiveKit room+token,
  persists the session (`status="created"`), returns `{session_id, room, token, livekit_url}`.
  **502** if the LiveKit mint fails.
- `GET /api/sessions/{id}` → `{session_id, status, score}`; **404** if unknown.

## LiveKit handoff

`POST /api/sessions` builds room metadata `{"session_id","rep_slug","bot_slug","difficulty"}`
(JSON string), mints a join token with `livekit.api.AccessToken` scoped to that room, and
returns it. The existing agent already reads `ctx.room.metadata` (`src/agent.py:331`) to
resolve identity/persona, so it consumes `bot_slug`/`rep_slug` the same way — **no agent
change is required for this spec** (switching the agent from `build_prospect_prompt` to
`build_bot_prompt` is a later runtime task). Token TTL and grants (room-join only) set
server-side. Secrets come from env; never returned in errors.

## Frontend wiring

- New `frontend/lib/api.ts`: typed functions (`getCallTypes`, `getPersonas`, `getDifficulties`,
  `getReps`, `getRepProfile`, `getTeamWeaknesses`, `startSession`) hitting
  `process.env.NEXT_PUBLIC_API_BASE`, each returning the unwrapped `data` or throwing on `!success`.
- `app/page.tsx` (dashboard) fetches catalog + reps; `app/roleplay/page.tsx` "Start Call"
  calls `startSession(...)` then connects to LiveKit with the returned token.
- Delete the fake `PERSONA_DEFS`, `PROFILE_DEFS`, and `SCRIPT` from `lib/data.ts`
  (keep pure styling constants like `ACCENT`/`CARD_BG` if still used).
- Frontend shows loading / empty / error states around each fetch (empty `/reps` is a valid
  empty state until the data layer is populated).

## Error handling

- Pydantic v2 models validate all POST bodies (422 on malformed input).
- A single FastAPI exception handler wraps responses in the `ApiResponse` envelope.
- Explicit status codes: 404 (unknown rep/persona/session), 400 (invalid session selection),
  502 (LiveKit mint failure). Error messages are user-safe; secrets/tracebacks never leak.
- CORS limited to configured Next origins.

## Testing

`pytest` + FastAPI `TestClient`:
- Catalog endpoints return the expected shape from the real `prompts/*.yaml` (e.g. `closing`
  present with `locked` flag; `april-alvarado` persona present).
- `/reps` etc. tested against a temp SQLite seeded like `cleaned_data` tests; empty DB → `[]` with `success: true`.
- `/reps/{unknown}` → 404; `POST /sessions` with a bad `call_type` → 400.
- `POST /sessions` happy path with the LiveKit `AccessToken` mint **mocked** → returns
  `session_id` + token + persists a `sessions` row.
- Underlying reused functions are already unit-tested; API tests cover HTTP + validation only.

## Migration / compatibility

- No changes to `src/agent.py`, `src/bot_config.py`, or `cleaned_data/` logic — the API imports them.
- Adds `sessions` table via `CREATE TABLE IF NOT EXISTS` (additive; existing schema untouched).
- `lib/data.ts` static data is removed in favor of `lib/api.ts` (frontend behavior preserved,
  data now real).

## Open items (implementation-time)
- Exact LiveKit token TTL and whether the frontend participant identity = rep slug.
- Whether `/api/sessions` also triggers agent dispatch (LiveKit Cloud agent dispatch) or the
  agent is a standing worker that picks up the room — confirm against current deploy.
- Run the data-layer pipeline so `/reps` and `/analytics` have data (operational, not code).
