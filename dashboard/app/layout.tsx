import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { LogStream } from "./components/LogStream";
import { IncidentFeed } from "./components/IncidentFeed";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SnoopLog Dashboard",
  description: "Real-time anomaly and incident dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="min-h-screen bg-slate-50 text-slate-900">
          <header className="border-b border-slate-800 bg-slate-950 text-slate-100">
            <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-4 px-4 py-3 md:px-6">
              <h1 className="text-lg font-semibold tracking-wide">SnoopLog</h1>
              <ConnectionStatus />
            </div>
          </header>

          <main className="mx-auto grid w-full max-w-[1400px] grid-rows-[1fr_auto] gap-4 px-4 py-4 md:px-6">
            <section className="grid min-h-[60vh] grid-cols-1 gap-4 lg:grid-cols-[1.15fr_1fr]">
              <article className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
                  Log Stream
                </h2>
                <LogStream />
              </article>

              <article className="grid grid-rows-[auto_1fr] gap-4">
                <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                  <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
                    Incident Feed
                  </h2>
                  <IncidentFeed />
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                  <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
                    Incident Detail
                  </h2>
                  <div className="space-y-3 text-sm">
                    <div className="rounded bg-slate-100 p-2">
                      Timeout spike traced to payment provider retries
                      saturating worker pool.
                    </div>
                    <div className="rounded bg-red-50 p-2 text-red-800">
                      Root cause: no request timeout guard on
                      `createPaymentIntent`.
                    </div>
                    <div className="rounded bg-slate-900 p-2 font-mono text-xs text-slate-100">
                      services/payment/client.ts:88
                      <br />
                      blame: b4a9e3f - &quot;add retry helper&quot; (2 days ago)
                    </div>
                    <div className="rounded bg-emerald-50 p-2 text-emerald-800">
                      Suggested fix: apply 3s timeout + jittered backoff +
                      circuit breaker.
                    </div>
                    <div className="rounded border border-slate-200 bg-slate-50 p-2 font-mono text-xs">
                      1. search_logs(query=&quot;timeout checkout&quot;)
                      <br />
                      2. git_blame(file=&quot;services/payment/client.ts&quot;,
                      line=88)
                      <br />
                      3. report_incident(severity=&quot;high&quot;)
                    </div>
                  </div>
                </div>
              </article>
            </section>

            <section className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-slate-100 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-300">
                Agent Activity
              </h2>
              <div className="space-y-1 font-mono text-xs">
                <p>
                  <span className="text-emerald-300">$</span> search_logs
                  --query &quot;payment timeout&quot; --limit 50
                </p>
                <p>
                  <span className="text-emerald-300">$</span> git_blame --file
                  services/payment/client.ts --line 88
                </p>
                <p>
                  <span className="text-emerald-300">$</span> report_incident
                  --severity high --confidence 0.93
                </p>
              </div>
            </section>
          </main>
          <div className="hidden">{children}</div>
        </div>
      </body>
    </html>
  );
}
