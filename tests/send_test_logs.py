"""Send test log corpus to the pipeline. Run with: python tests/send_test_logs.py"""

import json
import sys
from pathlib import Path

import httpx

ENDPOINT = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3001"
CORPUS = Path(__file__).parent / "test_logs.jsonl"


def main():
    logs = [json.loads(line) for line in CORPUS.read_text().splitlines() if line.strip()]
    print(f"Sending {len(logs)} logs to {ENDPOINT}/api/ingest")

    resp = httpx.post(f"{ENDPOINT}/api/ingest", json=logs, timeout=10)
    resp.raise_for_status()
    data = resp.json()

    print(f"Accepted: {data['accepted']}")
    print()
    for r in data["results"]:
        print(f"  {r['id'][:8]}  score={r['score']:.2f}")


if __name__ == "__main__":
    main()
