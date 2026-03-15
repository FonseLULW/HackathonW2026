import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AgentActivity } from "./components/AgentActivity";
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
              <article className="flex h-[62vh] min-h-0 flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
                  Log Stream
                </h2>
                <div className="min-h-0 flex-1">
                  <LogStream />
                </div>
              </article>

              <article className="flex h-[62vh] min-h-0 flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                  <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
                    Incident Feed
                  </h2>
                  <p className="mb-2 text-sm text-slate-500">
                    Expand an incident card above to view its full detail.
                  </p>
                  <div className="min-h-0 flex-1">
                    <IncidentFeed />
                  </div>
              </article>
            </section>

            <section className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-slate-100 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-300">
                Agent Activity
              </h2>
              <AgentActivity />
            </section>
          </main>
          <div className="hidden">{children}</div>
        </div>
      </body>
    </html>
  );
}
