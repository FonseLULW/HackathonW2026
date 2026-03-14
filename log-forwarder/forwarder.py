"""Log-forwarder sidecar — tails a log file and POSTs batches to the pipeline."""

from __future__ import annotations

import json
import os
import time

import httpx

PIPELINE_URL = os.getenv("PIPELINE_URL", "http://pipeline:3001/api/ingest")
LOG_FILE = os.getenv("LOG_FILE", "/logs/app.log")
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "10"))
FLUSH_INTERVAL = float(os.getenv("FLUSH_INTERVAL", "2.0"))
SOURCE = os.getenv("SOURCE", "dummy-app")


def tail_and_forward():
    """Tail the log file and POST batches to the pipeline."""
    # Wait for the log file to exist
    while not os.path.exists(LOG_FILE):
        print(f"Waiting for {LOG_FILE} ...")
        time.sleep(1)

    batch: list[dict] = []
    last_flush = time.time()

    with open(LOG_FILE, "r") as f:
        # Seek to end — only forward new logs
        f.seek(0, 2)
        while True:
            line = f.readline()
            if line:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    entry = {"message": line, "raw": line}
                entry.setdefault("source", SOURCE)
                batch.append(entry)

                if len(batch) >= BATCH_SIZE:
                    _flush(batch)
                    batch = []
                    last_flush = time.time()
            else:
                if batch and (time.time() - last_flush) >= FLUSH_INTERVAL:
                    _flush(batch)
                    batch = []
                    last_flush = time.time()
                time.sleep(0.1)


def _flush(batch: list[dict]):
    """POST a batch of logs to the pipeline."""
    try:
        resp = httpx.post(PIPELINE_URL, json=batch, timeout=5.0)
        print(f"Forwarded {len(batch)} logs → {resp.status_code}")
    except Exception as e:
        print(f"Forward failed: {e}")


if __name__ == "__main__":
    print(f"Log forwarder starting: {LOG_FILE} → {PIPELINE_URL}")
    tail_and_forward()
