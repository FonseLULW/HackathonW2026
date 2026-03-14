"""SnoopLog CLI -- watch logs and send to pipeline.

Usage:
    docker logs -f my-app | python -m pipeline.cli watch --endpoint http://localhost:3001
    python -m pipeline.cli watch --file /var/log/app.log
    python -m pipeline.cli init
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import httpx
import typer
import yaml

from shared.config import cli_batch_size, cli_default_endpoint, cli_flush_interval, cli_http_timeout

app = typer.Typer(name="snooplog", help="SnoopLog CLI -- AI log intelligence")

CONFIG_FILE = ".snooplog.yml"


@app.command()
def watch(
    endpoint: str = typer.Option(None, help="Pipeline endpoint URL"),
    source: str = typer.Option(None, help="Source/app name"),
    file: Path = typer.Option(None, help="Log file to tail (default: stdin)"),
    raw: bool = typer.Option(False, help="Send as raw text instead of JSON"),
):
    """Watch logs from stdin or a file and send to the pipeline."""
    cfg = _load_config()
    endpoint = endpoint or cfg.get("endpoint", cli_default_endpoint())
    source = source or cfg.get("source", "cli")

    typer.echo(f"SnoopLog watching -> {endpoint} (source: {source})")

    batch: list[str] = []
    last_flush = time.time()
    stats = {"sent": 0, "high": 0, "medium": 0, "errors": 0}

    try:
        lines = _tail_file(file) if file else _read_stdin()
        for line in lines:
            line = line.strip()
            if not line:
                continue
            batch.append(line)

            if len(batch) >= cli_batch_size() or (time.time() - last_flush) >= cli_flush_interval():
                _flush(batch, endpoint, source, raw, stats)
                batch.clear()
                last_flush = time.time()
    except KeyboardInterrupt:
        pass
    finally:
        if batch:
            _flush(batch, endpoint, source, raw, stats)
        typer.echo(f"\nDone. Sent {stats['sent']} logs ({stats['high']} high, {stats['medium']} medium)")


@app.command()
def init():
    """Initialize a .snooplog.yml config file."""
    endpoint = typer.prompt("Pipeline endpoint", default=cli_default_endpoint())
    source = typer.prompt("App/source name", default="my-app")

    config = {"endpoint": endpoint, "source": source}
    Path(CONFIG_FILE).write_text(yaml.dump(config, default_flow_style=False))
    typer.echo(f"Wrote {CONFIG_FILE}")


def _load_config() -> dict:
    p = Path(CONFIG_FILE)
    if p.exists():
        return yaml.safe_load(p.read_text()) or {}
    return {}


def _read_stdin():
    for line in sys.stdin:
        yield line


def _tail_file(path: Path):
    """Tail a file, yielding new lines as they appear."""
    with open(path) as f:
        # Start from end
        f.seek(0, 2)
        while True:
            line = f.readline()
            if line:
                yield line
            else:
                time.sleep(0.1)


def _flush(batch: list[str], endpoint: str, source: str, raw: bool, stats: dict):
    """Send a batch of logs to the pipeline."""
    if not batch:
        return

    try:
        if raw:
            resp = httpx.post(f"{endpoint}/api/ingest/raw", content="\n".join(batch), timeout=cli_http_timeout())
        else:
            logs = []
            for line in batch:
                try:
                    parsed = json.loads(line)
                    if isinstance(parsed, dict):
                        logs.append(parsed)
                        continue
                except (json.JSONDecodeError, ValueError):
                    pass
                # Not JSON -- wrap as structured log
                logs.append({"source": source, "message": line, "level": "info"})
            resp = httpx.post(f"{endpoint}/api/ingest", json=logs, timeout=cli_http_timeout())

        resp.raise_for_status()
        data = resp.json()
        n = data.get("accepted", 0)
        stats["sent"] += n

        # Count tiers from results
        for r in data.get("results", []):
            score = r.get("score", 0)
            if score > 0.7:
                stats["high"] += 1
            elif score >= 0.3:
                stats["medium"] += 1

        # Compact status line
        h, m = stats["high"], stats["medium"]
        typer.echo(f"  ^ {n} logs | total: {stats['sent']} | ! {h} high, {m} medium", err=True)

    except (httpx.HTTPError, Exception) as e:
        # Logging should never break the app
        stats["errors"] += 1
        typer.echo(f"  x send failed: {e}", err=True)


if __name__ == "__main__":
    app()
