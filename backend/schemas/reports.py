"""
Reports schemas - AI report generation and PDF export.
"""

from __future__ import annotations

from pydantic import BaseModel


class DateRange(BaseModel):
    """Date range filter for report data."""

    from_date: str  # ISO8601
    to_date: str  # ISO8601


class ReportGenerateRequest(BaseModel):
    """Request to generate an AI-powered report draft."""

    prompt: str
    audience: str = "technical"  # executive | technical | operational
    attached_documents: list[str] = []  # base64-encoded PDFs or plain text
    data_sources: list[str] = []  # wazuh_alerts, mikrotik_connections, firewall_rules
    date_range: DateRange | None = None


class ReportDraft(BaseModel):
    """Generated report draft ready for editing."""

    html_content: str
    title: str
    summary: str
    data_sources_used: list[str]
    tokens_used: int = 0


class ReportExportRequest(BaseModel):
    """Request to export HTML report to PDF."""

    html_content: str
    title: str = "NetShield Security Report"
    metadata: dict = {}
