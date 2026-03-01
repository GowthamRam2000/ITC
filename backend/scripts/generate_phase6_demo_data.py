#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import random
from copy import deepcopy
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any

DEFAULT_ENTITY_GSTINS = [
    '29AAACD1234F1Z5',
    '27AAACD1234F1Z9',
    '33AAACD1234F1Z2',
    '07AAACD1234F1Z7',
]

HSN_POOL = ['1006', '1701', '2106', '3004', '3923', '4819', '7208', '8504', '8708', '9983']


@dataclass
class CycleData:
    invoices: list[dict[str, Any]]
    gstr2b: list[dict[str, Any]]


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open('r', encoding='utf-8') as fp:
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
    with path.open('w', encoding='utf-8') as fp:
        for row in rows:
            fp.write(json.dumps(row, ensure_ascii=False) + '\n')


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text('', encoding='utf-8')
        return

    keys = [
        'supplier_gstin',
        'supplier_name',
        'invoice_no',
        'invoice_date',
        'return_period',
        'taxable_value',
        'cgst',
        'sgst',
        'igst',
        'total_tax',
        'hsn_codes',
        'supplier_status',
        'linked_doc_id',
        'expected_mismatch_type',
    ]
    with path.open('w', encoding='utf-8', newline='') as fp:
        writer = csv.DictWriter(fp, fieldnames=keys)
        writer.writeheader()
        for row in rows:
            normalized = {key: row.get(key) for key in keys}
            hsn_codes = normalized.get('hsn_codes')
            if isinstance(hsn_codes, list):
                normalized['hsn_codes'] = ';'.join(str(x) for x in hsn_codes)
            writer.writerow(normalized)


def round2(value: float | int | str | None) -> float:
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def normalize_tax_components(row: dict[str, Any]) -> None:
    taxable = round2(row.get('taxable_value'))
    cgst = round2(row.get('cgst'))
    sgst = round2(row.get('sgst'))
    igst = round2(row.get('igst'))
    total_tax = round2(cgst + sgst + igst)
    row['taxable_value'] = taxable
    row['cgst'] = cgst
    row['sgst'] = sgst
    row['igst'] = igst
    row['total_tax'] = total_tax
    row['invoice_total'] = round2(taxable + total_tax)


def extract_hsn_codes(invoice: dict[str, Any], rng: random.Random) -> list[str]:
    line_items = invoice.get('line_items')
    if isinstance(line_items, list):
        values: list[str] = []
        for item in line_items:
            if not isinstance(item, dict):
                continue
            hsn = item.get('hsn') or item.get('hsn_code') or item.get('hsn_sac')
            if hsn:
                values.append(str(hsn))
        if values:
            unique = []
            seen = set()
            for hsn in values:
                if hsn in seen:
                    continue
                seen.add(hsn)
                unique.append(hsn)
            return unique[:4]
    return [rng.choice(HSN_POOL)]


def make_return_period(invoice_date: date) -> str:
    return f'{invoice_date.month:02d}{invoice_date.year}'


def build_cycle(
    base_invoices: list[dict[str, Any]],
    cycle_index: int,
    records_per_cycle: int,
    start_year: int,
    start_month: int,
    entity_gstins: list[str],
    rng: random.Random,
) -> CycleData:
    if not base_invoices:
        raise ValueError('Base invoice dataset is empty.')

    month_zero = start_month - 1 + cycle_index
    year = start_year + (month_zero // 12)
    month = (month_zero % 12) + 1
    cycle_start = date(year, month, 1)

    start_idx = (cycle_index * records_per_cycle) % len(base_invoices)
    base_rows = [deepcopy(base_invoices[(start_idx + i) % len(base_invoices)]) for i in range(records_per_cycle)]

    invoices: list[dict[str, Any]] = []
    for idx, row in enumerate(base_rows, start=1):
        factor = 1.0 + ((cycle_index - 1) * 0.035) + rng.uniform(-0.055, 0.085)
        factor = max(0.65, factor)

        invoice_date = cycle_start + timedelta(days=(idx - 1) % 27)

        original_doc_id = str(row.get('doc_id') or f'ROW{idx:05d}')
        row['doc_id'] = f'C{cycle_index + 1:02d}-{original_doc_id}'
        row['invoice_no'] = f'INV/{year % 100:02d}{month:02d}/{idx:05d}'
        row['invoice_date'] = invoice_date.isoformat()
        row['buyer_gstin'] = entity_gstins[(idx - 1) % len(entity_gstins)]

        row['taxable_value'] = round2(round2(row.get('taxable_value')) * factor)
        row['cgst'] = round2(round2(row.get('cgst')) * factor)
        row['sgst'] = round2(round2(row.get('sgst')) * factor)
        row['igst'] = round2(round2(row.get('igst')) * factor)
        normalize_tax_components(row)

        if idx % 31 == 0:
            # Intentional outlier for anomaly triage.
            row['taxable_value'] = round2(row['taxable_value'] * 2.9)
            row['cgst'] = round2(row['cgst'] * 2.9)
            row['sgst'] = round2(row['sgst'] * 2.9)
            row['igst'] = round2(row['igst'] * 2.9)
            normalize_tax_components(row)

        row['mismatch_type'] = row.get('mismatch_type') or 'synthetic'
        row['expected_severity'] = row.get('expected_severity') or 'WARNING'
        row['amount_at_risk'] = round2(row.get('amount_at_risk') or (row['total_tax'] * 0.22))
        invoices.append(row)

        if idx % 37 == 0:
            # Duplicate invoice to showcase fraud/anomaly detection.
            duplicate = deepcopy(row)
            duplicate['doc_id'] = f"{row['doc_id']}-DUP"
            duplicate['invoice_total'] = round2(row['invoice_total'] + rng.uniform(180, 620))
            duplicate['amount_at_risk'] = round2(max(row['amount_at_risk'], row['total_tax'] * 0.6))
            invoices.append(duplicate)

    gstr2b: list[dict[str, Any]] = []
    for idx, invoice in enumerate(invoices, start=1):
        doc_id = str(invoice.get('doc_id') or '')
        if doc_id.endswith('-DUP'):
            continue

        invoice_date = date.fromisoformat(str(invoice['invoice_date']))
        expected_issue = 'match'

        if idx % 11 == 0:
            # Missing in 2B case.
            continue

        record = {
            'supplier_gstin': invoice.get('supplier_gstin'),
            'supplier_name': invoice.get('supplier_name'),
            'invoice_no': invoice.get('invoice_no'),
            'invoice_date': invoice.get('invoice_date'),
            'return_period': make_return_period(invoice_date),
            'taxable_value': round2(invoice.get('taxable_value')),
            'cgst': round2(invoice.get('cgst')),
            'sgst': round2(invoice.get('sgst')),
            'igst': round2(invoice.get('igst')),
            'total_tax': round2(invoice.get('total_tax')),
            'hsn_codes': extract_hsn_codes(invoice, rng),
            'supplier_status': 'ACTIVE',
            'linked_doc_id': invoice.get('doc_id'),
            'expected_mismatch_type': expected_issue,
        }

        if idx % 13 == 0:
            record['supplier_status'] = 'INACTIVE'
            record['expected_mismatch_type'] = 'gstin_status_risk'

        if idx % 17 == 0:
            drift = 1 + rng.choice([-0.16, 0.14])
            record['total_tax'] = round2(record['total_tax'] * drift)
            record['cgst'] = round2(record['cgst'] * drift)
            record['sgst'] = round2(record['sgst'] * drift)
            record['igst'] = round2(record['igst'] * drift)
            record['expected_mismatch_type'] = 'rate_mismatch'

        if idx % 19 == 0:
            shifted = invoice_date + timedelta(days=31)
            record['return_period'] = make_return_period(shifted)
            record['expected_mismatch_type'] = 'period_mismatch'

        if idx % 23 == 0:
            record['hsn_codes'] = [rng.choice(HSN_POOL)]
            record['expected_mismatch_type'] = 'hsn_mismatch'

        gstr2b.append(record)

    return CycleData(invoices=invoices, gstr2b=gstr2b)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description='Generate Phase 6 synthetic GST demo datasets (multi-cycle + multi-entity).',
    )
    parser.add_argument(
        '--base-invoices',
        default='data/demo_v1/invoice_truth.jsonl',
        help='Path to base invoice JSONL file.',
    )
    parser.add_argument(
        '--out-dir',
        default='data/phase6_v1',
        help='Output directory for generated cycle files.',
    )
    parser.add_argument('--cycles', type=int, default=3, help='Number of filing cycles to generate.')
    parser.add_argument('--records-per-cycle', type=int, default=220, help='Invoice seed rows per cycle.')
    parser.add_argument('--start-year', type=int, default=2026)
    parser.add_argument('--start-month', type=int, default=1)
    parser.add_argument('--seed', type=int, default=20260228)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    base_path = Path(args.base_invoices).resolve()
    out_dir = Path(args.out_dir).resolve()

    if not base_path.exists():
        raise SystemExit(f'Base invoice file not found: {base_path}')

    rng = random.Random(args.seed)
    base_invoices = load_jsonl(base_path)
    if not base_invoices:
        raise SystemExit('Base invoice dataset is empty.')

    manifest: dict[str, Any] = {
        'generated_at': date.today().isoformat(),
        'seed': args.seed,
        'source': str(base_path),
        'cycles': [],
    }

    out_dir.mkdir(parents=True, exist_ok=True)

    for cycle_index in range(args.cycles):
        cycle_name = f'cycle_{cycle_index + 1:02d}'
        cycle_dir = out_dir / cycle_name
        cycle_dir.mkdir(parents=True, exist_ok=True)

        cycle_data = build_cycle(
            base_invoices=base_invoices,
            cycle_index=cycle_index,
            records_per_cycle=args.records_per_cycle,
            start_year=args.start_year,
            start_month=args.start_month,
            entity_gstins=DEFAULT_ENTITY_GSTINS,
            rng=rng,
        )

        invoice_path = cycle_dir / 'invoice_truth.jsonl'
        gstr_jsonl_path = cycle_dir / 'gstr2b_truth.jsonl'
        gstr_csv_path = cycle_dir / 'gstr2b_truth.csv'

        write_jsonl(invoice_path, cycle_data.invoices)
        write_jsonl(gstr_jsonl_path, cycle_data.gstr2b)
        write_csv(gstr_csv_path, cycle_data.gstr2b)

        manifest['cycles'].append(
            {
                'cycle': cycle_name,
                'invoice_file': str(invoice_path),
                'gstr2b_jsonl_file': str(gstr_jsonl_path),
                'gstr2b_csv_file': str(gstr_csv_path),
                'invoice_rows': len(cycle_data.invoices),
                'gstr2b_rows': len(cycle_data.gstr2b),
                'entities': DEFAULT_ENTITY_GSTINS,
            }
        )

    manifest_path = out_dir / 'phase6_manifest.json'
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')

    print(f'Generated Phase 6 demo data at: {out_dir}')
    print(f'Manifest: {manifest_path}')
    for cycle in manifest['cycles']:
        print(
            f"- {cycle['cycle']}: invoices={cycle['invoice_rows']} gstr2b={cycle['gstr2b_rows']} "
            f"({Path(cycle['invoice_file']).name}, {Path(cycle['gstr2b_csv_file']).name})"
        )


if __name__ == '__main__':
    main()
