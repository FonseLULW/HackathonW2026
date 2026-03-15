#!/usr/bin/env bash

set -euo pipefail

base_url="${1:-http://localhost:3000}"
repo_sync_url="${2:-http://localhost:3002}"
pipeline_url="${3:-http://localhost/health}"

echo "Checking dummy-app health..."
curl --fail --silent "$base_url/api/health" >/dev/null

echo "Checking products endpoint..."
curl --fail --silent "$base_url/api/products" >/dev/null

echo "Resetting chaos state..."
curl --fail --silent -X POST "$base_url/api/chaos/reset" >/dev/null

echo "Creating sample order..."
curl --fail --silent \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"productId":"sku_keyboard","quantity":1,"email":"smoke@snooplog.dev"}' \
  "$base_url/api/orders" >/dev/null

echo "Triggering db-leak chaos..."
curl --fail --silent -X POST "$base_url/api/chaos/db-leak" >/dev/null

echo "Checking repo-sync health..."
curl --fail --silent "$repo_sync_url/health" >/dev/null

echo "Checking pipeline health through Caddy..."
curl --fail --silent "$pipeline_url" >/dev/null

echo "Smoke test passed."
