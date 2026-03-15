"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createInitialMockAgentCalls,
  startMockAgentCallStream,
} from "@/lib/mockData";
import { AgentCall } from "./AgentCall";
import { resolveWebSocketUrl } from "./ws";

const MAX_AGENT_CALLS = 60;

type AgentCallItem = {
  id: string;
  timestamp: string;
  command: string;
};

type BusMessage = {
  type?: string;
  data?: unknown;
};

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

export function AgentActivity() {
  const useMockData = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";
  const [calls, setCalls] = useState<AgentCallItem[]>(() =>
    useMockData
      ? createInitialMockAgentCalls(3)
          .reverse()
          .map((call) => ({
            id: call.id,
            timestamp: call.timestamp,
            command: call.command,
          }))
      : [],
  );
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);

  useEffect(() => {
    if (useMockData) {
      const stopMockCalls = startMockAgentCallStream((call) => {
        setCalls((prev) =>
          [
            ...prev,
            { id: call.id, timestamp: call.timestamp, command: call.command },
          ].slice(-MAX_AGENT_CALLS),
        );
      });

      return () => {
        stopMockCalls();
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
          if (msg.type !== "agent:tool_call" || !msg.data) {
            return;
          }

          const item = normalizeAgentCall(msg.data);
          if (!item) {
            return;
          }

          setCalls((prev) => [...prev, item].slice(-MAX_AGENT_CALLS));
        } catch {
          // Ignore malformed events so feed stays alive.
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
  }, [calls, stickToBottom]);

  const renderedCalls = useMemo(() => {
    return calls.map((call) => (
      <AgentCall key={call.id} command={call.command} />
    ));
  }, [calls]);

  const onScroll = () => {
    if (!scrollContainerRef.current) {
      return;
    }

    const { scrollTop, clientHeight, scrollHeight } =
      scrollContainerRef.current;
    const nearBottom = scrollHeight - (scrollTop + clientHeight) < 24;
    setStickToBottom(nearBottom);
  };

  if (calls.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-amber-200 bg-white/60 p-4 text-xs text-slate-500">
        Waiting for `agent:tool_call` events...
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      onScroll={onScroll}
      className="agent-scroll min-h-[18vh] max-h-[24vh] overflow-y-auto pr-1 font-mono text-xs"
    >
      <div className="space-y-1">{renderedCalls}</div>
    </div>
  );
}
