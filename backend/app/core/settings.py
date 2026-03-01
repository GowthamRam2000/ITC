from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    app_name: str = Field(default="GST ITC Recon Copilot API", alias="APP_NAME")
    app_env: str = Field(default="development", alias="APP_ENV")
    app_port: int = Field(default=8000, alias="APP_PORT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    app_data_dir: str = Field(default="backend/runtime", alias="APP_DATA_DIR")
    job_runner_mode: str = Field(default="local", alias="JOB_RUNNER_MODE")
    worker_auth_enabled: bool = Field(default=True, alias="WORKER_AUTH_ENABLED")
    worker_bearer_token: str = Field(default="", alias="WORKER_BEARER_TOKEN")

    mistral_api_key: str = Field(default="", alias="MISTRAL_API_KEY")
    mistral_base_url: str = Field(default="https://api.mistral.ai", alias="MISTRAL_BASE_URL")
    mistral_timeout_ms: int = Field(default=120000, alias="MISTRAL_TIMEOUT_MS")
    mistral_enable_doc_ai: bool = Field(default=False, alias="MISTRAL_ENABLE_DOC_AI")
    mistral_enable_chat: bool = Field(default=False, alias="MISTRAL_ENABLE_CHAT")
    mistral_model_ocr: str = Field(default="mistral-ocr-latest", alias="MISTRAL_MODEL_OCR")
    mistral_model_extract_fast: str = Field(default="ministral-3b-latest", alias="MISTRAL_MODEL_EXTRACT_FAST")
    mistral_model_extract_default: str = Field(default="ministral-8b-latest", alias="MISTRAL_MODEL_EXTRACT_DEFAULT")
    mistral_model_extract_fallback: str = Field(default="ministral-14b-latest", alias="MISTRAL_MODEL_EXTRACT_FALLBACK")
    mistral_model_reasoning: str = Field(default="magistral-medium-latest", alias="MISTRAL_MODEL_REASONING")
    mistral_model_report_chat: str = Field(default="mistral-large-latest", alias="MISTRAL_MODEL_REPORT_CHAT")
    mistral_model_voice_stt: str = Field(default="voxtral-mini-latest", alias="MISTRAL_MODEL_VOICE_STT")

    elevenlabs_enable_tts: bool = Field(default=False, alias="ELEVENLABS_ENABLE_TTS")
    elevenlabs_api_key: str = Field(default="", alias="ELEVENLABS_API_KEY")
    elevenlabs_base_url: str = Field(default="https://api.elevenlabs.io", alias="ELEVENLABS_BASE_URL")
    elevenlabs_tts_model: str = Field(default="eleven_multilingual_v2", alias="ELEVENLABS_TTS_MODEL")
    elevenlabs_voice_id_en: str = Field(default="", alias="ELEVENLABS_VOICE_ID_EN")
    elevenlabs_voice_id_hi: str = Field(default="", alias="ELEVENLABS_VOICE_ID_HI")
    elevenlabs_voice_id_ta: str = Field(default="", alias="ELEVENLABS_VOICE_ID_TA")
    elevenlabs_enable_stt: bool = Field(default=False, alias="ELEVENLABS_ENABLE_STT")
    elevenlabs_stt_model: str = Field(default="scribe_v1", alias="ELEVENLABS_STT_MODEL")
    elevenlabs_output_format: str = Field(default="mp3_44100_128", alias="ELEVENLABS_OUTPUT_FORMAT")
    elevenlabs_timeout_ms: int = Field(default=45000, alias="ELEVENLABS_TIMEOUT_MS")
    elevenlabs_max_chars: int = Field(default=1200, alias="ELEVENLABS_MAX_CHARS")

    gcp_project_id: str = Field(default="", alias="GCP_PROJECT_ID")
    gcp_region: str = Field(default="us-central1", alias="GCP_REGION")
    google_application_credentials: str = Field(default="", alias="GOOGLE_APPLICATION_CREDENTIALS")
    gcs_upload_bucket: str = Field(default="", alias="GCS_UPLOAD_BUCKET")
    gcs_export_bucket: str = Field(default="", alias="GCS_EXPORT_BUCKET")

    firebase_project_id: str = Field(default="", alias="FIREBASE_PROJECT_ID")
    firestore_database: str = Field(default="(default)", alias="FIRESTORE_DATABASE")
    firebase_storage_bucket: str = Field(default="", alias="FIREBASE_STORAGE_BUCKET")
    firestore_jobs_collection: str = Field(default="jobs", alias="FIRESTORE_JOBS_COLLECTION")

    cloud_tasks_enabled: bool = Field(default=False, alias="CLOUD_TASKS_ENABLED")
    cloud_tasks_project_id: str = Field(default="", alias="CLOUD_TASKS_PROJECT_ID")
    cloud_tasks_location: str = Field(default="", alias="CLOUD_TASKS_LOCATION")
    cloud_tasks_queue: str = Field(default="", alias="CLOUD_TASKS_QUEUE")
    cloud_tasks_run_endpoint: str = Field(default="", alias="CLOUD_TASKS_RUN_ENDPOINT")
    cloud_tasks_service_account_email: str = Field(default="", alias="CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL")
    cloud_tasks_oidc_audience: str = Field(default="", alias="CLOUD_TASKS_OIDC_AUDIENCE")

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
