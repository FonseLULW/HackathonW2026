# Person 3: Dashboard — Implementation Spec

## InteliLog | HackTheBreak 2026

---

## Your role

You own the visual layer. You build the Next.js dashboard on Vercel that displays the live pipeline in real-time and shows incident reports. This is also the primary demo surface for judges — if the dashboard looks good and clearly shows the intelligence pipeline working, the demo lands.

You are fully independent — build everything with mock data first, switch to the real WebSocket when the backend is live.

---

## Deliverables

1. **Live pipeline view** — real-time log stream with anomaly scores and tier routing
2. **Incident feed** — list of AI-generated incident reports
3. **Incident detail view** — full report with agent reasoning chain and code references
4. **Pipeline stats bar** — processing counts, tier distribution, cost savings
5. **Agent activity feed** — real-time tool calls as the AI investigates
6. **WebSocket client** — connects to the FastAPI backend

---

## Tech stack

- **Next.js 14+** (App Router) on Vercel
- **WebSocket** for real-time data from the FastAPI backend on GCP
- **Tailwind CSS** for styling
- **shadcn/ui** components (optional, if it speeds things up)
- No charting library needed — keep it clean with CSS indicators

---

## 1. WebSocket client

The FastAPI backend exposes a WebSocket at `ws://<GCP_IP>:3001/ws` that pushes all pipeline events.

### Events you'll receive

```typescript
// Every log entering the system (including filtered)
type LogScoredEvent = {
  type: 'log:scored';
  data: LogEvent;
};

// When cheap model makes a triage decision
type LogTriagedEvent = {
  type: 'log:triaged';
  data: LogEvent & { triage: { escalate: boolean; reason: string; urgency: string } };
};

// Real-time agent tool calls during investigation
type AgentToolCallEvent = {
  type: 'agent:tool_call';
  data: {
    logId: string;
    tool: string;       // 'read_file' | 'grep_code' | 'git_blame' | etc.
    args: object;
    result: string;     // Truncated
  };
};

// Final incident report
type IncidentCreatedEvent = {
  type: 'incident:created';
  data: LogEvent;       // With incident field populated
};
```

### Connection hook

```typescript
// hooks/usePipelineSocket.ts
import { useEffect, useRef, useState, useCallback } from 'react';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws';

interface Stats {
  total: number;
  filtered: number;
  low: number;
  medium: number;
  high: number;
  incidents: number;
}

export function usePipelineSocket() {
  const [logs, setLogs] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [agentActivity, setAgentActivity] = useState<any[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0, filtered: 0, low: 0, medium: 0, high: 0, incidents: 0
  });
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case 'log:scored':
          setLogs(prev => [msg.data, ...prev].slice(0, 200));
          setStats(prev => ({
            ...prev,
            total: prev.total + 1,
            filtered: prev.filtered + (msg.data.pipeline?.filtered ? 1 : 0),
            [msg.data.pipeline?.tier || 'low']: (prev[msg.data.pipeline?.tier || 'low'] || 0) + 1,
          }));
          break;

        case 'log:triaged':
          // Update the log entry if visible
          break;

        case 'agent:tool_call':
          setAgentActivity(prev => [msg.data, ...prev].slice(0, 50));
          break;

        case 'incident:created':
          setIncidents(prev => [msg.data, ...prev]);
          setStats(prev => ({ ...prev, incidents: prev.incidents + 1 }));
          break;
      }
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      clearTimeout(reconnectRef.current);
    };
  }, [connect]);

  return { logs, incidents, agentActivity, stats, connected };
}
```

### Fallback: polling

If WebSocket is being difficult, poll a REST endpoint every 2 seconds:

```
GET /api/pipeline/recent?since={timestamp}
```

Get real-time working first, optimize later.

---

## 2. Page layout

Single-page dashboard. No routing — keep it simple.

```
┌─────────────────────────────────────────────────────┐
│  InteliLog     ● Connected   [stats bar]            │
├──────────────────────┬──────────────────────────────┤
│                      │                              │
│   Live log stream    │   Incident feed              │
│   (scrolling list)   │   (cards with summaries)     │
│                      │                              │
│                      │   ┌────────────────────────┐ │
│                      │   │ Incident detail         │ │
│                      │   │ (expanded on click)     │ │
│                      │   │                         │ │
│                      │   │ Agent reasoning chain   │ │
│                      │   │ Code references         │ │
│                      │   │ Suggested fix           │ │
│                      │   └────────────────────────┘ │
│                      │                              │
├──────────────────────┴──────────────────────────────┤
│  Agent activity feed (real-time tool calls)         │
└─────────────────────────────────────────────────────┘
```

---

## 3. Live log stream

Scrolling list of logs with color-coded severity and anomaly scores.

```tsx
// components/LogRow.tsx
function LogRow({ log }: { log: any }) {
  const score = log.pipeline?.anomaly_score || 0;
  const scoreColor = score < 0.3 ? 'bg-green-500' : score < 0.7 ? 'bg-amber-500' : 'bg-red-500';

  const tierStyles: Record<string, string> = {
    low: 'bg-gray-100 text-gray-600',
    medium: 'bg-amber-100 text-amber-700',
    high: 'bg-red-100 text-red-700',
  };

  const levelColors: Record<string, string> = {
    info: 'text-gray-500',
    warn: 'text-amber-600',
    warning: 'text-amber-600',
    error: 'text-red-600',
    fatal: 'text-red-700 font-bold',
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-100 font-mono text-sm hover:bg-gray-50 transition-colors">
      <span className="text-gray-400 text-xs w-20 shrink-0">
        {new Date(log.timestamp).toLocaleTimeString()}
      </span>

      <span className={`uppercase text-xs font-medium w-14 ${levelColors[log.level] || 'text-gray-500'}`}>
        {log.level}
      </span>

      {/* Anomaly score bar */}
      <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden shrink-0">
        <div className={`h-full rounded-full transition-all ${scoreColor}`}
          style={{ width: `${score * 100}%` }}
        />
      </div>

      <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${
        log.pipeline?.filtered ? 'bg-gray-50 text-gray-400' : tierStyles[log.pipeline?.tier] || 'bg-gray-50'
      }`}>
        {log.pipeline?.filtered ? 'filtered' : log.pipeline?.tier || '—'}
      </span>

      <span className="text-gray-700 truncate">{log.message}</span>
    </div>
  );
}
```

### Auto-scroll behavior

Auto-scroll to show new logs. Pause if the user scrolls up to inspect older logs. Resume when they scroll back to the bottom.

```tsx
// components/LogStream.tsx
function LogStream({ logs }: { logs: any[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = 0; // Newest at top
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop } = containerRef.current;
    setAutoScroll(scrollTop < 50); // Near top = auto-scroll on
  };

  return (
    <div ref={containerRef} onScroll={handleScroll}
      className="h-full overflow-y-auto">
      {logs.map(log => <LogRow key={log.id} log={log} />)}
      {logs.length === 0 && (
        <div className="text-center text-gray-400 py-12">
          Waiting for logs...
        </div>
      )}
    </div>
  );
}
```

---

## 4. Incident feed + detail

### Incident card

```tsx
// components/IncidentCard.tsx
function IncidentCard({ incident, isSelected, onClick }: {
  incident: any; isSelected: boolean; onClick: () => void;
}) {
  const severityStyles: Record<string, string> = {
    critical: 'border-l-red-600 bg-red-50',
    high: 'border-l-orange-500 bg-orange-50',
    medium: 'border-l-amber-400 bg-amber-50',
    low: 'border-l-green-400 bg-green-50',
    unknown: 'border-l-gray-400 bg-gray-50',
  };

  const severity = incident.incident?.severity || 'unknown';

  return (
    <div onClick={onClick}
      className={`border-l-4 rounded-lg p-4 cursor-pointer transition
        ${severityStyles[severity]}
        ${isSelected ? 'ring-2 ring-blue-300' : 'hover:shadow-md'}`}>

      <div className="flex justify-between items-start mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {severity}
        </span>
        <span className="text-xs text-gray-400">
          {new Date(incident.timestamp).toLocaleTimeString()}
        </span>
      </div>

      <p className="text-sm font-medium text-gray-900 mb-1">
        {incident.incident?.report || 'Investigating...'}
      </p>

      {incident.incident?.code_refs?.length > 0 && (
        <p className="text-xs text-gray-500 font-mono">
          {incident.incident.code_refs[0].file}:{incident.incident.code_refs[0].line}
        </p>
      )}
    </div>
  );
}
```

### Incident detail

When clicked, expand to show the full report.

```tsx
// components/IncidentDetail.tsx
function IncidentDetail({ incident, agentActivity }: { incident: any; agentActivity: any[] }) {
  const report = incident.incident;
  if (!report) return null;

  // Filter agent activity for this incident
  const relatedActivity = agentActivity.filter(a => a.logId === incident.id);

  return (
    <div className="space-y-4 p-4">
      {/* Summary */}
      <div className="bg-white rounded-lg p-4 border">
        <h3 className="text-sm font-medium text-gray-500 mb-1">Summary</h3>
        <p className="text-gray-900">{report.report}</p>
      </div>

      {/* Root cause */}
      {report.root_cause && (
        <div className="bg-red-50 rounded-lg p-4 border border-red-100">
          <h3 className="text-sm font-medium text-red-700 mb-1">Root cause</h3>
          <p className="text-red-900 text-sm">{report.root_cause}</p>
        </div>
      )}

      {/* Code references */}
      {report.code_refs?.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-2">Code references</h3>
          <div className="space-y-2">
            {report.code_refs.map((ref: any, i: number) => (
              <div key={i} className="bg-gray-900 text-gray-100 rounded-lg p-3 font-mono text-sm">
                <div className="text-blue-400">{ref.file}:{ref.line}</div>
                {ref.blame_author && (
                  <div className="text-gray-500 text-xs mt-1">
                    Last changed by {ref.blame_author} on {ref.blame_date} ({ref.blame_commit})
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggested fix */}
      {report.suggested_fix && (
        <div className="bg-green-50 rounded-lg p-4 border border-green-100">
          <h3 className="text-sm font-medium text-green-700 mb-1">Suggested fix</h3>
          <p className="text-green-900 text-sm">{report.suggested_fix}</p>
        </div>
      )}

      {/* Agent reasoning chain */}
      {relatedActivity.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-2">Agent investigation</h3>
          <div className="bg-gray-900 text-green-400 font-mono text-xs p-3 rounded-lg space-y-1">
            {relatedActivity.map((call, i) => (
              <div key={i}>
                <span className="text-gray-500">{i + 1}.</span>{' '}
                <span className="text-blue-400">{call.tool}</span>
                <span className="text-gray-400">({formatArgs(call.args)})</span>{' '}
                <span className="text-gray-600">→ {call.result.substring(0, 80)}...</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatArgs(args: any): string {
  return Object.entries(args)
    .map(([k, v]) => `${k}="${v}"`)
    .join(', ');
}
```

---

## 5. Stats bar

```tsx
// components/StatsBar.tsx
function StatsBar({ stats, connected }: { stats: Stats; connected: boolean }) {
  return (
    <div className="flex items-center gap-6 px-6 py-3 bg-gray-50 border-b text-sm">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-xs text-gray-500">{connected ? 'Connected' : 'Disconnected'}</span>
      </div>

      <Stat label="Total" value={stats.total} />
      <Stat label="Filtered" value={stats.filtered} color="gray" />
      <Stat label="Low" value={stats.low} color="green" />
      <Stat label="Medium" value={stats.medium} color="amber" />
      <Stat label="High" value={stats.high} color="red" />
      <Stat label="Incidents" value={stats.incidents} color="red" />

      <div className="ml-auto text-xs text-gray-500">
        Saved ~${((stats.filtered + stats.low) * 0.001).toFixed(2)} by not calling LLM
      </div>
    </div>
  );
}

function Stat({ label, value, color = 'gray' }: { label: string; value: number; color?: string }) {
  const colors: Record<string, string> = {
    gray: 'text-gray-700',
    green: 'text-green-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
  };
  return (
    <div className="flex items-center gap-1">
      <span className="text-gray-500">{label}:</span>
      <span className={`font-medium ${colors[color]}`}>{value}</span>
    </div>
  );
}
```

---

## 6. Agent activity feed

Terminal-style feed showing real-time tool calls.

```tsx
// components/AgentActivity.tsx
function AgentActivity({ activity }: { activity: any[] }) {
  if (activity.length === 0) {
    return (
      <div className="bg-gray-900 rounded-lg p-4 text-gray-600 font-mono text-xs text-center">
        Agent idle — waiting for high-anomaly events...
      </div>
    );
  }

  return (
    <div className="bg-gray-900 text-green-400 font-mono text-xs p-4 rounded-lg max-h-40 overflow-y-auto">
      {activity.map((call, i) => (
        <div key={i} className="mb-1 leading-relaxed">
          <span className="text-gray-600">[{new Date().toLocaleTimeString()}]</span>{' '}
          <span className="text-blue-400">{call.tool}</span>{' '}
          <span className="text-green-300">{formatArgs(call.args)}</span>{' '}
          <span className="text-gray-600">→ {call.result.substring(0, 100)}</span>
        </div>
      ))}
    </div>
  );
}
```

---

## 7. Mock data for development

Build the entire UI with this before the backend exists.

```typescript
// lib/mockData.ts
const messages = {
  info: [
    'GET /api/products 200 12ms',
    'POST /api/orders 201 45ms',
    'User login successful user_id=u123',
    'Cache hit for product_list ttl=300s',
  ],
  warn: [
    'Connection pool at 85% capacity',
    'Slow query detected: SELECT * FROM orders took 2340ms',
    'Rate limit approaching for api_key=ak_123',
  ],
  error: [
    'ECONNREFUSED - Connection refused to postgres:5432',
    'FATAL: too many connections for role "postgres"',
    'Unhandled exception in /api/orders: TypeError cannot read property id of undefined',
    'JWT verification failed: token signature invalid',
  ],
};

export function generateMockLog() {
  const rand = Math.random();
  const level = rand < 0.6 ? 'info' : rand < 0.85 ? 'warn' : 'error';
  const msgs = messages[level];
  const message = msgs[Math.floor(Math.random() * msgs.length)];
  const score = level === 'error' ? 0.5 + Math.random() * 0.5
    : level === 'warn' ? 0.2 + Math.random() * 0.4
    : Math.random() * 0.25;

  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    source: 'dummy-ecommerce-api',
    level,
    message,
    pipeline: {
      anomaly_score: Math.round(score * 100) / 100,
      tier: score < 0.3 ? 'low' : score < 0.7 ? 'medium' : 'high',
      filtered: level === 'info' && Math.random() < 0.3,
      filter_reason: null,
    },
  };
}

export function generateMockIncident() {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    source: 'dummy-ecommerce-api',
    level: 'error',
    message: 'FATAL: too many connections for role "postgres"',
    pipeline: { anomaly_score: 0.92, tier: 'high' },
    incident: {
      report: 'Connection pool exhaustion detected in order-service. Error rate spiked from 0% to 47% over 2 minutes.',
      root_cause: 'Database connection pool max size was reduced from 20 to 5 in a recent config change, causing exhaustion under normal load.',
      severity: 'high',
      code_refs: [{
        file: 'src/db/pool.ts',
        line: 42,
        blame_author: 'sepehr',
        blame_date: '2026-03-13',
        blame_commit: 'a1b2c3d',
      }],
      suggested_fix: 'Revert pool size change in src/db/pool.ts:42 or increase max connections to handle current load.',
    },
  };
}

// Simulate a stream for development
export function startMockStream(
  onLog: (log: any) => void,
  onIncident?: (incident: any) => void,
) {
  const logInterval = setInterval(() => onLog(generateMockLog()), 500);

  // Occasional incident every 30 seconds
  const incidentInterval = onIncident
    ? setInterval(() => onIncident(generateMockIncident()), 30000)
    : null;

  return () => {
    clearInterval(logInterval);
    if (incidentInterval) clearInterval(incidentInterval);
  };
}
```

---

## File structure

```
dashboard/
  app/
    page.tsx              # Main dashboard page
    layout.tsx            # Root layout
    globals.css           # Tailwind
  components/
    StatsBar.tsx
    LogStream.tsx
    LogRow.tsx
    IncidentFeed.tsx
    IncidentCard.tsx
    IncidentDetail.tsx
    AgentActivity.tsx
  hooks/
    usePipelineSocket.ts
  lib/
    types.ts              # TypeScript types
    mockData.ts           # Mock generators
  next.config.js
  tailwind.config.ts
  package.json
```

---

## Styling guidelines

- Dark header with "InteliLog" branding, light body
- **JetBrains Mono** or system monospace for log messages and agent activity
- Color-coded severity used consistently everywhere (green/amber/red)
- Minimal animations — subtle fade-in for new logs
- Clean, professional, information-dense. Judges are technical.

---

## Coordination

- **Person 1 + 2** provide the event stream via WebSocket. You need the GCP IP from Person 4.
- Set the Vercel environment variable: `NEXT_PUBLIC_WS_URL=ws://<GCP_IP>:3001/ws`
- You can develop 100% independently using mock data until the backend goes live.

---

## Priority order

1. Scaffold Next.js, deploy blank page to Vercel (30 min)
2. Mock data generators — start using them immediately (30 min)
3. LogStream + LogRow components (1 hour)
4. StatsBar (30 min)
5. IncidentFeed + IncidentCard (1 hour)
6. IncidentDetail with reasoning chain (1 hour)
7. AgentActivity feed (30 min)
8. WebSocket hook — connect to real backend (45 min)
9. Polish: layout, connection status indicator, empty states (remaining time)
