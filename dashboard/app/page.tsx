"use client";

import { useState } from "react";
import { AgentActivity } from "./components/AgentActivity";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { IncidentFeed } from "./components/IncidentFeed";
import { LiveDataProvider, useLiveData } from "./components/live-data";
import { LiveStats } from "./components/LiveStats";
import { LogStream } from "./components/LogStream";

type ViewMode = "overview" | "pipeline";

function SectionTabs({
  activeView,
  setActiveView,
}: {
  activeView: ViewMode;
  setActiveView: (view: ViewMode) => void;
}) {
  return (
    <div className="mt-6 flex flex-wrap gap-6 border-b border-black/6 pb-3">
      <button
        type="button"
        onClick={() => setActiveView("overview")}
        className={`border-b-2 pb-3 text-sm font-medium ${
          activeView === "overview"
            ? "border-[#5f6fff] text-[#4454d8]"
            : "border-transparent text-[#6b6b7a]"
        }`}
      >
        Overview
      </button>
      <button
        type="button"
        onClick={() => setActiveView("pipeline")}
        className={`border-b-2 pb-3 text-sm font-medium ${
          activeView === "pipeline"
            ? "border-[#5f6fff] text-[#4454d8]"
            : "border-transparent text-[#6b6b7a]"
        }`}
      >
        Live incident pipeline
      </button>
    </div>
  );
}

function DashboardContent() {
  const usingMockData = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";
  const [activeView, setActiveView] = useState<ViewMode>("overview");
  const { connectionState, lastError, stats, incidents, agentCalls } = useLiveData();
  const latestIncident = incidents[0];
  const latestAgentCall = agentCalls[agentCalls.length - 1];
  const latestIncidentSummary = latestIncident
    ? `${latestIncident.severity.toUpperCase()} from ${latestIncident.source ?? "unknown source"}`
    : "No incidents raised yet";
  const latestIncidentDetail = latestIncident
    ? `${latestIncident.logCount ?? latestIncident.relatedLogIds.length ?? 1} related log(s)`
    : "Waiting for the first escalated incident report";
  const latestAgentSummary = latestAgentCall
    ? latestAgentCall.command
    : "No tool calls captured yet";
  const latestAgentDetail = latestAgentCall
    ? new Date(latestAgentCall.timestamp).toLocaleTimeString()
    : "Agent activity will appear after investigation starts";

  return (
    <main className="min-h-screen bg-[#f4f4f1] text-[var(--text-strong)]">
      <div className="border-b border-black/6 bg-white">
        <div className="mx-auto max-w-[1520px] px-5 py-6 md:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 bg-[#f8f8f5] font-semibold text-[#111111]">
                  SL
                </div>
                <div>
                  <h1 className="text-3xl font-semibold tracking-[-0.03em]">
                    SnoopLog
                  </h1>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    AI log monitoring for anomaly triage, agent investigation,
                    and incident surfacing
                  </p>
                </div>
              </div>

              <SectionTabs
                activeView={activeView}
                setActiveView={setActiveView}
              />
            </div>

            <div className="flex flex-col items-start gap-3 lg:items-end">
              <span className="rounded-full bg-[#f4f7ff] px-3 py-1 text-xs font-medium text-[#5c67c7]">
                {usingMockData ? "Mock mode" : "Realtime mode"}
              </span>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-black/10 bg-[#fbfbf8] px-4 py-3 shadow-[0_1px_0_rgba(255,255,255,0.7)]">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#9a98a3]">
                Stream Status
              </p>
              <div className="mt-2">
                <ConnectionStatus />
              </div>
            </div>
            <div className="rounded-xl border border-black/10 bg-[#fbfbf8] px-4 py-3 shadow-[0_1px_0_rgba(255,255,255,0.7)]">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#9a98a3]">
                Latest Incident
              </p>
              <p className="mt-1 text-sm font-medium text-[#2b2735]">{latestIncidentSummary}</p>
              <p className="mt-1 text-sm text-[#4d4a57]">{latestIncidentDetail}</p>
            </div>
            <div className="rounded-xl border border-black/10 bg-[#fbfbf8] px-4 py-3 shadow-[0_1px_0_rgba(255,255,255,0.7)]">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#9a98a3]">
                Latest Agent Step
              </p>
              <p className="mt-1 truncate text-sm font-medium text-[#2b2735]">{latestAgentSummary}</p>
              <p className="mt-1 text-sm text-[#4d4a57]">{latestAgentDetail}</p>
            </div>
          </div>

          {connectionState !== "connected" ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="font-medium">Live stream not connected.</div>
              <p className="mt-1 text-amber-800">
                Start the pipeline with <span className="font-mono">docker compose up --build pipeline caddy</span>,
                then run the dashboard without overriding the websocket URL so it
                uses the direct local pipeline socket.
              </p>
              {lastError ? (
                <p className="mt-2 font-mono text-xs text-amber-700">{lastError}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto max-w-[1520px] px-5 py-5 md:px-8">
        {activeView === "overview" ? (
          <>
            <LiveStats />

            <section className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
              <article className="rounded-3xl border border-black/8 bg-white p-5 shadow-[0_12px_40px_rgba(20,20,20,0.05)]">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-[#777482]">Live Stream</p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#2b2735]">
                      Incoming scored logs
                    </h2>
                  </div>
                  <span className="rounded-full bg-[#f2f7ff] px-3 py-1 text-xs font-medium text-[#4f6fd6]">
                    auto-update
                  </span>
                </div>
                <div className="h-[30rem]">
                  <LogStream />
                </div>
              </article>

              <div className="grid gap-5">
                <article className="rounded-3xl border border-black/8 bg-white p-5 shadow-[0_12px_40px_rgba(20,20,20,0.05)]">
                  <div className="mb-4">
                    <p className="text-sm text-[#777482]">Incident Feed</p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#2b2735]">
                      Escalations and reports
                    </h2>
                  </div>
                  <div className="h-[18rem]">
                    <IncidentFeed />
                  </div>
                </article>

                <article className="rounded-3xl border border-black/8 bg-[#fcfcfa] p-5 shadow-[0_12px_40px_rgba(20,20,20,0.05)]">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-[#777482]">Agent Activity</p>
                      <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#2b2735]">
                        Investigation trail
                      </h2>
                    </div>
                    <span className="rounded-full bg-[#f5f1ff] px-3 py-1 text-xs font-medium text-[#7860d8]">
                      tool calls
                    </span>
                  </div>
                  <AgentActivity />
                </article>
              </div>
            </section>
          </>
        ) : (
          <section className="space-y-5">
            <div className="grid gap-4 xl:grid-cols-4">
              <div className="rounded-3xl border border-black/8 bg-white p-5 shadow-[0_12px_40px_rgba(20,20,20,0.05)]">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#9a98a3]">
                  Stage 1
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#2b2735]">
                  Logs scored
                </h2>
                <p className="mt-2 text-sm text-[#6b6b7a]">
                  Person 1 emits scored logs into the shared event stream.
                </p>
                <p className="mt-4 text-4xl font-semibold text-[#262330]">
                  {stats.logsScored}
                </p>
              </div>

              <div className="rounded-3xl border border-black/8 bg-white p-5 shadow-[0_12px_40px_rgba(20,20,20,0.05)]">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#9a98a3]">
                  Stage 2
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#2b2735]">
                  Batches triaged
                </h2>
                <p className="mt-2 text-sm text-[#6b6b7a]">
                  Medium anomalies are grouped and classified as benign or escalated.
                </p>
                <p className="mt-4 text-4xl font-semibold text-[#262330]">
                  {stats.triagedBatches}
                </p>
              </div>

              <div className="rounded-3xl border border-black/8 bg-white p-5 shadow-[0_12px_40px_rgba(20,20,20,0.05)]">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#9a98a3]">
                  Stage 3
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#2b2735]">
                  Agent tools used
                </h2>
                <p className="mt-2 text-sm text-[#6b6b7a]">
                  Investigations call repo and log tools before reporting incidents.
                </p>
                <p className="mt-4 text-4xl font-semibold text-[#262330]">
                  {stats.toolCalls}
                </p>
              </div>

              <div className="rounded-3xl border border-black/8 bg-white p-5 shadow-[0_12px_40px_rgba(20,20,20,0.05)]">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#9a98a3]">
                  Stage 4
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#2b2735]">
                  Incidents created
                </h2>
                <p className="mt-2 text-sm text-[#6b6b7a]">
                  Final reports carry the summary, root cause, code refs, and fix.
                </p>
                <p className="mt-4 text-4xl font-semibold text-[#262330]">
                  {stats.incidentsRaised}
                </p>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[0.95fr_0.95fr_1.1fr]">
              <article className="rounded-3xl border border-black/8 bg-white p-5 shadow-[0_12px_40px_rgba(20,20,20,0.05)]">
                <p className="text-sm text-[#777482]">Scored logs</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#2b2735]">
                  Event intake
                </h2>
                <div className="mt-4 h-[24rem]">
                  <LogStream />
                </div>
              </article>

              <article className="rounded-3xl border border-black/8 bg-[#fcfcfa] p-5 shadow-[0_12px_40px_rgba(20,20,20,0.05)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-[#777482]">Investigation trail</p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#2b2735]">
                      Agent steps
                    </h2>
                  </div>
                  <div className="rounded-full bg-[#f4fff7] px-3 py-1 text-xs font-medium text-emerald-700">
                    {stats.logsSuppressed} benign repeats suppressed
                  </div>
                </div>
                <div className="mt-4">
                  <AgentActivity />
                </div>
              </article>

              <article className="rounded-3xl border border-black/8 bg-white p-5 shadow-[0_12px_40px_rgba(20,20,20,0.05)]">
                <p className="text-sm text-[#777482]">Incident feed</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#2b2735]">
                  Final reports
                </h2>
                <div className="mt-4 h-[24rem]">
                  <IncidentFeed />
                </div>
              </article>
            </div>
          </section>
        )}
      </div>
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
