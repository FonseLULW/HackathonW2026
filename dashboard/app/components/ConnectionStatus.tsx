"use client";

import { useEffect, useState } from "react";

type ConnectionState = "checking" | "connected" | "disconnected";

function resolveHealthUrl(): string {
  const explicitUrl = process.env.NEXT_PUBLIC_HEALTH_URL;
  if (explicitUrl) {
    return explicitUrl;
  }

  const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (wsUrl) {
    try {
      const url = new URL(wsUrl);
      url.protocol = url.protocol === "wss:" ? "https:" : "http:";
      url.pathname = "/health";
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch {
      // Fall through to localhost default.
    }
  }

  return "http://localhost:3001/health";
}

export function ConnectionStatus() {
  const [state, setState] = useState<ConnectionState>("checking");
  const healthUrl = resolveHealthUrl();

  useEffect(() => {
    let stopped = false;

    const checkHealth = async () => {
      try {
        const res = await fetch(healthUrl, { cache: "no-store" });
        if (!res.ok) {
          if (!stopped) {
            setState("disconnected");
          }
          return;
        }

        const data = (await res.json()) as { status?: string };
        if (!stopped) {
          setState(data.status === "ok" ? "connected" : "disconnected");
        }
      } catch {
        if (!stopped) {
          setState("disconnected");
        }
      }
    };

    void checkHealth();
    const interval = setInterval(() => {
      void checkHealth();
    }, 8000);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [healthUrl]);

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
      className={`inline-flex items-center gap-2 rounded-full border border-amber-200/70 bg-white/70 px-3 py-2 text-sm shadow-sm ${textClass}`}
    >
      <span className={`h-2.5 w-2.5 rounded-full shadow-[0_0_14px_currentColor] ${dotClass}`} />
      <span className="font-medium tracking-wide">{label}</span>
    </div>
  );
}
