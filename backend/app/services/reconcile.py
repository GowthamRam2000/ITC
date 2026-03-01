from __future__ import annotations

from datetime import datetime
from typing import Any

from app.schemas import AuditBoundingBox, AuditFlag, MismatchIssue, ResultSummary, Severity


def _safe_str(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _safe_float(value: Any) -> float:
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return 0.0


def _return_period(invoice_date: str) -> str:
    try:
        dt = datetime.strptime(invoice_date, "%Y-%m-%d")
        return dt.strftime("%m%Y")
    except ValueError:
        return ""


def _invoice_hsns(invoice: dict[str, Any]) -> set[str]:
    hsns: set[str] = set()
    for item in invoice.get("line_items", []):
        hsn = _safe_str(item.get("hsn"))
        if hsn:
            hsns.add(hsn)
    direct_hsn = _safe_str(invoice.get("hsn"))
    if direct_hsn:
        hsns.add(direct_hsn)
    return hsns


def _entry_hsns(entry: dict[str, Any]) -> set[str]:
    value = entry.get("hsn_codes", [])
    if isinstance(value, str):
        return {v.strip() for v in value.split(";") if v.strip()}
    if isinstance(value, list):
        return {_safe_str(v) for v in value if _safe_str(v)}
    return set()


HSN_DESCRIPTION_HINTS: dict[str, tuple[str, ...]] = {
    "3004": ("tablet", "capsule", "medicine", "pharma", "drug"),
    "1006": ("rice", "basmati"),
    "1701": ("sugar", "jaggery"),
    "3923": ("plastic", "poly", "packaging"),
    "4819": ("carton", "corrugated", "paper box", "paper carton"),
    "8708": ("spare", "brake", "auto part", "automotive"),
}


def _line_item_bbox(item: dict[str, Any], index: int) -> AuditBoundingBox:
    raw = item.get("bbox")
    if isinstance(raw, dict):
        try:
            return AuditBoundingBox(
                page=int(raw.get("page", 1) or 1),
                x=float(raw.get("x", 0.08)),
                y=float(raw.get("y", max(0.06, min(0.88, 0.12 + index * 0.08)))),
                width=float(raw.get("width", 0.82)),
                height=float(raw.get("height", 0.06)),
            )
        except (TypeError, ValueError):
            pass
    return AuditBoundingBox(page=1, x=0.08, y=max(0.06, min(0.88, 0.12 + index * 0.08)), width=0.82, height=0.06)


def _build_audit_flags(invoice: dict[str, Any], entry_hsns: set[str] | None = None) -> list[AuditFlag]:
    flags: list[AuditFlag] = []
    line_items = invoice.get("line_items", [])
    if not isinstance(line_items, list):
        line_items = []

    for idx, item in enumerate(line_items):
        if not isinstance(item, dict):
            continue
        description = _safe_str(item.get("description")).lower()
        hsn = _safe_str(item.get("hsn"))
        if not description or not hsn:
            continue
        for expected_hsn, hints in HSN_DESCRIPTION_HINTS.items():
            if any(hint in description for hint in hints) and not hsn.startswith(expected_hsn):
                flags.append(
                    AuditFlag(
                        flag_code="description_hsn_conflict",
                        severity=Severity.WARNING,
                        summary=(
                            f"Line item description suggests HSN {expected_hsn}, "
                            f"but invoice carries HSN {hsn}."
                        ),
                        confidence=0.74,
                        line_item_ref=f"line_item_{idx + 1}",
                        bbox=_line_item_bbox(item, idx),
                        model="rule-semantic-v1",
                        source="rule",
                    )
                )
                break

    if entry_hsns:
        inv_hsns = _invoice_hsns(invoice)
        if inv_hsns and inv_hsns.isdisjoint(entry_hsns):
            flags.append(
                AuditFlag(
                    flag_code="invoice_2b_semantic_conflict",
                    severity=Severity.WARNING,
                    summary=(
                        "Invoice HSN context appears semantically different from supplier 2B HSN set. "
                        "Spot-check description-to-HSN alignment."
                    ),
                    confidence=0.66,
                    line_item_ref=None,
                    bbox=None,
                    model="rule-semantic-v1",
                    source="rule",
                )
            )
    return flags[:4]


def _suggestion(issue_code: str) -> str:
    suggestions = {
        "missing_in_2b": "Follow up with supplier to file/amend GSTR-1 and recheck in next GSTR-2B cycle.",
        "hsn_mismatch": "Validate HSN/SAC against CBIC schedule and request corrected invoice from supplier.",
        "rate_mismatch": "Verify applicable GST rate and correct booking or seek supplier amendment.",
        "value_drift": "Reconcile taxable value with purchase register and correct rounding/entry errors.",
        "period_mismatch": "Check invoice date and filing period mapping before ITC claim.",
        "gstin_status_risk": "Hold high-risk ITC and validate supplier GSTIN status before final claim.",
    }
    return suggestions.get(issue_code, "Review invoice and supplier filing details.")


def reconcile_invoices(
    invoices: list[dict[str, Any]],
    gstr_entries: list[dict[str, Any]],
    parse_failures: int = 0,
) -> tuple[ResultSummary, list[MismatchIssue]]:
    entry_map: dict[tuple[str, str], dict[str, Any]] = {}
    for entry in gstr_entries:
        key = (_safe_str(entry.get("supplier_gstin")).upper(), _safe_str(entry.get("invoice_no")).upper())
        if key[0] and key[1]:
            entry_map[key] = entry

    issues: list[MismatchIssue] = []
    matched = 0

    for inv in invoices:
        supplier_gstin = _safe_str(inv.get("supplier_gstin")).upper()
        invoice_no = _safe_str(inv.get("invoice_no")).upper()
        invoice_id = _safe_str(inv.get("doc_id")) or invoice_no or "UNKNOWN"
        inv_taxable = _safe_float(inv.get("taxable_value"))
        inv_total_tax = _safe_float(inv.get("total_tax")) or _safe_float(inv.get("cgst")) + _safe_float(
            inv.get("sgst")
        ) + _safe_float(inv.get("igst"))
        inv_period = _return_period(_safe_str(inv.get("invoice_date")))
        inv_hsns = _invoice_hsns(inv)
        invoice_audit_flags = _build_audit_flags(inv)

        invoice_issue_count = 0
        key = (supplier_gstin, invoice_no)
        entry = entry_map.get(key)

        if entry is None:
            issues.append(
                MismatchIssue(
                    invoice_id=invoice_id,
                    supplier_gstin=supplier_gstin,
                    invoice_no=invoice_no,
                    issue_code="missing_in_2b",
                    severity=Severity.CRITICAL,
                    amount_at_risk=round(inv_total_tax, 2),
                    evidence={"invoice_total_tax": round(inv_total_tax, 2), "matched_in_2b": False},
                    suggested_action=_suggestion("missing_in_2b"),
                    audit_flags=list(invoice_audit_flags),
                )
            )
            continue

        entry_taxable = _safe_float(entry.get("taxable_value"))
        entry_total_tax = _safe_float(entry.get("total_tax")) or _safe_float(entry.get("cgst")) + _safe_float(
            entry.get("sgst")
        ) + _safe_float(entry.get("igst"))
        entry_period = _safe_str(entry.get("return_period"))
        entry_hsns = _entry_hsns(entry)
        invoice_audit_flags = _build_audit_flags(inv, entry_hsns)
        supplier_status = _safe_str(entry.get("supplier_status")).upper()

        taxable_diff = round(abs(inv_taxable - entry_taxable), 2)
        total_tax_diff = round(abs(inv_total_tax - entry_total_tax), 2)

        if taxable_diff > 1.0:
            invoice_issue_count += 1
            issues.append(
                MismatchIssue(
                    invoice_id=invoice_id,
                    supplier_gstin=supplier_gstin,
                    invoice_no=invoice_no,
                    issue_code="value_drift",
                    severity=Severity.WARNING,
                    amount_at_risk=total_tax_diff,
                    evidence={
                        "invoice_taxable_value": inv_taxable,
                        "gstr2b_taxable_value": entry_taxable,
                        "difference": taxable_diff,
                    },
                    suggested_action=_suggestion("value_drift"),
                    audit_flags=list(invoice_audit_flags),
                )
            )

        if total_tax_diff > 1.0:
            invoice_issue_count += 1
            issues.append(
                MismatchIssue(
                    invoice_id=invoice_id,
                    supplier_gstin=supplier_gstin,
                    invoice_no=invoice_no,
                    issue_code="rate_mismatch",
                    severity=Severity.CRITICAL,
                    amount_at_risk=total_tax_diff,
                    evidence={
                        "invoice_total_tax": inv_total_tax,
                        "gstr2b_total_tax": entry_total_tax,
                        "difference": total_tax_diff,
                    },
                    suggested_action=_suggestion("rate_mismatch"),
                    audit_flags=list(invoice_audit_flags),
                )
            )

        if inv_period and entry_period and inv_period != entry_period:
            invoice_issue_count += 1
            issues.append(
                MismatchIssue(
                    invoice_id=invoice_id,
                    supplier_gstin=supplier_gstin,
                    invoice_no=invoice_no,
                    issue_code="period_mismatch",
                    severity=Severity.WARNING,
                    amount_at_risk=round(inv_total_tax * 0.2, 2),
                    evidence={"invoice_period": inv_period, "gstr2b_period": entry_period},
                    suggested_action=_suggestion("period_mismatch"),
                    audit_flags=list(invoice_audit_flags),
                )
            )

        if inv_hsns and entry_hsns and inv_hsns.isdisjoint(entry_hsns):
            invoice_issue_count += 1
            issues.append(
                MismatchIssue(
                    invoice_id=invoice_id,
                    supplier_gstin=supplier_gstin,
                    invoice_no=invoice_no,
                    issue_code="hsn_mismatch",
                    severity=Severity.WARNING,
                    amount_at_risk=round(inv_total_tax * 0.35, 2),
                    evidence={
                        "invoice_hsn_codes": sorted(inv_hsns),
                        "gstr2b_hsn_codes": sorted(entry_hsns),
                    },
                    suggested_action=_suggestion("hsn_mismatch"),
                    audit_flags=list(invoice_audit_flags),
                )
            )

        if supplier_status == "INACTIVE":
            invoice_issue_count += 1
            issues.append(
                MismatchIssue(
                    invoice_id=invoice_id,
                    supplier_gstin=supplier_gstin,
                    invoice_no=invoice_no,
                    issue_code="gstin_status_risk",
                    severity=Severity.CRITICAL,
                    amount_at_risk=round(inv_total_tax * 0.8, 2),
                    evidence={"supplier_status": "INACTIVE"},
                    suggested_action=_suggestion("gstin_status_risk"),
                    audit_flags=list(invoice_audit_flags),
                )
            )

        if invoice_issue_count == 0:
            matched += 1

    critical = sum(1 for i in issues if i.severity == Severity.CRITICAL)
    warning = sum(1 for i in issues if i.severity == Severity.WARNING)
    info = sum(1 for i in issues if i.severity == Severity.INFO)
    total_invoices = len(invoices)
    matched_pct = round((matched / total_invoices) * 100.0, 2) if total_invoices else 0.0
    total_itc_at_risk = round(sum(i.amount_at_risk for i in issues), 2)

    summary = ResultSummary(
        total_invoices=total_invoices,
        matched_invoices=matched,
        critical_count=critical,
        warning_count=warning,
        info_count=info,
        total_itc_at_risk=total_itc_at_risk,
        matched_pct=matched_pct,
        parse_failures=parse_failures,
    )
    return summary, issues


def attach_ai_auditor_flags(
    issues: list[MismatchIssue],
    invoices: list[dict[str, Any]],
    gstr_entries: list[dict[str, Any]],
    auditor: Any | None = None,
) -> tuple[list[MismatchIssue], int]:
    if auditor is None:
        return issues, 0

    audit_callable = getattr(auditor, "audit_semantic_anomalies", None)
    if not callable(audit_callable):
        return issues, 0

    try:
        raw_flags = audit_callable(
            invoices=invoices,
            gstr_entries=gstr_entries,
            issues=[issue.model_dump() for issue in issues],
        )
    except Exception:
        return issues, 0

    if not isinstance(raw_flags, list) or not raw_flags:
        return issues, 0

    by_invoice: dict[str, list[AuditFlag]] = {}
    for item in raw_flags:
        if not isinstance(item, dict):
            continue
        invoice_id = _safe_str(item.get("invoice_id"))
        if not invoice_id:
            continue
        try:
            flag = AuditFlag.model_validate(item)
        except Exception:
            continue
        by_invoice.setdefault(invoice_id, []).append(flag)

    attached = 0
    if not by_invoice:
        return issues, 0

    for issue in issues:
        extra = by_invoice.get(issue.invoice_id)
        if not extra:
            continue
        existing_keys = {(f.flag_code, f.line_item_ref or "") for f in issue.audit_flags}
        for flag in extra:
            key = (flag.flag_code, flag.line_item_ref or "")
            if key in existing_keys:
                continue
            issue.audit_flags.append(flag)
            existing_keys.add(key)
            attached += 1
    return issues, attached
