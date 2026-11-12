"""Experimental candidate decisions; no endpoint writes to operational blocking."""

from __future__ import annotations

import ipaddress
import re
from datetime import date, datetime
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.block_candidate import BlockCandidate, CandidateConfig, CandidateEvaluation, CandidateRule
from schemas.common import APIResponse
from services.block_candidate_service import (config_dict, loads, manual_scan_status, rule_dict,
                                              probe_sources, seed, start_manual_scan)

router = APIRouter(prefix="/api/candidates", tags=["Block candidates experiment"])


class ConfigUpdate(BaseModel):
    enabled: bool | None = None
    include_archives: bool | None = None
    poll_seconds: int | None = Field(default=None, ge=60, le=3600)
    prompt_text: str | None = Field(default=None, min_length=1, max_length=12000)
    included_agent_ids: list[str] | None = None
    excluded_agent_ids: list[str] | None = None


class RuleInput(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    category: Literal["critical", "ssh", "windows", "web", "custom"]
    sources: Literal["alerts", "archives", "both"]
    decision_mode: Literal["automatic", "ai"]
    enabled: bool = True
    min_level: int = Field(ge=0, le=16)
    min_count: int = Field(ge=1, le=1000)
    window_minutes: int = Field(ge=1, le=1440)
    pattern: str = Field(default="", max_length=200)
    rule_ids: list[str] = Field(default_factory=list)


def validate_rule(item: RuleInput) -> None:
    if item.category == "custom" and not item.pattern and not item.rule_ids:
        raise HTTPException(422, "La regla personalizada necesita patrón o IDs de regla Wazuh")
    if item.pattern:
        try:
            re.compile(item.pattern)
        except re.error as exc:
            raise HTTPException(422, f"Expresión regular inválida: {exc}") from exc
    if len(item.rule_ids) > 100 or any(len(x) > 30 for x in item.rule_ids):
        raise HTTPException(422, "Demasiados IDs de regla Wazuh")


def candidate_dict(row: BlockCandidate) -> dict:
    return {"id": row.id, "day": row.day, "ip": row.ip, "first_seen": row.first_seen,
            "last_seen": row.last_seen, "decided_at": row.decided_at,
            "reasons": loads(row.reasons_json, []), "categories": loads(row.categories_json, []),
            "agent_ids": loads(row.agent_ids_json, []), "agent_names": loads(row.agent_names_json, []),
            "sources": loads(row.source_types_json, []), "evaluation_ids": loads(row.evaluation_ids_json, []),
            "event_count": row.event_count, "decision_source": row.decision_source}


def evaluation_dict(row: CandidateEvaluation, *, detail: bool = False) -> dict:
    data = {"id": row.id, "day": row.day, "ip": row.ip, "rule_id": row.rule_id,
            "rule_name": row.rule_name, "rule_version": row.rule_version, "category": row.category,
            "decision": "SI" if row.decision else "NO", "decision_source": row.decision_source,
            "reason": row.reason, "technical_reason": row.technical_reason,
            "first_seen": row.first_seen, "last_seen": row.last_seen, "decided_at": row.decided_at,
            "event_count": row.event_count, "agent_ids": loads(row.agent_ids_json, []),
            "agent_names": loads(row.agent_names_json, []), "sources": loads(row.source_types_json, []),
            "ai_model": row.ai_model}
    if detail:
        data.update({"event_refs": loads(row.event_refs_json, []),
                     "rule_snapshot": loads(row.rule_snapshot_json, {}),
                     "prompt_snapshot": row.prompt_snapshot, "prompt_version": row.prompt_version,
                     "payload": loads(row.payload_json, None),
                     "ai_response": loads(row.ai_response_json, None)})
    return data


@router.get("/config")
async def get_config(db: AsyncSession = Depends(get_db)) -> APIResponse:
    await seed()
    return APIResponse.ok(config_dict(await db.get(CandidateConfig, 1)))


@router.put("/config")
async def update_config(item: ConfigUpdate, db: AsyncSession = Depends(get_db)) -> APIResponse:
    await seed()
    config = await db.get(CandidateConfig, 1)
    data = item.model_dump(exclude_unset=True)
    if "prompt_text" in data and data["prompt_text"] is not None:
        prompt = data.pop("prompt_text").strip()
        if not prompt:
            raise HTTPException(422, "La instrucción no puede estar vacía")
        if prompt != config.prompt_text:
            config.prompt_text = prompt
            config.prompt_version += 1
    for key in ("enabled", "include_archives", "poll_seconds"):
        if key in data and data[key] is not None:
            setattr(config, key, data[key])
    for key in ("included_agent_ids", "excluded_agent_ids"):
        if key in data and data[key] is not None:
            import json
            value = [str(x).strip() for x in data[key] if str(x).strip()]
            setattr(config, key + "_json", json.dumps(list(dict.fromkeys(value))))
    await db.flush()
    return APIResponse.ok(config_dict(config))


@router.get("/rules")
async def list_rules(db: AsyncSession = Depends(get_db)) -> APIResponse:
    await seed()
    rows = (await db.scalars(select(CandidateRule).order_by(CandidateRule.id))).all()
    return APIResponse.ok([rule_dict(row) for row in rows])


@router.post("/rules")
async def create_rule(item: RuleInput, db: AsyncSession = Depends(get_db)) -> APIResponse:
    validate_rule(item)
    data = item.model_dump(exclude={"rule_ids"})
    import json
    rule = CandidateRule(**data, rule_ids_json=json.dumps(item.rule_ids))
    db.add(rule)
    await db.flush()
    return APIResponse.ok(rule_dict(rule))


@router.put("/rules/{rule_id}")
async def update_rule(rule_id: int, item: RuleInput, db: AsyncSession = Depends(get_db)) -> APIResponse:
    validate_rule(item)
    rule = await db.get(CandidateRule, rule_id)
    if rule is None:
        raise HTTPException(404, "Regla no encontrada")
    data = item.model_dump(exclude={"rule_ids"})
    import json
    data["rule_ids_json"] = json.dumps(item.rule_ids)
    if any(getattr(rule, key) != value for key, value in data.items()):
        for key, value in data.items():
            setattr(rule, key, value)
        rule.version += 1
    await db.flush()
    return APIResponse.ok(rule_dict(rule))


@router.post("/scan")
async def start_scan(day: date | None = None, recent_minutes: int | None = Query(None, ge=5, le=120)) -> APIResponse:
    today = datetime.now(ZoneInfo("America/Argentina/Buenos_Aires")).date()
    target = day or today
    if target > today:
        raise HTTPException(422, "No se puede analizar un día futuro")
    if recent_minutes and target != today:
        raise HTTPException(422, "La lectura rápida solo se aplica al día actual")
    try:
        return APIResponse.ok(start_manual_scan(target, recent_minutes=recent_minutes))
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/scan/status")
async def scan_status() -> APIResponse:
    return APIResponse.ok(manual_scan_status())


@router.get("/sources")
async def source_status() -> APIResponse:
    return APIResponse.ok(await probe_sources())


@router.get("/days")
async def list_days(db: AsyncSession = Depends(get_db)) -> APIResponse:
    rows = (await db.execute(select(BlockCandidate.day, func.count(BlockCandidate.id))
                             .group_by(BlockCandidate.day).order_by(BlockCandidate.day.desc()).limit(365))).all()
    return APIResponse.ok([{"day": day, "count": count} for day, count in rows])


@router.get("/daily")
async def daily(day: date = Query(...), db: AsyncSession = Depends(get_db)) -> APIResponse:
    rows = (await db.scalars(select(BlockCandidate).where(BlockCandidate.day == str(day))
                             .order_by(BlockCandidate.last_seen.desc()))).all()
    ips = [row.ip for row in rows]
    history = {}
    if ips:
        counts = (await db.execute(select(BlockCandidate.ip, func.count(func.distinct(BlockCandidate.day)))
                                   .where(BlockCandidate.ip.in_(ips)).group_by(BlockCandidate.ip))).all()
        history = dict(counts)
    return APIResponse.ok([{**candidate_dict(row), "days_seen": history.get(row.ip, 1)} for row in rows])


@router.get("/ip/{ip}")
async def ip_history(ip: str, db: AsyncSession = Depends(get_db)) -> APIResponse:
    try:
        ip = str(ipaddress.ip_address(ip))
    except ValueError as exc:
        raise HTTPException(422, "IP inválida") from exc
    candidates = (await db.scalars(select(BlockCandidate).where(BlockCandidate.ip == ip)
                                   .order_by(BlockCandidate.day.desc()).limit(365))).all()
    evaluations = (await db.scalars(select(CandidateEvaluation).where(CandidateEvaluation.ip == ip)
                                    .order_by(CandidateEvaluation.decided_at.desc()).limit(500))).all()
    return APIResponse.ok({"ip": ip, "days_seen": len(candidates), "candidates": [candidate_dict(row) for row in candidates],
                           "evaluations": [evaluation_dict(row) for row in evaluations]})


@router.get("/evaluations/{evaluation_id}")
async def evaluation_detail(evaluation_id: int, db: AsyncSession = Depends(get_db)) -> APIResponse:
    row = await db.get(CandidateEvaluation, evaluation_id)
    if row is None:
        raise HTTPException(404, "Evaluación no encontrada")
    return APIResponse.ok(evaluation_dict(row, detail=True))
