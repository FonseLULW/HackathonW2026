"use client";

import { useMemo } from "react";
import { IncidentCard } from "./IncidentCard";
import { useAgentStatus } from "../hooks/useAgentStatus";
import { useLiveData } from "./live-data";

type IncidentFeedProps = {
  onSelectIncident: (id: string) => void;
  onOpenAgentTrail: () => void;
};

function InvestigatingPlaceholder({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-xl border border-dashed border-[var(--accent)]/25 bg-[#f4f7ff] p-3.5 text-left transition-all hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/8 active:scale-[0.995]"
    >
      <span className="agent-investigating flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/15">
        <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--accent)]">
          Investigation in progress...
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--accent)]/60">
          Agent is analyzing logs &middot; tap to view trail
        </p>
      </div>
      <svg
        className="h-4 w-4 shrink-0 text-[var(--accent)]/40 transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--accent)]"
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
    </button>
  );
}

export function IncidentFeed({
  onSelectIncident,
  onOpenAgentTrail,
}: IncidentFeedProps) {
  const { incidents } = useLiveData();
  const agentStatus = useAgentStatus();

  const incidentCards = useMemo(() => {
    return incidents.map((incident) => (
      <IncidentCard
        key={incident.id}
        incident={incident}
        onSelect={onSelectIncident}
      />
    ));
  }, [incidents, onSelectIncident]);

  if (incidents.length === 0 && agentStatus !== "investigating") {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-black/8 bg-white/60 p-6">
        <p className="text-sm text-[var(--muted)]">
          No escalations yet. Incidents will appear here when the agent
          identifies issues.
        </p>
      </div>
    );
  }

  return (
    <div className="agent-scroll h-full min-w-0 space-y-2 overflow-y-auto overflow-x-hidden pr-1">
      {agentStatus === "investigating" && (
        <InvestigatingPlaceholder onClick={onOpenAgentTrail} />
      )}
      {incidentCards}
    </div>
  );
}
