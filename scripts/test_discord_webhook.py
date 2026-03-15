#!/usr/bin/env python3
"""Generate a dummy incident report and optionally send it to Discord."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from pipeline.integrations.discord import build_discord_payload, post_discord_webhook


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Test Discord incident formatting and optional webhook delivery."
    )
    parser.add_argument("--send", action="store_true", help="Actually POST the payload to Discord.")
    parser.add_argument(
        "--webhook-url",
        default=os.getenv("DISCORD_WEBHOOK_URL", ""),
        help="Discord webhook URL. Can also be supplied via DISCORD_WEBHOOK_URL.",
    )
    parser.add_argument(
        "--print-event",
        action="store_true",
        help="Print the generated incident event before formatting.",
    )
    args = parser.parse_args()

    event = generate_dummy_incident_event()
    payload = build_discord_payload(event)

    if args.print_event:
        print("Dummy incident event:")
        print(json.dumps(event, indent=2))

    print("Discord payload:")
    print(json.dumps(payload, indent=2))

    if not args.send:
        print("\nDry run only. Re-run with --send to post this payload to Discord.")
        return

    target = args.webhook_url.strip()
    if not target:
        raise SystemExit("Provide --webhook-url or set DISCORD_WEBHOOK_URL when using --send.")

    post_discord_webhook(target, payload)
    print("\nPayload sent successfully.")


def generate_dummy_incident_event() -> dict[str, object]:
    return {
        "id": "demo-incident-0001",
        "timestamp": "2026-03-14T21:30:00.000Z",
        "source": "dummy-app",
        "level": "fatal",
        "message": "Order failed: DB_POOL_EXHAUSTED",
        "raw": None,
        "metadata": {
            "service": "dummy-app",
            "host": "snooplog-demo-vm",
            "container_id": "dummy-app-1",
            "extra": {
                "route": "/api/orders",
                "order_id": "ord_0042",
                "pool_usage": "100%",
                "chaos_mode": "db-leak",
            },
        },
        "pipeline": {
            "anomaly_score": 0.98,
            "tier": "high",
            "filtered": False,
            "filter_reason": None,
            "tier_model": "reasoning-model",
        },
        "incident": {
            "report": "Checkout failures caused by database connection pool exhaustion",
            "root_cause": (
                "The db-leak chaos mode increased pool usage on each order until the checkout path "
                "ran out of available DB connections and began returning 503 responses."
            ),
            "severity": "critical",
            "code_refs": [
                {
                    "file": "dummy-app/lib/store.js",
                    "line": 118,
                    "snippet": 'state.chaos.poolUsage = Math.min(100, state.chaos.poolUsage + 5);',
                    "blame": "person-4",
                },
                {
                    "file": "dummy-app/app/api/orders/route.js",
                    "line": 35,
                    "snippet": 'logEvent(level, `Order failed: ${result.code}`, { ...commonMetadata, details: result.details });',
                    "blame": "person-4",
                },
                {
                    "file": "dummy-app/app/storefront.js",
                    "line": 46,
                    "snippet": 'body: payload.error ? `${payload.error}: ${formatDetails(payload.details)}` : "Unexpected API error",',
                    "blame": "person-4",
                },
            ],
            "suggested_fix": (
                "Reset the chaos mode, recycle leaked connections, and add a guard that caps pool "
                "growth plus alerts before exhaustion."
            ),
        },
    }


if __name__ == "__main__":
    if not os.getenv("PYTHONUNBUFFERED"):
        os.environ["PYTHONUNBUFFERED"] = "1"
    main()
