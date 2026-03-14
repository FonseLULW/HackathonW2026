/**
 * Stub dummy-app server — Person 4 replaces with full Next.js e-commerce app.
 * For now: health endpoint + basic JSON logging to stdout and file.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3000;
const LOG_DIR = "/app/logs";
const LOG_FILE = path.join(LOG_DIR, "app.log");

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function log(level, message, meta = {}) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: "dummy-app",
    message,
    metadata: meta,
  });
  console.log(entry);
  fs.appendFileSync(LOG_FILE, entry + "\n");
}

const server = http.createServer((req, res) => {
  if (req.url === "/api/health" && req.method === "GET") {
    log("info", "Health check");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  } else if (req.url === "/api/products" && req.method === "GET") {
    log("info", "Products listed", { endpoint: "/api/products" });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ products: [] }));
  } else {
    log("warn", `Unknown route: ${req.method} ${req.url}`);
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  log("info", `Dummy app listening on port ${PORT}`);
});
