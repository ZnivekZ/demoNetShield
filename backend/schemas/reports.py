"""
Reports schemas - AI report generation and PDF export.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class DateRange(BaseModel):
    """Date range filter for report data."""

    from_date: str  # ISO8601
    to_date: str  # ISO8601


class ReportGenerateRequest(BaseModel):
    """Request to generate an AI-powered report draft."""

    prompt: str
    audience: str = "technical"  # executive | technical | operational
    attached_documents: list[str] = []  # base64-encoded PDFs or plain text
    data_sources: list[str] = []  # wazuh_alerts, mikrotik_connections, firewall_rules, etc.
    date_range: DateRange | None = None
    comparison_range: DateRange | None = None  # Second period for temporal comparison


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


class ReportPrepareRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=4000)
    audience: str = Field(default="technical", pattern="^(technical|executive|operational)$")
    data_sources: list[str] = Field(min_length=1, max_length=24)
    date_range: DateRange | None = None
    attached_documents: list[str] = Field(default_factory=list, max_length=3)


class ReportSelectionRequest(BaseModel):
    selected_rows: dict[str, list[int]]


class ReportGeneratePreparedRequest(BaseModel):
    preparation_id: str


class MitrePrepareRequest(BaseModel):
    period_hours: int = Field(default=168)
    report_format: str = Field(default="technical", pattern="^(technical|executive)$")
