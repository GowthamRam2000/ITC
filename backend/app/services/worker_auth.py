from __future__ import annotations

import hmac
from typing import Any

from fastapi import HTTPException, Request


def validate_worker_request(request: Request, settings: Any) -> None:
    """
    Validate worker-triggered calls to /v1/jobs/{job_id}/run in worker mode.
    Accepted auth methods:
    1) Shared bearer token via WORKER_BEARER_TOKEN
    2) Google OIDC token (when CLOUD_TASKS_OIDC_AUDIENCE is configured)
    """
    if settings.job_runner_mode.lower() != "worker":
        return
    if not settings.worker_auth_enabled:
        return

    auth_header = request.headers.get("authorization", "")
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token for worker trigger.")

    token = auth_header.split(" ", 1)[1].strip().strip('"').strip("'")
    if not token:
        raise HTTPException(status_code=401, detail="Empty bearer token for worker trigger.")

    configured_token = (settings.worker_bearer_token or "").strip().strip('"').strip("'")
    if configured_token and hmac.compare_digest(token, configured_token):
        return

    audience = (settings.cloud_tasks_oidc_audience or "").strip()
    if audience:
        try:
            from google.auth.transport import requests as google_requests  # type: ignore
            from google.oauth2 import id_token  # type: ignore

            id_token.verify_oauth2_token(token, google_requests.Request(), audience=audience)
            return
        except Exception:
            pass

    raise HTTPException(status_code=401, detail="Unauthorized worker trigger token.")
