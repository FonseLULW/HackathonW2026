FROM python:3.12-slim

# git is needed for agent tool calls (grep_code, git_blame, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

RUN groupadd -r snooplog && useradd -r -g snooplog -m snooplog

WORKDIR /app

# Build context is repo root (see docker-compose.yml / cloudbuild)
COPY pipeline/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY shared/ /app/shared/
COPY pipeline/ /app/pipeline/
COPY snooplog.yaml /app/snooplog.yaml

# Writable dirs for SQLite, snapshots, and repo clone
RUN mkdir -p /data /app/data /repo \
    && chown -R snooplog:snooplog /data /app/data /repo

USER snooplog

EXPOSE 3001

# Clone repo at startup (for agent tool calls), then launch uvicorn
CMD ["sh", "-c", "\
  if [ -n \"$REPO_URL\" ] && [ ! -d /repo/.git ]; then \
    echo 'Cloning repo...' && git clone --depth=1 \"$REPO_URL\" /repo 2>/dev/null || echo 'Repo clone failed (non-fatal)'; \
  fi && \
  exec uvicorn pipeline.main:app --host 0.0.0.0 --port 3001"]
