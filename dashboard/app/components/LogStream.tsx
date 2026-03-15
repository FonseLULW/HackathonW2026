"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createInitialMockLogs,
  startMockIncidentStream,
  startMockLogStream,
} from "@/lib/mockData";
import { LogEvent, LogRow } from "./LogRow";

const MAX_LOGS_TO_DISPLAY = 200;

type BusMessage = {
  type?: string;
  data?: LogEvent;
};

export function LogStream() {
  const useMockData = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";
  const [logs, setLogs] = useState<LogEvent[]>(() =>
    useMockData ? createInitialMockLogs(1).reverse() : [],
  );
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);

  useEffect(() => {
    if (useMockData) {
      const stopLogs = startMockLogStream((event) => {
        setLogs((prev) => [...prev, event].slice(-MAX_LOGS_TO_DISPLAY));
      });

      // Keep incident generator running for future incident feed wiring.
      const stopIncidents = startMockIncidentStream(() => {});

      return () => {
        stopLogs();
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
          if (
            !["log:scored", "log:triaged"].includes("" + msg.type) ||
            !msg.data
          ) {
            return;
          }
          setLogs((prev) =>
            [...prev, msg.data as LogEvent].slice(-MAX_LOGS_TO_DISPLAY),
          );
        } catch {
          // Ignore malformed events so the stream stays alive.
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

  useEffect(() => {
    if (!stickToBottom || !scrollContainerRef.current) {
      return;
    }
    scrollContainerRef.current.scrollTop =
      scrollContainerRef.current.scrollHeight;
  }, [logs, stickToBottom]);

  const renderedRows = useMemo(() => {
    return logs.map((log) => {
      const fallbackKey = `${log.timestamp ?? "unknown"}-${log.message ?? "unknown"}`;
      return <LogRow key={log.id ?? fallbackKey} log={log} />;
    });
  }, [logs]);

  if (logs.length === 0) {
    return (
      <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-500">
        Waiting for `log:scored` events...
      </div>
    );
  }

  const onScroll = () => {
    if (!scrollContainerRef.current) {
      return;
    }

    const { scrollTop, clientHeight, scrollHeight } =
      scrollContainerRef.current;
    const nearBottom = scrollHeight - (scrollTop + clientHeight) < 24;
    setStickToBottom(nearBottom);
  };

  return (
    <div
      ref={scrollContainerRef}
      onScroll={onScroll}
      className="h-full overflow-y-auto pr-1 font-mono text-xs [scrollbar-width:thin]"
    >
      <div className="space-y-2">{renderedRows}</div>
    </div>
  );
}
