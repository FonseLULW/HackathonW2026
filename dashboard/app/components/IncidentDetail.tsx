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

  return (
    <div className="mt-2 space-y-3 text-sm">
      <div className="rounded bg-slate-100 p-2">{summaryText}</div>
      <div className="rounded bg-red-50 p-2 text-red-800">
        Root cause: {rootCauseText}
      </div>
      <div className="space-y-2">
        {codeRefs.map((ref, index) => {
          const location = `${ref.file}${ref.line ? `:${ref.line}` : ""}`;
          return (
            <div
              key={`${location}-${index}`}
              className="rounded bg-slate-900 p-2 font-mono text-xs text-slate-100"
            >
              {location}
              <br />
              blame: {ref.blame ?? "unknown"}
            </div>
          );
        })}
      </div>
      <div className="rounded bg-emerald-50 p-2 text-emerald-800">
        Suggested fix: {suggestedFixText}
      </div>
      <div className="rounded border border-slate-200 bg-slate-50 p-2 font-mono text-xs">
        {reasoningSteps.map((step, index) => (
          <div key={`${step}-${index}`}>
            {index + 1}. {step}
          </div>
        ))}
      </div>
    </div>
  );
}
