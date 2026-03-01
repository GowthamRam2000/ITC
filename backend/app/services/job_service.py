from __future__ import annotations

import asyncio
import csv
import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from typing import Protocol

from fastapi import UploadFile

from app.schemas import CreateJobResponse, JobListItemResponse, JobResultResponse, JobStage, JobStatusResponse
from app.services.reconcile import attach_ai_auditor_flags, reconcile_invoices


def _now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _is_invoice_record(record: dict[str, Any]) -> bool:
    if "invoice_no" not in record:
        return False
    # GSTR-2B markers should never be classified as purchase invoice records.
    if any(k in record for k in ("return_period", "supplier_status", "hsn_codes", "linked_doc_id")):
        return False
    if "line_items" in record or "buyer_gstin" in record or "doc_id" in record:
        return True
    if (
        "supplier_gstin" in record
        and "invoice_date" in record
        and "taxable_value" in record
        and ("total_tax" in record or "cgst" in record or "sgst" in record or "igst" in record)
    ):
        return True
    return False


def _is_gstr_record(record: dict[str, Any]) -> bool:
    if "supplier_gstin" not in record or "invoice_no" not in record:
        return False
    if "return_period" in record or "hsn_codes" in record:
        return True
    return False


class DocumentAIProcessor(Protocol):
    def extract_document(
        self, file_path: Path, original_name: str
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]: ...


class JobPersistence(Protocol):
    enabled: bool
    reason: str

    def upsert_job_state(self, job_id: str, state: dict[str, Any]) -> None: ...

    def upsert_job_result(self, job_id: str, result: dict[str, Any]) -> None: ...

    def append_event(self, job_id: str, event: dict[str, Any]) -> None: ...

    def fetch_job(self, job_id: str) -> dict[str, Any] | None: ...

    def fetch_events(self, job_id: str, limit: int = 500) -> list[dict[str, Any]]: ...


class UploadArtifactStore(Protocol):
    enabled: bool
    reason: str

    def mirror_upload(self, local_path: Path, job_id: str, file_id: str) -> str | None: ...


class JobService:
    def __init__(
        self,
        data_dir: str,
        doc_ai: DocumentAIProcessor | None = None,
        persistence: JobPersistence | None = None,
        artifact_store: UploadArtifactStore | None = None,
    ) -> None:
        self._root = Path(data_dir).resolve()
        self._upload_root = self._root / "uploads"
        self._upload_root.mkdir(parents=True, exist_ok=True)
        self._doc_ai = doc_ai
        self._persistence = persistence
        self._artifact_store = artifact_store

        self._jobs: dict[str, dict[str, Any]] = {}
        self._subscribers: dict[str, list[asyncio.Queue[dict[str, Any]]]] = {}
        self._active_runs: set[str] = set()
        self._lock = asyncio.Lock()

    async def list_known_job_ids(self) -> list[str]:
        in_memory: list[str]
        async with self._lock:
            in_memory = list(self._jobs.keys())
        on_disk = [p.name for p in self._upload_root.iterdir() if p.is_dir()] if self._upload_root.exists() else []
        return sorted(set(in_memory + on_disk))

    async def list_jobs(self, only_completed: bool = False) -> list[JobListItemResponse]:
        items: list[JobListItemResponse] = []
        for job_id in await self.list_known_job_ids():
            status = await self.get_status(job_id)
            if status is None:
                continue
            if only_completed and status.status != JobStage.COMPLETED:
                continue
            state = await self._ensure_state(job_id)
            files = list(state.get("files", [])) if state else await self.get_job_files(job_id)
            has_results = bool(state and state.get("result") is not None)
            has_invoice_source = any(
                str(Path(str(meta.get("path", ""))).suffix).lower() in {".png", ".jpg", ".jpeg", ".pdf"}
                for meta in files
            )
            input_profile = self._derive_input_profile(files)
            items.append(
                JobListItemResponse(
                    job_id=job_id,
                    job_name=status.job_name,
                    status=status.status,
                    created_at=status.created_at,
                    updated_at=status.updated_at,
                    has_results=has_results,
                    has_invoice_source=has_invoice_source,
                    input_profile=input_profile,
                )
            )
        return sorted(items, key=lambda x: x.created_at, reverse=True)

    async def get_job_file_meta(self, job_id: str, file_id: str) -> dict[str, Any] | None:
        files = await self.get_job_files(job_id)
        for meta in files:
            if str(meta.get("file_id", "")) == file_id:
                return meta
        return None

    async def get_job_files(self, job_id: str) -> list[dict[str, Any]]:
        state = await self._ensure_state(job_id)
        if state and isinstance(state.get("files"), list):
            return list(state["files"])

        job_dir = self._upload_root / job_id
        if not job_dir.exists():
            return []
        files: list[dict[str, Any]] = []
        for path in sorted(job_dir.iterdir()):
            if not path.is_file():
                continue
            files.append(
                {
                    "file_id": path.stem.split("_", 1)[0] if "_" in path.name else path.stem,
                    "filename": path.name.split("_", 1)[1] if "_" in path.name else path.name,
                    "content_type": None,
                    "size_bytes": path.stat().st_size,
                    "path": str(path),
                    "gcs_uri": None,
                }
            )
        return files

    async def get_job_events(self, job_id: str) -> list[dict[str, Any]]:
        state = await self._ensure_state(job_id)
        if state:
            async with self._lock:
                current_state = self._jobs.get(job_id, state)
                events = list(current_state.get("events", []))
            if events:
                return events
        return await self._load_events_from_persistence(job_id)

    async def create_job(self, files: list[UploadFile], job_name: str | None = None) -> CreateJobResponse:
        if not files:
            raise ValueError("At least one file is required.")

        job_id = uuid.uuid4().hex
        clean_job_name = (job_name or "").strip()[:80] or None
        now = _now_iso()
        job_dir = self._upload_root / job_id
        job_dir.mkdir(parents=True, exist_ok=True)

        file_metas: list[dict[str, Any]] = []
        job_notes: list[str] = []
        for up in files:
            content = await up.read()
            file_id = uuid.uuid4().hex
            filename = up.filename or f"upload_{file_id}"
            dest = job_dir / f"{file_id}_{filename}"
            dest.write_bytes(content)
            meta = {
                "file_id": file_id,
                "filename": filename,
                "content_type": up.content_type,
                "size_bytes": len(content),
                "path": str(dest),
                "gcs_uri": None,
            }
            if self._artifact_store is not None and getattr(self._artifact_store, "enabled", False):
                try:
                    gcs_uri = await asyncio.to_thread(self._artifact_store.mirror_upload, dest, job_id, file_id)
                    if gcs_uri:
                        meta["gcs_uri"] = gcs_uri
                except Exception as exc:
                    job_notes.append(f"GCS mirror failed for `{filename}`: {exc}")
            file_metas.append(meta)

        state = {
            "job_id": job_id,
            "job_name": clean_job_name,
            "status": JobStage.QUEUED.value,
            "created_at": now,
            "updated_at": now,
            "progress_pct": 0,
            "stage_message": "Job accepted",
            "total_files": len(file_metas),
            "processed_files": 0,
            "error": None,
            "files": file_metas,
            "result": None,
            "notes": job_notes,
            "events": [],
        }

        async with self._lock:
            self._jobs[job_id] = state
            self._subscribers.setdefault(job_id, [])
        await self._persist_state(job_id)
        await self._emit_event(job_id, stage=JobStage.QUEUED.value, message="Job queued", progress_pct=0)
        return CreateJobResponse(job_id=job_id, job_name=clean_job_name, status=JobStage.QUEUED, created_at=now)

    async def process_job(self, job_id: str) -> None:
        try:
            await self._set_status(job_id, JobStage.PARSING, "Parsing uploaded files", 10)
            invoices, gstr_entries, parse_failures, notes = await self._parse_uploaded_files(job_id)
            if not invoices:
                raise RuntimeError("No invoice records parsed. Upload invoice_truth.jsonl/json or compatible JSON.")
            if not gstr_entries:
                raise RuntimeError("No GSTR-2B records parsed. Upload gstr2b_truth.jsonl/csv or compatible JSON.")

            await self._set_status(job_id, JobStage.RECONCILING, "Reconciling invoices with GSTR-2B", 70)
            summary, issues = reconcile_invoices(invoices, gstr_entries, parse_failures=parse_failures)
            await self._set_status(job_id, JobStage.RECONCILING, "AI Auditor spot-checking semantic anomalies", 82)
            issues, attached_flags = await asyncio.to_thread(
                attach_ai_auditor_flags,
                issues,
                invoices,
                gstr_entries,
                self._doc_ai,
            )
            if attached_flags > 0:
                notes.append(f"AI Auditor flagged {attached_flags} semantic spot-check signals across reconciled invoices.")
            result = JobResultResponse(job_id=job_id, summary=summary, issues=issues, notes=notes)

            async with self._lock:
                state = self._jobs[job_id]
                state["result"] = result.model_dump()
                state["notes"] = notes
            await self._persist_result(job_id, result.model_dump())
            await self._persist_state(job_id)

            await self._set_status(job_id, JobStage.COMPLETED, "Reconciliation completed", 100)
            await self._emit_event(
                job_id,
                stage=JobStage.COMPLETED.value,
                message=f"Done. invoices={summary.total_invoices}, issues={len(issues)}",
                progress_pct=100,
                event_type="job_terminal",
            )
        except Exception as exc:
            await self._set_failed(job_id, str(exc))

    async def trigger_run(self, job_id: str) -> tuple[bool, str]:
        status = await self.get_status(job_id)
        if status is None:
            return False, "Job not found"
        if status.status.value in {"COMPLETED", "FAILED"}:
            return False, "Job already in terminal state"
        if status.status.value in {"PARSING", "RECONCILING"}:
            return False, "Job is already running"

        async with self._lock:
            if job_id in self._active_runs:
                return False, "Job is already running"
            self._active_runs.add(job_id)

        asyncio.create_task(self._process_job_guarded(job_id))
        return True, "Job scheduled"

    async def add_job_note(self, job_id: str, note: str, event_type: str = "job_note") -> None:
        state = await self._ensure_state(job_id)
        if not state:
            return
        async with self._lock:
            state = self._jobs[job_id]
            state.setdefault("notes", []).append(note)
            state["updated_at"] = _now_iso()
            stage = state["status"]
            progress = int(state.get("progress_pct", 0))
        await self._persist_state(job_id)
        await self._emit_event(job_id, stage=stage, message=note, progress_pct=progress, event_type=event_type)

    async def get_status(self, job_id: str) -> JobStatusResponse | None:
        async with self._lock:
            state = self._jobs.get(job_id)
        if not state:
            state = await self._load_state_from_persistence(job_id)
            if not state:
                return None
        return JobStatusResponse(
            job_id=state["job_id"],
            job_name=state.get("job_name"),
            status=JobStage(state["status"]),
            created_at=state["created_at"],
            updated_at=state["updated_at"],
            progress_pct=state["progress_pct"],
            stage_message=state["stage_message"],
            total_files=state["total_files"],
            processed_files=state["processed_files"],
            error=state["error"],
        )

    async def get_result(self, job_id: str) -> JobResultResponse | None:
        async with self._lock:
            state = self._jobs.get(job_id)
        if not state or state.get("result") is None:
            state = await self._load_state_from_persistence(job_id)
            if not state or state.get("result") is None:
                return None
        return JobResultResponse.model_validate(state["result"])

    async def stream_events(self, job_id: str):
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        terminal_statuses = {JobStage.COMPLETED.value, JobStage.FAILED.value}

        async with self._lock:
            state = self._jobs.get(job_id)
        if not state:
            state = await self._load_state_from_persistence(job_id)
            if not state:
                raise KeyError(job_id)
            history = await self._load_events_from_persistence(job_id)
            for event in history:
                yield event
            return

        async with self._lock:
            history = list(state["events"])
            is_terminal = state["status"] in terminal_statuses
            if not is_terminal:
                self._subscribers.setdefault(job_id, []).append(queue)

        for event in history:
            yield event

        if is_terminal:
            return

        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                    yield event
                    if event.get("stage") in terminal_statuses:
                        break
                except TimeoutError:
                    yield {"type": "heartbeat", "job_id": job_id, "ts": _now_iso()}
        finally:
            async with self._lock:
                subscribers = self._subscribers.get(job_id, [])
                if queue in subscribers:
                    subscribers.remove(queue)

    async def _parse_uploaded_files(
        self, job_id: str
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int, list[str]]:
        async with self._lock:
            files = list(self._jobs[job_id]["files"])
            total_files = self._jobs[job_id]["total_files"]
            notes: list[str] = list(self._jobs[job_id].get("notes", []))

        invoices: list[dict[str, Any]] = []
        gstr_entries: list[dict[str, Any]] = []
        parse_failures = 0

        for idx, meta in enumerate(files, start=1):
            path = Path(meta["path"])
            name = meta["filename"].lower()
            suffix = path.suffix.lower()

            try:
                if suffix == ".jsonl":
                    inv, gstr = self._parse_jsonl(path)
                    invoices.extend(inv)
                    gstr_entries.extend(gstr)
                elif suffix == ".json":
                    inv, gstr = self._parse_json(path)
                    invoices.extend(inv)
                    gstr_entries.extend(gstr)
                elif suffix == ".csv":
                    gstr_entries.extend(self._parse_csv_gstr(path))
                elif suffix in {".png", ".jpg", ".jpeg", ".pdf"}:
                    if self._doc_ai is None:
                        parse_failures += 1
                        notes.append(
                            f"Skipped `{meta['filename']}`: no document AI service configured for image/PDF parsing."
                        )
                    else:
                        inv, gstr, ai_notes = await asyncio.to_thread(
                            self._doc_ai.extract_document,
                            path,
                            meta["filename"],
                        )
                        invoices.extend(inv)
                        gstr_entries.extend(gstr)
                        notes.extend(ai_notes)
                else:
                    parse_failures += 1
                    notes.append(
                        f"Skipped unsupported file `{meta['filename']}`. Supported: .jsonl, .json, .csv, .png, .jpg, .jpeg, .pdf"
                    )

                if "invoice_truth" in name and suffix == ".jsonl":
                    notes.append(f"Detected invoice source file: {meta['filename']}")
                if "gstr2b_truth" in name and suffix in {".jsonl", ".csv"}:
                    notes.append(f"Detected GSTR-2B source file: {meta['filename']}")
            except Exception as exc:
                parse_failures += 1
                notes.append(f"Failed to parse `{meta['filename']}`: {exc}")

            progress = min(65, 10 + int((idx / max(1, total_files)) * 55))
            await self._update_processed_file_count(
                job_id,
                processed_files=idx,
                progress_pct=progress,
                message=f"Parsed {idx}/{total_files} files",
            )

        notes.append(f"Parsed invoice records: {len(invoices)}")
        notes.append(f"Parsed GSTR-2B records: {len(gstr_entries)}")
        notes.append(f"Parse failures: {parse_failures}")
        return invoices, gstr_entries, parse_failures, notes

    async def _process_job_guarded(self, job_id: str) -> None:
        try:
            await self.process_job(job_id)
        finally:
            async with self._lock:
                self._active_runs.discard(job_id)

    def _parse_jsonl(self, path: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        invoices: list[dict[str, Any]] = []
        gstr_entries: list[dict[str, Any]] = []
        for line in path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            record = json.loads(stripped)
            if isinstance(record, dict):
                if _is_gstr_record(record):
                    gstr_entries.append(record)
                elif _is_invoice_record(record):
                    invoices.append(record)
        return invoices, gstr_entries

    def _parse_json(self, path: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        payload = json.loads(path.read_text(encoding="utf-8"))
        invoices: list[dict[str, Any]] = []
        gstr_entries: list[dict[str, Any]] = []

        if isinstance(payload, list):
            for item in payload:
                if isinstance(item, dict):
                    if _is_gstr_record(item):
                        gstr_entries.append(item)
                    elif _is_invoice_record(item):
                        invoices.append(item)
            return invoices, gstr_entries

        if isinstance(payload, dict):
            if _is_gstr_record(payload):
                gstr_entries.append(payload)
            elif _is_invoice_record(payload):
                invoices.append(payload)
            return invoices, gstr_entries

        return invoices, gstr_entries

    def _parse_csv_gstr(self, path: Path) -> list[dict[str, Any]]:
        entries: list[dict[str, Any]] = []
        with path.open("r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                cleaned = {k: (v.strip() if isinstance(v, str) else v) for k, v in row.items()}
                if "hsn_codes" in cleaned and isinstance(cleaned["hsn_codes"], str):
                    cleaned["hsn_codes"] = [x for x in cleaned["hsn_codes"].split(";") if x]
                entries.append(cleaned)
        return entries

    def _derive_input_profile(self, files: list[dict[str, Any]]) -> str:
        suffixes = {Path(str(meta.get("path", ""))).suffix.lower() for meta in files}
        names = {str(meta.get("filename", "")).lower() for meta in files}

        has_structured = bool(suffixes.intersection({".json", ".jsonl"}))
        has_csv = ".csv" in suffixes
        has_docs = bool(suffixes.intersection({".png", ".jpg", ".jpeg", ".pdf"}))
        has_gstr_hint = has_csv or any("gstr2b" in name for name in names)

        if has_docs and has_gstr_hint:
            return "image+gstr2b"
        if has_structured and has_gstr_hint:
            return "jsonl+gstr2b"
        if has_structured:
            return "structured-json"
        if has_docs:
            return "image/pdf"
        if has_csv:
            return "csv-only"
        return "mixed"

    async def _set_status(self, job_id: str, stage: JobStage, message: str, progress_pct: int) -> None:
        async with self._lock:
            state = self._jobs[job_id]
            state["status"] = stage.value
            state["stage_message"] = message
            state["progress_pct"] = max(0, min(100, progress_pct))
            state["updated_at"] = _now_iso()
        await self._emit_event(job_id, stage=stage.value, message=message, progress_pct=progress_pct)
        await self._persist_state(job_id)

    async def _update_processed_file_count(
        self, job_id: str, processed_files: int, progress_pct: int, message: str
    ) -> None:
        async with self._lock:
            state = self._jobs[job_id]
            state["processed_files"] = processed_files
            state["progress_pct"] = max(0, min(100, progress_pct))
            state["stage_message"] = message
            state["updated_at"] = _now_iso()
            stage = state["status"]
        await self._emit_event(job_id, stage=stage, message=message, progress_pct=progress_pct)
        await self._persist_state(job_id)

    async def _set_failed(self, job_id: str, error: str) -> None:
        progress_pct = 0
        async with self._lock:
            state = self._jobs[job_id]
            state["status"] = JobStage.FAILED.value
            state["stage_message"] = "Job failed"
            state["progress_pct"] = min(state.get("progress_pct", 0), 99)
            state["updated_at"] = _now_iso()
            state["error"] = error
            progress_pct = state["progress_pct"]
        await self._emit_event(
            job_id,
            stage=JobStage.FAILED.value,
            message=error,
            progress_pct=progress_pct,
            event_type="job_terminal",
        )
        await self._persist_state(job_id)

    async def _emit_event(
        self, job_id: str, stage: str, message: str, progress_pct: int, event_type: str = "job_update"
    ) -> None:
        async with self._lock:
            state = self._jobs[job_id]
            payload = {
                "type": event_type,
                "job_id": job_id,
                "stage": stage,
                "message": message,
                "progress_pct": max(0, min(100, progress_pct)),
                "processed_files": state["processed_files"],
                "total_files": state["total_files"],
                "ts": _now_iso(),
            }
            state["events"].append(payload)
            subscribers = list(self._subscribers.get(job_id, []))
        await self._persist_event(job_id, payload)

        for queue in subscribers:
            await queue.put(payload)

    def _serialize_state(self, state: dict[str, Any]) -> dict[str, Any]:
        return {
            "job_id": state.get("job_id"),
            "job_name": state.get("job_name"),
            "status": state.get("status"),
            "created_at": state.get("created_at"),
            "updated_at": state.get("updated_at"),
            "progress_pct": state.get("progress_pct", 0),
            "stage_message": state.get("stage_message", ""),
            "total_files": state.get("total_files", 0),
            "processed_files": state.get("processed_files", 0),
            "error": state.get("error"),
            "files": list(state.get("files", [])),
            "notes": list(state.get("notes", [])),
            "result": state.get("result"),
        }

    def _inflate_state(self, persisted: dict[str, Any]) -> dict[str, Any]:
        return {
            "job_id": persisted.get("job_id"),
            "job_name": persisted.get("job_name"),
            "status": persisted.get("status", JobStage.QUEUED.value),
            "created_at": persisted.get("created_at", _now_iso()),
            "updated_at": persisted.get("updated_at", _now_iso()),
            "progress_pct": int(persisted.get("progress_pct", 0)),
            "stage_message": persisted.get("stage_message", ""),
            "total_files": int(persisted.get("total_files", 0)),
            "processed_files": int(persisted.get("processed_files", 0)),
            "error": persisted.get("error"),
            "files": list(persisted.get("files", [])),
            "result": persisted.get("result"),
            "notes": list(persisted.get("notes", [])),
            "events": [],
        }

    async def _persist_state(self, job_id: str) -> None:
        if self._persistence is None or not getattr(self._persistence, "enabled", False):
            return
        async with self._lock:
            state = self._jobs.get(job_id)
            if not state:
                return
            payload = self._serialize_state(state)
        try:
            await asyncio.to_thread(self._persistence.upsert_job_state, job_id, payload)
        except Exception:
            pass

    async def _persist_result(self, job_id: str, result: dict[str, Any]) -> None:
        if self._persistence is None or not getattr(self._persistence, "enabled", False):
            return
        try:
            await asyncio.to_thread(self._persistence.upsert_job_result, job_id, result)
        except Exception:
            pass

    async def _persist_event(self, job_id: str, event: dict[str, Any]) -> None:
        if self._persistence is None or not getattr(self._persistence, "enabled", False):
            return
        try:
            await asyncio.to_thread(self._persistence.append_event, job_id, event)
        except Exception:
            pass

    async def _load_state_from_persistence(self, job_id: str) -> dict[str, Any] | None:
        if self._persistence is None or not getattr(self._persistence, "enabled", False):
            return None
        try:
            persisted = await asyncio.to_thread(self._persistence.fetch_job, job_id)
        except Exception:
            return None
        if not persisted:
            return None
        state = self._inflate_state(persisted)
        async with self._lock:
            self._jobs.setdefault(job_id, state)
            self._subscribers.setdefault(job_id, [])
        return state

    async def _load_events_from_persistence(self, job_id: str) -> list[dict[str, Any]]:
        if self._persistence is None or not getattr(self._persistence, "enabled", False):
            return []
        try:
            events = await asyncio.to_thread(self._persistence.fetch_events, job_id, 500)
        except Exception:
            return []
        return [e for e in events if isinstance(e, dict)]

    async def _ensure_state(self, job_id: str) -> dict[str, Any] | None:
        async with self._lock:
            state = self._jobs.get(job_id)
        if state:
            return state
        return await self._load_state_from_persistence(job_id)
