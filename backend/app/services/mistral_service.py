from __future__ import annotations

import json
import logging
import mimetypes
import re
from pathlib import Path
from typing import Any

from mistralai import Mistral

from app.core.settings import Settings

logger = logging.getLogger(__name__)


class MistralService:
    """Mistral-backed utilities for OCR/extraction, chat answers, and voice transcription."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.enabled = bool(settings.mistral_api_key)
        self.doc_ai_enabled = self.enabled and settings.mistral_enable_doc_ai
        self.chat_enabled = self.enabled and settings.mistral_enable_chat
        self.voice_enabled = self.enabled

        self._client: Mistral | None = None
        self._available_models: set[str] | None = None

        if self.enabled:
            self._client = Mistral(
                api_key=settings.mistral_api_key,
                server_url=settings.mistral_base_url,
                timeout_ms=settings.mistral_timeout_ms,
            )

    def extract_document(self, file_path: Path, original_name: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
        if not self.doc_ai_enabled or self._client is None:
            return [], [], ["Document AI disabled. Set MISTRAL_ENABLE_DOC_AI=true to parse images/PDFs."]

        notes: list[str] = []
        ocr_model = self._resolve_model(
            self.settings.mistral_model_ocr,
            fallback_prefixes=["mistral-ocr"],
        )
        if not ocr_model:
            return [], [], ["No OCR model available in your Mistral account."]

        try:
            ocr_text, page_count = self._ocr_markdown(file_path, ocr_model)
        except Exception as exc:
            logger.exception("OCR failed for %s", file_path)
            return [], [], [f"OCR failed for `{file_path.name}`: {exc}"]

        notes.append(f"OCR completed on `{file_path.name}` using model `{ocr_model}` (pages={page_count}).")
        if not ocr_text.strip():
            return [], [], [f"OCR returned empty text for `{file_path.name}`."]

        doc_type = self._infer_document_type(original_name, ocr_text)
        notes.append(f"Document classified as `{doc_type}`.")

        invoices: list[dict[str, Any]] = []
        gstr_entries: list[dict[str, Any]] = []
        doc_id = file_path.stem.upper()

        if doc_type == "gstr2b":
            gstr_entries, extraction_notes = self._extract_gstr_entries(ocr_text, doc_id)
            notes.extend(extraction_notes)
        elif doc_type == "invoice":
            invoices, extraction_notes = self._extract_invoice_records(ocr_text, doc_id, file_path.suffix.lower())
            notes.extend(extraction_notes)
        else:
            trial_invoices, inv_notes = self._extract_invoice_records(ocr_text, doc_id, file_path.suffix.lower())
            trial_gstr, gstr_notes = self._extract_gstr_entries(ocr_text, doc_id)
            if len(trial_gstr) > len(trial_invoices):
                gstr_entries = trial_gstr
                notes.extend(gstr_notes)
            else:
                invoices = trial_invoices
                notes.extend(inv_notes)

        return invoices, gstr_entries, notes

    def answer_reconciliation_question(
        self,
        question: str,
        language: str,
        response_style: str,
        summary: dict[str, Any],
        issues: list[dict[str, Any]],
        notes: list[str],
        scenario_mode: bool = False,
    ) -> str | None:
        if not self.chat_enabled or self._client is None:
            return None

        model = self._resolve_model(
            self.settings.mistral_model_report_chat,
            fallback_prefixes=["mistral-large"],
        )
        if not model:
            return None

        compact_issues = sorted(
            issues,
            key=lambda x: float(x.get("amount_at_risk", 0) or 0),
            reverse=True,
        )[:60]
        if language == "auto":
            language_hint = "Auto-detect language from user query."
        elif language == "hinglish":
            language_hint = "Respond in Hinglish (natural mix of Hindi and English, mostly Roman script)."
        elif language == "tanglish":
            language_hint = "Respond in Tanglish (natural mix of Tamil and English, mostly Roman script)."
        elif language == "hi":
            language_hint = "Respond in Hindi."
        elif language == "ta":
            language_hint = "Respond in Tamil."
        else:
            language_hint = "Respond in English."
        style_hint = (
            "Return plain text only. Do not use markdown symbols like **, #, or bullet markers."
            if response_style == "plain"
            else "Markdown is allowed but keep formatting minimal and readable."
        )
        prompt_payload = {
            "summary": summary,
            "top_issues": compact_issues,
            "notes": notes[:20],
            "question": question,
            "language": language,
            "response_style": response_style,
        }
        system = (
            "You are an Indian GST reconciliation assistant for CAs. "
            "Answer strictly from provided data. Use INR values. "
            "If data is insufficient, say so explicitly. "
            "When the user asks hypothetical/simulator questions, provide clear assumptions and likely impact. "
            f"{language_hint} {style_hint}"
        )
        user = (
            "Provide a concise answer and include cited invoice IDs where relevant.\n"
            f"SIMULATOR_MODE={str(bool(scenario_mode)).lower()}\n"
            f"DATA:\n{json.dumps(prompt_payload, ensure_ascii=False)}"
        )
        text = self._chat_text(model=model, system_prompt=system, user_prompt=user)
        return text.strip() if text else None

    def transcribe_audio(self, audio_path: Path, language: str | None = None) -> dict[str, Any]:
        if not self.voice_enabled or self._client is None:
            raise RuntimeError("Voice transcription is disabled. Set a valid MISTRAL_API_KEY.")

        model = self._resolve_model(
            self.settings.mistral_model_voice_stt,
            fallback_prefixes=["voxtral"],
        )
        if not model:
            raise RuntimeError("No Voxtral transcription model available.")

        mime_type = mimetypes.guess_type(audio_path.name)[0] or "application/octet-stream"
        with audio_path.open("rb") as f:
            response = self._client.audio.transcriptions.complete(
                model=model,
                file={"file_name": audio_path.name, "content": f, "content_type": mime_type},
                language=language,
            )
        return {
            "text": getattr(response, "text", "") or "",
            "model": getattr(response, "model", model),
            "language": getattr(response, "language", language),
        }

    def audit_semantic_anomalies(
        self,
        invoices: list[dict[str, Any]],
        gstr_entries: list[dict[str, Any]],
        issues: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if not self.chat_enabled or self._client is None:
            return []

        model = self._resolve_model(
            self.settings.mistral_model_reasoning,
            fallback_prefixes=["magistral", "mistral-large"],
        )
        if not model:
            return []

        issue_ids: list[str] = []
        for issue in issues[:80]:
            inv_id = str(issue.get("invoice_id", "")).strip()
            if inv_id and inv_id not in issue_ids:
                issue_ids.append(inv_id)
            if len(issue_ids) >= 24:
                break

        invoice_lookup: dict[str, dict[str, Any]] = {}
        for inv in invoices:
            inv_id = str(inv.get("doc_id") or inv.get("invoice_no") or "").strip()
            if inv_id:
                invoice_lookup[inv_id] = inv

        compact_invoices: list[dict[str, Any]] = []
        for inv_id in issue_ids:
            record = invoice_lookup.get(inv_id)
            if record:
                compact_invoices.append(record)

        if not compact_invoices:
            compact_invoices = invoices[:20]

        compact_payload = {
            "issues": issues[:50],
            "invoices": compact_invoices[:20],
            "gstr_entries": gstr_entries[:20],
        }
        system = (
            "You are an AI GST auditor. Detect semantic inconsistencies in invoice data. "
            "Focus on description-vs-HSN conflicts, impossible tax structure patterns, and line-item contradictions. "
            "Return strict JSON only in shape: "
            '{"flags":[{"invoice_id":"...","flag_code":"semantic_conflict","severity":"WARNING","summary":"...","confidence":0.0,'
            '"line_item_ref":"line_item_1","bbox":{"page":1,"x":0.1,"y":0.2,"width":0.8,"height":0.07},"model":"...","source":"ai_auditor"}]}. '
            "If nothing found, return {\"flags\":[]}."
        )
        user = f"Audit this job context and return flags.\nDATA:\n{json.dumps(compact_payload, ensure_ascii=False)}"
        parsed = self._chat_json(model=model, system_prompt=system, user_prompt=user)
        if isinstance(parsed, dict):
            flags = parsed.get("flags")
        elif isinstance(parsed, list):
            flags = parsed
        else:
            flags = None

        if not isinstance(flags, list):
            return []

        sanitized: list[dict[str, Any]] = []
        for row in flags[:80]:
            if not isinstance(row, dict):
                continue
            invoice_id = str(row.get("invoice_id", "")).strip()
            summary = str(row.get("summary", "")).strip()
            if not invoice_id or not summary:
                continue
            bbox = row.get("bbox")
            cleaned_bbox = None
            if isinstance(bbox, dict):
                try:
                    cleaned_bbox = {
                        "page": int(bbox.get("page", 1) or 1),
                        "x": float(bbox.get("x", 0.08)),
                        "y": float(bbox.get("y", 0.18)),
                        "width": float(bbox.get("width", 0.82)),
                        "height": float(bbox.get("height", 0.07)),
                    }
                except (TypeError, ValueError):
                    cleaned_bbox = None
            sanitized.append(
                {
                    "invoice_id": invoice_id,
                    "flag_code": str(row.get("flag_code", "semantic_conflict")).strip() or "semantic_conflict",
                    "severity": str(row.get("severity", "WARNING")).strip().upper() or "WARNING",
                    "summary": summary,
                    "confidence": float(row.get("confidence", 0.62) or 0.62),
                    "line_item_ref": str(row.get("line_item_ref", "")).strip() or None,
                    "bbox": cleaned_bbox,
                    "model": str(row.get("model", model)).strip() or model,
                    "source": "ai_auditor",
                }
            )
        return sanitized

    def localize_text_for_speech(self, text: str, target_language: str) -> str | None:
        if not self.chat_enabled or self._client is None:
            return None
        normalized_text = (text or "").strip()
        target = (target_language or "").strip().lower()
        if not normalized_text or target not in {"hi", "ta", "hinglish", "tanglish"}:
            return None

        model = self._resolve_model(
            self.settings.mistral_model_report_chat,
            fallback_prefixes=["mistral-large"],
        )
        if not model:
            return None

        if target == "hi":
            language_instruction = "Convert this into natural spoken Hindi in Devanagari script."
        elif target == "ta":
            language_instruction = "Convert this into natural spoken Tamil in Tamil script."
        elif target == "hinglish":
            language_instruction = "Convert this into natural Hinglish (Hindi + English mix in Roman script)."
        else:
            language_instruction = "Convert this into natural Tanglish (Tamil + English mix in Roman script)."

        system = (
            "You are a GST narration localizer. "
            "Keep all numbers, invoice IDs, GSTINs, and amounts exact. "
            "Do not add or remove facts. "
            "Output plain text only with no markdown."
        )
        user = f"{language_instruction}\n\nText:\n{normalized_text}"
        localized = self._chat_text(model=model, system_prompt=system, user_prompt=user, json_mode=False)
        if not localized:
            return None
        return localized.strip()

    def _ocr_markdown(self, file_path: Path, model: str) -> tuple[str, int]:
        assert self._client is not None
        mime_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        with file_path.open("rb") as f:
            uploaded = self._client.files.upload(
                file={"file_name": file_path.name, "content": f, "content_type": mime_type},
                purpose="ocr",
            )

        try:
            ocr_response = self._client.ocr.process(
                model=model,
                document={"type": "file", "file_id": uploaded.id},
            )
        finally:
            try:
                self._client.files.delete(file_id=uploaded.id)
            except Exception:
                logger.debug("Unable to delete uploaded OCR file id=%s", uploaded.id, exc_info=True)

        pages = getattr(ocr_response, "pages", []) or []
        markdown_parts: list[str] = []
        for page in pages:
            markdown = getattr(page, "markdown", None)
            if markdown:
                markdown_parts.append(str(markdown))
        full_markdown = "\n\n".join(markdown_parts)
        return full_markdown, len(pages)

    def _infer_document_type(self, original_name: str, ocr_text: str) -> str:
        lowered_name = original_name.lower()
        if "gstr2b" in lowered_name or "2b" in lowered_name:
            return "gstr2b"
        if "invoice" in lowered_name:
            return "invoice"
        lowered_text = ocr_text.lower()
        if "gstr-2b" in lowered_text or "gstr 2b" in lowered_text:
            return "gstr2b"

        model = self._resolve_model(
            self.settings.mistral_model_extract_fast,
            fallback_prefixes=["ministral-3b"],
        )
        if not model:
            return "invoice"

        system = (
            "Classify Indian tax document type. Return JSON only with keys: "
            "document_type (invoice|gstr2b|other), confidence (0..1)."
        )
        user = (
            f"Filename: {original_name}\n"
            f"Document text snippet:\n{ocr_text[:8000]}"
        )
        parsed = self._chat_json(model=model, system_prompt=system, user_prompt=user)
        if isinstance(parsed, dict):
            doc_type = str(parsed.get("document_type", "invoice")).strip().lower()
            if doc_type in {"invoice", "gstr2b", "other"}:
                return doc_type
        return "invoice"

    def _extract_invoice_records(
        self, ocr_text: str, fallback_doc_id: str, suffix: str
    ) -> tuple[list[dict[str, Any]], list[str]]:
        notes: list[str] = []
        primary_model = self._resolve_model(
            self.settings.mistral_model_extract_default,
            fallback_prefixes=["ministral-8b", "ministral-3b"],
        )
        fallback_model = self._resolve_model(
            self.settings.mistral_model_extract_fallback,
            fallback_prefixes=["ministral-14b", "ministral-8b", "mistral-large"],
        )
        if suffix == ".pdf" and len(ocr_text) > 20000:
            large_model = self._resolve_model(
                self.settings.mistral_model_report_chat,
                fallback_prefixes=["mistral-large"],
            )
            if large_model:
                primary_model = large_model

        if not primary_model:
            return [], ["No model available for invoice extraction."]

        system = (
            "Extract Indian GST purchase invoice fields from OCR text. "
            "OCR text can contain English, Devanagari Hindi, Roman Hindi (Hinglish), Tamil script, and Roman Tamil (Tanglish). "
            "Return STRICT JSON object only with shape: "
            "{\"records\":[{\"doc_id\":\"\",\"invoice_no\":\"\",\"invoice_date\":\"YYYY-MM-DD\","
            "\"supplier_name\":\"\",\"supplier_gstin\":\"\",\"buyer_gstin\":\"\","
            "\"taxable_value\":0,\"cgst\":0,\"sgst\":0,\"igst\":0,\"total_tax\":0,"
            "\"line_items\":[{\"description\":\"\",\"hsn\":\"\",\"qty\":1,\"unit_price\":0,"
            "\"taxable_value\":0,\"gst_rate\":0,\"cgst\":0,\"sgst\":0,\"igst\":0}]}]}"
        )
        user = f"OCR TEXT:\n{ocr_text[:42000]}"

        parsed = self._chat_json(primary_model, system, user)
        records = self._normalize_invoice_records(parsed, fallback_doc_id)
        notes.append(f"Invoice extraction attempted with `{primary_model}`.")

        if not records or self._low_confidence_invoices(records):
            if fallback_model and fallback_model != primary_model:
                parsed2 = self._chat_json(fallback_model, system, user)
                records2 = self._normalize_invoice_records(parsed2, fallback_doc_id)
                if records2:
                    notes.append(f"Fallback invoice extraction succeeded with `{fallback_model}`.")
                    records = records2
                else:
                    notes.append(f"Fallback invoice extraction with `{fallback_model}` produced no valid records.")

        return records, notes

    def _extract_gstr_entries(self, ocr_text: str, fallback_doc_id: str) -> tuple[list[dict[str, Any]], list[str]]:
        notes: list[str] = []
        model = self._resolve_model(
            self.settings.mistral_model_report_chat,
            fallback_prefixes=["mistral-large"],
        )
        if not model:
            return [], ["No model available for GSTR-2B extraction."]

        system = (
            "Extract GSTR-2B supplier invoice entries from OCR text. "
            "OCR text can contain English, Devanagari Hindi, Roman Hindi (Hinglish), Tamil script, and Roman Tamil (Tanglish). "
            "Return STRICT JSON object only with shape: "
            "{\"entries\":[{\"supplier_gstin\":\"\",\"supplier_name\":\"\",\"supplier_status\":\"ACTIVE\","
            "\"invoice_no\":\"\",\"invoice_date\":\"YYYY-MM-DD\",\"return_period\":\"MMYYYY\","
            "\"taxable_value\":0,\"cgst\":0,\"sgst\":0,\"igst\":0,\"total_tax\":0,"
            "\"hsn_codes\":[\"\"],\"linked_doc_id\":\"\"}]}"
        )
        user = f"OCR TEXT:\n{ocr_text[:70000]}"
        parsed = self._chat_json(model, system, user)
        entries = self._normalize_gstr_entries(parsed, fallback_doc_id)
        notes.append(f"GSTR-2B extraction attempted with `{model}`.")
        return entries, notes

    def _low_confidence_invoices(self, records: list[dict[str, Any]]) -> bool:
        if not records:
            return True
        missing = 0
        for rec in records:
            if not rec.get("invoice_no") or not rec.get("supplier_gstin"):
                missing += 1
        return (missing / len(records)) > 0.35

    def _normalize_invoice_records(self, parsed: Any, fallback_doc_id: str) -> list[dict[str, Any]]:
        rows = []
        if isinstance(parsed, dict):
            if isinstance(parsed.get("records"), list):
                rows = parsed["records"]
            elif isinstance(parsed.get("invoices"), list):
                rows = parsed["invoices"]
            else:
                rows = [parsed]
        elif isinstance(parsed, list):
            rows = parsed

        normalized: list[dict[str, Any]] = []
        for idx, rec in enumerate(rows):
            if not isinstance(rec, dict):
                continue
            invoice_no = self._safe_str(rec.get("invoice_no"))
            supplier_gstin = self._safe_str(rec.get("supplier_gstin")).upper()
            if not invoice_no or not supplier_gstin:
                continue

            cgst = self._safe_float(rec.get("cgst"))
            sgst = self._safe_float(rec.get("sgst"))
            igst = self._safe_float(rec.get("igst"))
            total_tax = self._safe_float(rec.get("total_tax")) or round(cgst + sgst + igst, 2)
            line_items = rec.get("line_items") if isinstance(rec.get("line_items"), list) else []
            normalized.append(
                {
                    "doc_id": self._safe_str(rec.get("doc_id")) or f"{fallback_doc_id}-{idx + 1}",
                    "invoice_no": invoice_no,
                    "invoice_date": self._safe_str(rec.get("invoice_date")),
                    "supplier_name": self._safe_str(rec.get("supplier_name")),
                    "supplier_gstin": supplier_gstin,
                    "buyer_gstin": self._safe_str(rec.get("buyer_gstin")),
                    "taxable_value": self._safe_float(rec.get("taxable_value")),
                    "cgst": cgst,
                    "sgst": sgst,
                    "igst": igst,
                    "total_tax": total_tax,
                    "line_items": line_items,
                }
            )
        return normalized

    def _normalize_gstr_entries(self, parsed: Any, fallback_doc_id: str) -> list[dict[str, Any]]:
        rows = []
        if isinstance(parsed, dict):
            if isinstance(parsed.get("entries"), list):
                rows = parsed["entries"]
            elif isinstance(parsed.get("records"), list):
                rows = parsed["records"]
            else:
                rows = [parsed]
        elif isinstance(parsed, list):
            rows = parsed

        normalized: list[dict[str, Any]] = []
        for rec in rows:
            if not isinstance(rec, dict):
                continue
            invoice_no = self._safe_str(rec.get("invoice_no"))
            supplier_gstin = self._safe_str(rec.get("supplier_gstin")).upper()
            if not invoice_no or not supplier_gstin:
                continue
            hsn_codes = rec.get("hsn_codes")
            if isinstance(hsn_codes, str):
                hsn_codes_list = [x.strip() for x in hsn_codes.split(",") if x.strip()]
            elif isinstance(hsn_codes, list):
                hsn_codes_list = [self._safe_str(x) for x in hsn_codes if self._safe_str(x)]
            else:
                hsn_codes_list = []

            cgst = self._safe_float(rec.get("cgst"))
            sgst = self._safe_float(rec.get("sgst"))
            igst = self._safe_float(rec.get("igst"))
            total_tax = self._safe_float(rec.get("total_tax")) or round(cgst + sgst + igst, 2)
            normalized.append(
                {
                    "supplier_gstin": supplier_gstin,
                    "supplier_name": self._safe_str(rec.get("supplier_name")),
                    "supplier_status": self._safe_str(rec.get("supplier_status")).upper() or "ACTIVE",
                    "invoice_no": invoice_no,
                    "invoice_date": self._safe_str(rec.get("invoice_date")),
                    "return_period": self._safe_str(rec.get("return_period")),
                    "taxable_value": self._safe_float(rec.get("taxable_value")),
                    "cgst": cgst,
                    "sgst": sgst,
                    "igst": igst,
                    "total_tax": total_tax,
                    "hsn_codes": hsn_codes_list,
                    "linked_doc_id": self._safe_str(rec.get("linked_doc_id")) or fallback_doc_id,
                }
            )
        return normalized

    def _chat_json(self, model: str, system_prompt: str, user_prompt: str) -> Any:
        text = self._chat_text(model=model, system_prompt=system_prompt, user_prompt=user_prompt, json_mode=True)
        if not text:
            return None
        return self._extract_json_payload(text)

    def _chat_text(self, model: str, system_prompt: str, user_prompt: str, json_mode: bool = False) -> str | None:
        assert self._client is not None
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.1,
        }
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        response = self._client.chat.complete(**kwargs)
        choices = getattr(response, "choices", []) or []
        if not choices:
            return None
        message = getattr(choices[0], "message", None)
        if message is None:
            return None
        content = getattr(message, "content", None)
        return self._content_to_text(content)

    def _content_to_text(self, content: Any) -> str:
        if content is None:
            return ""
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            chunks: list[str] = []
            for part in content:
                if isinstance(part, str):
                    chunks.append(part)
                    continue
                if isinstance(part, dict):
                    text = part.get("text") or part.get("content")
                    if text:
                        chunks.append(str(text))
                    continue
                text = getattr(part, "text", None) or getattr(part, "content", None)
                if text:
                    chunks.append(str(text))
            return "\n".join(chunks)
        if isinstance(content, dict):
            text = content.get("text") or content.get("content")
            return str(text) if text is not None else ""
        text_attr = getattr(content, "text", None)
        if text_attr is not None:
            return str(text_attr)
        return str(content)

    def _extract_json_payload(self, raw_text: str) -> Any:
        text = raw_text.strip()
        if text.startswith("```"):
            text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
            text = re.sub(r"\n?```$", "", text).strip()

        for candidate in (text, self._slice_json_candidate(text, "{", "}"), self._slice_json_candidate(text, "[", "]")):
            if not candidate:
                continue
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                continue
        return None

    def _slice_json_candidate(self, text: str, start_char: str, end_char: str) -> str | None:
        start = text.find(start_char)
        end = text.rfind(end_char)
        if start == -1 or end == -1 or end <= start:
            return None
        return text[start : end + 1]

    def _resolve_model(self, preferred: str | None, fallback_prefixes: list[str] | None = None) -> str | None:
        model_ids = self._get_available_models()
        candidates: list[str] = []
        if preferred:
            candidates.append(preferred)
        if fallback_prefixes:
            candidates.extend(fallback_prefixes)

        for candidate in candidates:
            if not candidate:
                continue
            if candidate in model_ids:
                return candidate
            if candidate.endswith("-latest"):
                prefix = candidate[: -len("-latest")]
                matches = sorted([m for m in model_ids if m.startswith(prefix)], reverse=True)
                if matches:
                    return matches[0]
            matches = sorted([m for m in model_ids if m.startswith(candidate)], reverse=True)
            if matches:
                return matches[0]
        return preferred if preferred else None

    def _get_available_models(self) -> set[str]:
        if self._available_models is not None:
            return self._available_models
        if self._client is None:
            self._available_models = set()
            return self._available_models
        try:
            listed = self._client.models.list()
            data = getattr(listed, "data", []) or []
            ids: set[str] = set()
            for item in data:
                model_id = getattr(item, "id", None)
                if model_id:
                    ids.add(str(model_id))
            self._available_models = ids
        except Exception:
            logger.debug("Unable to list Mistral models, using configured names as-is.", exc_info=True)
            self._available_models = set()
        return self._available_models

    def _safe_str(self, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()

    def _safe_float(self, value: Any) -> float:
        try:
            return round(float(value), 2)
        except (TypeError, ValueError):
            return 0.0
