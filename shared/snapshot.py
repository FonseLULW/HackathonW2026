"""Snapshot manager -- saves and loads files to local disk or GCS.

Handles two storage backends:
  - local: saves to a directory on disk (default, works in dev)
  - gcs: saves to a Google Cloud Storage bucket (production)

The manager is generic -- any component can register files to snapshot.
Currently used for the ML model (scorer.pkl), designed to also handle
memory.md and any other state files added later.
"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger("snooplog.snapshot")


class SnapshotManager:
    """Save/load arbitrary files to local disk or GCS."""

    def __init__(self, backend: str = "local", local_dir: str = "data/snapshots", gcs_bucket: str = "", gcs_prefix: str = "snapshots"):
        self._backend = backend
        self._local_dir = Path(local_dir)
        self._gcs_bucket = gcs_bucket
        self._gcs_prefix = gcs_prefix

        if backend == "local":
            self._local_dir.mkdir(parents=True, exist_ok=True)

    def save(self, name: str, data: bytes) -> bool:
        """Save a named snapshot. Returns True on success."""
        if self._backend == "gcs":
            return self._save_gcs(name, data)
        return self._save_local(name, data)

    def load(self, name: str) -> bytes | None:
        """Load a named snapshot. Returns bytes or None if not found."""
        if self._backend == "gcs":
            return self._load_gcs(name)
        return self._load_local(name)

    def exists(self, name: str) -> bool:
        """Check if a named snapshot exists."""
        if self._backend == "gcs":
            return self._exists_gcs(name)
        return self._exists_local(name)

    # --- Local backend ---

    def _save_local(self, name: str, data: bytes) -> bool:
        try:
            path = self._local_dir / name
            tmp = path.with_suffix(".tmp")
            tmp.write_bytes(data)
            tmp.replace(path)
            logger.info("Snapshot saved (local): %s (%d bytes)", name, len(data))
            return True
        except Exception as e:
            logger.warning("Failed to save snapshot locally: %s", e)
            return False

    def _load_local(self, name: str) -> bytes | None:
        path = self._local_dir / name
        if not path.exists():
            return None
        try:
            data = path.read_bytes()
            logger.info("Snapshot loaded (local): %s (%d bytes)", name, len(data))
            return data
        except Exception as e:
            logger.warning("Failed to load snapshot locally: %s", e)
            return None

    def _exists_local(self, name: str) -> bool:
        return (self._local_dir / name).exists()

    # --- GCS backend ---

    def _gcs_path(self, name: str) -> str:
        return f"{self._gcs_prefix}/{name}" if self._gcs_prefix else name

    def _save_gcs(self, name: str, data: bytes) -> bool:
        try:
            from google.cloud import storage
            client = storage.Client()
            bucket = client.bucket(self._gcs_bucket)
            blob = bucket.blob(self._gcs_path(name))
            blob.upload_from_string(data)
            logger.info("Snapshot saved (gcs): gs://%s/%s (%d bytes)", self._gcs_bucket, self._gcs_path(name), len(data))
            return True
        except Exception as e:
            logger.warning("Failed to save snapshot to GCS: %s", e)
            return False

    def _load_gcs(self, name: str) -> bytes | None:
        try:
            from google.cloud import storage
            client = storage.Client()
            bucket = client.bucket(self._gcs_bucket)
            blob = bucket.blob(self._gcs_path(name))
            if not blob.exists():
                return None
            data = blob.download_as_bytes()
            logger.info("Snapshot loaded (gcs): gs://%s/%s (%d bytes)", self._gcs_bucket, self._gcs_path(name), len(data))
            return data
        except Exception as e:
            logger.warning("Failed to load snapshot from GCS: %s", e)
            return None

    def _exists_gcs(self, name: str) -> bool:
        try:
            from google.cloud import storage
            client = storage.Client()
            bucket = client.bucket(self._gcs_bucket)
            return bucket.blob(self._gcs_path(name)).exists()
        except Exception:
            return False
