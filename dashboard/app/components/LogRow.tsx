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
    return "bg-red-500";
  }
  if (score >= 0.3) {
    return "bg-amber-500";
  }
  return "bg-emerald-500";
}

function levelBadge(level: string): string {
  if (level === "ERROR" || level === "FATAL") {
    return "bg-red-100 text-red-700";
  }
  if (level === "WARN") {
    return "bg-amber-100 text-amber-800";
  }
  return "bg-emerald-100 text-emerald-700";
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
    <div className="rounded border border-slate-200 bg-slate-50 p-2">
      <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-500">
        <span>{timestamp}</span>
        <span className={`rounded px-1.5 py-0.5 font-semibold ${levelBadge(level)}`}>
          {level}
        </span>
        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-slate-700">
          {tier}
        </span>
      </div>
      <p className="truncate text-slate-700">{log.message ?? "(no message)"}</p>
      <div className="mt-2 h-1.5 rounded bg-slate-200">
        <div className={`h-1.5 rounded ${scoreBarColor(score)}`} style={{ width }} />
      </div>
    </div>
  );
}
