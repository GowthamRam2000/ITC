from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
@dataclass
class TaskQueueService:
    enabled: bool = False
    reason: str = "Not configured"
    def __post_init__(self) -> None:
        self._client = None
        self._queue_path = ""
        self._settings = None
    @classmethod
    def from_settings(cls, settings) -> "TaskQueueService":
        instance = cls()
        instance._settings = settings
        if not settings.cloud_tasks_enabled:
            instance.reason = "CLOUD_TASKS_ENABLED=false"
            return instance
        project_id = (settings.cloud_tasks_project_id or settings.gcp_project_id).strip()
        location = (settings.cloud_tasks_location or settings.gcp_region).strip()
        queue = (settings.cloud_tasks_queue or "").strip()
        endpoint = (settings.cloud_tasks_run_endpoint or "").strip()
        if not project_id or not location or not queue or not endpoint:
            instance.reason = "Missing queue config: project/location/queue/run endpoint"
            return instance
        if settings.worker_auth_enabled and not settings.worker_bearer_token and not settings.cloud_tasks_service_account_email:
            instance.reason = "Worker auth enabled but no token or OIDC service account configured"
            return instance

        try:
            from google.cloud import tasks_v2  # type: ignore
        except Exception as exc:
            instance.reason = f"google-cloud-tasks unavailable: {exc}"
            return instance

        try:
            client = tasks_v2.CloudTasksClient()
            queue_path = client.queue_path(project_id, location, queue)
            instance._client = client
            instance._queue_path = queue_path
            instance.enabled = True
            instance.reason = "OK"
            return instance
        except Exception as exc:  # pragma: no cover
            instance.reason = f"Cloud Tasks init failed: {exc}"
            return instance

    def enqueue_job_run(self, job_id: str) -> dict[str, Any]:
        if not self.enabled or self._client is None or self._settings is None:
            return {"ok": False, "reason": self.reason}

        try:
            from google.api_core.exceptions import AlreadyExists  # type: ignore
            from google.cloud import tasks_v2  # type: ignore
        except Exception as exc:
            return {"ok": False, "reason": f"Cloud Tasks imports unavailable: {exc}"}

        run_url = self._build_run_url(job_id)
        headers = {
            "Content-Type": "application/json",
            "X-Job-ID": job_id,
            "X-Worker-Source": "cloud-tasks",
        }
        body = json.dumps({"job_id": job_id, "source": "cloud-tasks"}).encode("utf-8")

        http_request: dict[str, Any] = {
            "http_method": tasks_v2.HttpMethod.POST,
            "url": run_url,
            "headers": headers,
            "body": body,
        }

        if self._settings.worker_bearer_token:
            headers["Authorization"] = f"Bearer {self._settings.worker_bearer_token}"
        elif self._settings.cloud_tasks_service_account_email:
            audience = (self._settings.cloud_tasks_oidc_audience or "").strip() or run_url
            http_request["oidc_token"] = {
                "service_account_email": self._settings.cloud_tasks_service_account_email,
                "audience": audience,
            }

        task_name = f"{self._queue_path}/tasks/job-{job_id}"
        task = {"name": task_name, "http_request": http_request}

        try:
            created = self._client.create_task(request={"parent": self._queue_path, "task": task})
            return {"ok": True, "task_name": created.name, "url": run_url}
        except AlreadyExists:
            return {"ok": True, "task_name": task_name, "duplicate": True, "url": run_url}
        except Exception as exc:  # pragma: no cover
            return {"ok": False, "reason": str(exc), "url": run_url}

    def _build_run_url(self, job_id: str) -> str:
        template = (self._settings.cloud_tasks_run_endpoint or "").strip()
        if "{job_id}" in template:
            return template.replace("{job_id}", job_id)
        return f"{template.rstrip('/')}/{job_id}/run"
