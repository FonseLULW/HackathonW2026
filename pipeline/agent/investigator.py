"""Investigation implementations for incident creation."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Any

from pipeline.agent.payloads import (
    build_incident_event_payload,
    build_tool_call_event_payload,
)
from pipeline.llm.openrouter import OpenRouterError, get_first_message, get_message_text, parse_json_object
from pipeline.llm.prompts import (
    INCIDENT_REPORT_SCHEMA,
    INVESTIGATION_SYSTEM_PROMPT,
    build_investigation_user_prompt,
)
from shared.events import bus
from shared.models import CodeReference, IncidentReport, Severity

logger = logging.getLogger("snooplog.agent.investigator")
MAX_REPEAT_TOOL_CALLS = 2


class HeuristicIncidentInvestigator:
    """Prototype investigator that uses tools and emits a report."""

    def __init__(self, tool_executor) -> None:
        self._tool_executor = tool_executor
        self._pattern_memory = None
        self._incident_tracker = None

    def set_pattern_memory(self, pattern_memory) -> None:
        self._pattern_memory = pattern_memory

    def set_incident_tracker(self, incident_tracker) -> None:
        self._incident_tracker = incident_tracker

    async def investigate(
        self,
        logs: list[dict[str, Any]],
        reason: str,
        urgency: str,
    ) -> dict[str, Any]:
        combined_message = "\n".join(log.get("message", "") for log in logs).lower()
        tool_steps = self._build_tool_plan(combined_message)
        code_refs: list[CodeReference] = []

        for tool_name, kwargs in tool_steps:
            result = await asyncio.to_thread(self._tool_executor.run_tool, tool_name, **kwargs)
            await bus.emit(
                "agent:tool_call",
                build_tool_call_event_payload(
                    tool_name=tool_name,
                    tool_args=kwargs,
                    result=result,
                    log_ids=[log.get("id") for log in logs],
                    source=logs[0].get("source", "unknown"),
                ),
            )
            if tool_name == "grep_code":
                code_refs.extend(_extract_code_refs(result))

        incident = IncidentReport(
            report=_build_report(logs, reason),
            root_cause=_guess_root_cause(combined_message),
            severity=_guess_severity(combined_message, urgency),
            code_refs=code_refs[:5],
            suggested_fix=_suggest_fix(combined_message),
        )

        payload = build_incident_event_payload(
            logs=logs,
            incident=incident,
            reason=reason,
            urgency=urgency,
        )
        if self._incident_tracker is not None:
            payload = await self._incident_tracker.mark_created(logs, payload)
        if self._pattern_memory is not None:
            self._pattern_memory.remember(
                logs,
                decision="incident",
                action="incident_created",
                reason=reason,
                urgency=urgency,
            )
        _log_incident_payload(payload)
        await bus.emit("incident:created", payload)
        logger.info("Incident created for %s log(s)", len(logs))
        return payload

    def _build_tool_plan(self, combined_message: str) -> list[tuple[str, dict[str, Any]]]:
        if any(term in combined_message for term in ("postgres", "database", "connection", "pool")):
            return [
                ("grep_code", {"pattern": "postgres|pool|database|connection", "file_glob": "*"}),
                ("search_logs", {"pattern": "postgres|database|connection", "minutes": 60}),
            ]
        if any(term in combined_message for term in ("auth", "unauthorized", "permission denied", "token")):
            return [
                ("grep_code", {"pattern": "auth|token|session|permission", "file_glob": "*"}),
                ("search_logs", {"pattern": "auth|unauthorized|permission denied", "minutes": 60}),
            ]
        return [
            ("grep_code", {"pattern": "error|fatal|exception", "file_glob": "*"}),
            ("search_logs", {"pattern": "error|fatal|exception", "minutes": 60}),
        ]


def _extract_code_refs(grep_output: str) -> list[CodeReference]:
    try:
        parsed = json.loads(grep_output)
        if isinstance(parsed, dict):
            grep_output = "\n".join(parsed.get("data", {}).get("matches", []))
    except json.JSONDecodeError:
        pass

    refs: list[CodeReference] = []
    for line in grep_output.splitlines():
        match = re.match(r"(.+?):(\d+):(.*)", line)
        if not match:
            continue
        refs.append(
            CodeReference(
                file=match.group(1),
                line=int(match.group(2)),
                snippet=match.group(3).strip()[:200],
            )
        )
    return refs


def _guess_root_cause(combined_message: str) -> str:
    if any(term in combined_message for term in ("postgres", "database", "connection", "pool")):
        return "Database connectivity or pool exhaustion is the most likely failure mode."
    if any(term in combined_message for term in ("auth", "unauthorized", "permission denied", "token")):
        return "Authentication or authorization flow is failing for incoming requests."
    if any(term in combined_message for term in ("memory", "oom", "out of memory")):
        return "Resource exhaustion is likely causing process instability."
    return "A repeated application error pattern was detected and needs code inspection."


def _suggest_fix(combined_message: str) -> str:
    if any(term in combined_message for term in ("postgres", "database", "connection", "pool")):
        return "Inspect connection lifecycle management and cap concurrency around the DB client."
    if any(term in combined_message for term in ("auth", "unauthorized", "permission denied", "token")):
        return "Review auth middleware, token validation, and recent changes around session handling."
    if any(term in combined_message for term in ("memory", "oom", "out of memory")):
        return "Check for unbounded allocations, request amplification, and missing cleanup paths."
    return "Start with the referenced files, reproduce the error path, and confirm whether it is a new regression."


def _guess_severity(combined_message: str, urgency: str) -> Severity:
    if urgency == "high" or any(term in combined_message for term in ("fatal", "panic", "out of memory")):
        return Severity.HIGH
    if any(term in combined_message for term in ("error", "unauthorized", "permission denied")):
        return Severity.MEDIUM
    return Severity.LOW


def _build_report(logs: list[dict[str, Any]], reason: str) -> str:
    if len(logs) == 1:
        return f"Investigated 1 log after escalation: {reason}."
    return f"Investigated a batch of {len(logs)} related logs after escalation: {reason}."


class LlmIncidentInvestigator:
    """Tool-calling investigator backed by OpenRouter, with heuristic fallback."""

    def __init__(
        self,
        llm_client,
        tool_executor,
        fallback: HeuristicIncidentInvestigator,
        model: str | None = None,
        fallback_models: list[str] | None = None,
        max_iterations: int = 10,
    ) -> None:
        self._llm_client = llm_client
        self._tool_executor = tool_executor
        self._fallback = fallback
        self._pattern_memory = None
        self._incident_tracker = None
        self._model = model or os.getenv("OPENROUTER_INVESTIGATION_MODEL", "z-ai/glm-5")
        configured_fallbacks = fallback_models
        if configured_fallbacks is None:
            raw_fallbacks = os.getenv(
                "OPENROUTER_INVESTIGATION_FALLBACK_MODELS",
                "minimax/minimax-m2.5",
            )
            configured_fallbacks = [
                candidate.strip()
                for candidate in raw_fallbacks.split(",")
                if candidate.strip()
            ]
        self._fallback_models = [
            candidate for candidate in configured_fallbacks if candidate != self._model
        ]
        self._max_iterations = max_iterations

    def set_pattern_memory(self, pattern_memory) -> None:
        self._pattern_memory = pattern_memory
        if hasattr(self._fallback, "set_pattern_memory"):
            self._fallback.set_pattern_memory(pattern_memory)

    def set_incident_tracker(self, incident_tracker) -> None:
        self._incident_tracker = incident_tracker
        if hasattr(self._fallback, "set_incident_tracker"):
            self._fallback.set_incident_tracker(incident_tracker)

    async def investigate(
        self,
        logs: list[dict[str, Any]],
        reason: str,
        urgency: str,
    ) -> dict[str, Any]:
        if not self._llm_client.enabled:
            return await self._fallback.investigate(logs, reason=reason, urgency=urgency)

        fallback_reason = reason
        fallback_urgency = urgency

        messages: list[dict[str, Any]] = [
            {"role": "system", "content": INVESTIGATION_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": build_investigation_user_prompt(logs, reason=reason, urgency=urgency),
            },
        ]
        tools = self._tool_executor.get_tool_definitions()
        seen_tool_calls: dict[tuple[str, str], int] = {}
        models = [self._model, *self._fallback_models]

        try:
            for index, model_name in enumerate(models):
                logger.info(
                    "Using OpenRouter investigation model %s for %s log(s)",
                    model_name,
                    len(logs),
                )
                try:
                    incident = await self._run_investigation_loop(
                        model_name=model_name,
                        logs=logs,
                        messages=messages,
                        tools=tools,
                        seen_tool_calls=seen_tool_calls,
                    )
                    return await self._emit_incident(logs, incident, reason, urgency)
                except OpenRouterError as exc:
                    if index < len(models) - 1 and _should_retry_with_fallback_model(exc):
                        next_model = models[index + 1]
                        logger.warning(
                            "OpenRouter investigation model %s failed with %s; retrying with %s",
                            model_name,
                            exc,
                            next_model,
                        )
                        continue
                    logger.warning("OpenRouter investigation failed: %s", exc)
                    fallback_reason = f"{reason} (fallback after OpenRouter error: {exc})"
                    break
                except _InvestigationMaxIterationsExceeded:
                    logger.warning("LLM investigation hit max iterations; falling back")
                    fallback_reason = f"{reason} (fallback after max iterations)"
                    break
        except Exception as exc:
            logger.exception("Unexpected investigation failure")
            fallback_reason = f"{reason} (fallback after unexpected error: {exc})"

        return await self._fallback.investigate(
            logs,
            reason=fallback_reason,
            urgency=fallback_urgency,
        )

    async def _run_investigation_loop(
        self,
        *,
        model_name: str,
        logs: list[dict[str, Any]],
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        seen_tool_calls: dict[tuple[str, str], int],
    ) -> IncidentReport:
        for _ in range(self._max_iterations):
            response = await self._llm_client.create_chat_completion(
                model=model_name,
                messages=messages,
                tools=tools,
                tool_choice="auto",
                max_tokens=1200,
                temperature=0.1,
            )
            message = get_first_message(response)
            tool_calls = message.get("tool_calls") or []
            assistant_content = get_message_text(message)
            assistant_message = {"role": "assistant", "content": assistant_content}
            if tool_calls:
                assistant_message["tool_calls"] = tool_calls
            messages.append(assistant_message)

            if tool_calls:
                for tool_call in tool_calls:
                    tool_name = tool_call.get("function", {}).get("name", "")
                    raw_args = tool_call.get("function", {}).get("arguments", "{}")
                    tool_args = _safe_parse_tool_args(raw_args)
                    result = await self._execute_tool_call(
                        tool_name=tool_name,
                        tool_args=tool_args,
                        raw_args=raw_args,
                        seen_tool_calls=seen_tool_calls,
                    )
                    await bus.emit(
                        "agent:tool_call",
                        build_tool_call_event_payload(
                            tool_name=tool_name or "unknown",
                            tool_args=tool_args,
                            result=result,
                            log_ids=[log.get("id") for log in logs],
                            source=logs[0].get("source", "unknown"),
                            tool_call_id=tool_call.get("id"),
                        ),
                    )
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tool_call.get("id"),
                            "name": tool_name,
                            "content": result,
                        }
                    )
                continue

            if not assistant_content.strip():
                raise OpenRouterError("Model returned neither tool calls nor final content")

            return await self._coerce_incident_report(messages, model_name=model_name)

        raise _InvestigationMaxIterationsExceeded()

    async def _coerce_incident_report(
        self,
        messages: list[dict[str, Any]],
        *,
        model_name: str,
    ) -> IncidentReport:
        last_message = messages[-1]
        content = get_message_text(last_message)
        try:
            payload = parse_json_object(content)
            return _build_incident_from_payload(payload)
        except ValueError:
            response = await self._llm_client.create_chat_completion(
                model=model_name,
                messages=messages
                + [
                    {
                        "role": "system",
                        "content": (
                            "Rewrite the final answer as strict incident_report JSON only. "
                            "Do not add markdown. Keep code_refs limited to evidence you actually found."
                        ),
                    }
                ],
                response_format=INCIDENT_REPORT_SCHEMA,
                max_tokens=800,
                temperature=0.0,
            )
            payload = parse_json_object(get_message_text(get_first_message(response)))
            return _build_incident_from_payload(payload)

    async def _execute_tool_call(
        self,
        *,
        tool_name: str,
        tool_args: dict[str, Any],
        raw_args: str,
        seen_tool_calls: dict[tuple[str, str], int],
    ) -> str:
        if not tool_name:
            return "Tool failed: missing tool name in model response"

        if not self._tool_executor.has_tool(tool_name):
            return f"Tool failed: unknown tool '{tool_name}'"

        call_key = (tool_name, json.dumps(tool_args, sort_keys=True))
        seen_tool_calls[call_key] = seen_tool_calls.get(call_key, 0) + 1
        if seen_tool_calls[call_key] > MAX_REPEAT_TOOL_CALLS:
            return (
                "Tool failed: repeated identical tool call was blocked to avoid a loop. "
                "Pick a different tool or narrow the query."
            )

        if raw_args and raw_args.strip() and tool_args == {} and raw_args.strip() != "{}":
            return "Tool failed: arguments were not valid JSON object content"

        return await asyncio.to_thread(
            self._tool_executor.run_tool,
            tool_name,
            **tool_args,
        )

    async def _emit_incident(
        self,
        logs: list[dict[str, Any]],
        incident: IncidentReport,
        reason: str,
        urgency: str,
    ) -> dict[str, Any]:
        payload = build_incident_event_payload(
            logs=logs,
            incident=incident,
            reason=reason,
            urgency=urgency,
        )
        if self._incident_tracker is not None:
            payload = await self._incident_tracker.mark_created(logs, payload)
        if self._pattern_memory is not None:
            self._pattern_memory.remember(
                logs,
                decision="incident",
                action="incident_created",
                reason=reason,
                urgency=urgency,
            )
        _log_incident_payload(payload)
        await bus.emit("incident:created", payload)
        logger.info("Incident created for %s log(s)", len(logs))
        return payload


def _safe_parse_tool_args(raw_args: str) -> dict[str, Any]:
    try:
        parsed = json.loads(raw_args)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _build_incident_from_payload(payload: dict[str, Any]) -> IncidentReport:
    normalized = {
        "report": payload.get("report", ""),
        "root_cause": payload.get("root_cause", ""),
        "severity": str(payload.get("severity", "medium")).lower(),
        "code_refs": payload.get("code_refs", []),
        "suggested_fix": payload.get("suggested_fix", ""),
    }
    return IncidentReport.model_validate(normalized)


class _InvestigationMaxIterationsExceeded(RuntimeError):
    pass


def _should_retry_with_fallback_model(exc: OpenRouterError) -> bool:
    if exc.status_code in {402, 408, 409, 429, 500, 502, 503, 504}:
        return True
    message = str(exc).lower()
    return any(
        token in message
        for token in (
            "rate-limit",
            "rate limited",
            "temporarily rate-limited",
            "payment required",
            "more credits",
            "provider returned error",
            "timeout",
        )
    )


def _log_incident_payload(payload: dict[str, Any]) -> None:
    logger.info(
        "Incident payload: %s",
        json.dumps(payload, indent=2, default=str),
    )
