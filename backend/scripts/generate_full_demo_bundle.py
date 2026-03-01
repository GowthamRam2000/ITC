#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


CSV_FIELDS = [
    "supplier_gstin",
    "supplier_name",
    "invoice_no",
    "invoice_date",
    "return_period",
    "taxable_value",
    "cgst",
    "sgst",
    "igst",
    "total_tax",
    "hsn_codes",
    "supplier_status",
    "linked_doc_id",
    "expected_mismatch_type",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a full demo dataset bundle for GST Intelligence UI + backend feature testing.",
    )
    parser.add_argument(
        "--out-dir",
        default="data/demo_full_v2",
        help="Output directory for the generated full demo bundle.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=20260301,
        help="Seed forwarded to cycle-data generation.",
    )
    parser.add_argument(
        "--cycles",
        type=int,
        default=3,
        help="Number of filing cycles to generate for intelligence testing.",
    )
    parser.add_argument(
        "--records-per-cycle",
        type=int,
        default=240,
        help="Invoice seed rows per generated cycle.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite output directory if it already exists.",
    )
    return parser.parse_args()


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as fp:
        for line in fp:
            line = line.strip()
            if not line:
                continue
            payload = json.loads(line)
            if isinstance(payload, dict):
                rows.append(payload)
    return rows


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fp:
        for row in rows:
            fp.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fp:
        writer = csv.DictWriter(fp, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for row in rows:
            normalized = {key: row.get(key) for key in CSV_FIELDS}
            hsn_codes = normalized.get("hsn_codes")
            if isinstance(hsn_codes, list):
                normalized["hsn_codes"] = ";".join(str(x) for x in hsn_codes)
            writer.writerow(normalized)


def ensure_out_dir(path: Path, force: bool) -> None:
    if path.exists():
        if not force:
            raise SystemExit(
                f"Output directory already exists: {path}\n"
                "Use --force to overwrite."
            )
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def build_hybrid_set(
    invoices: list[dict[str, Any]],
    gstr2b: list[dict[str, Any]],
    docs_dir: Path,
    output_root: Path,
) -> dict[str, Any]:
    selected_doc_ids = [
        "GSTINV-00001",
        "GSTINV-00013",
        "GSTINV-00020",
        "GSTINV-00063",
        "GSTINV-00106",
        "GSTINV-00229",
    ]
    invoice_map = {str(row.get("doc_id", "")).upper(): row for row in invoices}
    gstr_index = {
        (str(row.get("supplier_gstin", "")).upper(), str(row.get("invoice_no", "")).upper()): row
        for row in gstr2b
    }

    hybrid_invoices: list[dict[str, Any]] = []
    hybrid_gstr: list[dict[str, Any]] = []
    copied_docs: list[str] = []
    docs_out = output_root / "docs"
    docs_out.mkdir(parents=True, exist_ok=True)

    for doc_id in selected_doc_ids:
        inv = invoice_map.get(doc_id)
        if not inv:
            continue
        hybrid_invoices.append(inv)
        key = (
            str(inv.get("supplier_gstin", "")).upper(),
            str(inv.get("invoice_no", "")).upper(),
        )
        g_row = gstr_index.get(key)
        if g_row:
            hybrid_gstr.append(g_row)

        matches = sorted(docs_dir.glob(f"{doc_id}.*"))
        if matches:
            src = matches[0]
            dst = docs_out / src.name
            shutil.copy2(src, dst)
            copied_docs.append(dst.name)

    write_jsonl(output_root / "invoice_truth.jsonl", hybrid_invoices)
    write_jsonl(output_root / "gstr2b_truth.jsonl", hybrid_gstr)
    write_csv(output_root / "gstr2b_truth.csv", hybrid_gstr)

    return {
        "invoice_rows": len(hybrid_invoices),
        "gstr2b_rows": len(hybrid_gstr),
        "docs": copied_docs,
        "invoice_file": str((output_root / "invoice_truth.jsonl").resolve()),
        "gstr_jsonl_file": str((output_root / "gstr2b_truth.jsonl").resolve()),
        "gstr_csv_file": str((output_root / "gstr2b_truth.csv").resolve()),
        "docs_dir": str(docs_out.resolve()),
    }


def run_cycle_generation(
    project_root: Path,
    out_dir: Path,
    seed: int,
    cycles: int,
    records_per_cycle: int,
) -> None:
    script = project_root / "backend" / "scripts" / "generate_phase6_demo_data.py"
    base_invoices = project_root / "data" / "demo_v1" / "invoice_truth.jsonl"
    cmd = [
        sys.executable,
        str(script),
        "--base-invoices",
        str(base_invoices),
        "--out-dir",
        str(out_dir),
        "--seed",
        str(seed),
        "--cycles",
        str(cycles),
        "--records-per-cycle",
        str(records_per_cycle),
        "--start-year",
        "2026",
        "--start-month",
        "1",
    ]
    subprocess.run(cmd, check=True)


def write_readme(path: Path) -> None:
    content = """# GST Full Demo Bundle

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
"""
    path.write_text(content, encoding="utf-8")


def main() -> None:
    args = parse_args()
    project_root = Path(__file__).resolve().parents[2]
    demo_root = project_root / "data" / "demo_v1"

    invoice_src = demo_root / "invoice_truth.jsonl"
    gstr_jsonl_src = demo_root / "gstr2b_truth.jsonl"
    gstr_csv_src = demo_root / "gstr2b_truth.csv"
    docs_src = demo_root / "docs" / "synthetic"

    for required in [invoice_src, gstr_jsonl_src, gstr_csv_src, docs_src]:
        if not required.exists():
            raise SystemExit(f"Required source path missing: {required}")

    out_dir = Path(args.out_dir)
    if not out_dir.is_absolute():
        out_dir = (project_root / out_dir).resolve()
    ensure_out_dir(out_dir, args.force)

    upload_sets = out_dir / "upload_sets"
    baseline_dir = upload_sets / "01_baseline_json"
    hybrid_dir = upload_sets / "02_hybrid_docs"
    cycles_dir = upload_sets / "03_cycles"

    baseline_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(invoice_src, baseline_dir / "invoice_truth.jsonl")
    shutil.copy2(gstr_jsonl_src, baseline_dir / "gstr2b_truth.jsonl")
    shutil.copy2(gstr_csv_src, baseline_dir / "gstr2b_truth.csv")

    invoices = load_jsonl(invoice_src)
    gstr2b = load_jsonl(gstr_jsonl_src)
    hybrid_meta = build_hybrid_set(invoices, gstr2b, docs_src, hybrid_dir)

    run_cycle_generation(
        project_root=project_root,
        out_dir=cycles_dir,
        seed=args.seed,
        cycles=args.cycles,
        records_per_cycle=args.records_per_cycle,
    )

    prompts_file = out_dir / "sample_prompts.txt"
    prompts_file.write_text(
        "\n".join(
            [
                "What are top critical issues above ₹50000?",
                "What if supplier files pending invoices this month?",
                "Simulate ITC impact if GST rate mismatch is corrected for top 10 invoices.",
                "இந்த invoice-ல என்ன issue இருக்கு?",
                "इस जॉब के लिए action priority बताओ.",
            ]
        ),
        encoding="utf-8",
    )

    write_readme(out_dir / "README.md")

    manifest = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "seed": args.seed,
        "bundle_root": str(out_dir),
        "sets": {
            "baseline_json": {
                "invoice_file": str((baseline_dir / "invoice_truth.jsonl").resolve()),
                "gstr_jsonl_file": str((baseline_dir / "gstr2b_truth.jsonl").resolve()),
                "gstr_csv_file": str((baseline_dir / "gstr2b_truth.csv").resolve()),
            },
            "hybrid_docs": hybrid_meta,
            "cycles_root": str(cycles_dir.resolve()),
            "sample_prompts": str(prompts_file.resolve()),
        },
    }
    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Generated full demo bundle: {out_dir}")
    print(f"Manifest: {manifest_path}")
    print(f"README: {out_dir / 'README.md'}")
    print(f"Baseline upload set: {baseline_dir}")
    print(f"Hybrid upload set: {hybrid_dir}")
    print(f"Cycle upload sets: {cycles_dir}")


if __name__ == "__main__":
    main()
