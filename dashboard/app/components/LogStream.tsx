"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LogRow } from "./LogRow";
import { useLiveData } from "./live-data";

export function LogStream() {
  const { logs } = useLiveData();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);

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
      <div className="rounded-2xl border border-dashed border-amber-200 bg-white/60 p-4 text-xs text-slate-500">
        Nothing to report...
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
      className="agent-scroll h-full overflow-y-auto pr-1 font-mono text-xs"
    >
      <div className="space-y-2">{renderedRows}</div>
    </div>
  );
}
