"use client";

import { IncidentDetail } from "./IncidentDetail";
import type { IncidentFeedItem } from "./incidentTypes";

type IncidentCardProps = {
  incident: IncidentFeedItem;
};

function severityClasses(severity: string): string {
  const level = severity.toLowerCase();
  if (level === "critical") {
    return "border-l-red-700 bg-red-100 hover:bg-red-200 text-red-800";
  }
  if (level === "high") {
    return "border-l-red-500 bg-red-50 hover:bg-red-100 text-red-700";
  }
  if (level === "medium") {
    return "border-l-amber-500 bg-amber-50 hover:bg-amber-100 text-amber-800";
  }
  return "border-l-emerald-500 bg-emerald-50 hover:bg-emerald-100 text-emerald-800";
}

export function IncidentCard({ incident }: IncidentCardProps) {
  const timestamp = new Date(incident.timestamp).toLocaleTimeString();
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
      className={`group w-full rounded border-l-4 p-3 text-left text-sm transition ${severityClasses(incident.severity)}`}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold">
        <span>
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
      <p className="mt-1 text-xs opacity-80">
        {timestamp} | First code ref: `{incident.firstCodeRef}`
      </p>
      <IncidentDetail incident={incident} />
    </details>
  );
}
