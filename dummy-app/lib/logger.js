const PIPELINE_URL =
  process.env.PIPELINE_URL || "http://pipeline:3001/api/ingest";

export function logEvent(level, message, metadata = {}, extra = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    source: "dummy-app",
    message,
    metadata: {
      service: "dummy-app",
      extra: metadata,
    },
    ...extra,
  };

  const serialized = JSON.stringify(entry);
  process.stdout.write(`${serialized}\n`);

  // Fire-and-forget POST to pipeline
  fetch(PIPELINE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: serialized,
  }).catch(() => {});

  return entry;
}
