from __future__ import annotations

import asyncio
import json
import mimetypes
import re
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.settings import get_settings
from app.schemas import (
    ChatRequest,
    ChatResponse,
    CreateJobResponse,
    InvoicePreviewResponse,
    JobDispatchResponse,
    JobListItemResponse,
    JobResultResponse,
    JobStatusResponse,
    Phase6ReadinessResponse,
    VoiceSpeakRequest,
    VoiceTranscriptionResponse,
)
from app.services.job_service import JobService
from app.services.artifact_store import ArtifactStore
from app.services.cloud_persistence import CloudPersistence
from app.services.elevenlabs_service import ElevenLabsService
from app.services.mistral_service import MistralService
from app.services.phase6_service import Phase6Service
from app.services.task_queue import TaskQueueService
from app.services.voice_synthesis_service import VoiceSynthesisService
from app.services.worker_auth import validate_worker_request
from app.services.chat_service import ChatService

settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0")
mistral_service = MistralService(settings)
elevenlabs_service = ElevenLabsService(settings)
voice_synthesis_service = VoiceSynthesisService(elevenlabs=elevenlabs_service)
cloud_persistence = CloudPersistence.from_settings(settings)
artifact_store = ArtifactStore.from_settings(settings)
task_queue = TaskQueueService.from_settings(settings)
job_service = JobService(
    settings.app_data_dir,
    doc_ai=mistral_service,
    persistence=cloud_persistence,
    artifact_store=artifact_store,
)
phase6_service = Phase6Service(settings.app_data_dir, job_service)
chat_service = ChatService(mistral_service)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _build_pdf_report(job_id: str, result: JobResultResponse, report_path: Path) -> None:
    report_path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(report_path),
        pagesize=A4,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title=f"GST ITC Audit Report {job_id}",
    )

    styles = getSampleStyleSheet()
    story: list = []

    title_style = styles["Title"]
    subtitle_style = styles["Heading3"]
    body_style = styles["BodyText"]

    story.append(Paragraph(f"GST Intelligence Magic - Audit Report", title_style))
    story.append(Paragraph(f"Job ID: {job_id}", body_style))
    story.append(Spacer(1, 5 * mm))

    summary_data = [
        ["Metric", "Value"],
        ["Total invoices", f"{result.summary.total_invoices:,}"],
        ["Matched invoices", f"{result.summary.matched_invoices:,}"],
        ["Critical issues", f"{result.summary.critical_count:,}"],
        ["Warning issues", f"{result.summary.warning_count:,}"],
        ["Info issues", f"{result.summary.info_count:,}"],
        ["Total ITC at risk", f"INR {result.summary.total_itc_at_risk:,.2f}"],
        ["Match percent", f"{result.summary.matched_pct:.2f}%"],
    ]

    summary_table = Table(summary_data, colWidths=[70 * mm, 100 * mm])
    summary_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0b57d0")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#c6dafc")),
                ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#f6f9ff")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(summary_table)
    story.append(Spacer(1, 6 * mm))

    story.append(Paragraph("Top Risk Issues", subtitle_style))
    story.append(Spacer(1, 2 * mm))

    top_issues = sorted(result.issues, key=lambda x: x.amount_at_risk, reverse=True)[:25]
    issue_rows = [["Invoice", "Supplier GSTIN", "Issue", "Severity", "Risk (INR)"]]
    for issue in top_issues:
        issue_rows.append(
            [
                issue.invoice_no or "-",
                issue.supplier_gstin or "-",
                issue.issue_code.replace("_", " "),
                issue.severity.value,
                f"{issue.amount_at_risk:,.2f}",
            ]
        )

    issues_table = Table(issue_rows, colWidths=[32 * mm, 45 * mm, 43 * mm, 22 * mm, 28 * mm], repeatRows=1)
    issues_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f9d58")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d7e8dc")),
                ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#f8fdf9")),
                ("ALIGN", (4, 1), (4, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(issues_table)

    if result.notes:
        story.append(Spacer(1, 6 * mm))
        story.append(Paragraph("Processing Notes", subtitle_style))
        for note in result.notes[:12]:
            story.append(Paragraph(f"- {note}", body_style))

    doc.build(story)


def _contains_devanagari(text: str) -> bool:
    return bool(re.search(r"[\u0900-\u097F]", text))


def _contains_tamil(text: str) -> bool:
    return bool(re.search(r"[\u0B80-\u0BFF]", text))


def _contains_roman_hindi(text: str) -> bool:
    tokens = set(re.findall(r"[a-zA-Z']+", text.lower()))
    hints = {"kya", "hai", "nahi", "ka", "ki", "mein", "mera", "mujhe", "inka", "iska", "ye"}
    return len(tokens.intersection(hints)) >= 2


def _contains_roman_tamil(text: str) -> bool:
    tokens = set(re.findall(r"[a-zA-Z']+", text.lower()))
    hints = {"intha", "enna", "irukku", "inga", "unga", "illai", "seri", "pa", "la", "appo", "idhu"}
    return len(tokens.intersection(hints)) >= 2


def _should_localize_speech_text(target_language: str, text: str) -> bool:
    target = (target_language or "").strip().lower()
    message = (text or "").strip()
    if not message:
        return False
    if target == "hi":
        return not _contains_devanagari(message)
    if target == "ta":
        return not _contains_tamil(message)
    if target == "hinglish":
        return _contains_devanagari(message) or _contains_tamil(message)
    if target == "tanglish":
        return _contains_devanagari(message) or _contains_tamil(message)
    return False


def _resolve_language_mode(language: str, question: str) -> str:
    message = (question or "").strip()

    # Always prioritize the current message language to avoid stale app-mode forcing.
    if message:
        if _contains_tamil(message):
            return "ta"
        if _contains_devanagari(message):
            return "hi"
        if _contains_roman_tamil(message):
            return "tanglish"
        if _contains_roman_hindi(message):
            return "hinglish"
        return "en"
    return "en"


@app.get("/v1/healthz")
def healthz() -> dict:
    return {
        "status": "ok",
        "env": settings.app_env,
        "service": settings.app_name,
        "runner_mode": settings.job_runner_mode,
        "firestore_persistence": cloud_persistence.enabled,
        "gcs_artifact_store": artifact_store.enabled,
        "task_queue_enabled": task_queue.enabled,
    }


@app.get("/v1/config/models")
def model_config() -> dict:
    return {
        "job_runner_mode": settings.job_runner_mode,
        "worker_auth_enabled": settings.worker_auth_enabled,
        "firestore_persistence_enabled": cloud_persistence.enabled,
        "firestore_persistence_reason": cloud_persistence.reason,
        "gcs_artifact_store_enabled": artifact_store.enabled,
        "gcs_artifact_store_reason": artifact_store.reason,
        "task_queue_enabled": task_queue.enabled,
        "task_queue_reason": task_queue.reason,
        "doc_ai_enabled": settings.mistral_enable_doc_ai,
        "chat_ai_enabled": settings.mistral_enable_chat,
        "ocr": settings.mistral_model_ocr,
        "extract_fast": settings.mistral_model_extract_fast,
        "extract_default": settings.mistral_model_extract_default,
        "extract_fallback": settings.mistral_model_extract_fallback,
        "reasoning": settings.mistral_model_reasoning,
        "report_chat": settings.mistral_model_report_chat,
        "voice_stt": settings.mistral_model_voice_stt,
        "voice_stt_tamil_provider": "elevenlabs" if elevenlabs_service.stt_enabled else "mistral",
        "voice_stt_tamil_model": settings.elevenlabs_stt_model if elevenlabs_service.stt_enabled else settings.mistral_model_voice_stt,
        "voice_tts_enabled": voice_synthesis_service.enabled,
        "voice_tts_provider": voice_synthesis_service.active_provider_name,
        "voice_tts_model": settings.elevenlabs_tts_model if voice_synthesis_service.enabled else None,
    }


@app.post("/v1/jobs", response_model=CreateJobResponse)
async def create_job(files: list[UploadFile] = File(...), job_name: str | None = Form(default=None)) -> CreateJobResponse:
    try:
        job = await job_service.create_job(files, job_name=job_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if settings.job_runner_mode.lower() == "local":
        scheduled, _ = await job_service.trigger_run(job.job_id)
        if not scheduled:
            await job_service.add_job_note(job.job_id, "Local runner could not start automatically.")
    elif settings.job_runner_mode.lower() == "worker":
        enqueue_result = await asyncio.to_thread(task_queue.enqueue_job_run, job.job_id)
        if not enqueue_result.get("ok"):
            await job_service.add_job_note(
                job.job_id,
                f"Auto-enqueue failed: {enqueue_result.get('reason', 'unknown error')}. "
                "Run manually via POST /v1/jobs/{job_id}/run.",
                event_type="job_warning",
            )
        else:
            await job_service.add_job_note(
                job.job_id,
                f"Worker task queued: {enqueue_result.get('task_name', 'n/a')}",
                event_type="job_dispatch",
            )
    return job


@app.post("/v1/jobs/{job_id}/run")
async def run_job(job_id: str, request: Request) -> dict:
    validate_worker_request(request, settings)
    status = await job_service.get_status(job_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if status.status.value in {"COMPLETED", "FAILED"}:
        return {
            "job_id": job_id,
            "scheduled": False,
            "status": status.status.value,
            "message": "Job already in terminal state.",
        }
    scheduled, message = await job_service.trigger_run(job_id)
    return {
        "job_id": job_id,
        "scheduled": scheduled,
        "status": status.status.value,
        "runner_mode": settings.job_runner_mode,
        "message": message,
    }


@app.post("/v1/jobs/{job_id}/dispatch", response_model=JobDispatchResponse)
async def dispatch_job(job_id: str) -> JobDispatchResponse:
    status = await job_service.get_status(job_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if status.status.value in {"COMPLETED", "FAILED"}:
        return JobDispatchResponse(
            job_id=job_id,
            scheduled=False,
            status=status.status,
            runner_mode=settings.job_runner_mode,
            message="Job already in terminal state.",
        )
    scheduled, message = await job_service.trigger_run(job_id)
    latest = await job_service.get_status(job_id)
    return JobDispatchResponse(
        job_id=job_id,
        scheduled=scheduled,
        status=latest.status if latest else status.status,
        runner_mode=settings.job_runner_mode,
        message=message,
    )


@app.get("/v1/jobs", response_model=list[JobListItemResponse])
async def list_jobs(completed_only: bool = False) -> list[JobListItemResponse]:
    return await job_service.list_jobs(only_completed=completed_only)


@app.get("/v1/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str) -> JobStatusResponse:
    status = await job_service.get_status(job_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return status


@app.get("/v1/jobs/{job_id}/events")
async def stream_job_events(job_id: str):
    status = await job_service.get_status(job_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Job not found")
    event_stream = job_service.stream_events(job_id)

    async def sse_generator():
        try:
            async for event in event_stream:
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except KeyError:
            yield 'event: error\ndata: {"message":"job not found"}\n\n'

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@app.get("/v1/jobs/{job_id}/results", response_model=JobResultResponse)
async def get_job_results(job_id: str) -> JobResultResponse:
    result = await job_service.get_result(job_id)
    if result is None:
        status = await job_service.get_status(job_id)
        if status is None:
            raise HTTPException(status_code=404, detail="Job not found")
        raise HTTPException(status_code=409, detail=f"Job is not completed. Current status: {status.status.value}")
    return result


@app.get("/v1/jobs/{job_id}/files/{file_id}/download")
async def download_uploaded_file(job_id: str, file_id: str):
    meta = await job_service.get_job_file_meta(job_id, file_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="File not found for job")
    file_path = Path(str(meta.get("path", ""))).resolve()
    upload_root = (Path(settings.app_data_dir).resolve() / "uploads").resolve()
    if not str(file_path).startswith(str(upload_root)):
        raise HTTPException(status_code=403, detail="Invalid file path")
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File does not exist")
    media_type = (
        (str(meta.get("content_type", "")).strip() or None)
        or mimetypes.guess_type(str(file_path))[0]
        or "application/octet-stream"
    )
    filename = str(meta.get("filename") or file_path.name)
    return FileResponse(path=file_path, media_type=media_type, filename=filename)


@app.post("/v1/chat", response_model=ChatResponse)
async def ask_chat(payload: ChatRequest) -> ChatResponse:
    result = await job_service.get_result(payload.job_id)
    if result is None:
        raise HTTPException(status_code=409, detail="Job result not available. Complete reconciliation first.")

    question = (payload.voice_input_text or payload.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    resolved_language = _resolve_language_mode(payload.language, question)
    try:
        return await asyncio.to_thread(
            chat_service.answer,
            question,
            resolved_language,
            payload.response_style,
            result.summary,
            [i.model_dump() for i in result.issues],
            result.notes,
            payload.simulator_mode,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/v1/reports/{job_id}/export")
async def export_report(job_id: str) -> dict:
    result = await job_service.get_result(job_id)
    if result is None:
        raise HTTPException(status_code=409, detail="Job result not available. Complete reconciliation first.")

    report_dir = Path(settings.app_data_dir).resolve() / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)
    report_path = report_dir / f"{job_id}.pdf"
    _build_pdf_report(job_id=job_id, result=result, report_path=report_path)
    return {"job_id": job_id, "report_path": str(report_path), "format": "pdf"}


@app.get("/v1/reports/{job_id}/download")
async def download_report(job_id: str):
    export_result = await export_report(job_id)
    report_path = Path(export_result["report_path"])
    if not report_path.exists():
        raise HTTPException(status_code=404, detail="Report file not found.")
    return FileResponse(
        path=report_path,
        media_type="application/pdf",
        filename=f"gst-itc-report-{job_id}.pdf",
    )


@app.post("/v1/voice/transcribe", response_model=VoiceTranscriptionResponse)
async def transcribe_voice(file: UploadFile = File(...), language: str | None = None) -> VoiceTranscriptionResponse:
    if not mistral_service.voice_enabled and not elevenlabs_service.stt_enabled:
        raise HTTPException(status_code=503, detail="Voice transcription is disabled in current configuration.")

    uploads_dir = Path(settings.app_data_dir).resolve() / "voice_uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(file.filename or "").suffix or ".bin"
    temp_path = uploads_dir / f"{uuid.uuid4().hex}{suffix}"
    content = await file.read()
    temp_path.write_bytes(content)
    normalized_language = (language or "").strip().lower()
    if normalized_language in {"", "auto", "hinglish"}:
        effective_language = None
    elif normalized_language == "tanglish":
        # Bias STT toward Tamil for Roman-Tamil speech to avoid accidental Hindi scripts.
        effective_language = "ta"
    else:
        effective_language = normalized_language

    provider_errors: list[str] = []
    result: dict[str, str | None] | None = None
    prefers_elevenlabs = elevenlabs_service.stt_enabled and (effective_language == "ta" or effective_language is None)

    try:
        if prefers_elevenlabs and elevenlabs_service.stt_enabled:
            try:
                result = await asyncio.to_thread(
                    elevenlabs_service.transcribe_audio,
                    temp_path,
                    effective_language,
                )
            except Exception as exc:
                provider_errors.append(f"elevenlabs: {exc}")

        if result is None and mistral_service.voice_enabled:
            try:
                result = await asyncio.to_thread(
                    mistral_service.transcribe_audio,
                    temp_path,
                    effective_language,
                )
            except Exception as exc:
                provider_errors.append(f"mistral: {exc}")

        if result is None and not mistral_service.voice_enabled and elevenlabs_service.stt_enabled:
            try:
                result = await asyncio.to_thread(
                    elevenlabs_service.transcribe_audio,
                    temp_path,
                    effective_language,
                )
            except Exception as exc:
                provider_errors.append(f"elevenlabs: {exc}")

        if result is None:
            detail = "; ".join(provider_errors) if provider_errors else "Unknown STT failure."
            raise HTTPException(status_code=500, detail=f"Transcription failed: {detail}")
    finally:
        try:
            temp_path.unlink(missing_ok=True)
        except OSError:
            pass

    if result is None:
        raise HTTPException(status_code=500, detail="Transcription failed: empty provider response.")

    if normalized_language == "hinglish" and not result.get("language"):
        result["language"] = "auto"
    if normalized_language == "tanglish" and not result.get("language"):
        result["language"] = "ta"
    return VoiceTranscriptionResponse.model_validate(result)


@app.post("/v1/voice/speak")
async def speak_text(payload: VoiceSpeakRequest) -> Response:
    if not voice_synthesis_service.enabled:
        raise HTTPException(status_code=503, detail=f"Voice synthesis disabled: {voice_synthesis_service.reason}")

    raw_text = (payload.text or "").strip()
    if not raw_text:
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    speech_text = raw_text
    if _should_localize_speech_text(payload.language, raw_text):
        localized = await asyncio.to_thread(
            mistral_service.localize_text_for_speech,
            raw_text,
            payload.language,
        )
        if localized:
            speech_text = localized

    try:
        speech = await asyncio.to_thread(
            voice_synthesis_service.synthesize,
            speech_text,
            payload.language,
            payload.response_style,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Speech synthesis failed: {exc}") from exc

    return Response(
        content=speech.audio_bytes,
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "no-store",
            "X-Voice-Provider": speech.provider,
            "X-Voice-Model": speech.model_id,
            "X-Voice-Language": speech.language,
            "X-Voice-Id": speech.voice_id,
        },
    )


def _phase6_value_error(exc: ValueError) -> HTTPException:
    message = str(exc)
    if "not available" in message.lower() or "not found" in message.lower():
        return HTTPException(status_code=409, detail=message)
    return HTTPException(status_code=400, detail=message)


@app.get("/v1/phase6/voices/narration")
async def get_narration_voices() -> dict:
    voices = {
        "en": {
            "label": "English",
            "voice_id": (settings.elevenlabs_voice_id_en or "").strip() or None,
        },
        "hi": {
            "label": "Hindi",
            "voice_id": (settings.elevenlabs_voice_id_hi or "").strip() or None,
        },
        "ta": {
            "label": "Tamil",
            "voice_id": (settings.elevenlabs_voice_id_ta or "").strip() or None,
        },
    }
    return {
        "provider": voice_synthesis_service.active_provider_name,
        "enabled": voice_synthesis_service.enabled,
        "model": settings.elevenlabs_tts_model if voice_synthesis_service.enabled else None,
        "voices": voices,
    }


@app.get("/v1/phase6/evidence-pack/{job_id}")
async def get_evidence_pack(job_id: str) -> dict:
    try:
        return await phase6_service.build_evidence_pack(job_id)
    except ValueError as exc:
        raise _phase6_value_error(exc) from exc


@app.get("/v1/phase6/portfolio/overview")
async def get_portfolio_overview(job_id: str | None = None) -> dict:
    try:
        return await phase6_service.build_portfolio_overview(job_id=job_id)
    except ValueError as exc:
        raise _phase6_value_error(exc) from exc


@app.get("/v1/phase6/portfolio/morning-brief")
async def get_portfolio_morning_brief() -> dict:
    return await phase6_service.build_portfolio_overview()


@app.get("/v1/phase6/readiness/{job_id}", response_model=Phase6ReadinessResponse)
async def get_phase6_readiness(job_id: str) -> dict:
    try:
        return await phase6_service.build_readiness(job_id)
    except ValueError as exc:
        raise _phase6_value_error(exc) from exc


@app.get("/v1/phase6/gstr3b-sanity/{job_id}")
async def get_gstr3b_sanity(job_id: str) -> dict:
    try:
        return await phase6_service.build_gstr3b_sanity(job_id)
    except ValueError as exc:
        raise _phase6_value_error(exc) from exc


@app.get("/v1/phase6/anomalies/{job_id}")
async def get_anomalies(job_id: str) -> dict:
    try:
        return await phase6_service.build_anomaly_highlights(job_id)
    except ValueError as exc:
        raise _phase6_value_error(exc) from exc


@app.get("/v1/phase6/watchlist")
async def get_watchlist(job_id: str | None = None) -> dict:
    try:
        return await phase6_service.build_watchlist(job_id=job_id)
    except ValueError as exc:
        raise _phase6_value_error(exc) from exc


@app.get("/v1/phase6/hsn-suggestions/{job_id}")
async def get_hsn_suggestions(job_id: str) -> dict:
    try:
        return await phase6_service.build_hsn_suggestions(job_id)
    except ValueError as exc:
        raise _phase6_value_error(exc) from exc


@app.get("/v1/phase6/delta-digest")
async def get_delta_digest() -> dict:
    return await phase6_service.build_delta_digest()


@app.get("/v1/phase6/inbox")
async def get_inbox(role: str = "team", job_id: str | None = None) -> dict:
    try:
        return await phase6_service.build_inbox(role, job_id=job_id)
    except ValueError as exc:
        raise _phase6_value_error(exc) from exc


@app.get("/v1/phase6/cashflow/{job_id}")
async def get_cashflow(job_id: str, annual_interest_pct: float = 14.0) -> dict:
    try:
        return await phase6_service.build_cashflow_simulator(job_id, annual_interest_pct=annual_interest_pct)
    except ValueError as exc:
        raise _phase6_value_error(exc) from exc


@app.get("/v1/phase6/circular-impact/{job_id}")
async def get_circular_impact(job_id: str) -> dict:
    try:
        return await phase6_service.build_circular_impact(job_id)
    except ValueError as exc:
        raise _phase6_value_error(exc) from exc


@app.get("/v1/phase6/sla-analytics")
async def get_sla_analytics(job_id: str | None = None) -> dict:
    try:
        return await phase6_service.build_sla_analytics(job_id=job_id)
    except ValueError as exc:
        raise _phase6_value_error(exc) from exc


@app.get("/v1/jobs/{job_id}/invoices/{invoice_id}/preview", response_model=InvoicePreviewResponse)
async def get_invoice_preview(job_id: str, invoice_id: str) -> dict:
    try:
        return await phase6_service.build_invoice_preview(job_id, invoice_id)
    except ValueError as exc:
        raise _phase6_value_error(exc) from exc
