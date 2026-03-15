"use client";

import { IncidentDetail } from "./IncidentDetail";
import type { IncidentFeedItem } from "./incidentTypes";

type IncidentCardProps = {
  incident: IncidentFeedItem;
};

function severityClasses(severity: string): string {
  const level = severity.toLowerCase();
  if (level === "critical") {
    return "border-l-rose-500 bg-rose-100 hover:bg-rose-200 text-rose-900";
  }
  if (level === "high") {
    return "border-l-rose-400 bg-rose-50 hover:bg-rose-100 text-rose-800";
  }
  if (level === "medium") {
    return "border-l-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-900";
  }
  return "border-l-emerald-400 bg-emerald-50 hover:bg-emerald-100 text-emerald-900";
}

export function IncidentCard({ incident }: IncidentCardProps) {
  const timestamp = new Date(incident.timestamp).toLocaleTimeString();
  const occurrenceCount =
    incident.occurrenceCount ??
    incident.logCount ??
    incident.relatedLogIds.length ??
    1;
  const handleToggle = (event: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (!event.currentTarget.open) {
      return;
    }

    event.currentTarget.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  };

  return (
    <details
      onToggle={handleToggle}
      className={`group w-full rounded-2xl border border-white/60 border-l-4 p-4 text-left text-sm shadow-[0_12px_24px_rgba(247,196,102,0.08)] transition ${severityClasses(incident.severity)}`}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold">
        <span className="pr-2 leading-6">
          {incident.severity.toUpperCase()}: {incident.summary}
        </span>
        <svg
          className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90"
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
      </summary>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] opacity-60">
        {timestamp} | {incident.source ?? "unknown source"} | {occurrenceCount} occurrence(s) | First code ref: `{incident.firstCodeRef}`
      </p>
      <IncidentDetail incident={incident} />
    </details>
  );
}
