# syntax=docker/dockerfile:1
# Production image for deploying the agent worker to LiveKit Cloud (`lk agent create`).
ARG PYTHON_VERSION=3.13
FROM ghcr.io/astral-sh/uv:python${PYTHON_VERSION}-bookworm-slim AS base

ENV PYTHONUNBUFFERED=1

# --- Build stage: install deps and pre-download ML models ---
FROM base AS build

RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    python3-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency files first for efficient layer caching.
COPY pyproject.toml uv.lock ./
RUN mkdir -p src
RUN uv sync --locked

# Copy the rest of the app (excludes .dockerignore entries).
COPY . .

# Pre-download turn-detector / VAD models so the container starts instantly.
RUN uv run "src/agent.py" download-files

# --- Production stage: no build tools in the final image ---
FROM base

ARG UID=10001
RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/app" \
    --shell "/sbin/nologin" \
    --uid "${UID}" \
    appuser

COPY --from=build --chown=appuser:appuser /app /app

WORKDIR /app
USER appuser

# "start" connects to LiveKit Cloud and waits for calls (production mode).
CMD ["uv", "run", "src/agent.py", "start"]
