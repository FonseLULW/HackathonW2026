"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { IncidentFeed } from "./components/IncidentFeed";
import { IncidentSidePanel } from "./components/IncidentSidePanel";
import { AgentTrailSidePanel } from "./components/AgentTrailSidePanel";
import { LiveDataProvider, useLiveData } from "./components/live-data";
import { LiveStats } from "./components/LiveStats";
import { LogStream } from "./components/LogStream";
import { resetFirestore } from "@/lib/firestore-reset";
import { Pirata_One } from "next/font/google";

const myfont = Pirata_One({ subsets: ["latin"], weight: "400" });

type PanelState =
  | { kind: "closed" }
  | { kind: "incident"; incidentId: string }
  | { kind: "agent-trail" };

function DashboardContent() {
  const usingMockData = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";
  const { connectionState, lastError } = useLiveData();
  const [panel, setPanel] = useState<PanelState>({ kind: "closed" });
  const [resetting, setResetting] = useState(false);

  const handleReset = useCallback(async () => {
    if (!confirm("Wipe all data from Firebase? This cannot be undone.")) return;
    setResetting(true);
    try {
      await resetFirestore();
      window.location.reload();
    } catch (err) {
      console.error("Reset failed:", err);
      alert("Reset failed — check the console for details.");
      setResetting(false);
    }
  }, []);

  const closePanel = useCallback(() => setPanel({ kind: "closed" }), []);
  const openIncident = useCallback(
    (id: string) => setPanel({ kind: "incident", incidentId: id }),
    [],
  );
  const openAgentTrail = useCallback(
    () => setPanel({ kind: "agent-trail" }),
    [],
  );

  return (
    <main className="min-h-screen bg-[#f4f4f1] text-[var(--text-strong)]">
      {/* ── Compact Header ── */}
      <div className="border-b border-black/6 bg-white">
        <div className="mx-auto flex max-w-[1520px] items-center justify-between gap-4 px-5 py-3.5 md:px-8">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.svg"
              alt="SnoopLog logo"
              width={56}
              height={56}
              priority
              className="h-14 w-14 shrink-0 object-contain"
            />
            <div>
              <h1
                className={
                  "text-2xl font-semibold tracking-[-0.03em] " +
                  myfont.className
                }
              >
                SnoopLog
              </h1>
              <p className="hidden text-[11px] text-[var(--muted)] sm:block">
                AI log monitoring &middot; anomaly triage &middot; incident
                surfacing
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ConnectionStatus />
            <span className="rounded-full bg-[#f4f7ff] px-2.5 py-1 text-[11px] font-medium text-[#5c67c7]">
              {usingMockData ? "Mock" : "Live"}
            </span>
            {!usingMockData && (
              <button
                type="button"
                onClick={handleReset}
                disabled={resetting}
                className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-600 transition-colors hover:bg-rose-100 disabled:opacity-50"
              >
                {resetting ? "Wiping..." : "Reset DB"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="mx-auto max-w-[1520px] px-5 py-4 md:px-8">
        {connectionState !== "connected" && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="font-medium">Live stream not connected.</div>
            <p className="mt-1 text-amber-800">
              Start the pipeline with{" "}
              <span className="font-mono">
                docker compose up --build pipeline caddy
              </span>
              , then run the dashboard.
            </p>
            {lastError && (
              <p className="mt-2 font-mono text-xs text-amber-700">
                {lastError}
              </p>
            )}
          </div>
        )}

        <LiveStats onOpenAgentTrail={openAgentTrail} />

        <section className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          {/* Primary: Escalations */}
          <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-black/8 bg-white p-4 shadow-[0_8px_30px_rgba(20,20,20,0.04)]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#2b2735]">
                Escalations
              </h2>
              <span className="text-[11px] text-[var(--muted)]">
                click to inspect
              </span>
            </div>
            <div className="min-h-0 flex-1" style={{ maxHeight: "calc(100vh - 260px)" }}>
              <IncidentFeed onSelectIncident={openIncident} onOpenAgentTrail={openAgentTrail} />
            </div>
          </article>

          {/* Secondary: Log stream */}
          <article className="flex flex-col rounded-2xl border border-black/8 bg-white p-4 shadow-[0_8px_30px_rgba(20,20,20,0.04)]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#2b2735]">
                Log Stream
              </h2>
              <span className="rounded-full bg-[#f2f7ff] px-2 py-0.5 text-[10px] font-medium text-[#4f6fd6]">
                auto-update
              </span>
            </div>
            <div className="min-h-0 flex-1" style={{ maxHeight: "calc(100vh - 260px)" }}>
              <LogStream />
            </div>
          </article>
        </section>
      </div>

      {/* ── Side panels ── */}
      <IncidentSidePanel
        incidentId={panel.kind === "incident" ? panel.incidentId : null}
        onClose={closePanel}
      />
      <AgentTrailSidePanel
        open={panel.kind === "agent-trail"}
        onClose={closePanel}
      />
    </main>
  );
}

export default function Home() {
  return (
    <LiveDataProvider>
      <DashboardContent />
    </LiveDataProvider>
  );
}
