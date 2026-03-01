# GST Intelligence Magic - YouTube Demo Script (Read + Do)

This is a ready-to-read script for recording your demo video.

## 0) Recording Setup (Do this before recording)

Use these exact files:

1. Baseline job files:
- `/Users/gowthamram/PycharmProjects/ITC/data/demo_full_v3/upload_sets/01_baseline_json/invoice_truth.jsonl`
- `/Users/gowthamram/PycharmProjects/ITC/data/demo_full_v3/upload_sets/01_baseline_json/gstr2b_truth.csv`

2. Hybrid OCR + visual audit job files:
- `/Users/gowthamram/PycharmProjects/ITC/data/demo_full_v3/upload_sets/02_hybrid_docs/docs/GSTINV-00001.jpg`
- `/Users/gowthamram/PycharmProjects/ITC/data/demo_full_v3/upload_sets/02_hybrid_docs/docs/GSTINV-00013.pdf`
- `/Users/gowthamram/PycharmProjects/ITC/data/demo_full_v3/upload_sets/02_hybrid_docs/docs/GSTINV-00020.jpg`
- `/Users/gowthamram/PycharmProjects/ITC/data/demo_full_v3/upload_sets/02_hybrid_docs/docs/GSTINV-00063.pdf`
- `/Users/gowthamram/PycharmProjects/ITC/data/demo_full_v3/upload_sets/02_hybrid_docs/docs/GSTINV-00106.jpg`
- `/Users/gowthamram/PycharmProjects/ITC/data/demo_full_v3/upload_sets/02_hybrid_docs/docs/GSTINV-00229.pdf`
- `/Users/gowthamram/PycharmProjects/ITC/data/demo_full_v3/upload_sets/02_hybrid_docs/invoice_truth.jsonl`
- `/Users/gowthamram/PycharmProjects/ITC/data/demo_full_v3/upload_sets/02_hybrid_docs/gstr2b_truth.csv`

3. Intelligence multi-cycle jobs:
- `/Users/gowthamram/PycharmProjects/ITC/data/demo_full_v3/upload_sets/03_cycles/cycle_01/invoice_truth.jsonl`
- `/Users/gowthamram/PycharmProjects/ITC/data/demo_full_v3/upload_sets/03_cycles/cycle_01/gstr2b_truth.jsonl`
- `/Users/gowthamram/PycharmProjects/ITC/data/demo_full_v3/upload_sets/03_cycles/cycle_02/invoice_truth.jsonl`
- `/Users/gowthamram/PycharmProjects/ITC/data/demo_full_v3/upload_sets/03_cycles/cycle_02/gstr2b_truth.jsonl`
- `/Users/gowthamram/PycharmProjects/ITC/data/demo_full_v3/upload_sets/03_cycles/cycle_03/invoice_truth.jsonl`
- `/Users/gowthamram/PycharmProjects/ITC/data/demo_full_v3/upload_sets/03_cycles/cycle_03/gstr2b_truth.jsonl`

Create these job names in UI:
- `FY26 Baseline`
- `FY26 Hybrid OCR`
- `FY26 Cycle 01`
- `FY26 Cycle 02`
- `FY26 Cycle 03`

Tip for recording: pre-run all five jobs so you don’t wait during the video.

---

## 1) Opening (0:00 - 0:40)

### On screen
- Open app dashboard.

### Say this
“Hi everyone, I’m Gowtham Ram M. This is **GST Intelligence Magic**, built for the Mistral Worldwide Hackathon.
This product solves three major GST pain points for Indian businesses and CAs:
1) Input Tax Credit mismatches,
2) HSN/SAC coding errors,
3) Manual GSTR-2B reconciliation effort.”

---

## 2) Tech Relevance for India (0:40 - 1:20)

### On screen
- Briefly show About page architecture section.

### Say this
“This stack is optimized for India’s compliance reality:
- OCR and parsing for image, PDF, and JSON invoice inputs.
- Rule-aware reconciliation against GSTR-2B.
- Multilingual workflows in English, Hindi, and Tamil voice/text.
- Cloud-native deployment on GCP for reliability and scale.
So this is not generic AI chat, it is GST workflow intelligence.”

---

## 3) Dashboard Flow - Baseline Job (1:20 - 3:00)

### On screen (actions)
1. Go to Dashboard upload.
2. Upload:
   - `.../01_baseline_json/invoice_truth.jsonl`
   - `.../01_baseline_json/gstr2b_truth.csv`
3. Set job name: `FY26 Baseline`.
4. Start reconciliation.
5. Open Job Status.
6. Show pipeline stages and completion.
7. Open Results.

### Say this
“First, I’ll run a baseline reconciliation using invoice ledger and GSTR-2B.
As soon as I submit, you can see live stages: parsing, extraction, reconciliation, and final risk scoring.
The output gives me total invoices, matched percentage, critical vs warning counts, and total ITC at risk.
For a CA, this means immediate prioritization. For an SMB owner, this means clear financial risk visibility.”

### What to verify on screen
- Non-zero issues in summary.
- Issue table has GST issue types like `missing_in_2b`, `rate_mismatch`, `period_mismatch`, `hsn_mismatch`.
- Suggested action column is readable.

---

## 4) Copilot + Scenario Sandbox + Voice (3:00 - 5:00)

### On screen (actions)
Open floating Intelligence Copilot and run:

1. Normal query:
- `What are top critical issues above ₹50000?`

2. Simulator mode ON:
- `What if supplier files pending invoices this month?`
- `Simulate ITC impact if GST rate mismatch is corrected for top 10 invoices.`

3. Voice (English):
- Click “Ask with voice” and speak:
  `What are the top issues in this invoice?`

4. Voice (Hindi):
- Speak:
  `इस जॉब में सबसे ज्यादा ITC risk कहाँ है?`

5. Voice (Tamil):
- Speak:
  `இந்த invoice-ல என்ன issue இருக்கு?`

### Say this
“The copilot supports factual Q&A plus a sandbox mode for what-if simulation.
This is useful before filing, because teams can estimate the financial impact of corrective actions.
Voice input makes this practical for non-technical operators.
The system supports English, Hindi, and Tamil interactions for real Indian team workflows.”

### What to verify on screen
- Chat answers include concrete issue references.
- Simulator response includes implication-style output.
- Voice transcript and answer language match selected/auto mode.
- TTS narration speaks with Indian-number style where available.

---

## 5) AI Auditor + Document Proof (5:00 - 6:40)

### On screen (actions)
1. Create/open job `FY26 Hybrid OCR`.
2. Upload hybrid set (6 docs + invoice_truth.jsonl + gstr2b_truth.csv from section 0).
3. Run job and open Results.
4. Click an issue/invoice row to open document preview/workbench.
5. Show:
   - original invoice image/PDF preview,
   - OCR text/parsed fields,
   - audit flags and mismatch evidence,
   - recommended action.

### Say this
“Now I’m showing AI Auditor mode with document-level spot checks.
When I click an invoice, I can see source proof plus extracted fields and risk explanation in one place.
This reduces trust gaps during audit review because the recommendation is linked to evidence.”

### What to verify on screen
- Invoice drawer/viewer opens.
- Original document preview appears (or OCR fallback if source is unavailable).
- Audit/mismatch context is visible.

---

## 6) Intelligence Workspace - Portfolio to Action (6:40 - 9:20)

### On screen (actions)
1. Open `GST Action Workspace`.
2. In Job Context selector, pick `FY26 Cycle 03`.
3. Toggle `Data Scope`:
   - `All Jobs`
   - `Selected Job`
4. Show all 4 tabs:
   - Portfolio Pulse
   - Return Readiness
   - Fraud & Risk Triage
   - Action Inbox & Evidence

### Say this
“This workspace is designed as an action cockpit, not just charts.
I can switch between All Jobs and Selected Job scope, so leadership gets portfolio view while analysts get cycle-specific focus.”

#### 6A) Portfolio Pulse
### On screen
- Portfolio Overview table, Supplier Watchlist, Change Since Last Filing.

### Say this
“Portfolio Pulse shows entity-level ITC risk and supplier watchlist so teams can prioritize follow-ups by money impact.”

#### 6B) Return Readiness
### On screen
- GSTR-3B Sanity, HSN Correction Suggestions, Circular Impact Summary.

### Say this
“Return Readiness translates raw mismatches into filing readiness. It highlights blocked ITC, HSN correction candidates, and circular impacts.”

#### 6C) Fraud & Risk Triage
### On screen
- Anomaly Detector and Cash-flow Impact Simulator.

### Say this
“Risk Triage helps catch duplicate or suspicious patterns and quantifies working-capital stress from blocked ITC.
This helps SMB owners understand not just compliance risk, but cash-flow impact.”

#### 6D) Action Inbox & Evidence
### On screen
- Role-based action inbox and evidence pack card.
- Click Narrate.

### Say this
“Operations tab converts analytics into owner-wise tasks with due timelines.
Evidence narration can be played for manager review and audit handoff.”

### What to verify on screen
- Scope toggle changes context labels and, for scoped modules, dataset behavior.
- Narration voice dropdown works (English/Hindi/Tamil).
- Evidence narration references active context.

---

## 7) Export + Closure (9:20 - 10:00)

### On screen (actions)
1. Return to Results page for any completed job.
2. Click Export Report.
3. Download/open generated report.

### Say this
“Finally, I can export audit-ready output for stakeholder review.
So this product covers the full lifecycle: ingestion, reconciliation, risk triage, multilingual copilot, and evidence-driven actioning.”

---

## 8) Business Value Close (10:00 - 10:40)

### Say this
“For Indian SMBs, this reduces ITC leakage, filing rework, and compliance uncertainty.
For CAs, this reduces manual reconciliation time and improves team coordination with clear action queues.
And because it is cloud-native with modular model routing, it is production-ready to scale across multiple clients and GSTIN portfolios.”

“This is GST Intelligence Magic. Thank you.”

---

## 9) Quick Troubleshooting During Recording

1. If `Selected Job` looks empty:
- Ensure the selected job status is `COMPLETED`.

2. If visual invoice preview is missing:
- Use the Hybrid OCR job and upload document files along with truth files.

3. If voice output language is unexpected:
- Set narration voice explicitly to English/Hindi/Tamil before playback.

4. If All Jobs and Selected Job look similar in one panel:
- Some cards are portfolio/global by design; verify scoped cards like watchlist/inbox/readiness.

5. If a table says no rows:
- Use this as part of explanation: “No findings in this cycle is also a useful compliance signal.”

---

## 10) Optional Intro line for YouTube Description

“GST Intelligence Magic is an AI-powered GST reconciliation and risk copilot for Indian SMBs and CAs. It combines OCR, reconciliation, multilingual chat/voice, audit evidence, and action workflows using Mistral models, ElevenLabs narration, and GCP deployment.”
