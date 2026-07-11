FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

# ffmpeg is only needed by the optional local download mirror.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --extra download
COPY main.py ./
COPY spotify_mirror ./spotify_mirror

ENV PYTHONUNBUFFERED=1
CMD ["uv", "run", "--no-sync", "main.py", "--execute", "--loop"]
