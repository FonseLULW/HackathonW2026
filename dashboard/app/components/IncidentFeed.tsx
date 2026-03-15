"use client";

import { useMemo } from "react";
import { IncidentCard } from "./IncidentCard";
import { useLiveData } from "./live-data";

export function IncidentFeed() {
  const { incidents } = useLiveData();

  const incidentCards = useMemo(() => {
    return incidents.map((incident) => {
      return <IncidentCard key={incident.id} incident={incident} />;
    });
  }, [incidents]);

  if (incidents.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-amber-200 bg-white/60 p-4 text-xs text-slate-500">
        Waiting for `incident:created` events...
      </div>
    );
  }

  return (
    <div className="agent-scroll h-full space-y-3 overflow-y-auto pr-1">
      {incidentCards}
    </div>
  );
}
