# InteliLog — System Architecture Diagrams

## 1. High-level pipeline flow

```mermaid
flowchart TD
    subgraph Sources["Log sources"]
        CLI["CLI / stdin"]
        Docker["Docker sidecar"]
        Webhook["Webhook"]
        Syslog["Syslog"]
    end

    subgraph Pipeline["InteliLog pipeline — FastAPI"]
        Ingest["Log ingestion + parsing"]
        Filter["Rule-based pre-filter"]
        ML["ML anomaly scorer\n(isolation forest)"]
        Router{"Tier router"}
    end

    subgraph LLM["LLM cascade — OpenRouter"]
        Cheap["Cheap model triage\n(Gemini Flash / Haiku)"]
        Reason["Reasoning model\n(Sonnet / GPT-4o)"]
    end

    subgraph Agent["Agent framework"]
        ReadFile["read_file"]
        Grep["grep_code"]
        Blame["git_blame"]
        GitLog["git_log"]
        ListFiles["list_files"]
        SearchLogs["search_logs"]
    end

    subgraph Output["Delivery"]
        Report["Incident report"]
        Discord["Discord / Slack\nwebhook"]
        Dashboard["Dashboard\n(Vercel)"]
    end

    Sources --> Ingest
    Ingest --> Filter
    Filter -->|"Known noise"| Drop["Archive / drop"]
    Filter --> ML
    ML --> Router

    Router -->|"score < 0.3"| Drop
    Router -->|"0.3 – 0.7"| Cheap
    Router -->|"score > 0.7"| Reason

    Cheap -->|"escalate: true"| Reason
    Cheap -->|"escalate: false"| Archive["Log + triage decision"]

    Reason <--> Agent
    Agent <-->|"read-only"| Repo[("Git repo\n(Docker volume)")]

    Reason --> Report
    Report --> Discord
    Report --> Dashboard
    ML -.->|"all events\n(WebSocket)"| Dashboard
```

## 2. Docker Compose service topology

```mermaid
flowchart LR
    subgraph GCP["GCP Compute Engine"]
        subgraph DockerCompose["Docker Compose"]
            RepoInit["repo-init\n(alpine/git)"]
            PipelineSvc["pipeline\n(python:3.12-slim)\nFastAPI :3001"]
            DummyApp["dummy-app\n(node:20-slim)\nNext.js :3000"]
            TrafficGen["traffic-gen\n(node:20-slim)"]
        end
        RepoVol[("repo-data\nvolume")]
    end

    Vercel["Dashboard\n(Vercel)"]

    RepoInit -->|"git clone"| RepoVol
    PipelineSvc -->|":ro mount"| RepoVol
    DummyApp -->|"POST /api/ingest"| PipelineSvc
    TrafficGen -->|"GET/POST traffic"| DummyApp
    PipelineSvc -->|"WebSocket"| Vercel
    PipelineSvc -->|"webhook"| DiscordAPI["Discord API"]
    PipelineSvc -->|"LLM calls"| OpenRouter["OpenRouter API"]
```

## 3. Log event lifecycle (state machine)

```mermaid
stateDiagram-v2
    [*] --> Ingested: Raw log received
    Ingested --> Parsed: Normalize to JSON schema
    Parsed --> Filtered: Match filter rules

    Filtered --> Dropped: Known noise
    Filtered --> Scoring: Pass filter

    Scoring --> Low: score < 0.3
    Scoring --> Medium: 0.3 ≤ score ≤ 0.7
    Scoring --> High: score > 0.7

    Low --> Archived: No LLM call
    Medium --> Triage: Cheap model
    High --> Investigation: Reasoning model

    Triage --> Archived: Not escalated
    Triage --> Investigation: Escalated

    Investigation --> AgentLoop: Tool use loop
    AgentLoop --> AgentLoop: Read / grep / blame
    AgentLoop --> ReportGenerated: Max iterations or done

    ReportGenerated --> Delivered: Discord + Dashboard
    Delivered --> [*]
```

## 4. Agent investigation loop

```mermaid
flowchart TD
    Start["Receive high-anomaly log\n+ context from triage"]
    Prompt["Build prompt:\nsystem + log + context"]
    Call["Call reasoning model\nvia OpenRouter"]
    Check{"Response type?"}

    ToolUse["Tool call requested"]
    Execute["Execute tool\n(sandboxed)"]
    Append["Append result\nto conversation"]

    Final["Final text response"]
    Parse["Parse JSON\nincident report"]
    Emit["Emit incident:created\nevent"]

    Timeout{"Timeout or\nmax iterations?"}

    Start --> Prompt
    Prompt --> Call
    Call --> Check

    Check -->|"tool_calls"| ToolUse
    Check -->|"text"| Final

    ToolUse --> Execute
    Execute --> Append
    Append --> Timeout
    Timeout -->|"No"| Call
    Timeout -->|"Yes"| Partial["Emit partial report"]

    Final --> Parse
    Parse --> Emit
```

## 5. Data flow between team tracks

```mermaid
flowchart LR
    subgraph P4["Person 4"]
        DummyApp2["Dummy app\n(Next.js)"]
        TrafficGen2["Traffic generator"]
        Discord2["Discord integration"]
        DockerSetup["Docker / GCP"]
    end

    subgraph P1["Person 1"]
        Ingestion["Ingestion server"]
        Parser["Log parser"]
        Filters["Pre-filters"]
        Scorer["ML scorer"]
    end

    subgraph P2["Person 2"]
        Router2["Tier router"]
        CheapLLM["Cheap model triage"]
        AgentFW["Agent framework"]
        ReasonLLM["Reasoning model"]
    end

    subgraph P3["Person 3"]
        WebSocketClient["WebSocket client"]
        LogStream["Log stream view"]
        IncidentFeed["Incident feed"]
        AgentView["Agent activity view"]
    end

    TrafficGen2 -->|"HTTP traffic"| DummyApp2
    DummyApp2 -->|"POST logs"| Ingestion
    Ingestion --> Parser --> Filters --> Scorer
    Scorer -->|"log:scored"| Router2
    Scorer -.->|"all events\n(WebSocket)"| WebSocketClient
    Router2 --> CheapLLM
    Router2 --> ReasonLLM
    CheapLLM -->|"escalate"| ReasonLLM
    ReasonLLM <--> AgentFW
    AgentFW -.->|"agent:tool_call"| AgentView
    ReasonLLM -->|"incident:created"| IncidentFeed
    ReasonLLM -->|"incident:created"| Discord2
    WebSocketClient --> LogStream

    DockerSetup -.->|"deploys all"| P1
    DockerSetup -.->|"deploys all"| P2
```

## 6. Security and isolation model

```mermaid
flowchart TD
    subgraph DockerHost["Docker host (GCP)"]
        subgraph PipelineContainer["Pipeline container"]
            direction TB
            API["FastAPI server\n(non-root user)"]
            AgentExec["Agent executor"]
            
            subgraph Restrictions["Security restrictions"]
                RO["read_only: true"]
                NP["no-new-privileges"]
                CD["cap_drop: ALL"]
                Mem["memory limit: 512M"]
                CPU["cpu limit: 0.5"]
            end
        end

        subgraph RepoVolume["Repo volume (:ro)"]
            Code["Application\nsource code"]
            GitHistory[".git history"]
        end
    end

    AgentExec -->|"read-only\naccess"| RepoVolume
    AgentExec -->|"subprocess.run\nwith timeout"| GitCmds["git blame\ngit log"]
    AgentExec -->|"subprocess.run\nwith timeout"| GrepCmd["grep -rn"]
    AgentExec -->|"open() read"| ReadCmd["file read"]
    AgentExec -.->|"BLOCKED"| Write["Write to repo"]
    AgentExec -.->|"BLOCKED"| Network["Arbitrary network"]
    AgentExec -.->|"BLOCKED"| Exec["Code execution"]
    API -->|"httpx"| OpenRouter2["OpenRouter API\n(only allowed outbound)"]

    style Write fill:#fee,stroke:#c00
    style Network fill:#fee,stroke:#c00
    style Exec fill:#fee,stroke:#c00
```
