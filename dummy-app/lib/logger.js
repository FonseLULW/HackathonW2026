const PIPELINE_URL =
  process.env.PIPELINE_URL || "http://pipeline:3001/api/ingest";

function buildLogEntry(level, message, metadata = {}, extra = {}) {
  return {
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
}

function writeLogEntry(entry) {
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

export async function postToPipeline(entry, options = {}) {
  const timeoutMs = Number.parseInt(String(options.timeoutMs ?? "8000"), 10);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(PIPELINE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
      signal: controller.signal,
    });

    return {
      ok: response.ok,
      status: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      error,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function logEvent(level, message, metadata = {}, extra = {}) {
  const entry = buildLogEntry(level, message, metadata, extra);
  writeLogEntry(entry);

  // Fire-and-forget POST to pipeline
  void postToPipeline(entry);

  return entry;
}

export async function logEventAndFlush(level, message, metadata = {}, extra = {}, options = {}) {
  const entry = buildLogEntry(level, message, metadata, extra);
  writeLogEntry(entry);

  return {
    entry,
    pipeline: await postToPipeline(entry, options),
  };
}
