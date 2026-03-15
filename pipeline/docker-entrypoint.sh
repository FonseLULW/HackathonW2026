#!/bin/sh
set -eu

DB_PATH="${KNOWN_LOG_DB_PATH:-/data/known_patterns.db}"
DB_DIR="$(dirname "$DB_PATH")"
FALLBACK_DB_PATH="/tmp/known_patterns.db"

prepare_db_path() {
  target_path="$1"
  target_dir="$(dirname "$target_path")"
  mkdir -p "$target_dir"
  touch "$target_path"
  chown -R snooplog:snooplog "$target_dir"
}

if ! prepare_db_path "$DB_PATH" 2>/dev/null; then
  echo "warning: could not prepare $DB_PATH, falling back to $FALLBACK_DB_PATH" >&2
  DB_PATH="$FALLBACK_DB_PATH"
  DB_DIR="$(dirname "$DB_PATH")"
  prepare_db_path "$DB_PATH"
  export KNOWN_LOG_DB_PATH="$DB_PATH"
fi

exec gosu snooplog "$@"
