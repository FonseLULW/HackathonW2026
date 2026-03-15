"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { AgentCall } from "./AgentCall";
import { useLiveData } from "./live-data";

export function AgentActivity() {
  const { agentCalls: calls } = useLiveData();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);

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
