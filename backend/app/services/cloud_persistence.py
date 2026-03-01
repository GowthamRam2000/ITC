from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class CloudPersistence:
    enabled: bool = False
    reason: str = "Not configured"

    def __post_init__(self) -> None:
        self._db = None
        self._jobs_collection = "jobs"

    @classmethod
    def from_settings(cls, settings) -> "CloudPersistence":
        instance = cls()
        project = (settings.gcp_project_id or settings.firebase_project_id or "").strip()
        if not project:
            instance.reason = "GCP/Firebase project not configured"
            return instance

        try:
            from google.cloud import firestore  # type: ignore
        except Exception as exc:
            instance.reason = f"google-cloud-firestore unavailable: {exc}"
            return instance

        try:
            instance._db = firestore.Client(project=project, database=settings.firestore_database)
            instance._jobs_collection = settings.firestore_jobs_collection or "jobs"
            instance.enabled = True
            instance.reason = "OK"
            return instance
        except Exception as exc:  # pragma: no cover
            instance.reason = f"Firestore init failed: {exc}"
            return instance

    def upsert_job_state(self, job_id: str, state: dict[str, Any]) -> None:
        if not self.enabled or self._db is None:
            return
        doc = self._db.collection(self._jobs_collection).document(job_id)
        doc.set(state, merge=True)

    def upsert_job_result(self, job_id: str, result: dict[str, Any]) -> None:
        if not self.enabled or self._db is None:
            return
        doc = self._db.collection(self._jobs_collection).document(job_id)
        doc.set({"result": result}, merge=True)

    def append_event(self, job_id: str, event: dict[str, Any]) -> None:
        if not self.enabled or self._db is None:
            return
        events = self._db.collection(self._jobs_collection).document(job_id).collection("events")
        events.add(event)

    def fetch_job(self, job_id: str) -> dict[str, Any] | None:
        if not self.enabled or self._db is None:
            return None
        snap = self._db.collection(self._jobs_collection).document(job_id).get()
        if not snap.exists:
            return None
        data = snap.to_dict() or {}
        data["job_id"] = job_id
        return data

    def fetch_events(self, job_id: str, limit: int = 500) -> list[dict[str, Any]]:
        if not self.enabled or self._db is None:
            return []
        query = (
            self._db.collection(self._jobs_collection)
            .document(job_id)
            .collection("events")
            .order_by("ts")
            .limit(limit)
        )
        return [doc.to_dict() for doc in query.stream()]

