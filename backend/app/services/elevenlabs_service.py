from __future__ import annotations

import mimetypes
import re
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests

from app.core.settings import Settings


def _contains_devanagari(text: str) -> bool:
    return bool(re.search(r"[\u0900-\u097F]", text))


def _contains_tamil(text: str) -> bool:
    return bool(re.search(r"[\u0B80-\u0BFF]", text))


def _looks_like_roman_tamil(text: str) -> bool:
    tokens = set(re.findall(r"[a-zA-Z']+", text.lower()))
    hints = {"intha", "enna", "irukku", "inga", "unga", "illai", "seri", "pa", "la", "appo", "idhu"}
    return len(tokens.intersection(hints)) >= 2


@dataclass
class ElevenLabsSpeechResult:
    audio_bytes: bytes
    model_id: str
    voice_id: str
    language: str


class ElevenLabsService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._base_url = settings.elevenlabs_base_url.rstrip("/")
        self._timeout_seconds = max(settings.elevenlabs_timeout_ms, 1000) / 1000.0
        self.enabled = False
        self.reason = "Disabled"
        self.stt_enabled = False
        self.stt_reason = "Disabled"

        if not settings.elevenlabs_api_key.strip():
            self.reason = "ELEVENLABS_API_KEY missing"
            self.stt_reason = "ELEVENLABS_API_KEY missing"
            return

        if settings.elevenlabs_enable_tts:
            self.enabled = True
            self.reason = "OK"
        else:
            self.reason = "ELEVENLABS_ENABLE_TTS=false"

        if settings.elevenlabs_enable_stt:
            self.stt_enabled = True
            self.stt_reason = "OK"
        else:
            self.stt_reason = "ELEVENLABS_ENABLE_STT=false"

    def synthesize_text(
        self,
        text: str,
        language: str = "auto",
        response_style: str = "plain",
    ) -> ElevenLabsSpeechResult:
        if not self.enabled:
            raise RuntimeError(f"ElevenLabs TTS unavailable: {self.reason}")

        sanitized_text = self._sanitize_text(text, response_style=response_style)
        if not sanitized_text:
            raise ValueError("Text is empty after normalization.")

        resolved_language = self._resolve_language(language, sanitized_text)
        spoken_text = self._normalize_for_speech(sanitized_text, language=resolved_language)
        if not spoken_text:
            raise ValueError("Text is empty after speech normalization.")

        voice_candidates = self._voice_candidates(resolved_language)
        if not voice_candidates:
            raise RuntimeError("No voice ID configured for the selected language.")

        model_candidates = self._model_candidates(resolved_language)
        attempts: list[str] = []
        for model_id in model_candidates:
            for voice_id in voice_candidates:
                try:
                    audio = self._request_tts(voice_id=voice_id, model_id=model_id, text=spoken_text)
                    return ElevenLabsSpeechResult(
                        audio_bytes=audio,
                        model_id=model_id,
                        voice_id=voice_id,
                        language=resolved_language,
                    )
                except RuntimeError as exc:
                    attempts.append(f"voice={voice_id}, model={model_id}, error={exc}")
                    continue

        raise RuntimeError(
            "ElevenLabs TTS failed for all configured voice/model fallbacks. "
            + (attempts[0] if attempts else "No attempt details available.")
        )

    def _sanitize_text(self, text: str, response_style: str) -> str:
        normalized = (text or "").strip()
        if not normalized:
            return ""

        if response_style == "markdown":
            normalized = re.sub(r"\[(.*?)\]\((.*?)\)", r"\1", normalized)
            normalized = re.sub(r"[*_`>#-]", " ", normalized)
        else:
            normalized = re.sub(r"[*_`]", " ", normalized)

        return re.sub(r"\s+", " ", normalized).strip()

    def _normalize_for_speech(self, text: str, language: str) -> str:
        normalized = self._verbalize_currency_amounts(text, language)
        normalized = re.sub(r"\s+", " ", normalized).strip()
        if len(normalized) > self._settings.elevenlabs_max_chars:
            normalized = normalized[: self._settings.elevenlabs_max_chars].rstrip()
        return normalized

    def _resolve_language(self, language: str, text: str) -> str:
        mode = (language or "auto").strip().lower()
        if _contains_tamil(text):
            return "ta"
        if _contains_devanagari(text):
            return "hi"
        if mode in {"ta", "tanglish"}:
            return "ta"
        if mode in {"hi", "hinglish"}:
            return "hi"
        return "en"

    def _voice_candidates(self, language: str) -> list[str]:
        voice_map = {
            "en": (self._settings.elevenlabs_voice_id_en or "").strip(),
            "hi": (self._settings.elevenlabs_voice_id_hi or "").strip(),
            "ta": (self._settings.elevenlabs_voice_id_ta or "").strip(),
        }
        order = {
            "en": ("en", "hi", "ta"),
            "hi": ("hi", "en", "ta"),
            "ta": ("ta", "hi", "en"),
        }.get(language, ("en", "hi", "ta"))
        candidates: list[str] = []
        seen: set[str] = set()
        for lang in order:
            candidate = voice_map.get(lang, "")
            if not candidate or candidate in seen:
                continue
            seen.add(candidate)
            candidates.append(candidate)
        return candidates

    def _model_candidates(self, language: str) -> list[str]:
        configured = (self._settings.elevenlabs_tts_model or "").strip() or "eleven_multilingual_v2"
        if language == "ta":
            pool = [configured, "eleven_v3", "eleven_multilingual_v2"]
        else:
            pool = [configured, "eleven_multilingual_v2", "eleven_v3"]

        candidates: list[str] = []
        seen: set[str] = set()
        for model in pool:
            if not model or model in seen:
                continue
            seen.add(model)
            candidates.append(model)
        return candidates

    def _request_tts(self, voice_id: str, model_id: str, text: str) -> bytes:
        output_format = (self._settings.elevenlabs_output_format or "").strip() or "mp3_44100_128"

        url = f"{self._base_url}/v1/text-to-speech/{voice_id}?output_format={output_format}"
        headers = {
            "xi-api-key": self._settings.elevenlabs_api_key,
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
        }
        payload = {
            "text": text,
            "model_id": model_id,
            "voice_settings": {
                "stability": 0.45,
                "similarity_boost": 0.75,
            },
        }

        try:
            response = requests.post(url, headers=headers, json=payload, timeout=self._timeout_seconds)
        except Exception as exc:
            raise RuntimeError(f"ElevenLabs request failed: {exc}") from exc

        if response.status_code != 200:
            body = response.text.strip()
            if len(body) > 180:
                body = f"{body[:180]}..."
            raise RuntimeError(f"ElevenLabs TTS failed ({response.status_code}): {body}")

        if not response.content:
            raise RuntimeError("ElevenLabs returned empty audio payload.")
        return response.content

    def _verbalize_currency_amounts(self, text: str, language: str) -> str:
        if not text:
            return text

        prefix_pattern = re.compile(
            r"(?P<prefix>₹|INR|Rs\.?)\s*(?P<amount>-?[0-9][0-9,]*(?:\.[0-9]+)?)",
            flags=re.IGNORECASE,
        )
        suffix_pattern = re.compile(
            r"(?P<amount>-?[0-9][0-9,]*(?:\.[0-9]+)?)\s*(?P<suffix>₹|INR|Rs\.?)",
            flags=re.IGNORECASE,
        )

        def replace_currency(match: re.Match[str]) -> str:
            amount = match.group("amount")
            verbalized = self._format_inr_phrase(amount, language)
            return verbalized if verbalized else match.group(0)

        result = prefix_pattern.sub(replace_currency, text)
        result = suffix_pattern.sub(replace_currency, result)
        return result

    def _format_inr_phrase(self, amount_text: str, language: str) -> str | None:
        raw = (amount_text or "").replace(",", "").strip()
        if not raw:
            return None
        try:
            amount = Decimal(raw).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        except (InvalidOperation, ValueError):
            return None

        is_negative = amount < 0
        if is_negative:
            amount = -amount

        rupees = int(amount)
        paise = int(((amount - Decimal(rupees)) * Decimal(100)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))

        words = self._currency_words(language)
        phrase = self._format_indian_number(rupees, words)
        phrase = f"{phrase} {words['rupees']}"
        if paise > 0:
            phrase = f"{phrase} {words['and']} {paise} {words['paise']}"
        if is_negative:
            phrase = f"{words['minus']} {phrase}"
        return phrase

    def _format_indian_number(self, value: int, words: dict[str, str]) -> str:
        if value <= 0:
            return "0"

        crore = value // 10_000_000
        value %= 10_000_000
        lakh = value // 100_000
        value %= 100_000
        thousand = value // 1_000
        last_three = value % 1_000

        parts: list[str] = []
        if crore:
            parts.append(f"{crore} {words['crore']}")
        if lakh:
            parts.append(f"{lakh} {words['lakh']}")
        if thousand:
            parts.append(f"{thousand} {words['thousand']}")
        if last_three:
            parts.append(str(last_three))
        return " ".join(parts) if parts else "0"

    def _currency_words(self, language: str) -> dict[str, str]:
        mode = (language or "").strip().lower()
        if mode == "hi":
            return {
                "crore": "करोड़",
                "lakh": "लाख",
                "thousand": "हज़ार",
                "rupees": "रुपये",
                "paise": "पैसे",
                "and": "और",
                "minus": "माइनस",
            }
        if mode == "ta":
            return {
                "crore": "கோடி",
                "lakh": "லட்சம்",
                "thousand": "ஆயிரம்",
                "rupees": "ரூபாய்",
                "paise": "பைசா",
                "and": "மற்றும்",
                "minus": "மைனஸ்",
            }
        return {
            "crore": "crore",
            "lakh": "lakh",
            "thousand": "thousand",
            "rupees": "rupees",
            "paise": "paise",
            "and": "and",
            "minus": "minus",
        }

    def transcribe_audio(self, audio_path: Path, language: str | None = None) -> dict[str, Any]:
        if not self.stt_enabled:
            raise RuntimeError(f"ElevenLabs STT unavailable: {self.stt_reason}")

        requested_mode = (language or "").strip().lower()
        tamil_hint = requested_mode in {"ta", "tanglish"}
        model_id = (self._settings.elevenlabs_stt_model or "").strip() or "scribe_v1"
        mime_type = mimetypes.guess_type(audio_path.name)[0] or "application/octet-stream"
        language_candidates = self._language_code_candidates(language)
        attempts: list[str] = []

        for language_code in language_candidates:
            data: dict[str, str] = {"model_id": model_id}
            if language_code:
                data["language_code"] = language_code

            try:
                with audio_path.open("rb") as audio_file:
                    response = requests.post(
                        f"{self._base_url}/v1/speech-to-text",
                        headers={
                            "xi-api-key": self._settings.elevenlabs_api_key,
                            "Accept": "application/json",
                        },
                        data=data,
                        files={"file": (audio_path.name, audio_file, mime_type)},
                        timeout=self._timeout_seconds,
                    )
            except Exception as exc:
                attempts.append(f"language_code={language_code or 'auto'} error={exc}")
                continue

            if response.status_code != 200:
                body = response.text.strip()
                if len(body) > 240:
                    body = f"{body[:240]}..."
                attempts.append(f"language_code={language_code or 'auto'} HTTP {response.status_code}: {body}")
                continue

            try:
                payload = response.json()
            except Exception as exc:
                attempts.append(f"language_code={language_code or 'auto'} invalid JSON: {exc}")
                continue

            text = str(payload.get("text") or "").strip()
            if not text:
                attempts.append(f"language_code={language_code or 'auto'} empty transcript")
                continue

            if tamil_hint and _contains_devanagari(text) and not _contains_tamil(text) and not _looks_like_roman_tamil(text):
                attempts.append(
                    f"language_code={language_code or 'auto'} detected likely Hindi text for Tamil hint; retrying"
                )
                continue

            detected_language = str(payload.get("language_code") or language_code or "auto")
            return {
                "text": text,
                "model": model_id,
                "language": detected_language,
            }

        raise RuntimeError(
            "ElevenLabs STT failed for all language-code attempts. "
            + (attempts[0] if attempts else "No attempt details available.")
        )

    def _language_code_candidates(self, language: str | None) -> list[str | None]:
        mode = (language or "").strip().lower()
        if mode in {"ta", "tanglish"}:
            return ["tam", "ta", None]
        if mode in {"hi", "hinglish"}:
            return ["hin", "hi", None]
        if mode == "en":
            return ["en", "eng", None]
        return [None]
