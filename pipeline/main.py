"""SnoopLog pipeline — FastAPI application."""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

<<<<<<< HEAD
from pipeline.agent import (
    HeuristicIncidentInvestigator,
    KnownPatternMemory,
    LlmIncidentInvestigator,
    TierRouter,
    ToolExecutor,
)
from pipeline.agent.batcher import MediumLogBatcher
from pipeline.llm import HeuristicTriageClient, OpenRouterChatClient, OpenRouterTriageClient
=======
from pipeline.integrations.discord import configure_discord_integration
>>>>>>> origin/integration-deployment
from shared.events import bus

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("snooplog.pipeline")

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
        batcher = MediumLogBatcher(
            triage_client=triage_client,
            investigator=investigator,
            pattern_memory=pattern_memory,
            flush_window_seconds=float(os.getenv("MEDIUM_BATCH_FLUSH_SECONDS", "30")),
            max_batch_size=int(os.getenv("MEDIUM_BATCH_MAX_SIZE", "20")),
        )
        router = TierRouter(
            batcher=batcher,
            investigator=investigator,
            pattern_memory=pattern_memory,
        )
        bus.subscribe("log:scored", router.handle)
        app.state.tier_router = router
        app.state.medium_batcher = batcher
        logger.info("Person 2 tier router subscribed to log:scored")


@app.on_event("shutdown")
async def shutdown():
    batcher = getattr(app.state, "medium_batcher", None)
    if batcher is not None:
        await batcher.shutdown()
    configure_discord_integration()
    # Person 2: wire tier router subscription here
    # e.g. bus.subscribe("log:scored", tier_router.handle)
