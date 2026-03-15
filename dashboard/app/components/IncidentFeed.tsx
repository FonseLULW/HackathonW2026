"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createInitialMockIncidents,
  startMockIncidentStream,
} from "@/lib/mockData";
import { IncidentCard } from "./IncidentCard";
import { resolveWebSocketUrl } from "./ws";
import type {
  IncidentCodeRef,
  IncidentContextEvent,
  IncidentFeedItem,
} from "./incidentTypes";

const MAX_INCIDENTS_TO_DISPLAY = 50;

type BusMessage = {
  type?: string;
  data?: unknown;
};

function normalizeContextEvents(value: unknown): IncidentContextEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
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
  const normalizedCodeRefs: IncidentCodeRef[] = Array.isArray(codeRefs)
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
  const firstRef =
    normalizedCodeRefs.length > 0
      ? `${normalizedCodeRefs[0].file}:${normalizedCodeRefs[0].line ?? "?"}`
      : "unknown";

  const summary =
    incidentRecord.report ??
    record.report ??
    record.summary ??
    "Incident reported (summary pending)";

  const severity = String(incidentRecord.severity ?? record.severity ?? "medium");
  const reasoningStepsRaw = (record.reasoning_chain ??
    record.reasoningSteps ??
    []) as unknown[];
  const reasoningSteps = Array.isArray(reasoningStepsRaw)
    ? reasoningStepsRaw.map((step) => String(step))
    : [];
  const relatedLogIds = Array.isArray(record.related_log_ids)
    ? record.related_log_ids.map((id) => String(id))
    : [];
  const primaryEvent =
    record.primary_event && typeof record.primary_event === "object"
      ? normalizeContextEvents([record.primary_event])[0]
      : undefined;
  const contextEvents = normalizeContextEvents(record.context_events);

  return {
    id: String(record.id ?? `${Date.now()}-${Math.random()}`),
    timestamp: String(record.timestamp ?? new Date().toISOString()),
    source: typeof record.source === "string" ? record.source : undefined,
    severity,
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
    contextEvents,
    codeRefs: normalizedCodeRefs,
    firstCodeRef: firstRef,
    reasoningSteps,
  };
}

export function IncidentFeed() {
  const useMockData = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";
  const [incidents, setIncidents] = useState<IncidentFeedItem[]>(() =>
    useMockData
      ? createInitialMockIncidents(200).map((incident) => ({
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
          reasoningSteps: [
            'search_logs(query="checkout timeout")',
            'git_blame(file="services/payment/client.ts", line=88)',
            'report_incident(severity="high")',
          ],
        }))
      : [],
  );

  useEffect(() => {
    if (useMockData) {
      const stopIncidents = startMockIncidentStream((incident) => {
        setIncidents((prev) =>
          [
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
              reasoningSteps: [
                'search_logs(query="checkout timeout")',
                'git_blame(file="services/payment/client.ts", line=88)',
                'report_incident(severity="high")',
              ],
            },
            ...prev,
          ].slice(0, MAX_INCIDENTS_TO_DISPLAY),
        );
      });

      return () => {
        stopIncidents();
      };
    }

    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = () => {
      const wsUrl = resolveWebSocketUrl();
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as BusMessage;
          if (msg.type !== "incident:created" || !msg.data) {
            return;
          }

          const item = normalizeIncident(msg.data);
          if (!item) {
            return;
          }

          setIncidents((prev) =>
            [item, ...prev].slice(0, MAX_INCIDENTS_TO_DISPLAY),
          );
        } catch {
          // Ignore malformed events to keep feed alive.
        }
      };

      ws.onclose = () => {
        if (stopped) {
          return;
        }
        retryTimer = setTimeout(connect, 1500);
      };
    };

    connect();

    return () => {
      stopped = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      if (ws && ws.readyState < WebSocket.CLOSING) {
        ws.close();
      }
    };
  }, [useMockData]);

  const incidentCards = useMemo(() => {
    return incidents.map((incident) => {
      return <IncidentCard key={incident.id} incident={incident} />;
    });
  }, [incidents]);

  if (incidents.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-amber-200 bg-white/60 p-4 text-xs text-slate-500">
        Waiting for `incident:created` events...
      </div>
    );
  }

  return (
    <div className="agent-scroll h-full space-y-3 overflow-y-auto pr-1">
      {incidentCards}
    </div>
  );
}
