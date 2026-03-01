#!/usr/bin/env python3
import argparse
import csv
import json
import random
import string
from datetime import datetime, timedelta
from pathlib import Path

from faker import Faker
from PIL import Image, ImageDraw, ImageFilter
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

STATE_CODES = {
    "01": "Jammu and Kashmir",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "19": "West Bengal",
    "24": "Gujarat",
    "27": "Maharashtra",
    "29": "Karnataka",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "36": "Telangana",
}

HSN_MASTER = [
    {"hsn": "1006", "description": "Rice", "rate": 5},
    {"hsn": "1701", "description": "Sugar", "rate": 5},
    {"hsn": "2106", "description": "Processed food products", "rate": 12},
    {"hsn": "3004", "description": "Medicaments", "rate": 12},
    {"hsn": "3923", "description": "Plastic packing materials", "rate": 18},
    {"hsn": "4819", "description": "Cartons and paper boxes", "rate": 18},
    {"hsn": "7208", "description": "Iron and steel products", "rate": 18},
    {"hsn": "8504", "description": "Electrical transformers", "rate": 18},
    {"hsn": "8708", "description": "Vehicle parts", "rate": 28},
    {"hsn": "9983", "description": "IT services", "rate": 18},  # SAC-like usage
]

MISMATCH_RATIOS = {
    "missing_in_2b": 0.12,
    "hsn_mismatch": 0.10,
    "rate_mismatch": 0.08,
    "value_drift": 0.08,
    "period_mismatch": 0.06,
    "gstin_status_risk": 0.06,
}
SEVERITY_MAP = {
    "none": "INFO",
    "missing_in_2b": "CRITICAL",
    "hsn_mismatch": "WARNING",
    "rate_mismatch": "CRITICAL",
    "value_drift": "WARNING",
    "period_mismatch": "WARNING",
    "gstin_status_risk": "CRITICAL",
}

BUYER_PROFILE = {
    "name": "DEMO BUYER PRIVATE LIMITED",
    "state_code": "29",
    "gstin": "29AAACD1234F1Z5",
    "address": "14, Residency Road, Bengaluru, Karnataka",
}

MODEL_PROFILE = {
    "ocr": "mistral-ocr-latest",
    "extract_fast": "ministral-3b-2512",
    "extract_default": "ministral-8b-2512",
    "extract_fallback": "ministral-14b-2512",
    "reasoning_report_chat": "mistral-large-latest",
    "voice_stt": "voxtral-mini-latest",
}


def r2(x: float) -> float:
    return round(float(x) + 1e-9, 2)


def random_pan(rng: random.Random) -> str:
    letters = "".join(rng.choices(string.ascii_uppercase, k=5))
    digits = "".join(rng.choices(string.digits, k=4))
    tail = rng.choice(string.ascii_uppercase)
    return f"{letters}{digits}{tail}"


def random_gstin(rng: random.Random, state_code: str) -> str:
    pan = random_pan(rng)
    entity = rng.choice("123456789")
    checksum = rng.choice(string.digits + string.ascii_uppercase)
    return f"{state_code}{pan}{entity}Z{checksum}"


def tax_split(taxable: float, rate: float, inter_state: bool):
    total_tax = r2(taxable * rate / 100.0)
    if inter_state:
        return 0.0, 0.0, total_tax
    half = r2(total_tax / 2.0)
    return half, half, 0.0


def return_period(iso_date: str) -> str:
    d = datetime.strptime(iso_date, "%Y-%m-%d")
    return d.strftime("%m%Y")


def build_mismatch_plan(total: int, rng: random.Random):
    plan = []
    allocated = 0
    for k, ratio in MISMATCH_RATIOS.items():
        c = int(total * ratio)
        plan.extend([k] * c)
        allocated += c
    plan.extend(["none"] * (total - allocated))
    rng.shuffle(plan)
    return plan[:total]


def generate_invoice(idx: int, rng: random.Random, fake: Faker):
    supplier_state = rng.choice(list(STATE_CODES.keys()))
    supplier_gstin = random_gstin(rng, supplier_state)
    supplier_name = fake.company().upper()
    invoice_no = f"INV/{datetime.now().year % 100:02d}/{idx + 1:05d}"
    invoice_date = (datetime.today() - timedelta(days=rng.randint(1, 58))).strftime("%Y-%m-%d")
    inter_state = supplier_state != BUYER_PROFILE["state_code"]

    line_items = []
    taxable_total = 0.0
    cgst_total = 0.0
    sgst_total = 0.0
    igst_total = 0.0

    for _ in range(rng.randint(1, 4)):
        itm = rng.choice(HSN_MASTER)
        qty = rng.randint(1, 12)
        unit_price = r2(rng.uniform(120.0, 8500.0))
        taxable = r2(qty * unit_price)
        cgst, sgst, igst = tax_split(taxable, itm["rate"], inter_state)

        taxable_total = r2(taxable_total + taxable)
        cgst_total = r2(cgst_total + cgst)
        sgst_total = r2(sgst_total + sgst)
        igst_total = r2(igst_total + igst)

        line_items.append(
            {
                "description": itm["description"],
                "hsn": itm["hsn"],
                "qty": qty,
                "unit_price": unit_price,
                "taxable_value": taxable,
                "gst_rate": itm["rate"],
                "cgst": cgst,
                "sgst": sgst,
                "igst": igst,
            }
        )

    total_tax = r2(cgst_total + sgst_total + igst_total)
    invoice_total = r2(taxable_total + total_tax)
    eff_rate = r2((total_tax / taxable_total) * 100.0) if taxable_total else 0.0

    invoice = {
        "doc_id": f"GSTINV-{idx + 1:05d}",
        "invoice_no": invoice_no,
        "invoice_date": invoice_date,
        "supplier_name": supplier_name,
        "supplier_gstin": supplier_gstin,
        "supplier_state_code": supplier_state,
        "supplier_state_name": STATE_CODES[supplier_state],
        "buyer_name": BUYER_PROFILE["name"],
        "buyer_gstin": BUYER_PROFILE["gstin"],
        "buyer_state_code": BUYER_PROFILE["state_code"],
        "buyer_address": BUYER_PROFILE["address"],
        "place_of_supply": STATE_CODES[BUYER_PROFILE["state_code"]],
        "line_items": line_items,
        "taxable_value": taxable_total,
        "cgst": cgst_total,
        "sgst": sgst_total,
        "igst": igst_total,
        "total_tax": total_tax,
        "invoice_total": invoice_total,
        "effective_rate": eff_rate,
        "inter_state": inter_state,
    }
    return invoice


def build_gstr2b_entry(invoice: dict):
    return {
        "supplier_gstin": invoice["supplier_gstin"],
        "supplier_name": invoice["supplier_name"],
        "invoice_no": invoice["invoice_no"],
        "invoice_date": invoice["invoice_date"],
        "return_period": return_period(invoice["invoice_date"]),
        "taxable_value": invoice["taxable_value"],
        "cgst": invoice["cgst"],
        "sgst": invoice["sgst"],
        "igst": invoice["igst"],
        "total_tax": invoice["total_tax"],
        "hsn_codes": sorted({x["hsn"] for x in invoice["line_items"]}),
        "supplier_status": "ACTIVE",
    }


def apply_mismatch(entry: dict, invoice: dict, mismatch_type: str, rng: random.Random, status_map: dict):
    risk = 0.0

    if mismatch_type == "none":
        return entry, risk

    if mismatch_type == "missing_in_2b":
        risk = invoice["total_tax"]
        return None, risk

    if mismatch_type == "hsn_mismatch":
        existing = set(entry["hsn_codes"])
        alternatives = [x["hsn"] for x in HSN_MASTER if x["hsn"] not in existing]
        if alternatives and entry["hsn_codes"]:
            entry["hsn_codes"][0] = rng.choice(alternatives)
        risk = r2(invoice["total_tax"] * 0.35)
        return entry, risk

    if mismatch_type == "rate_mismatch":
        possible = [5, 12, 18, 28]
        alt_rate = rng.choice([x for x in possible if x != int(round(invoice["effective_rate"]))] or possible)
        tax = r2(entry["taxable_value"] * alt_rate / 100.0)
        if invoice["inter_state"]:
            entry["cgst"], entry["sgst"], entry["igst"] = 0.0, 0.0, tax
        else:
            half = r2(tax / 2.0)
            entry["cgst"], entry["sgst"], entry["igst"] = half, half, 0.0
        entry["total_tax"] = r2(entry["cgst"] + entry["sgst"] + entry["igst"])
        risk = r2(abs(entry["total_tax"] - invoice["total_tax"]))
        return entry, risk

    if mismatch_type == "value_drift":
        drift = rng.uniform(0.05, 0.12) * rng.choice([-1, 1])
        entry["taxable_value"] = r2(entry["taxable_value"] * (1.0 + drift))
        tax = r2(entry["taxable_value"] * invoice["effective_rate"] / 100.0)
        if invoice["inter_state"]:
            entry["cgst"], entry["sgst"], entry["igst"] = 0.0, 0.0, tax
        else:
            half = r2(tax / 2.0)
            entry["cgst"], entry["sgst"], entry["igst"] = half, half, 0.0
        entry["total_tax"] = r2(entry["cgst"] + entry["sgst"] + entry["igst"])
        risk = r2(abs(entry["total_tax"] - invoice["total_tax"]))
        return entry, risk

    if mismatch_type == "period_mismatch":
        d = datetime.strptime(entry["invoice_date"], "%Y-%m-%d") + timedelta(days=35)
        entry["invoice_date"] = d.strftime("%Y-%m-%d")
        entry["return_period"] = return_period(entry["invoice_date"])
        risk = r2(invoice["total_tax"] * 0.2)
        return entry, risk

    if mismatch_type == "gstin_status_risk":
        status_map[invoice["supplier_gstin"]] = {
            "demo_status": "INACTIVE",
            "reason": "Seeded high-risk supplier for hackathon demo",
        }
        entry["supplier_status"] = "INACTIVE"
        risk = r2(invoice["total_tax"] * 0.8)
        return entry, risk

    return entry, risk


def render_invoice_image(invoice: dict, out_path: Path, rng: random.Random, degrade: bool):
    img = Image.new("RGB", (1240, 1754), "white")
    d = ImageDraw.Draw(img)
    y = 35

    header = [
        "TAX INVOICE (DEMO DATA - NOT REAL TAXPAYER)",
        f"Invoice No: {invoice['invoice_no']}",
        f"Invoice Date: {invoice['invoice_date']}",
        f"Supplier: {invoice['supplier_name']}",
        f"Supplier GSTIN: {invoice['supplier_gstin']}",
        f"Buyer: {invoice['buyer_name']}  |  GSTIN: {invoice['buyer_gstin']}",
        f"Place of Supply: {invoice['place_of_supply']}",
        "-" * 110,
    ]
    for line in header:
        d.text((30, y), line, fill="black")
        y += 30

    d.text((30, y), "Description | HSN/SAC | Qty | Unit Price | Taxable | Rate | CGST | SGST | IGST", fill="black")
    y += 28
    for li in invoice["line_items"]:
        row = (
            f"{li['description'][:24]:24} | {li['hsn']:7} | {li['qty']:>3} | "
            f"{li['unit_price']:>9.2f} | {li['taxable_value']:>8.2f} | {li['gst_rate']:>4}% | "
            f"{li['cgst']:>7.2f} | {li['sgst']:>7.2f} | {li['igst']:>7.2f}"
        )
        d.text((30, y), row, fill="black")
        y += 26

    y += 20
    totals = [
        f"Taxable Value: INR {invoice['taxable_value']:.2f}",
        f"CGST: INR {invoice['cgst']:.2f}",
        f"SGST: INR {invoice['sgst']:.2f}",
        f"IGST: INR {invoice['igst']:.2f}",
        f"Total Tax: INR {invoice['total_tax']:.2f}",
        f"Invoice Total: INR {invoice['invoice_total']:.2f}",
    ]
    for t in totals:
        d.text((30, y), t, fill="black")
        y += 30

    if degrade:
        if rng.random() < 0.8:
            img = img.filter(ImageFilter.GaussianBlur(radius=rng.uniform(0.3, 1.1)))
        if rng.random() < 0.8:
            img = img.rotate(rng.uniform(-1.8, 1.8), fillcolor="white")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.suffix.lower() == ".jpg":
        img.save(out_path, quality=rng.randint(55, 80))
    else:
        img.save(out_path)


def render_invoice_pdf(invoice: dict, out_path: Path):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(out_path), pagesize=A4)
    width, height = A4
    y = height - 40

    lines = [
        "TAX INVOICE (DEMO DATA - NOT REAL TAXPAYER)",
        f"Invoice No: {invoice['invoice_no']}",
        f"Invoice Date: {invoice['invoice_date']}",
        f"Supplier: {invoice['supplier_name']}",
        f"Supplier GSTIN: {invoice['supplier_gstin']}",
        f"Buyer: {invoice['buyer_name']} | GSTIN: {invoice['buyer_gstin']}",
        f"Place of Supply: {invoice['place_of_supply']}",
        "-" * 110,
    ]
    for line in lines:
        c.drawString(30, y, line)
        y -= 16

    c.drawString(30, y, "Description | HSN | Qty | Taxable | Rate | CGST | SGST | IGST")
    y -= 16
    for li in invoice["line_items"]:
        row = (
            f"{li['description'][:22]} | {li['hsn']} | {li['qty']} | {li['taxable_value']:.2f} | "
            f"{li['gst_rate']}% | {li['cgst']:.2f} | {li['sgst']:.2f} | {li['igst']:.2f}"
        )
        c.drawString(30, y, row)
        y -= 16

    y -= 8
    for t in [
        f"Taxable Value: INR {invoice['taxable_value']:.2f}",
        f"CGST: INR {invoice['cgst']:.2f}",
        f"SGST: INR {invoice['sgst']:.2f}",
        f"IGST: INR {invoice['igst']:.2f}",
        f"Total Tax: INR {invoice['total_tax']:.2f}",
        f"Invoice Total: INR {invoice['invoice_total']:.2f}",
    ]:
        c.drawString(30, y, t)
        y -= 16

    c.save()


def download_cord_subset(public_dir: Path, count: int):
    from datasets import load_dataset

    ds = load_dataset("naver-clova-ix/cord-v2", split=f"train[:{count}]")
    records = []
    public_dir.mkdir(parents=True, exist_ok=True)

    for i, row in enumerate(ds):
        image = row["image"]
        img_path = public_dir / f"cord_{i:04d}.png"
        meta_path = public_dir / f"cord_{i:04d}.json"

        image.save(img_path)
        meta = {k: v for k, v in row.items() if k != "image"}
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2, default=str), encoding="utf-8")

        records.append(
            {
                "doc_id": f"CORD-{i:04d}",
                "source": "naver-clova-ix/cord-v2",
                "image_path": str(img_path),
                "meta_path": str(meta_path),
            }
        )
    return records


def write_jsonl(path: Path, rows):
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def main():
    parser = argparse.ArgumentParser(description="Generate Indian GST synthetic dataset for reconciliation demo.")
    parser.add_argument("--out", type=str, default="data/demo_v1")
    parser.add_argument("--count", type=int, default=400)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--download-public-cord", action="store_true")
    parser.add_argument("--public-count", type=int, default=80)
    args = parser.parse_args()

    rng = random.Random(args.seed)
    fake = Faker("en_IN")
    fake.seed_instance(args.seed)

    out = Path(args.out)
    docs_dir = out / "docs" / "synthetic"
    raw_json_dir = out / "raw_json"
    public_dir = out / "docs" / "public"
    out.mkdir(parents=True, exist_ok=True)
    docs_dir.mkdir(parents=True, exist_ok=True)
    raw_json_dir.mkdir(parents=True, exist_ok=True)

    mismatch_plan = build_mismatch_plan(args.count, rng)
    invoice_truth = []
    gstr2b_truth = []
    status_map = {}

    for i in range(args.count):
        inv = generate_invoice(i, rng, fake)
        status_map.setdefault(
            inv["supplier_gstin"],
            {"demo_status": "ACTIVE", "reason": "Default seeded status"},
        )

        entry = build_gstr2b_entry(inv)
        mismatch_type = mismatch_plan[i]
        entry, amount_at_risk = apply_mismatch(entry, inv, mismatch_type, rng, status_map)

        ext = rng.choice(["png", "jpg", "pdf"])
        doc_path = docs_dir / f"{inv['doc_id']}.{ext}"
        if ext == "pdf":
            render_invoice_pdf(inv, doc_path)
        else:
            render_invoice_image(inv, doc_path, rng, degrade=(rng.random() < 0.35))

        inv_record = dict(inv)
        inv_record["doc_path"] = str(doc_path)
        inv_record["mismatch_type"] = mismatch_type
        inv_record["expected_severity"] = SEVERITY_MAP[mismatch_type]
        inv_record["amount_at_risk"] = r2(amount_at_risk)
        invoice_truth.append(inv_record)

        (raw_json_dir / f"{inv['doc_id']}.json").write_text(
            json.dumps(inv_record, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        if entry is not None:
            entry["linked_doc_id"] = inv["doc_id"]
            entry["expected_mismatch_type"] = mismatch_type
            gstr2b_truth.append(entry)

    public_records = []
    if args.download_public_cord and args.public_count > 0:
        try:
            public_records = download_cord_subset(public_dir, args.public_count)
        except Exception as e:
            print(f"[WARN] Could not download CORD subset: {e}")

    write_jsonl(out / "invoice_truth.jsonl", invoice_truth)
    write_jsonl(out / "gstr2b_truth.jsonl", gstr2b_truth)

    csv_fields = [
        "supplier_gstin",
        "supplier_name",
        "supplier_status",
        "invoice_no",
        "invoice_date",
        "return_period",
        "taxable_value",
        "cgst",
        "sgst",
        "igst",
        "total_tax",
        "hsn_codes",
        "linked_doc_id",
        "expected_mismatch_type",
    ]
    with (out / "gstr2b_truth.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=csv_fields)
        w.writeheader()
        for row in gstr2b_truth:
            row_copy = dict(row)
            row_copy["hsn_codes"] = ";".join(row_copy["hsn_codes"])
            w.writerow(row_copy)

    (out / "status_seed_map.json").write_text(
        json.dumps(status_map, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (out / "model_profile.json").write_text(
        json.dumps(MODEL_PROFILE, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    mismatch_counts = {}
    for x in invoice_truth:
        mismatch_counts[x["mismatch_type"]] = mismatch_counts.get(x["mismatch_type"], 0) + 1

    manifest = {
        "dataset_version": "demo_v1",
        "created_at_utc": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "seed": args.seed,
        "synthetic_invoice_count": len(invoice_truth),
        "gstr2b_entry_count": len(gstr2b_truth),
        "public_doc_count": len(public_records),
        "mismatch_distribution": mismatch_counts,
        "paths": {
            "invoice_truth_jsonl": str(out / "invoice_truth.jsonl"),
            "gstr2b_truth_jsonl": str(out / "gstr2b_truth.jsonl"),
            "gstr2b_truth_csv": str(out / "gstr2b_truth.csv"),
            "status_seed_map": str(out / "status_seed_map.json"),
            "model_profile": str(out / "model_profile.json"),
        },
        "licenses": {
            "synthetic_data": "Generated in-script (demo data, no real taxpayer)",
            "cord_v2_if_downloaded": "CC BY 4.0",
        },
    }
    (out / "dataset_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"[OK] Dataset generated at: {out}")
    print(f"[OK] Synthetic invoices: {len(invoice_truth)}")
    print(f"[OK] GSTR-2B entries: {len(gstr2b_truth)}")
    print(f"[OK] Public CORD docs: {len(public_records)}")


if __name__ == "__main__":
    main()
