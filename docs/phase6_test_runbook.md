# Phase 6 Test Runbook

## 1) Generate Phase 6 demo data

```bash
cd /Users/gowthamram/PycharmProjects/ITC
python backend/scripts/generate_phase6_demo_data.py \
  --out-dir data/phase6_v1 \
  --cycles 3 \
  --records-per-cycle 180
```

This creates:
- `data/phase6_v1/cycle_01/invoice_truth.jsonl`
- `data/phase6_v1/cycle_01/gstr2b_truth.jsonl`
- `data/phase6_v1/cycle_01/gstr2b_truth.csv`
- same for `cycle_02`, `cycle_03`
- `data/phase6_v1/phase6_manifest.json`

## 2) Run API and frontend

Backend:

```bash
cd /Users/gowthamram/PycharmProjects/ITC/backend
source /Users/gowthamram/PycharmProjects/ITC/.venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd /Users/gowthamram/PycharmProjects/ITC/frontend
npm run dev
```

## 3) Create 3 completed jobs (for delta/portfolio/SLA/inbox)

```bash
API="http://127.0.0.1:8000"
TOKEN=$(grep '^WORKER_BEARER_TOKEN=' /Users/gowthamram/PycharmProjects/ITC/backend/.env | cut -d= -f2- | tr -d '"' | tr -d "'")

for CYCLE in 01 02 03; do
  JOB_ID=$(curl -s -X POST "$API/v1/jobs" \
    -F "files=@/Users/gowthamram/PycharmProjects/ITC/data/phase6_v1/cycle_${CYCLE}/invoice_truth.jsonl" \
    -F "files=@/Users/gowthamram/PycharmProjects/ITC/data/phase6_v1/cycle_${CYCLE}/gstr2b_truth.jsonl" \
    | python -c 'import sys,json; print(json.load(sys.stdin)["job_id"])')

  echo "Cycle ${CYCLE} -> JOB_ID=${JOB_ID}"

  curl -s -X POST "$API/v1/jobs/$JOB_ID/run" \
    -H "Authorization: Bearer $TOKEN" >/dev/null

  curl -N "$API/v1/jobs/$JOB_ID/events"
done
```

Wait until each job reaches `COMPLETED`.

## 4) Open Intelligence UI

- Login to frontend.
- Go to `/app/intelligence/portfolio` from left nav (`Intelligence`).
- Select narration voice (`English`, `Hindi`, `Tamil`).
- Select latest completed job in Job Context.

## 5) Validate narration features

1. Play **Morning Risk Brief**.
2. Play **GSTR-3B Sanity** narration.
3. Play **Anomaly Highlights** narration.
4. Play **Evidence Pack** narration.
5. Change voice dropdown EN -> HI -> TA and replay each narration.

## 6) Validate quick wins / Phase 6 panels

1. **GSTIN watchlist**: table loads with risk badges.
2. **HSN correction suggestions**: suggestions show confidence values.
3. **Delta digest**: `current_job_id`, `previous_job_id`, and deltas visible.
4. **Role-based inbox**: switch `CA Manager` / `Ops Team` and task list updates.
5. **Cash-flow simulator**: slider changes financing outputs.
6. **Circular impact**: relevant circulars list appears.
7. **SLA analytics**: supplier score table loads.
8. **Portfolio dashboard**: multi-entity table loads.
9. **GSTR-3B sanity checker**: exception alerts appear.
10. **Anomaly triage queue**: anomalies list appears.
11. **Evidence pack**: action list appears.

## 7) API spot checks (optional)

```bash
API="http://127.0.0.1:8000"
JOB_ID="<any-completed-job-id>"

curl "$API/v1/phase6/voices/narration"
curl "$API/v1/phase6/portfolio/overview"
curl "$API/v1/phase6/watchlist"
curl "$API/v1/phase6/delta-digest"
curl "$API/v1/phase6/inbox?role=manager"
curl "$API/v1/phase6/sla-analytics"

curl "$API/v1/phase6/evidence-pack/$JOB_ID"
curl "$API/v1/phase6/gstr3b-sanity/$JOB_ID"
curl "$API/v1/phase6/anomalies/$JOB_ID"
curl "$API/v1/phase6/hsn-suggestions/$JOB_ID"
curl "$API/v1/phase6/cashflow/$JOB_ID?annual_interest_pct=14"
curl "$API/v1/phase6/circular-impact/$JOB_ID"
```

## 8) Voice synthesis check (manual)

```bash
curl -X POST "$API/v1/voice/speak" \
  -H "Content-Type: application/json" \
  -d '{"text":"Morning risk brief generated.","language":"ta","segment_type":"summary"}' \
  --output /tmp/phase6-ta.mp3
```

Open `/tmp/phase6-ta.mp3` to verify playback.
