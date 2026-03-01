from __future__ import annotations

from enum import Enum
from typing import Literal
from typing import Any

from pydantic import BaseModel, Field


class JobStage(str, Enum):
    QUEUED = "QUEUED"
    PARSING = "PARSING"
    RECONCILING = "RECONCILING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class Severity(str, Enum):
    CRITICAL = "CRITICAL"
    WARNING = "WARNING"
    INFO = "INFO"


class JobFileMeta(BaseModel):
    file_id: str
    filename: str
    content_type: str | None = None
    size_bytes: int
    path: str


class CreateJobResponse(BaseModel):
    job_id: str
    job_name: str | None = None
    status: JobStage
    created_at: str


class JobStatusResponse(BaseModel):
    job_id: str
    job_name: str | None = None
    status: JobStage
    created_at: str
    updated_at: str
    progress_pct: int = Field(ge=0, le=100)
    stage_message: str
    total_files: int
    processed_files: int
    error: str | None = None


class JobListItemResponse(BaseModel):
    job_id: str
    job_name: str | None = None
    status: JobStage
    created_at: str
    updated_at: str
    has_results: bool
    has_invoice_source: bool
    input_profile: str


class JobDispatchResponse(BaseModel):
    job_id: str
    scheduled: bool
    status: JobStage
    runner_mode: str
    message: str


class AuditBoundingBox(BaseModel):
    page: int = Field(default=1, ge=1)
    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)
    width: float = Field(gt=0.0, le=1.0)
    height: float = Field(gt=0.0, le=1.0)


class AuditFlag(BaseModel):
    flag_code: str
    severity: Severity = Severity.WARNING
    summary: str
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    line_item_ref: str | None = None
    bbox: AuditBoundingBox | None = None
    model: str | None = None
    source: Literal["ai_auditor", "rule"] = "ai_auditor"


class MismatchIssue(BaseModel):
    invoice_id: str
    supplier_gstin: str
    invoice_no: str
    issue_code: str
    severity: Severity
    amount_at_risk: float
    evidence: dict[str, Any]
    suggested_action: str
    audit_flags: list[AuditFlag] = Field(default_factory=list)


class ResultSummary(BaseModel):
    total_invoices: int
    matched_invoices: int
    critical_count: int
    warning_count: int
    info_count: int
    total_itc_at_risk: float
    matched_pct: float
    parse_failures: int


class JobResultResponse(BaseModel):
    job_id: str
    summary: ResultSummary
    issues: list[MismatchIssue]
    notes: list[str]


class ChatRequest(BaseModel):
    job_id: str
    question: str
    language: Literal["auto", "en", "hi", "hinglish", "ta", "tanglish"] = "en"
    response_style: Literal["plain", "markdown"] = "plain"
    voice_input_text: str | None = None
    simulator_mode: bool = False


class ScenarioMetric(BaseModel):
    label: str
    value: str
    tone: Literal["default", "good", "warning", "critical", "info"] = "default"


class ScenarioCard(BaseModel):
    title: str
    subtitle: str
    assumptions: list[str] = Field(default_factory=list)
    metrics: list[ScenarioMetric] = Field(default_factory=list)
    disclaimer: str


class ChatResponse(BaseModel):
    answer: str
    citations: list[str]
    filters_applied: list[str]
    followups: list[str]
    simulator_card: ScenarioCard | None = None


class VoiceTranscriptionResponse(BaseModel):
    text: str
    model: str
    language: str | None = None


class VoiceSpeakRequest(BaseModel):
    text: str
    language: Literal["auto", "en", "hi", "hinglish", "ta", "tanglish"] = "auto"
    response_style: Literal["plain", "markdown"] = "plain"
    context_job_id: str | None = None
    segment_type: Literal["chat_answer", "summary", "report", "generic"] = "chat_answer"


class Phase6ReadinessResponse(BaseModel):
    job_id: str
    compliance_ready: bool
    anomaly_ready: bool
    evidence_ready: bool
    reasons: list[str]


class InvoicePreviewResponse(BaseModel):
    job_id: str
    invoice_id: str
    invoice_no: str | None = None
    supplier_gstin: str | None = None
    source_available: bool
    source_file_id: str | None = None
    source_download_url: str | None = None
    source_filename: str | None = None
    source_content_type: str | None = None
    preview_type: Literal["image", "pdf", "none"] = "none"
    ocr_excerpt: str | None = None
    invoice_record: dict[str, Any] | None = None
    gstr2b_record: dict[str, Any] | None = None
    issue: dict[str, Any] | None = None
    timeline: list[dict[str, Any]] = Field(default_factory=list)
    actions: list[dict[str, Any]] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
