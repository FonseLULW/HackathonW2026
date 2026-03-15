"use client";

import { useLiveData } from "./live-data";

export function ConnectionStatus() {
  const { connectionState: state, lastError } = useLiveData();

  const dotClass =
    state === "connected"
      ? "bg-emerald-400"
      : state === "checking"
        ? "bg-amber-400"
        : "bg-red-400";

  const textClass =
    state === "connected"
      ? "text-emerald-300"
      : state === "checking"
        ? "text-amber-300"
        : "text-red-300";

  const label =
    state === "connected"
      ? "Connected"
      : state === "checking"
        ? "Checking..."
        : "Disconnected";

  return (
    <div
      title={lastError ?? undefined}
      className={`inline-flex items-center gap-2 rounded-full border border-amber-200/70 bg-white/70 px-3 py-2 text-sm shadow-sm ${textClass}`}
    >
      <span className={`h-2.5 w-2.5 rounded-full shadow-[0_0_14px_currentColor] ${dotClass}`} />
      <span className="font-medium tracking-wide">{label}</span>
    </div>
  );
}
