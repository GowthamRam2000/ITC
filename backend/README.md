# Backend Setup

## 1) Bootstrap
```bash
cd /Users/gowthamram/PycharmProjects/ITC
chmod +x /Users/gowthamram/PycharmProjects/ITC/backend/scripts/bootstrap.sh
/Users/gowthamram/PycharmProjects/ITC/backend/scripts/bootstrap.sh
```

## 2) Configure environment
Edit `/Users/gowthamram/PycharmProjects/ITC/backend/.env`:
- Add your `MISTRAL_API_KEY`
- Add `GCP_PROJECT_ID` and `FIREBASE_PROJECT_ID`
- Set `GOOGLE_APPLICATION_CREDENTIALS` to your Firebase/GCP service account JSON path
- Set `GCS_UPLOAD_BUCKET` and `GCS_EXPORT_BUCKET`
- Set `MISTRAL_ENABLE_DOC_AI=true` to parse images/PDFs via Mistral OCR + Ministral/Large routing
- Set `MISTRAL_ENABLE_CHAT=true` to answer chat using Mistral Large on reconciliation context
- Set `ELEVENLABS_ENABLE_TTS=true` and configure `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID_EN/HI/TA` for spoken answers
- Set `JOB_RUNNER_MODE=local` for local async processing, or `JOB_RUNNER_MODE=worker` for queue/worker mode
- Set `FIRESTORE_JOBS_COLLECTION=jobs` (or your preferred collection)
- Set `WORKER_AUTH_ENABLED=true` and `WORKER_BEARER_TOKEN=<long-secret>` to secure worker trigger endpoint
- For Cloud Tasks auto-dispatch in worker mode, set:
- `CLOUD_TASKS_ENABLED=true`
- `CLOUD_TASKS_PROJECT_ID`
- `CLOUD_TASKS_LOCATION`
- `CLOUD_TASKS_QUEUE`
- `CLOUD_TASKS_RUN_ENDPOINT` (example: `https://<api>/v1/jobs/{job_id}/run`)
- Optional: `CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL` + `CLOUD_TASKS_OIDC_AUDIENCE`

## 3) Validate services
```bash
cd /Users/gowthamram/PycharmProjects/ITC
source /Users/gowthamram/PycharmProjects/ITC/.venv/bin/activate
python /Users/gowthamram/PycharmProjects/ITC/backend/scripts/check_services.py \
  --env-file /Users/gowthamram/PycharmProjects/ITC/backend/.env \
  --strict
```

## 4) Start backend
```bash
cd /Users/gowthamram/PycharmProjects/ITC
source /Users/gowthamram/PycharmProjects/ITC/.venv/bin/activate
uvicorn app.main:app --app-dir /Users/gowthamram/PycharmProjects/ITC/backend --reload --host 0.0.0.0 --port 8000
```

## 5) Smoke test
```bash
curl http://127.0.0.1:8000/v1/healthz
curl http://127.0.0.1:8000/v1/config/models
```
`/v1/config/models` now includes:
- Firestore persistence status
- GCS artifact store status
- Runner mode (`local` or `worker`)
- Cloud Tasks dispatcher status

## 6) Run a reconciliation job with generated data
```bash
curl -X POST "http://127.0.0.1:8000/v1/jobs" \
  -F "files=@/Users/gowthamram/PycharmProjects/ITC/data/demo_v1/invoice_truth.jsonl" \
  -F "files=@/Users/gowthamram/PycharmProjects/ITC/data/demo_v1/gstr2b_truth.jsonl"
```

Use returned `job_id`:
```bash
curl "http://127.0.0.1:8000/v1/jobs/<job_id>"
curl "http://127.0.0.1:8000/v1/jobs/<job_id>/results"
curl -N "http://127.0.0.1:8000/v1/jobs/<job_id>/events"
```

Chat query:
```bash
curl -X POST "http://127.0.0.1:8000/v1/chat" \
  -H "Content-Type: application/json" \
  -d '{"job_id":"<job_id>","question":"show invoices above ₹50000 risk","language":"en"}'
```

## 7) Voice transcription (Voxtral)
```bash
curl -X POST "http://127.0.0.1:8000/v1/voice/transcribe?language=en" \
  -F "file=@/absolute/path/to/query.wav"
```

## 8) Voice synthesis (ElevenLabs TTS)
```bash
curl -X POST "http://127.0.0.1:8000/v1/voice/speak" \
  -H "Content-Type: application/json" \
  -d '{"text":"Total ITC at risk is INR 9556.18","language":"en","response_style":"plain"}' \
  --output /tmp/itc-answer.mp3
```

## 9) Real doc processing flow (image/PDF upload)
With `MISTRAL_ENABLE_DOC_AI=true`, upload invoice/GSTR files directly:
```bash
curl -X POST "http://127.0.0.1:8000/v1/jobs" \
  -F "files=@/absolute/path/to/invoice_scan_1.jpg" \
  -F "files=@/absolute/path/to/gstr2b_feb_2026.pdf"
```

## 10) Worker/queue-style execution mode
If `JOB_RUNNER_MODE=worker`, `POST /v1/jobs` only creates a queued job.
With `CLOUD_TASKS_ENABLED=true`, the API auto-enqueues a Cloud Task for each job.

Manual trigger (if needed):
```bash
curl -X POST "http://127.0.0.1:8000/v1/jobs/<job_id>/run" \
  -H "Authorization: Bearer <WORKER_BEARER_TOKEN>"
```

Idempotency behavior:
- Duplicate run triggers while job is already running are ignored safely.
- Completed/failed jobs are not re-run.
