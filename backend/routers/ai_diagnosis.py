"""Read-only on-demand agent diagnosis and local Groq usage endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from schemas.common import APIResponse
from services.ai_diagnosis_service import get_run, get_run_history, service
from services.mitre_report_service import get_report, get_report_history, service as mitre_service
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


@router.post("/mitre-reports")
async def start_mitre_report(period_hours: int = Query(24, description="24 or 168 hours")) -> APIResponse:
    try:
        run_id = await mitre_service.start(period_hours)
        return APIResponse.ok({"id": run_id, "status": "running"})
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/mitre-reports/latest")
async def latest_mitre_report() -> APIResponse:
    return APIResponse.ok(await get_report())


@router.get("/mitre-reports/history")
async def mitre_report_history() -> APIResponse:
    return APIResponse.ok(await get_report_history())


@router.get("/mitre-reports/{run_id}")
async def read_mitre_report(run_id: int) -> APIResponse:
    report = await get_report(run_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Informe MITRE no encontrado")
    return APIResponse.ok(report)
