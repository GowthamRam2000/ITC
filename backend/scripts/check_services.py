#!/usr/bin/env python3
import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.parse
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


@dataclass
class CheckResult:
    name: str
    ok: bool
    detail: str


def run_command(cmd: list[str]) -> tuple[bool, str]:
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    except FileNotFoundError:
        return False, f"Not installed: {' '.join(cmd)}"
    out = (proc.stdout or proc.stderr).strip().splitlines()
    if proc.returncode == 0:
        return True, out[0] if out else "OK"
    return False, out[0] if out else f"Failed with exit code {proc.returncode}"


def check_env_vars(required: Iterable[str]) -> CheckResult:
    missing = []
    for key in required:
        value = (os.getenv(key) or "").strip()
        if not value:
            missing.append(key)
            continue
        lowered = value.lower()
        if "replace_with" in lowered or lowered.startswith("/absolute/path/to/"):
            missing.append(key)
    if missing:
        return CheckResult(
            name="Environment Variables",
            ok=False,
            detail=f"Missing: {', '.join(missing)}",
        )
    return CheckResult("Environment Variables", True, "Required variables are set")


def check_credentials_file() -> CheckResult:
    creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    if not creds_path:
        return CheckResult("GCP Credentials File", False, "GOOGLE_APPLICATION_CREDENTIALS not set")
    path = Path(creds_path)
    if not path.exists():
        return CheckResult("GCP Credentials File", False, f"File not found: {creds_path}")
    return CheckResult("GCP Credentials File", True, f"Found: {creds_path}")


def check_mistral() -> CheckResult:
    api_key = os.getenv("MISTRAL_API_KEY", "").strip()
    if not api_key:
        return CheckResult("Mistral API", False, "MISTRAL_API_KEY not set")

    base = os.getenv("MISTRAL_BASE_URL", "https://api.mistral.ai").rstrip("/")
    url = f"{base}/v1/models"
    headers = {"Authorization": f"Bearer {api_key}", "Accept": "application/json"}

    try:
        req = urllib.request.Request(url, headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=20) as resp:
            status = resp.status
            body = resp.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        return CheckResult("Mistral API", False, f"HTTP {exc.code}: {detail[:140]}")
    except Exception as exc:
        return CheckResult("Mistral API", False, f"Request failed: {exc}")

    if status != 200:
        return CheckResult("Mistral API", False, f"HTTP {status}: {body[:140].decode('utf-8', errors='ignore')}")

    payload = json.loads(body.decode("utf-8"))
    data = payload.get("data", [])
    model_ids = {m.get("id", "") for m in data if isinstance(m, dict)}

    must_have_prefixes = [
        "mistral-large",
        "ministral-3b",
        "ministral-8b",
        "voxtral",
    ]
    present_prefixes = [p for p in must_have_prefixes if any(mid.startswith(p) for mid in model_ids)]
    return CheckResult(
        "Mistral API",
        True,
        f"Reachable. {len(model_ids)} models visible. Found families: {', '.join(present_prefixes) or 'none detected'}",
    )


def check_elevenlabs() -> CheckResult:
    tts_enabled = (os.getenv("ELEVENLABS_ENABLE_TTS", "false").strip().lower() in {"1", "true", "yes"})
    stt_enabled = (os.getenv("ELEVENLABS_ENABLE_STT", "false").strip().lower() in {"1", "true", "yes"})
    if not tts_enabled and not stt_enabled:
        return CheckResult("ElevenLabs API", True, "Disabled (ELEVENLABS_ENABLE_TTS=false, ELEVENLABS_ENABLE_STT=false)")

    api_key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    if not api_key:
        return CheckResult("ElevenLabs API", False, "ELEVENLABS_API_KEY not set")

    base = os.getenv("ELEVENLABS_BASE_URL", "https://api.elevenlabs.io").rstrip("/")
    models_url = f"{base}/v1/models"
    voices_url = f"{base}/v1/voices"
    headers = {"xi-api-key": api_key, "Accept": "application/json"}

    try:
        req = urllib.request.Request(models_url, headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=20) as resp:
            status = resp.status
            body = resp.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        return CheckResult("ElevenLabs API", False, f"Models HTTP {exc.code}: {detail[:140]}")
    except Exception as exc:
        return CheckResult("ElevenLabs API", False, f"Models request failed: {exc}")

    if status != 200:
        return CheckResult("ElevenLabs API", False, f"Models HTTP {status}")

    try:
        models_payload = json.loads(body.decode("utf-8"))
    except Exception:
        models_payload = []

    model_ids = []
    if isinstance(models_payload, list):
        model_ids = [str(m.get("model_id")) for m in models_payload if isinstance(m, dict) and m.get("model_id")]
    elif isinstance(models_payload, dict) and isinstance(models_payload.get("models"), list):
        model_ids = [str(m.get("model_id")) for m in models_payload["models"] if isinstance(m, dict) and m.get("model_id")]

    if stt_enabled:
        requested_stt_model = (os.getenv("ELEVENLABS_STT_MODEL") or "scribe_v1").strip() or "scribe_v1"
        allowed_stt_models = {"scribe_v1", "scribe_v2"}
        if requested_stt_model not in allowed_stt_models:
            return CheckResult(
                "ElevenLabs API",
                False,
                f"Unsupported STT model configured: {requested_stt_model}. Use one of: {', '.join(sorted(allowed_stt_models))}",
            )

        # STT models are not always listed in /v1/models for all accounts.
        # Probe /v1/speech-to-text endpoint to validate permissions/configuration.
        stt_url = f"{base}/v1/speech-to-text"
        stt_headers = {
            "xi-api-key": api_key,
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        stt_payload = urllib.parse.urlencode({"model_id": requested_stt_model}).encode("utf-8")
        try:
            req = urllib.request.Request(stt_url, headers=stt_headers, data=stt_payload, method="POST")
            with urllib.request.urlopen(req, timeout=20) as resp:
                stt_status = resp.status
                _ = resp.read()
            if stt_status >= 400:
                return CheckResult("ElevenLabs API", False, f"STT probe failed with HTTP {stt_status}")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="ignore")
            # 400/422 for missing file is acceptable for probe and confirms endpoint/auth path is reachable.
            if exc.code in {400, 422} and "missing_permissions" not in body.lower():
                pass
            else:
                return CheckResult("ElevenLabs API", False, f"STT probe HTTP {exc.code}: {body[:180]}")
        except Exception as exc:
            return CheckResult("ElevenLabs API", False, f"STT probe failed: {exc}")

    voice_ids = {
        "en": (os.getenv("ELEVENLABS_VOICE_ID_EN") or "").strip(),
        "hi": (os.getenv("ELEVENLABS_VOICE_ID_HI") or "").strip(),
        "ta": (os.getenv("ELEVENLABS_VOICE_ID_TA") or "").strip(),
    }
    configured_voice_ids = {v for v in voice_ids.values() if v}

    if tts_enabled and configured_voice_ids:
        try:
            req = urllib.request.Request(voices_url, headers=headers, method="GET")
            with urllib.request.urlopen(req, timeout=20) as resp:
                voices_status = resp.status
                voices_body = resp.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            return CheckResult("ElevenLabs API", False, f"Voices HTTP {exc.code}: {detail[:140]}")
        except Exception as exc:
            return CheckResult("ElevenLabs API", False, f"Voices request failed: {exc}")

        if voices_status != 200:
            return CheckResult("ElevenLabs API", False, f"Voices HTTP {voices_status}")

        try:
            voices_payload = json.loads(voices_body.decode("utf-8"))
        except Exception:
            voices_payload = {}

        voices = voices_payload.get("voices", []) if isinstance(voices_payload, dict) else []
        available_voice_ids = {str(v.get("voice_id")) for v in voices if isinstance(v, dict) and v.get("voice_id")}
        missing = sorted([voice_id for voice_id in configured_voice_ids if voice_id not in available_voice_ids])
        if missing:
            return CheckResult("ElevenLabs API", False, f"Configured voice IDs not found: {', '.join(missing)}")

    return CheckResult(
        "ElevenLabs API",
        True,
        (
            f"Reachable. models={len(model_ids)} "
            f"tts_enabled={tts_enabled} stt_enabled={stt_enabled} "
            f"voice_ids_configured={len(configured_voice_ids)}"
        ),
    )


def check_gcloud_cli() -> CheckResult:
    if shutil.which("gcloud") is None:
        return CheckResult("gcloud CLI", False, "Not installed")
    ok, out = run_command(["gcloud", "--version"])
    return CheckResult("gcloud CLI", ok, out)


def check_firebase_cli() -> CheckResult:
    if shutil.which("firebase") is None:
        return CheckResult("Firebase CLI", False, "Not installed")
    ok, out = run_command(["firebase", "--version"])
    if ok:
        return CheckResult("Firebase CLI", True, out)
    if out and any(ch.isdigit() for ch in out):
        return CheckResult("Firebase CLI", True, f"Detected version output: {out}")
    return CheckResult("Firebase CLI", False, out)


def check_google_auth_default() -> CheckResult:
    try:
        import google.auth

        creds, project = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        account = getattr(creds, "service_account_email", "default-credentials")
        effective_project = os.getenv("GCP_PROJECT_ID") or project or "unknown"
        return CheckResult("Google Auth", True, f"Authenticated as {account} | project={effective_project}")
    except Exception as exc:  # pragma: no cover
        return CheckResult("Google Auth", False, f"Auth failure: {exc}")


def check_firestore() -> CheckResult:
    project = os.getenv("FIREBASE_PROJECT_ID") or os.getenv("GCP_PROJECT_ID")
    if not project:
        return CheckResult("Firestore", False, "FIREBASE_PROJECT_ID/GCP_PROJECT_ID missing")
    try:
        from google.cloud import firestore

        db = firestore.Client(project=project)
        _ = list(db.collections())
        return CheckResult("Firestore", True, f"Connected to project {project}")
    except Exception as exc:  # pragma: no cover
        return CheckResult("Firestore", False, f"Connection failure: {exc}")


def check_gcs() -> CheckResult:
    project = os.getenv("GCP_PROJECT_ID")
    if not project:
        return CheckResult("Cloud Storage", False, "GCP_PROJECT_ID missing")
    try:
        from google.cloud import storage

        client = storage.Client(project=project)
        bucket_name = os.getenv("GCS_UPLOAD_BUCKET", "").strip()
        if not bucket_name:
            _ = list(client.list_buckets(page_size=1))
            return CheckResult("Cloud Storage", True, f"Client connected to project {project}")
        bucket = client.bucket(bucket_name)
        exists = bucket.exists()
        if exists:
            return CheckResult("Cloud Storage", True, f"Bucket reachable: {bucket_name}")
        return CheckResult("Cloud Storage", False, f"Bucket not found or no access: {bucket_name}")
    except Exception as exc:  # pragma: no cover
        return CheckResult("Cloud Storage", False, f"Connection failure: {exc}")


def check_firebase_admin() -> CheckResult:
    project = os.getenv("FIREBASE_PROJECT_ID") or os.getenv("GCP_PROJECT_ID")
    if not project:
        return CheckResult("Firebase Admin SDK", False, "FIREBASE_PROJECT_ID/GCP_PROJECT_ID missing")

    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
    except Exception as exc:  # pragma: no cover
        return CheckResult("Firebase Admin SDK", False, f"SDK import failure: {exc}")

    try:
        if not firebase_admin._apps:
            creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
            if creds_path and Path(creds_path).exists():
                firebase_admin.initialize_app(
                    credentials.Certificate(creds_path),
                    {"projectId": project},
                )
            else:
                firebase_admin.initialize_app(options={"projectId": project})
        db = firestore.client()
        _ = list(db.collections())
        return CheckResult("Firebase Admin SDK", True, f"Connected to project {project}")
    except Exception as exc:  # pragma: no cover
        return CheckResult("Firebase Admin SDK", False, f"Connection failure: {exc}")


def check_cloud_tasks() -> CheckResult:
    enabled = (os.getenv("CLOUD_TASKS_ENABLED", "false").strip().lower() in {"1", "true", "yes"})
    if not enabled:
        return CheckResult("Cloud Tasks", True, "Disabled (CLOUD_TASKS_ENABLED=false)")

    project = (os.getenv("CLOUD_TASKS_PROJECT_ID") or os.getenv("GCP_PROJECT_ID") or "").strip()
    location = (os.getenv("CLOUD_TASKS_LOCATION") or os.getenv("GCP_REGION") or "").strip()
    queue = (os.getenv("CLOUD_TASKS_QUEUE") or "").strip()
    endpoint = (os.getenv("CLOUD_TASKS_RUN_ENDPOINT") or "").strip()
    if not project or not location or not queue or not endpoint:
        return CheckResult(
            "Cloud Tasks",
            False,
            "Missing CLOUD_TASKS_PROJECT_ID/CLOUD_TASKS_LOCATION/CLOUD_TASKS_QUEUE/CLOUD_TASKS_RUN_ENDPOINT",
        )

    try:
        from google.cloud import tasks_v2

        client = tasks_v2.CloudTasksClient()
        queue_path = client.queue_path(project, location, queue)
        _ = client.get_queue(name=queue_path)
        return CheckResult("Cloud Tasks", True, f"Queue reachable: {queue_path}")
    except Exception as exc:  # pragma: no cover
        return CheckResult("Cloud Tasks", False, f"Connection failure: {exc}")


def check_worker_auth_config() -> CheckResult:
    runner_mode = (os.getenv("JOB_RUNNER_MODE", "local").strip().lower() or "local")
    auth_enabled = os.getenv("WORKER_AUTH_ENABLED", "true").strip().lower() in {"1", "true", "yes"}
    token = (os.getenv("WORKER_BEARER_TOKEN") or "").strip()
    oidc_sa = (os.getenv("CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL") or "").strip()
    oidc_aud = (os.getenv("CLOUD_TASKS_OIDC_AUDIENCE") or "").strip()
    if runner_mode != "worker":
        return CheckResult("Worker Auth Config", True, "Not required in local runner mode")
    if not auth_enabled:
        return CheckResult("Worker Auth Config", False, "WORKER_AUTH_ENABLED=false (insecure for worker mode)")
    if token:
        return CheckResult("Worker Auth Config", True, "Using shared bearer token auth")
    if oidc_sa and oidc_aud:
        return CheckResult("Worker Auth Config", True, "Using OIDC auth via Cloud Tasks service account")
    return CheckResult(
        "Worker Auth Config",
        False,
        "Configure WORKER_BEARER_TOKEN or CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL + CLOUD_TASKS_OIDC_AUDIENCE",
    )


def print_results(results: list[CheckResult]) -> int:
    failed = 0
    for r in results:
        status = "PASS" if r.ok else "FAIL"
        print(f"[{status}] {r.name}: {r.detail}")
        if not r.ok:
            failed += 1
    print("-" * 72)
    print(f"Total checks: {len(results)} | Passed: {len(results) - failed} | Failed: {failed}")
    return failed


def load_env_file(path: Path) -> None:
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate local environment and cloud service connectivity.")
    parser.add_argument("--env-file", default="backend/.env", help="Path to .env file")
    parser.add_argument("--strict", action="store_true", help="Return non-zero if any check fails")
    args = parser.parse_args()

    env_file = Path(args.env_file)
    if env_file.exists():
        load_env_file(env_file)
    else:
        print(f"[WARN] Env file not found: {env_file}. Falling back to process env.")

    checks = [
        check_env_vars(
            [
                "MISTRAL_API_KEY",
                "GCP_PROJECT_ID",
                "FIREBASE_PROJECT_ID",
                "GOOGLE_APPLICATION_CREDENTIALS",
            ]
        ),
        check_credentials_file(),
        check_gcloud_cli(),
        check_firebase_cli(),
        check_mistral(),
        check_elevenlabs(),
        check_google_auth_default(),
        check_firestore(),
        check_gcs(),
        check_firebase_admin(),
        check_cloud_tasks(),
        check_worker_auth_config(),
    ]

    failed = print_results(checks)
    if args.strict and failed:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
