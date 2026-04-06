"""
Reports Router - AI report generation and PDF export.
Prefix: /api/reports
"""

from __future__ import annotations

import asyncio
import json

import structlog
from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.action_log import ActionLog
from schemas.common import APIResponse
from schemas.reports import ReportExportRequest, ReportGenerateRequest
from services.ai_service import AIService, get_ai_service
from services.pdf_service import PDFService, get_pdf_service

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/reports", tags=["Reports"])


@router.post("/generate")
async def generate_report(
    request: ReportGenerateRequest,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Generate an AI-powered security report draft.
    Claude uses function calling to fetch live data from Wazuh and MikroTik.
    Returns editable HTML for the TipTap editor.
    """
    try:
        ai_service = get_ai_service()
        result = await ai_service.generate_report(
            prompt=request.prompt,
            audience=request.audience,
            attached_documents=request.attached_documents,
            data_sources=request.data_sources,
            date_range=request.date_range.model_dump() if request.date_range else None,
        )

        # Log report generation
        log_entry = ActionLog(
            action_type="report_generated",
            details=json.dumps({
                "title": result.get("title", ""),
                "audience": request.audience,
                "data_sources": request.data_sources,
                "tokens_used": result.get("tokens_used", 0),
            }),
            comment=f"AI report: {request.prompt[:100]}",
        )
        db.add(log_entry)
        await db.flush()

        logger.info(
            "api_report_generated",
            audience=request.audience,
            tokens=result.get("tokens_used", 0),
        )
        return APIResponse.ok(result)
    except ValueError as e:
        # Missing API key or configuration
        return APIResponse.fail(str(e))
    except Exception as e:
        logger.error("api_generate_report_failed", error=str(e))
        return APIResponse.fail(f"Failed to generate report: {str(e)}")


@router.post("/export-pdf")
async def export_pdf(request: ReportExportRequest) -> Response:
    """
    Export HTML content to a styled PDF document.
    Returns the PDF binary directly for download.
    """
    try:
        pdf_service = get_pdf_service()

        # Run WeasyPrint in an executor since it's CPU-bound
        loop = asyncio.get_event_loop()
        pdf_bytes = await loop.run_in_executor(
            None,
            pdf_service.generate_pdf,
            request.html_content,
            request.title,
            request.metadata,
        )

        # Generate filename from title
        safe_title = "".join(
            c if c.isalnum() or c in " -_" else "_" for c in request.title
        )
        filename = f"{safe_title}.pdf"

        logger.info("api_pdf_exported", title=request.title, size=len(pdf_bytes))

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )
    except Exception as e:
        logger.error("api_export_pdf_failed", error=str(e))
        # Return JSON error since we can't return PDF
        return Response(
            content=json.dumps({"success": False, "error": str(e)}),
            media_type="application/json",
            status_code=500,
        )


@router.get("/history")
async def get_report_history(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get history of generated reports from the audit log."""
    try:
        from sqlalchemy import select

        result = await db.execute(
            select(ActionLog)
            .where(ActionLog.action_type == "report_generated")
            .order_by(ActionLog.created_at.desc())
            .limit(limit)
        )
        logs = result.scalars().all()
        data = []
        for log in logs:
            data.append({
                "id": log.id,
                "details": json.loads(log.details) if log.details else {},
                "comment": log.comment,
                "created_at": log.created_at.isoformat(),
            })
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_report_history_failed", error=str(e))
        return APIResponse.fail(f"Failed to get report history: {str(e)}")
