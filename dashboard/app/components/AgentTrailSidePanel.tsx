"use client";

import { useLiveData } from "./live-data";
import { SidePanel } from "./SidePanel";
import { AgentCall } from "./AgentCall";
import type { AgentCallItem } from "./live-data";

type AgentTrailSidePanelProps = {
  open: boolean;
  onClose: () => void;
};

function InvestigationStartMarker({ call }: { call: AgentCallItem }) {
  let argsObj: Record<string, unknown> = {};
  try {
    argsObj = JSON.parse(call.args);
  } catch {
    /* ignore */
  }
  const reason = String(argsObj.reason ?? "");
  const urgency = String(argsObj.urgency ?? "");
  const logCount = Number(argsObj.log_count ?? 0);
  const ts = new Date(call.timestamp);
  const timeStr = Number.isNaN(ts.getTime()) ? "" : ts.toLocaleTimeString();

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[var(--accent)]/20 bg-[#f4f7ff] px-4 py-3">
      <span className="agent-investigating mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15">
        <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--accent)]">
          Investigation started
        </p>
        <p className="mt-0.5 text-[12px] text-[#555]">
          {logCount > 0 && <>{logCount} log(s) &middot; </>}
          {reason && <>{reason} &middot; </>}
          {urgency && (
            <span className="font-medium capitalize">{urgency}</span>
          )}
        </p>
        {timeStr && (
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">{timeStr}</p>
        )}
      </div>
    </div>
  );
}

export function AgentTrailSidePanel({
  open,
  onClose,
}: AgentTrailSidePanelProps) {
  const { agentCalls } = useLiveData();

  return (
    <SidePanel open={open} onClose={onClose} title="Investigation Trail">
      {agentCalls.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/8 bg-white/60 p-4 text-sm text-[var(--muted)]">
          No agent activity yet. Tool calls will appear here when the agent
          begins investigating.
        </div>
      ) : (
        <div className="space-y-2">
          {agentCalls.map((call) =>
            call.toolName === "__investigation_start__" ? (
              <InvestigationStartMarker key={call.id} call={call} />
            ) : (
              <AgentCall
                key={call.id}
                command={call.command}
                toolName={call.toolName}
                args={call.args}
                result={call.result}
                ok={call.ok}
                full
              />
            ),
          )}
        </div>
      )}
    </SidePanel>
  );
}
