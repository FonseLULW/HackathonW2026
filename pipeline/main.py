"""SnoopLog pipeline — FastAPI application."""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from pipeline.agent import (
    HeuristicIncidentInvestigator,
    IncidentCorrelationTracker,
    KnownPatternMemory,
    LlmIncidentInvestigator,
    TierRouter,
    ToolExecutor,
)
from pipeline.agent.batcher import MediumLogBatcher
from pipeline.integrations.discord import configure_discord_integration
from pipeline.integrations.firestore import configure_firestore_integration
from pipeline.llm import HeuristicTriageClient, OpenRouterChatClient, OpenRouterTriageClient
from pipeline.ml.model import scorer as ml_scorer
from shared.events import bus

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("snooplog.pipeline")


# Silence noisy health-check access logs from uvicorn
class _QuietAccessFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return "GET /health" not in msg and "POST /api/ingest" not in msg

logging.getLogger("uvicorn.access").addFilter(_QuietAccessFilter())

app = FastAPI(title="SnoopLog Pipeline", version="0.1.0")

# CORS — allow dashboard on Vercel and local dev
ALLOWED_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,https://*.vercel.app",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ──────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "snooplog-pipeline"}


# ── WebSocket ───────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    bus.register_ws(ws)
    logger.info("WebSocket client connected")
    try:
        while True:
            # Keep connection alive; client can send pings
            await ws.receive_text()
    except WebSocketDisconnect:
        bus.unregister_ws(ws)
        logger.info("WebSocket client disconnected")


# ── Route mounting ──────────────────────────────────────────────────────
# Person 1 adds ingestion routes here
# Person 2 wires cascade subscribers at startup

from pipeline.ingestion.routes import router as ingestion_router  # noqa: E402

app.include_router(ingestion_router, prefix="/api")


@app.on_event("startup")
async def startup():
    logger.info("SnoopLog pipeline starting up")
    if getattr(app.state, "tier_router", None) is None:
        tool_executor = ToolExecutor()
        heuristic_triage = HeuristicTriageClient()
        heuristic_investigator = HeuristicIncidentInvestigator(tool_executor=tool_executor)
        llm_client = OpenRouterChatClient()
        pattern_memory = KnownPatternMemory(
            ttl_seconds=float(os.getenv("KNOWN_LOG_TTL_SECONDS", "3600")),
            max_entries=int(os.getenv("KNOWN_LOG_MAX_PATTERNS", "5000")),
            benign_min_repeats=int(
                os.getenv(
                    "KNOWN_LOG_BENIGN_MIN_REPEATS",
                    os.getenv("KNOWN_LOG_SUPPRESS_AFTER", "5"),
                )
            ),
            db_path=os.getenv("KNOWN_LOG_DB_PATH", "/data/known_patterns.db"),
        )
        incident_tracker = IncidentCorrelationTracker(pattern_memory=pattern_memory)
        triage_client = OpenRouterTriageClient(
            llm_client=llm_client,
            fallback=heuristic_triage,
        )
        investigator = LlmIncidentInvestigator(
            llm_client=llm_client,
            tool_executor=tool_executor,
            fallback=heuristic_investigator,
        )
        investigator.set_pattern_memory(pattern_memory)
        investigator.set_incident_tracker(incident_tracker)
        batcher = MediumLogBatcher(
            triage_client=triage_client,
            investigator=investigator,
            pattern_memory=pattern_memory,
            incident_tracker=incident_tracker,
            flush_window_seconds=float(os.getenv("MEDIUM_BATCH_FLUSH_SECONDS", "30")),
            max_batch_size=int(os.getenv("MEDIUM_BATCH_MAX_SIZE", "20")),
        )
        router = TierRouter(
            batcher=batcher,
            investigator=investigator,
            pattern_memory=pattern_memory,
            incident_tracker=incident_tracker,
        )
        bus.subscribe("log:scored", router.handle)
        app.state.tier_router = router
        app.state.medium_batcher = batcher
        app.state.pattern_memory = pattern_memory
        logger.info("Person 2 tier router subscribed to log:scored")
    configure_discord_integration()
    configure_firestore_integration()


@app.on_event("shutdown")
async def shutdown():
    batcher = getattr(app.state, "medium_batcher", None)
    if batcher is not None:
        await batcher.shutdown()
    ml_scorer.save_snapshot()
    pattern_memory = getattr(app.state, "pattern_memory", None)
    if pattern_memory is not None:
        pattern_memory.save_snapshot()
        pattern_memory.close()
