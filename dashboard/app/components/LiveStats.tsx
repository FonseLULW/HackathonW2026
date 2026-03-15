"use client";

import { useEffect, useState } from "react";
import {
  createInitialMockAgentCalls,
  createInitialMockIncidents,
  createInitialMockLogs,
  startMockAgentCallStream,
  startMockIncidentStream,
  startMockLogStream,
} from "@/lib/mockData";
import { resolveWebSocketUrl } from "./ws";

type StatsState = {
  logsScored: number;
  triagedBatches: number;
  incidentsRaised: number;
  toolCalls: number;
  logsSuppressed: number;
};

type BusMessage = {
  type?: string;
  data?: unknown;
};

const INITIAL_STATS: StatsState = {
  logsScored: 0,
  triagedBatches: 0,
  incidentsRaised: 0,
  toolCalls: 0,
  logsSuppressed: 0,
};

const statConfig: Array<{
  key: keyof StatsState;
  label: string;
  note: string;
}> = [
  { key: "logsScored", label: "Logs Scored", note: "`log:scored` events" },
  { key: "triagedBatches", label: "Batches Triaged", note: "`log:triaged` events" },
  { key: "incidentsRaised", label: "Incidents Raised", note: "`incident:created` events" },
  { key: "toolCalls", label: "Tool Calls", note: "`agent:tool_call` events" },
  { key: "logsSuppressed", label: "Logs Suppressed", note: "`log:suppressed` events" },
];

export function LiveStats() {
  const useMockData = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";
  const [stats, setStats] = useState<StatsState>(() => {
    if (!useMockData) {
      return INITIAL_STATS;
    }

    return {
      logsScored: createInitialMockLogs(25).length,
      triagedBatches: 0,
      incidentsRaised: createInitialMockIncidents(2).length,
      toolCalls: createInitialMockAgentCalls(5).length,
      logsSuppressed: 0,
    };
  });

  useEffect(() => {
    if (useMockData) {
      const stopLogs = startMockLogStream(() => {
        setStats((prev) => ({ ...prev, logsScored: prev.logsScored + 1 }));
      });
      const stopIncidents = startMockIncidentStream(() => {
        setStats((prev) => ({ ...prev, incidentsRaised: prev.incidentsRaised + 1 }));
      });
      const stopAgent = startMockAgentCallStream(() => {
        setStats((prev) => ({ ...prev, toolCalls: prev.toolCalls + 1 }));
      });

      return () => {
        stopLogs();
        stopIncidents();
        stopAgent();
      };
    }

    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = () => {
      ws = new WebSocket(resolveWebSocketUrl());

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as BusMessage;
          setStats((prev) => {
            switch (msg.type) {
              case "log:scored":
                return { ...prev, logsScored: prev.logsScored + 1 };
              case "log:triaged":
                return { ...prev, triagedBatches: prev.triagedBatches + 1 };
              case "incident:created":
                return { ...prev, incidentsRaised: prev.incidentsRaised + 1 };
              case "agent:tool_call":
                return { ...prev, toolCalls: prev.toolCalls + 1 };
              case "log:suppressed":
                return { ...prev, logsSuppressed: prev.logsSuppressed + 1 };
              default:
                return prev;
            }
          });
        } catch {
          // Ignore malformed events and keep streaming.
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

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {statConfig.map((stat) => (
        <div
          key={stat.key}
          className="rounded-2xl border border-black/8 bg-white px-4 py-4 shadow-[0_8px_30px_rgba(20,20,20,0.04)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-[#666372]">{stat.label}</p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[#262330]">
                {stats[stat.key].toLocaleString()}
              </p>
            </div>
            <span className="rounded-full bg-[#f4f7ff] px-2 py-1 text-xs font-medium text-[#5c67c7]">
              live
            </span>
          </div>
          <p className="mt-3 text-xs text-[#8d8a98]">{stat.note}</p>
        </div>
      ))}
    </section>
  );
}
