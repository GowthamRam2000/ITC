from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.services.elevenlabs_service import ElevenLabsService, ElevenLabsSpeechResult


class VoiceProvider(Protocol):
    enabled: bool
    reason: str

    def synthesize_text(self, text: str, language: str = "auto", response_style: str = "plain") -> ElevenLabsSpeechResult:
        ...


@dataclass
class VoiceSynthesisResult:
    audio_bytes: bytes
    provider: str
    model_id: str
    voice_id: str
    language: str


class VoiceSynthesisService:
    def __init__(self, elevenlabs: ElevenLabsService | None = None) -> None:
        self._providers: dict[str, VoiceProvider] = {}
        if elevenlabs is not None:
            self._providers["elevenlabs"] = elevenlabs

    @property
    def enabled(self) -> bool:
        return any(provider.enabled for provider in self._providers.values())

    @property
    def active_provider_name(self) -> str:
        for name, provider in self._providers.items():
            if provider.enabled:
                return name
        return "none"

    @property
    def reason(self) -> str:
        if self.enabled:
            return "OK"
        if self._providers:
            return "; ".join([f"{name}: {provider.reason}" for name, provider in self._providers.items()])
        return "No provider configured"

    def synthesize(
        self,
        text: str,
        language: str = "auto",
        response_style: str = "plain",
    ) -> VoiceSynthesisResult:
        for provider_name, provider in self._providers.items():
            if not provider.enabled:
                continue
            speech = provider.synthesize_text(text=text, language=language, response_style=response_style)
            return VoiceSynthesisResult(
                audio_bytes=speech.audio_bytes,
                provider=provider_name,
                model_id=speech.model_id,
                voice_id=speech.voice_id,
                language=speech.language,
            )
        raise RuntimeError(f"No active voice provider. {self.reason}")
