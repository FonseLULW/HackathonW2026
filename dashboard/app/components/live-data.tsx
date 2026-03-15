"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createInitialMockAgentCalls,
  createInitialMockIncidents,
  createInitialMockLogs,
  startMockAgentCallStream,
  startMockIncidentStream,
  startMockLogStream,
} from "@/lib/mockData";
import type { IncidentFeedItem } from "./incidentTypes";
import type { LogEvent } from "./LogRow";
import { resolveWebSocketUrl } from "./ws";
import {
  subscribeToLogs,
  subscribeToIncidents,
  subscribeToStats,
} from "@/lib/firestore-history";

type BusMessage = {
  type?: string;
  data?: unknown;
};

const MAX_LOGS = 200;
const MAX_INCIDENTS = 50;
const MAX_AGENT_CALLS = 60;

export type ConnectionState = "checking" | "connected" | "disconnected";

export type AgentCallItem = {
  id: string;
  timestamp: string;
  command: string;
};

type StatsState = {
  logsScored: number;
  triagedBatches: number;
  incidentsRaised: number;
  toolCalls: number;
  logsSuppressed: number;
};

type LiveDataContextValue = {
  connectionState: ConnectionState;
  lastError: string | null;
  stats: StatsState;
  logs: LogEvent[];
  incidents: IncidentFeedItem[];
  agentCalls: AgentCallItem[];
};

const INITIAL_STATS: StatsState = {
  logsScored: 0,
  triagedBatches: 0,
  incidentsRaised: 0,
  toolCalls: 0,
  logsSuppressed: 0,
};

const LiveDataContext = createContext<LiveDataContextValue | null>(null);

function truncate(value: string, max = 120): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}...`;
}

function stringifyArgs(args: unknown): string {
  if (args === undefined || args === null) {
    return "";
  }
  if (typeof args === "string") {
    return args;
  }

  try {
    return JSON.stringify(args);
  } catch {
    return String(args);
  }
}

function normalizeContextEvents(value: unknown): IncidentFeedItem["contextEvents"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry && typeof entry === "object"),
    )
    .map((entry) => ({
      id: String(entry.id ?? `${Math.random()}`),
      level: typeof entry.level === "string" ? entry.level : undefined,
      message: typeof entry.message === "string" ? entry.message : undefined,
      score:
        typeof entry.score === "number"
          ? entry.score
          : entry.score
            ? Number(entry.score)
            : undefined,
      tier: typeof entry.tier === "string" ? entry.tier : undefined,
    }));
}

function normalizeIncident(data: unknown): IncidentFeedItem | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  const incidentRecord =
    record.incident && typeof record.incident === "object"
      ? (record.incident as Record<string, unknown>)
      : record;
  const codeRefs = (incidentRecord.code_refs ?? incidentRecord.codeRefs ?? []) as Array<
    Record<string, unknown>
  >;
  const normalizedCodeRefs = Array.isArray(codeRefs)
    ? codeRefs.map((ref) => ({
        file: String(ref.file ?? "unknown"),
        line:
          typeof ref.line === "number"
            ? ref.line
            : ref.line
              ? Number(ref.line)
              : undefined,
        blame: typeof ref.blame === "string" ? ref.blame : undefined,
        snippet: typeof ref.snippet === "string" ? ref.snippet : undefined,
      }))
    : [];

  const summary =
    incidentRecord.report ??
    record.report ??
    record.summary ??
    "Incident reported (summary pending)";

  const relatedLogIds = Array.isArray(record.related_log_ids)
    ? record.related_log_ids.map((id) => String(id))
    : [];
  const primaryEvent =
    record.primary_event && typeof record.primary_event === "object"
      ? normalizeContextEvents([record.primary_event])[0]
      : undefined;

  return {
    id: String(record.id ?? `${Date.now()}-${Math.random()}`),
    timestamp: String(record.timestamp ?? new Date().toISOString()),
    source: typeof record.source === "string" ? record.source : undefined,
    severity: String(incidentRecord.severity ?? record.severity ?? "medium"),
    summary: String(summary),
    report:
      typeof incidentRecord.report === "string"
        ? incidentRecord.report
        : typeof record.report === "string"
          ? record.report
          : undefined,
    rootCause:
      typeof incidentRecord.root_cause === "string"
        ? incidentRecord.root_cause
        : typeof incidentRecord.rootCause === "string"
          ? incidentRecord.rootCause
          : typeof record.root_cause === "string"
            ? record.root_cause
            : typeof record.rootCause === "string"
              ? record.rootCause
              : undefined,
    suggestedFix:
      typeof incidentRecord.suggested_fix === "string"
        ? incidentRecord.suggested_fix
        : typeof incidentRecord.suggestedFix === "string"
          ? incidentRecord.suggestedFix
          : typeof record.suggested_fix === "string"
            ? record.suggested_fix
            : typeof record.suggestedFix === "string"
              ? record.suggestedFix
              : undefined,
    investigationReason:
      typeof record.investigation_reason === "string"
        ? record.investigation_reason
        : undefined,
    investigationUrgency:
      typeof record.investigation_urgency === "string"
        ? record.investigation_urgency
        : undefined,
    logCount:
      typeof record.log_count === "number"
        ? record.log_count
        : record.log_count
          ? Number(record.log_count)
          : undefined,
    relatedLogIds,
    primaryLogId:
      typeof record.primary_log_id === "string" ? record.primary_log_id : undefined,
    primaryEvent,
    contextEvents: normalizeContextEvents(record.context_events),
    codeRefs: normalizedCodeRefs,
    firstCodeRef:
      normalizedCodeRefs.length > 0
        ? `${normalizedCodeRefs[0].file}:${normalizedCodeRefs[0].line ?? "?"}`
        : "unavailable",
    reasoningSteps: [],
  };
}

function normalizeAgentCall(data: unknown): AgentCallItem | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  const explicitCommand = record.command;
  const toolName = String(
    record.tool ??
      record.tool_name ??
      record.name ??
      record.function_name ??
      "tool_call",
  );
  const args = stringifyArgs(record.args ?? record.arguments);
  const resultRaw = record.result ?? record.output ?? record.tool_result;
  const summary = typeof record.summary === "string" ? record.summary : "";
  const preview = typeof record.result_preview === "string" ? record.result_preview : "";
  const resultText =
    typeof resultRaw === "string"
      ? resultRaw
      : summary || preview
        ? [summary, preview].filter(Boolean).join(" | ")
        : stringifyArgs(resultRaw);

  const baseCommand =
    typeof explicitCommand === "string"
      ? explicitCommand
      : `${toolName}${args ? ` ${args}` : ""}`;
  const command = resultText
    ? `${truncate(baseCommand)} -> ${truncate(resultText, 90)}`
    : truncate(baseCommand);
  const timestamp = String(record.timestamp ?? new Date().toISOString());

  return {
    id: String(record.id ?? `${timestamp}-${Math.random()}`),
    timestamp,
    command,
  };
}

export function LiveDataProvider({ children }: { children: ReactNode }) {
  const useMockData = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    useMockData ? "connected" : "checking",
  );
  const [lastError, setLastError] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsState>(() =>
    useMockData
      ? {
          logsScored: createInitialMockLogs(25).length,
          triagedBatches: 0,
          incidentsRaised: createInitialMockIncidents(2).length,
          toolCalls: createInitialMockAgentCalls(5).length,
          logsSuppressed: 0,
        }
      : INITIAL_STATS,
  );
  const [logs, setLogs] = useState<LogEvent[]>(() =>
    useMockData ? createInitialMockLogs(25).reverse() : [],
  );
  const [incidents, setIncidents] = useState<IncidentFeedItem[]>(() =>
    useMockData ? [] : [],
  );
  const [agentCalls, setAgentCalls] = useState<AgentCallItem[]>(() =>
    useMockData
      ? createInitialMockAgentCalls(5).reverse().map((call) => ({
          id: call.id,
          timestamp: call.timestamp,
          command: call.command,
        }))
      : [],
  );

  useEffect(() => {
    if (useMockData) {
      const stopLogs = startMockLogStream((event) => {
        setLogs((prev) => [...prev, event].slice(-MAX_LOGS));
        setStats((prev) => ({ ...prev, logsScored: prev.logsScored + 1 }));
      });
      const stopIncidents = startMockIncidentStream((incident) => {
        setIncidents((prev) => [
          {
            id: incident.id,
            timestamp: incident.timestamp,
            severity: incident.severity,
            summary: incident.summary,
            report: incident.summary,
            rootCause: incident.rootCause,
            suggestedFix: incident.suggestedFix,
            investigationReason: "Mock incident stream",
            investigationUrgency: incident.severity,
            logCount: 1,
            relatedLogIds: [incident.id],
            primaryLogId: incident.id,
            primaryEvent: {
              id: incident.id,
              level: "error",
              message: incident.summary,
              score: 0.84,
              tier: "high",
            },
            contextEvents: [
              {
                id: incident.id,
                level: "error",
                message: incident.summary,
                score: 0.84,
                tier: "high",
              },
            ],
            codeRefs: incident.codeRefs,
            firstCodeRef: incident.codeRefs[0]
              ? `${incident.codeRefs[0].file}:${incident.codeRefs[0].line}`
              : "unknown",
            reasoningSteps: [],
          },
          ...prev,
        ].slice(0, MAX_INCIDENTS));
        setStats((prev) => ({ ...prev, incidentsRaised: prev.incidentsRaised + 1 }));
      });
      const stopAgent = startMockAgentCallStream((call) => {
        setAgentCalls((prev) => [
          ...prev,
          { id: call.id, timestamp: call.timestamp, command: call.command },
        ].slice(-MAX_AGENT_CALLS));
        setStats((prev) => ({ ...prev, toolCalls: prev.toolCalls + 1 }));
      });

      return () => {
        stopLogs();
        stopIncidents();
        stopAgent();
      };
    }

    const liveMode = process.env.NEXT_PUBLIC_LIVE_MODE ?? "firebase";

    // ── Firebase mode: real-time Firestore listeners, no pipeline wake-up ──
    if (liveMode === "firebase") {
      let gotFirstSnapshot = false;

      const unsubLogs = subscribeToLogs((data) => {
        if (data.length) setLogs(data as LogEvent[]);
        if (!gotFirstSnapshot) {
          gotFirstSnapshot = true;
          setConnectionState("connected");
        }
      });

      const unsubIncidents = subscribeToIncidents((data) => {
        if (data.length)
          setIncidents(
            data.map(normalizeIncident).filter(Boolean) as IncidentFeedItem[],
          );
      });

      const unsubStats = subscribeToStats((data) => {
        if (data)
          setStats({
            logsScored: (data.logs_scored as number) ?? 0,
            triagedBatches: (data.triaged_batches as number) ?? 0,
            incidentsRaised: (data.incidents_raised as number) ?? 0,
            toolCalls: (data.tool_calls as number) ?? 0,
            logsSuppressed: (data.logs_suppressed as number) ?? 0,
          });
      });

      return () => {
        unsubLogs();
        unsubIncidents();
        unsubStats();
      };
    }

    // ── WebSocket mode: direct pipeline connection (local dev / live demo) ──
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    let retryDelay = 1500;

    const connect = () => {
      setConnectionState((prev) => (prev === "connected" ? prev : "checking"));
      const wsUrl = resolveWebSocketUrl();
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setConnectionState("connected");
        setLastError(null);
        retryDelay = 1500;
        heartbeatTimer = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send("ping");
          }
        }, 15000);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as BusMessage;
          switch (msg.type) {
            case "log:scored":
              if (msg.data && typeof msg.data === "object") {
                setLogs((prev) =>
                  [...prev, msg.data as LogEvent].slice(-MAX_LOGS),
                );
              }
              setStats((prev) => ({ ...prev, logsScored: prev.logsScored + 1 }));
              break;
            case "log:triaged":
              setStats((prev) => ({
                ...prev,
                triagedBatches: prev.triagedBatches + 1,
              }));
              break;
            case "incident:created": {
              const item = normalizeIncident(msg.data);
              if (item) {
                setIncidents((prev) => [item, ...prev].slice(0, MAX_INCIDENTS));
              }
              setStats((prev) => ({
                ...prev,
                incidentsRaised: prev.incidentsRaised + 1,
              }));
              break;
            }
            case "agent:tool_call": {
              const item = normalizeAgentCall(msg.data);
              if (item) {
                setAgentCalls((prev) => [...prev, item].slice(-MAX_AGENT_CALLS));
              }
              setStats((prev) => ({ ...prev, toolCalls: prev.toolCalls + 1 }));
              break;
            }
            case "log:suppressed":
              setStats((prev) => ({
                ...prev,
                logsSuppressed: prev.logsSuppressed + 1,
              }));
              break;
            default:
              break;
          }
        } catch {
          // Ignore malformed events so the stream stays alive.
        }
      };

      ws.onerror = () => {
        setLastError("Live stream unavailable.");
      };

      ws.onclose = (event) => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        if (stopped) return;
        setConnectionState("disconnected");
        setLastError(
          event.reason || "Live stream disconnected. Retrying...",
        );
        retryDelay = Math.min(retryDelay * 2, 30000);
        retryTimer = setTimeout(connect, retryDelay);
      };
    };

    connect();

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (ws && ws.readyState < WebSocket.CLOSING) ws.close();
    };
  }, [useMockData]);

  const value = useMemo(
    () => ({
      connectionState,
      lastError,
      stats,
      logs,
      incidents,
      agentCalls,
    }),
    [agentCalls, connectionState, incidents, lastError, logs, stats],
  );

  return (
    <LiveDataContext.Provider value={value}>{children}</LiveDataContext.Provider>
  );
}

export function useLiveData(): LiveDataContextValue {
  const value = useContext(LiveDataContext);
  if (!value) {
    throw new Error("useLiveData must be used within LiveDataProvider");
  }
  return value;
}
