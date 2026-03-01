# GST Full Demo Bundle

This folder is generated for end-to-end demo and UI validation.

## Upload Sets

1. `upload_sets/01_baseline_json`
   - Fast baseline run for reconciliation + chat + export.
2. `upload_sets/02_hybrid_docs`
   - Includes source image/pdf invoices + matching JSONL/CSV for invoice preview and AI auditor overlays.
3. `upload_sets/03_cycles`
   - Multi-cycle files for Portfolio / Compliance / Risk / Operations views.

## Suggested Demo Flow

1. Upload `01_baseline_json` and run a job named `FY26 Baseline`.
2. Upload `02_hybrid_docs` files (all docs + invoice_truth.jsonl + gstr2b_truth.csv) and run `FY26 Hybrid OCR`.
3. Upload each cycle from `03_cycles/cycle_01..03` as `FY26 Cycle 01..03`.
4. Open `/app/intelligence/*` and select scope:
   - `All Jobs` for portfolio/watchlist trend.
   - `Selected Job` for readiness/anomaly/evidence drilldown.

## Voice + Sandbox Checks

Use these prompts in chat/voice:
- `What if supplier files pending invoices this month?`
- `Simulate ITC impact if 30% critical invoices are corrected`
- `இந்த இன்பாய்ஸ்ல முக்கிய பிரச்சனை என்ன?`
- `इस जॉब में सबसे ज्यादा ITC risk कहाँ है?`
