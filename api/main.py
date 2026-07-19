"""FastAPI app: CORS, routers, health, and a uniform error envelope."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.schemas import fail, ok
from api.settings import load_settings

settings = load_settings()
app = FastAPI(title="Rep Trainer Config & Data API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exc_handler(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=fail(str(exc.detail)))


@app.get("/api/health")
def health() -> dict:
    return ok({"status": "ok"})
