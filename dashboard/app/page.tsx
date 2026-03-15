import { AgentActivity } from "./components/AgentActivity";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { IncidentFeed } from "./components/IncidentFeed";
import { LiveStats } from "./components/LiveStats";
import { LogStream } from "./components/LogStream";

export default function Home() {
  const usingMockData = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";

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

              <div className="mt-6 flex flex-wrap gap-6 border-b border-black/6 pb-3">
                <span className="border-b-2 border-[#5f6fff] pb-3 text-sm font-medium text-[#4454d8]">
                  Overview
                </span>
                <span className="pb-3 text-sm font-medium text-[#6b6b7a]">
                  Live incident pipeline
                </span>
              </div>
            </div>

            <div className="flex flex-col items-start gap-3 lg:items-end">
              <ConnectionStatus />
              <span className="rounded-full bg-[#f4f7ff] px-3 py-1 text-xs font-medium text-[#5c67c7]">
                {usingMockData ? "Mock mode" : "Realtime mode"}
              </span>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-black/10 bg-[#fbfbf8] px-4 py-3 shadow-[0_1px_0_rgba(255,255,255,0.7)]">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#9a98a3]">
                Data Source
              </p>
              <p className="mt-1 text-sm text-[#4d4a57]">
                Person 1 scoring + Person 2 triage and incident events
              </p>
            </div>
            <div className="rounded-xl border border-black/10 bg-[#fbfbf8] px-4 py-3 shadow-[0_1px_0_rgba(255,255,255,0.7)]">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#9a98a3]">
                WebSocket
              </p>
              <p className="mt-1 text-sm text-[#4d4a57]">/ws event stream</p>
            </div>
            <div className="rounded-xl border border-black/10 bg-[#fbfbf8] px-4 py-3 shadow-[0_1px_0_rgba(255,255,255,0.7)]">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#9a98a3]">
                Current Scope
              </p>
              <p className="mt-1 text-sm text-[#4d4a57]">
                Live logs, incidents, tool calls, and suppressed repeats
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1520px] px-5 py-5 md:px-8">
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
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-[#777482]">Incident Feed</p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#2b2735]">
                    Escalations and reports
                  </h2>
                </div>
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
      </div>
    </main>
  );
}
