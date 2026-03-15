"use client";

import { useState } from "react";

type AgentCallProps = {
  command: string;
  toolName?: string;
  args?: string;
  result?: string;
  ok?: boolean;
  full?: boolean;
};

const COLLAPSED_LINES = 4;

function CollapsibleBlock({
  label,
  content,
}: {
  label: string;
  content: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const lines = content.split("\n");
  const needsTruncation = lines.length > COLLAPSED_LINES;
  const displayed = expanded
    ? content
    : lines.slice(0, COLLAPSED_LINES).join("\n");

  return (
    <div className="rounded-xl bg-[#f5f5f1] px-3 py-2">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[#9a98a3]">
        {label}
      </p>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-[#4d4a57]">
        {displayed}
      </pre>
      {needsTruncation && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-1.5 text-[11px] font-medium text-[var(--accent)] hover:underline"
        >
          {expanded ? "Show less" : `Show more (${lines.length} lines)`}
        </button>
      )}
    </div>
  );
}

export function AgentCall({
  command,
  toolName,
  args,
  result,
  ok,
  full = false,
}: AgentCallProps) {
  if (!full) {
    return (
      <p
        className="rounded-xl border border-white/70 bg-white/70 px-3 py-2 leading-6 text-slate-700"
        title={command}
      >
        <span className="mr-2 text-emerald-500">$</span>
        {command}
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-black/6 bg-white p-4 shadow-[0_2px_8px_rgba(20,20,20,0.03)]">
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${ok !== false ? "bg-emerald-400" : "bg-rose-400"}`}
        />
        <span className="font-mono text-sm font-semibold text-[#2b2735]">
          {toolName ?? "tool_call"}
        </span>
      </div>

      {args && <CollapsibleBlock label="Args" content={args} />}
      {result && (
        <div className={args ? "mt-2" : ""}>
          <CollapsibleBlock label="Result" content={result} />
        </div>
      )}
    </div>
  );
}
