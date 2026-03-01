from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass
class ArtifactStore:
    enabled: bool = False
    reason: str = "Not configured"

    def __post_init__(self) -> None:
        self._client = None
        self._bucket = None

    @classmethod
    def from_settings(cls, settings) -> "ArtifactStore":
        instance = cls()
        bucket_name = (settings.gcs_upload_bucket or "").strip()
        if not bucket_name:
            instance.reason = "GCS_UPLOAD_BUCKET not configured"
            return instance

        project = (settings.gcp_project_id or settings.firebase_project_id or "").strip()
        if not project:
            instance.reason = "GCP/Firebase project not configured"
            return instance

        try:
            from google.cloud import storage  # type: ignore
        except Exception as exc:
            instance.reason = f"google-cloud-storage unavailable: {exc}"
            return instance

        try:
            client = storage.Client(project=project)
            bucket = client.bucket(bucket_name)
            instance._client = client
            instance._bucket = bucket
            instance.enabled = True
            instance.reason = "OK"
            return instance
        except Exception as exc:  # pragma: no cover
            instance.reason = f"GCS init failed: {exc}"
            return instance

    def mirror_upload(self, local_path: Path, job_id: str, file_id: str) -> str | None:
        if not self.enabled or self._bucket is None:
            return None
        ext = local_path.suffix.lower()
        blob_name = f"jobs/{job_id}/uploads/{file_id}{ext}"
        blob = self._bucket.blob(blob_name)
        blob.upload_from_filename(str(local_path))
        return f"gs://{self._bucket.name}/{blob_name}"

