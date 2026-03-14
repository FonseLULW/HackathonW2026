# Person 3: Dashboard

## Sherlog | HackTheBreak 2026

---

## You own

The Next.js dashboard on Vercel. This is the primary demo surface — if it looks good and clearly shows the pipeline working, the demo lands. You are fully independent: build with mock data, switch to real WebSocket when backend goes live.

## Deliverables

1. Live log stream — real-time with anomaly scores and tier badges
2. Incident feed — cards with severity, summary, code refs
3. Incident detail — full report with agent reasoning chain
4. Stats bar — counts, tier distribution, cost savings estimate
5. Agent activity feed — terminal-style real-time tool calls
6. WebSocket client — connects to FastAPI backend via `wss://`

---

## WebSocket events

| Event | Source | Data |
|---|---|---|
| `log:scored` | Person 1 | Every log (including filtered) with score and tier |
| `log:triaged` | Person 2 | Cheap model decision (escalate/dismiss) |
| `agent:tool_call` | Person 2 | Real-time tool calls during investigation |
| `incident:created` | Person 2 | Final incident report |

**Fix from v2:** Connect via `wss://` (not `ws://`). Caddy in the Docker stack handles TLS. Set Vercel env var: `NEXT_PUBLIC_WS_URL=wss://<domain>/ws`

---

## Page layout

Single page, no routing.

```
┌─────────────────────────────────────────────────┐
│  Sherlog    ● Connected    [stats bar]        │
├────────────────────┬────────────────────────────┤
│  Live log stream   │  Incident feed             │
│  (scrolling, auto- │  (cards, click to expand)  │
│   scroll, pause    │                            │
│   on user scroll)  │  Incident detail           │
│                    │  (report, root cause,      │
│                    │   code refs, suggested fix,│
│                    │   agent reasoning chain)   │
├────────────────────┴────────────────────────────┤
│  Agent activity (terminal-style tool calls)     │
└─────────────────────────────────────────────────┘
```

---

## Key components

**LogRow:** timestamp, level (color-coded), anomaly score bar (green/amber/red), tier badge, truncated message.

**IncidentCard:** severity border color, summary, first code ref. Clickable.

**IncidentDetail:** Summary block, root cause (red bg), code references (dark code blocks with blame info), suggested fix (green bg), agent reasoning chain (numbered tool calls with args and truncated results).

**AgentActivity:** Dark terminal-style feed. Shows tool name, args, truncated result. "Watching the AI think" effect — this is compelling in a demo.

**StatsBar:** Connection indicator, total/filtered/low/medium/high/incident counts, cost savings estimate.

---

## Development approach

Build entirely with mock data first. `lib/mockData.ts` generates fake logs (60% info, 25% warn, 15% error with appropriate scores) and fake incidents every 30s. Switch to real WebSocket by changing one env var.

---

## Styling

- Dark header, light body
- Monospace for logs and agent activity (JetBrains Mono or system mono)
- Consistent severity colors everywhere: green < amber < red
- Minimal animation (subtle fade-in for new items)
- Clean and information-dense — judges are technical

---

## Priority order

1. Scaffold Next.js, deploy to Vercel (30 min)
2. Mock data generators (30 min)
3. LogStream + LogRow (1 hour)
4. StatsBar (30 min)
5. IncidentFeed + IncidentCard (1 hour)
6. IncidentDetail with reasoning chain (1 hour)
7. AgentActivity feed (30 min)
8. WebSocket hook with `wss://` and auto-reconnect (45 min)
9. Polish: empty states, connection indicator, responsive (remaining time)
