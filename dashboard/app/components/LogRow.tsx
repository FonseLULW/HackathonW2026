export type PipelineState = {
  anomaly_score?: number;
  tier?: string;
};

export type LogEvent = {
  id?: string;
  timestamp?: string;
  level?: string;
  message?: string;
  pipeline?: PipelineState;
};

type LogRowProps = {
  log: LogEvent;
};

function scoreBarColor(score: number): string {
  if (score >= 0.7) {
    return "bg-rose-400";
  }
  if (score >= 0.3) {
    return "bg-amber-300";
  }
  return "bg-emerald-300";
}

function levelBadge(level: string): string {
  if (level === "ERROR" || level === "FATAL") {
    return "border border-rose-300/60 bg-rose-100 text-rose-700";
  }
  if (level === "WARN") {
    return "border border-amber-300/70 bg-amber-100 text-amber-800";
  }
  return "border border-emerald-300/70 bg-emerald-100 text-emerald-700";
}

export function LogRow({ log }: LogRowProps) {
  const timestamp = log.timestamp
    ? new Date(log.timestamp).toLocaleTimeString()
    : "unknown";
  const level = (log.level ?? "info").toUpperCase();
  const tier = (log.pipeline?.tier ?? "low").toUpperCase();
  const score = Number(log.pipeline?.anomaly_score ?? 0);
  const width = `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`;

  return (
    <div className="rounded-2xl border border-amber-100 bg-white/78 p-3 shadow-[0_12px_24px_rgba(247,196,102,0.08)] transition hover:border-amber-200 hover:bg-white">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <span>{timestamp}</span>
        <span className={`rounded px-1.5 py-0.5 font-semibold ${levelBadge(level)}`}>
          {level}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-slate-700">
          {tier}
        </span>
      </div>
      <p className="truncate text-sm text-slate-700">{log.message ?? "(no message)"}</p>
      <div className="mt-3 h-1.5 rounded-full bg-amber-100">
        <div className={`h-1.5 rounded ${scoreBarColor(score)}`} style={{ width }} />
      </div>
    </div>
  );
}
