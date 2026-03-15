export type MockTier = "low" | "medium" | "high";
export type MockLevel = "info" | "warn" | "error";

export type MockLogEvent = {
  id: string;
  timestamp: string;
  source: string;
  level: MockLevel;
  message: string;
  pipeline: {
    anomaly_score: number;
    tier: MockTier;
    filtered: boolean;
  };
};

export type MockIncident = {
  id: string;
  timestamp: string;
  severity: "medium" | "high" | "critical";
  summary: string;
  rootCause: string;
  codeRefs: Array<{ file: string; line: number }>;
  suggestedFix: string;
};

export type MockAgentCall = {
  id: string;
  timestamp: string;
  command: string;
};

const INFO_MESSAGES = [
  "GET /api/products 200 in 38ms",
  "Cache hit for catalog:featured",
  "Worker heartbeat OK",
  "Session refresh completed",
];

const WARN_MESSAGES = [
  "Retrying Redis connection (attempt 2/5)",
  "Payment provider latency > 800ms",
  "Queue depth above warning threshold",
  "DB pool saturation at 78%",
];

const ERROR_MESSAGES = [
  "POST /checkout failed: payment provider timeout",
  "Unhandled exception in order processor",
  "Database write failed: deadlock detected",
  "Webhook delivery failed after retries",
];

const AGENT_COMMANDS = [
  'search_logs --query "payment timeout" --limit 50',
  "grep_code --pattern \"createPaymentIntent\" --file_glob \"*.ts\"",
  "read_file --path services/payment/client.ts --start_line 70 --end_line 110",
  "git_blame --path services/payment/client.ts --start_line 88 --end_line 88",
  "report_incident --severity high --confidence 0.93",
];

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function chooseLevelByWeight(): MockLevel {
  const roll = Math.random();
  if (roll < 0.6) {
    return "info";
  }
  if (roll < 0.85) {
    return "warn";
  }
  return "error";
}

function tierFromScore(score: number): MockTier {
  if (score > 0.7) {
    return "high";
  }
  if (score >= 0.3) {
    return "medium";
  }
  return "low";
}

export function createMockLogEvent(): MockLogEvent {
  const level = chooseLevelByWeight();

  const score =
    level === "info"
      ? randomBetween(0.03, 0.28)
      : level === "warn"
        ? randomBetween(0.31, 0.69)
        : randomBetween(0.71, 0.98);

  const message =
    level === "info"
      ? pick(INFO_MESSAGES)
      : level === "warn"
        ? pick(WARN_MESSAGES)
        : pick(ERROR_MESSAGES);

  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    source: "mock-service",
    level,
    message,
    pipeline: {
      anomaly_score: Number(score.toFixed(2)),
      tier: tierFromScore(score),
      filtered: Math.random() < 0.28,
    },
  };
}

export function createInitialMockLogs(count = 25): MockLogEvent[] {
  return Array.from({ length: count }, () => createMockLogEvent()).sort(
    (a, b) => b.timestamp.localeCompare(a.timestamp),
  );
}

export function createMockIncident(): MockIncident {
  const severityPool: MockIncident["severity"][] = [
    "medium",
    "high",
    "critical",
  ];
  const severity = pick(severityPool);

  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    severity,
    summary:
      "Checkout reliability degraded due to upstream payment instability",
    rootCause: "No timeout guard on createPaymentIntent in payment client",
    codeRefs: [{ file: "services/payment/client.ts", line: 88 }],
    suggestedFix:
      "Add 3s timeout, jittered retry backoff, and a circuit breaker",
  };
}

export function createMockAgentCall(): MockAgentCall {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    command: pick(AGENT_COMMANDS),
  };
}

export function createInitialMockIncidents(count = 2): MockIncident[] {
  return Array.from({ length: count }, () => createMockIncident()).sort(
    (a, b) => b.timestamp.localeCompare(a.timestamp),
  );
}

export function createInitialMockAgentCalls(count = 5): MockAgentCall[] {
  return Array.from({ length: count }, () => createMockAgentCall()).sort(
    (a, b) => b.timestamp.localeCompare(a.timestamp),
  );
}

export function startMockLogStream(
  onLog: (event: MockLogEvent) => void,
  intervalMs = 10000,
): () => void {
  const timer = setInterval(() => {
    onLog(createMockLogEvent());
  }, intervalMs);

  return () => clearInterval(timer);
}

export function startMockIncidentStream(
  onIncident: (incident: MockIncident) => void,
  intervalMs = 30000,
): () => void {
  const timer = setInterval(() => {
    onIncident(createMockIncident());
  }, intervalMs);

  return () => clearInterval(timer);
}

export function startMockAgentCallStream(
  onCall: (call: MockAgentCall) => void,
  intervalMs = 5000,
): () => void {
  const timer = setInterval(() => {
    onCall(createMockAgentCall());
  }, intervalMs);

  return () => clearInterval(timer);
}
