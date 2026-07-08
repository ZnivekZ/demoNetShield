"""
Schemas for saved reports and report schedules.
"""
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel


class SavedReportCreate(BaseModel):
    title: str
    html_content: str
    prompt: str = ""
    audience: str = "technical"
    model_used: str = ""
    data_sources: list[str] = []
    tokens_used: int = 0


class SavedReportUpdate(BaseModel):
    title: Optional[str] = None
    html_content: Optional[str] = None


class ReportScheduleCreate(BaseModel):
    name: str
    enabled: bool = True
    cron_expression: str = "0 8 * * 1"
    template_id: Optional[str] = None
    prompt: str = ""
    audience: str = "technical"
    data_sources: list[str] = []
    model: str = "openrouter/auto"
    output: str = "save"  # save | pdf | telegram | save+telegram


class ReportScheduleUpdate(BaseModel):
    name: Optional[str] = None
    enabled: Optional[bool] = None
    cron_expression: Optional[str] = None
    template_id: Optional[str] = None
    prompt: Optional[str] = None
    audience: Optional[str] = None
    data_sources: Optional[list[str]] = None
    model: Optional[str] = None
    output: Optional[str] = None
