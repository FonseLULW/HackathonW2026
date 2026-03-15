"use client";

import { useAgentStatus } from "../hooks/useAgentStatus";

type AgentStatusCardProps = {
  onOpenTrail: () => void;
};

export function AgentStatusCard({ onOpenTrail }: AgentStatusCardProps) {
  const status = useAgentStatus();
  const isActive = status === "investigating";

  return (
    <button
      type="button"
      onClick={onOpenTrail}
      className="group w-full cursor-pointer rounded-2xl border border-black/8 bg-white px-4 py-4 text-left shadow-[0_8px_30px_rgba(20,20,20,0.04)] transition-all hover:border-[var(--accent)]/30 hover:shadow-[0_8px_30px_rgba(95,111,255,0.1)] active:scale-[0.98]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[#666372]">Agent Status</p>
          <div className="mt-3 flex items-center gap-2.5">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                isActive
                  ? "agent-investigating bg-[var(--accent)]"
                  : "bg-[#c4c2cc]"
              }`}
            />
            <p
              className={`text-lg font-semibold tracking-[-0.02em] capitalize ${
                isActive ? "text-[var(--accent)]" : "text-[#8d8a98]"
              }`}
            >
              {status}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-[var(--accent)]/15 bg-[#f4f7ff] px-2.5 py-1 text-[11px] font-medium text-[#5c67c7] transition-all group-hover:border-[var(--accent)]/30 group-hover:bg-[var(--accent)]/10">
          View trail
          <svg
            className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M9 6L15 12L9 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </button>
  );
}
