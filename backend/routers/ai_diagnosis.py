"""Read-only on-demand agent diagnosis and local Groq usage endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from schemas.common import APIResponse
from services.ai_diagnosis_service import get_run, get_run_history, service
from services.groq_usage import get_usage_status

router = APIRouter(prefix="/api/ai-diagnosis", tags=["AI Diagnosis"])


@router.post("/runs")
async def start_run() -> APIResponse:
    try:
        run_id = await service.start()
        return APIResponse.ok({"id": run_id, "status": "running"})
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/runs/latest")
async def latest_run() -> APIResponse:
    return APIResponse.ok(await get_run())


@router.get("/runs/history")
async def run_history() -> APIResponse:
    return APIResponse.ok(await get_run_history())


@router.get("/runs/{run_id}")
async def read_run(run_id: int) -> APIResponse:
    run = await get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Diagnóstico no encontrado")
    return APIResponse.ok(run)


@router.get("/groq-usage")
async def groq_usage() -> APIResponse:
    return APIResponse.ok(await get_usage_status())
