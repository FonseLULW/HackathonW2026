import type { IncidentFeedItem } from "./incidentTypes";

type IncidentDetailProps = {
  incident: IncidentFeedItem;
};

export function IncidentDetail({ incident }: IncidentDetailProps) {
  const summaryText = incident.report ?? incident.summary;
  const rootCauseText = incident.rootCause ?? "Root cause pending analysis.";
  const suggestedFixText =
    incident.suggestedFix ?? "Suggested fix pending analysis.";
  const codeRefs = incident.codeRefs.length
    ? incident.codeRefs
    : [{ file: "unknown", line: undefined, blame: "blame unavailable" }];
  const reasoningSteps = incident.reasoningSteps.length
    ? incident.reasoningSteps
    : ["No agent reasoning captured for this incident yet."];
  const contextEvents = incident.contextEvents.length
    ? incident.contextEvents
    : incident.primaryEvent
      ? [incident.primaryEvent]
      : [];

  return (
    <div className="mt-2 space-y-3 text-sm">
      <div className="rounded-2xl border border-white/70 bg-white/70 p-3 text-slate-700">
        {summaryText}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Source</p>
          <p className="mt-2 text-sm font-medium text-slate-700">
            {incident.source ?? "unknown"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Batch Size</p>
          <p className="mt-2 text-sm font-medium text-slate-700">
            {(incident.logCount ?? incident.relatedLogIds.length ?? 1)} log(s)
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Urgency</p>
          <p className="mt-2 text-sm font-medium capitalize text-slate-700">
            {incident.investigationUrgency ?? "unknown"}
          </p>
        </div>
      </div>
      {incident.investigationReason ? (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-3 text-indigo-800">
          Investigation trigger: {incident.investigationReason}
        </div>
      ) : null}
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-800">
        Root cause: {rootCauseText}
      </div>
      <div className="space-y-2">
        {codeRefs.map((ref, index) => {
          const location = `${ref.file}${ref.line ? `:${ref.line}` : ""}`;
          return (
            <div
              key={`${location}-${index}`}
              className="rounded-2xl border border-sky-100 bg-sky-50 p-3 font-mono text-xs text-slate-700"
            >
              <div className="text-[11px] uppercase tracking-[0.18em] text-sky-700/70">
                {location}
              </div>
              <div className="mt-2 text-slate-600">blame: {ref.blame ?? "unknown"}</div>
              {ref.snippet ? <div className="mt-2 text-slate-500">{ref.snippet}</div> : null}
            </div>
          );
        })}
      </div>
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
        Suggested fix: {suggestedFixText}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
          Context Events
        </p>
        <div className="mt-3 space-y-2 font-mono text-xs text-slate-700">
          {contextEvents.length > 0 ? (
            contextEvents.map((event) => (
              <div
                key={event.id}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                  <span>{event.level ?? "unknown"}</span>
                  <span>{event.tier ?? "unknown"}</span>
                  <span>
                    score {typeof event.score === "number" ? event.score.toFixed(2) : "n/a"}
                  </span>
                </div>
                <p className="mt-2 text-slate-700">{event.message ?? "(no message)"}</p>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-slate-500">
              No context events attached to this incident.
            </div>
          )}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
          Related Log IDs
        </p>
        <div className="mt-3 flex flex-wrap gap-2 font-mono text-[11px] text-slate-600">
          {incident.relatedLogIds.length > 0 ? (
            incident.relatedLogIds.map((id) => (
              <span
                key={id}
                className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1"
              >
                {id}
              </span>
            ))
          ) : (
            <span className="rounded-full border border-dashed border-slate-200 px-2 py-1 text-slate-500">
              none
            </span>
          )}
        </div>
      </div>
      <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-3 font-mono text-xs text-slate-700">
        {reasoningSteps.map((step, index) => (
          <div key={`${step}-${index}`} className="py-1">
            {index + 1}. {step}
          </div>
        ))}
      </div>
    </div>
  );
}
