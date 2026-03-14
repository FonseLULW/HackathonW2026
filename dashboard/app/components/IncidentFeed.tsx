"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createInitialMockIncidents,
  startMockIncidentStream,
} from "@/lib/mockData";
import { IncidentCard, IncidentFeedItem } from "./IncidentCard";

const MAX_INCIDENTS_TO_DISPLAY = 50;

type BusMessage = {
  type?: string;
  data?: unknown;
};

function normalizeIncident(data: unknown): IncidentFeedItem | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  const codeRefs = (record.code_refs ?? record.codeRefs ?? []) as Array<
    Record<string, unknown>
  >;
  const firstRef =
    Array.isArray(codeRefs) && codeRefs.length > 0
      ? `${String(codeRefs[0].file ?? "unknown")}:${String(codeRefs[0].line ?? "?")}`
      : "unknown";

  const summary =
    record.report ?? record.summary ?? "Incident reported (summary pending)";

  const severity = String(record.severity ?? "medium");

  return {
    id: String(record.id ?? `${Date.now()}-${Math.random()}`),
    timestamp: String(record.timestamp ?? new Date().toISOString()),
    severity,
    summary: String(summary),
    firstCodeRef: firstRef,
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
          firstCodeRef: incident.codeRefs[0]
            ? `${incident.codeRefs[0].file}:${incident.codeRefs[0].line}`
            : "unknown",
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
              firstCodeRef: incident.codeRefs[0]
                ? `${incident.codeRefs[0].file}:${incident.codeRefs[0].line}`
                : "unknown",
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
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001/ws";
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
      <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-500">
        Waiting for `incident:created` events...
      </div>
    );
  }

  return (
    <div className="max-h-[28vh] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
      {incidentCards}
    </div>
  );
}
