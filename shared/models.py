"""Shared Pydantic models — the data contract for the entire SnoopLog pipeline."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import uuid4

from pydantic import BaseModel, Field


class LogLevel(str, Enum):
    DEBUG = "debug"
    INFO = "info"
    WARN = "warn"
    ERROR = "error"
    FATAL = "fatal"
    UNKNOWN = "unknown"


class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Tier(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class LogMetadata(BaseModel):
    service: str = "unknown"
    host: Optional[str] = None
    container_id: Optional[str] = None
    extra: dict = Field(default_factory=dict)


class PipelineState(BaseModel):
    anomaly_score: float = 0.0
    tier: Optional[Tier] = None
    filtered: bool = False
    filter_reason: Optional[str] = None
    tier_model: Optional[str] = None


class CodeReference(BaseModel):
    file: str
    line: Optional[int] = None
    snippet: Optional[str] = None
    blame: Optional[str] = None


class IncidentReport(BaseModel):
    report: str = ""
    root_cause: Optional[str] = None
    severity: Severity = Severity.MEDIUM
    code_refs: list[CodeReference] = Field(default_factory=list)
    suggested_fix: Optional[str] = None


class TriageResult(BaseModel):
    escalate: bool
    reason: str = ""
    urgency: str = "low"


class LogEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    source: str = "unknown"
    level: LogLevel = LogLevel.INFO
    message: str = ""
    raw: Optional[str] = None
    metadata: LogMetadata = Field(default_factory=LogMetadata)
    pipeline: PipelineState = Field(default_factory=PipelineState)
    incident: Optional[IncidentReport] = None
