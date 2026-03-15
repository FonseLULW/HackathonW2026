import fs from "fs";
import path from "path";

const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), "logs");
const LOG_FILE = process.env.LOG_FILE || path.join(LOG_DIR, "app.log");

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

export function logEvent(level, message, metadata = {}, extra = {}) {
  ensureLogDir();

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
  fs.appendFileSync(LOG_FILE, `${serialized}\n`);
  return entry;
}
