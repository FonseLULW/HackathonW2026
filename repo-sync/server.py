from __future__ import annotations

import json
import os
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer

HOST = "0.0.0.0"
PORT = int(os.getenv("PORT", "3002"))
REPO_PATH = os.getenv("REPO_PATH", "/repo")
BRANCH = os.getenv("REPO_SYNC_BRANCH", "")
WEBHOOK_SECRET = os.getenv("REPO_SYNC_SECRET", "")


def run_git_pull() -> dict[str, str | int]:
    commands = [["git", "-C", REPO_PATH, "fetch", "--all"]]
    if BRANCH:
        commands.append(["git", "-C", REPO_PATH, "checkout", BRANCH])
        commands.append(["git", "-C", REPO_PATH, "pull", "origin", BRANCH])
    else:
        commands.append(["git", "-C", REPO_PATH, "pull"])

    stdout_parts: list[str] = []
    stderr_parts: list[str] = []
    exit_code = 0

    for command in commands:
        result = subprocess.run(command, capture_output=True, text=True)
        stdout_parts.append(result.stdout.strip())
        stderr_parts.append(result.stderr.strip())
        if result.returncode != 0:
            exit_code = result.returncode
            break

    return {
        "exitCode": exit_code,
        "stdout": "\n".join(part for part in stdout_parts if part),
        "stderr": "\n".join(part for part in stderr_parts if part),
    }


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, status_code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/health":
            self._send_json(200, {"status": "ok", "service": "repo-sync"})
            return

        self._send_json(200, {"service": "repo-sync", "repoPath": REPO_PATH, "branch": BRANCH or "default"})

    def do_POST(self) -> None:
        if WEBHOOK_SECRET:
            received_secret = self.headers.get("x-webhook-secret", "")
            if received_secret != WEBHOOK_SECRET:
                self._send_json(403, {"error": "Forbidden"})
                return

        result = run_git_pull()
        status_code = 200 if result["exitCode"] == 0 else 500
        self._send_json(status_code, result)

    def log_message(self, format: str, *args) -> None:
        print(f"repo-sync: {format % args}")


if __name__ == "__main__":
    print(f"repo-sync listening on {HOST}:{PORT} for {REPO_PATH}")
    HTTPServer((HOST, PORT), Handler).serve_forever()
