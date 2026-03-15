"use client";

import { useLiveData } from "./live-data";

const statConfig: Array<{
  key:
    | "logsScored"
    | "triagedBatches"
    | "incidentsRaised"
    | "toolCalls"
    | "logsSuppressed";
  label: string;
  note: string;
}> = [
  { key: "logsScored", label: "Logs Scored", note: "" },
  { key: "triagedBatches", label: "Batches Triaged", note: "" },
  { key: "incidentsRaised", label: "Incidents Raised", note: "" },
  { key: "toolCalls", label: "Tool Calls", note: "" },
  { key: "logsSuppressed", label: "Logs Suppressed", note: "" },
];

export function LiveStats() {
  const { stats } = useLiveData();

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {statConfig.map((stat) => (
        <div
          key={stat.key}
          className="rounded-2xl border border-black/8 bg-white px-4 py-4 shadow-[0_8px_30px_rgba(20,20,20,0.04)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-[#666372]">{stat.label}</p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[#262330]">
                {stats[stat.key].toLocaleString()}
              </p>
            </div>
            <span className="rounded-full bg-[#f4f7ff] px-2 py-1 text-xs font-medium text-[#5c67c7]">
              live
            </span>
          </div>
          <p className="mt-3 text-xs text-[#8d8a98]">{stat.note}</p>
        </div>
      ))}
    </section>
  );
}
