from __future__ import annotations

import csv
import json
import math
import random
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.services.job_service import JobService

RATE_BY_HSN: dict[str, int] = {
    "1006": 5,
    "1701": 5,
    "2106": 12,
    "3004": 12,
    "3923": 18,
    "4819": 18,
    "7208": 18,
    "8504": 18,
    "8708": 28,
    "9983": 18,
}

SUGGESTED_ROLES = ("manager", "team")


@dataclass
class ParsedJobData:
    invoices: list[dict[str, Any]]
    gstr2b: list[dict[str, Any]]


class Phase6Service:
    def __init__(self, data_dir: str, job_service: JobService) -> None:
        self._runtime_root = Path(data_dir).resolve()
        self._job_service = job_service
        self._rng = random.Random(42)

    async def build_evidence_pack(self, job_id: str) -> dict[str, Any]:
        result = await self._job_service.get_result(job_id)
        if result is None:
            raise ValueError("Job result not available.")
        events = await self._job_service.get_job_events(job_id)
        top_issues = sorted(result.issues, key=lambda x: x.amount_at_risk, reverse=True)[:10]
        actions = [
            {
                "invoice_id": issue.invoice_id,
                "issue_code": issue.issue_code,
                "severity": issue.severity.value,
                "owner": "CA Team",
                "action": issue.suggested_action,
                "due_in_days": 2 if issue.severity.value == "CRITICAL" else 5,
            }
            for issue in top_issues
        ]
        timeline = [
            {
                "ts": evt.get("ts"),
                "stage": evt.get("stage"),
                "message": evt.get("message"),
                "type": evt.get("type"),
            }
            for evt in events[-20:]
        ]
        narration = (
            f"Evidence pack for job {job_id}. "
            f"Total invoices {result.summary.total_invoices}. "
            f"Critical issues {result.summary.critical_count}. "
            f"Total ITC at risk INR {result.summary.total_itc_at_risk:,.2f}. "
            f"Top action: {actions[0]['action'] if actions else 'No immediate action'}."
        )
        return {
            "job_id": job_id,
            "generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "summary": result.summary.model_dump(),
            "actions": actions,
            "timeline": timeline,
            "narration_text": narration,
        }

    async def build_portfolio_overview(self, job_id: str | None = None) -> dict[str, Any]:
        if job_id:
            status = await self._job_service.get_status(job_id)
            if status is None:
                raise ValueError("Job not found.")
            job_ids = [job_id]
        else:
            job_ids = await self._job_service.list_known_job_ids()
        entities: dict[str, dict[str, Any]] = {}
        completed_jobs: list[dict[str, Any]] = []

        for job_id in job_ids:
            result = await self._job_service.get_result(job_id)
            if result is None:
                continue
            completed_jobs.append({"job_id": job_id, "summary": result.summary.model_dump()})
            parsed = await self._load_job_data(job_id)
            for inv in parsed.invoices:
                entity = inv.get("buyer_gstin") or "UNKNOWN_ENTITY"
                if entity not in entities:
                    entities[entity] = {
                        "entity_gstin": entity,
                        "invoice_count": 0,
                        "taxable_value": 0.0,
                        "itc_at_risk": 0.0,
                        "risk_badge": "LOW",
                    }
                entities[entity]["invoice_count"] += 1
                entities[entity]["taxable_value"] += float(inv.get("taxable_value", 0) or 0)
            for issue in result.issues:
                entity = "UNKNOWN_ENTITY"
                match = next((i for i in parsed.invoices if i.get("invoice_no") == issue.invoice_no), None)
                if match:
                    entity = match.get("buyer_gstin") or "UNKNOWN_ENTITY"
                entities.setdefault(
                    entity,
                    {
                        "entity_gstin": entity,
                        "invoice_count": 0,
                        "taxable_value": 0.0,
                        "itc_at_risk": 0.0,
                        "risk_badge": "LOW",
                    },
                )
                entities[entity]["itc_at_risk"] += issue.amount_at_risk

        entity_rows = list(entities.values())
        for row in entity_rows:
            if row["itc_at_risk"] >= 500000:
                row["risk_badge"] = "HIGH"
            elif row["itc_at_risk"] >= 100000:
                row["risk_badge"] = "MEDIUM"
            else:
                row["risk_badge"] = "LOW"
            row["taxable_value"] = round(row["taxable_value"], 2)
            row["itc_at_risk"] = round(row["itc_at_risk"], 2)

        total_risk = sum(x["itc_at_risk"] for x in entity_rows)
        narration = (
            f"Morning risk brief. "
            f"Entities tracked {len(entity_rows)}. "
            f"Total ITC at risk INR {total_risk:,.2f}. "
            f"High risk entities {sum(1 for x in entity_rows if x['risk_badge'] == 'HIGH')}."
        )
        return {
            "entities": sorted(entity_rows, key=lambda x: x["itc_at_risk"], reverse=True),
            "jobs_covered": len(completed_jobs),
            "narration_text": narration,
        }

    async def build_readiness(self, job_id: str) -> dict[str, Any]:
        status = await self._job_service.get_status(job_id)
        if status is None:
            raise ValueError("Job not found.")

        reasons: list[str] = []
        parsed = await self._load_job_data(job_id)
        result = await self._job_service.get_result(job_id)

        has_invoices = len(parsed.invoices) > 0
        has_gstr2b = len(parsed.gstr2b) > 0
        has_result = result is not None

        if not has_result:
            reasons.append("Reconciliation result not available for this job yet.")
        if not has_invoices:
            reasons.append("No invoice dataset detected in uploaded files.")
        if not has_gstr2b:
            reasons.append("No GSTR-2B records detected in uploaded files.")

        has_hsn = bool(
            has_result and result is not None and any(issue.issue_code == "hsn_mismatch" for issue in result.issues)
        )
        if has_result and result is not None and not has_hsn:
            reasons.append("No HSN mismatch cases found in this job.")

        has_doc_sources = False
        for meta in await self._job_service.get_job_files(job_id):
            suffix = Path(str(meta.get("path", ""))).suffix.lower()
            if suffix in {".png", ".jpg", ".jpeg", ".pdf"}:
                has_doc_sources = True
                break
        if not has_doc_sources:
            reasons.append("No source image/PDF invoices available for visual preview.")

        compliance_ready = has_invoices and has_gstr2b and has_result
        anomaly_ready = bool(has_result and result is not None and len(result.issues) > 0)
        evidence_ready = bool(has_result and result is not None and len(result.issues) > 0)

        return {
            "job_id": job_id,
            "compliance_ready": compliance_ready,
            "anomaly_ready": anomaly_ready,
            "evidence_ready": evidence_ready,
            "reasons": reasons,
        }

    async def build_gstr3b_sanity(self, job_id: str) -> dict[str, Any]:
        parsed = await self._load_job_data(job_id)
        if not parsed.invoices:
            raise ValueError("No invoice dataset available for this job.")
        result = await self._job_service.get_result(job_id)
        if result is None:
            raise ValueError("Job result not available.")

        taxable = round(sum(float(x.get("taxable_value", 0) or 0) for x in parsed.invoices), 2)
        total_tax = round(sum(float(x.get("total_tax", 0) or 0) for x in parsed.invoices), 2)
        expected_itc = round(total_tax - result.summary.total_itc_at_risk, 2)

        # Demo prefill numbers with intentional deviations for sanity checker showcase.
        claimed_taxable = round(taxable * 1.018, 2)
        claimed_itc = round(max(expected_itc * 1.09, 0), 2)
        blocked_itc = round(max(total_tax - claimed_itc, 0), 2)

        exceptions = []
        diff_taxable = round(claimed_taxable - taxable, 2)
        if abs(diff_taxable) > 1000:
            exceptions.append(
                {
                    "code": "taxable_mismatch",
                    "severity": "WARNING",
                    "expected": taxable,
                    "claimed": claimed_taxable,
                    "difference": diff_taxable,
                    "message": "Claimed taxable value deviates from purchase register baseline.",
                }
            )
        diff_itc = round(claimed_itc - expected_itc, 2)
        if abs(diff_itc) > 1000:
            exceptions.append(
                {
                    "code": "itc_overclaim_risk",
                    "severity": "CRITICAL",
                    "expected": expected_itc,
                    "claimed": claimed_itc,
                    "difference": diff_itc,
                    "message": "Claimed ITC exceeds risk-adjusted eligible ITC.",
                }
            )
        if blocked_itc > 0:
            exceptions.append(
                {
                    "code": "blocked_itc_present",
                    "severity": "WARNING",
                    "expected": 0.0,
                    "claimed": blocked_itc,
                    "difference": blocked_itc,
                    "message": "Blocked ITC is present and needs cash-flow provisioning.",
                }
            )

        narration = (
            f"GSTR 3B sanity summary for job {job_id}. "
            f"Exceptions found {len(exceptions)}. "
            f"Claimed ITC INR {claimed_itc:,.2f} versus expected INR {expected_itc:,.2f}."
        )
        return {
            "job_id": job_id,
            "prefill": {
                "taxable_value_expected": taxable,
                "taxable_value_claimed": claimed_taxable,
                "itc_expected": expected_itc,
                "itc_claimed": claimed_itc,
                "blocked_itc": blocked_itc,
            },
            "exceptions": exceptions,
            "narration_text": narration,
        }

    async def build_anomaly_highlights(self, job_id: str) -> dict[str, Any]:
        parsed = await self._load_job_data(job_id)
        if not parsed.invoices:
            raise ValueError("No invoice dataset available for this job.")
        result = await self._job_service.get_result(job_id)
        if result is None:
            raise ValueError("Job result not available.")

        seen: dict[tuple[str, str], dict[str, Any]] = {}
        duplicates: list[dict[str, Any]] = []
        for inv in parsed.invoices:
            key = ((inv.get("supplier_gstin") or "").upper(), (inv.get("invoice_no") or "").upper())
            if key in seen:
                first = seen[key]
                duplicates.append(
                    {
                        "type": "duplicate_invoice",
                        "severity": "CRITICAL",
                        "invoice_id": str(inv.get("doc_id") or key[1]),
                        "supplier_gstin": key[0],
                        "invoice_no": key[1],
                        "amount": float(inv.get("total_tax", 0) or 0),
                        "evidence": {
                            "first_doc_id": first.get("doc_id"),
                            "second_doc_id": inv.get("doc_id"),
                        },
                    }
                )
            else:
                seen[key] = inv

        high_value = sorted(parsed.invoices, key=lambda x: float(x.get("invoice_total", 0) or 0), reverse=True)[:8]
        outlier_cutoff = (
            sum(float(i.get("invoice_total", 0) or 0) for i in parsed.invoices) / max(1, len(parsed.invoices))
        ) * 2.2
        outliers = [
            {
                "type": "value_outlier",
                "severity": "WARNING",
                "invoice_id": str(i.get("doc_id") or i.get("invoice_no") or ""),
                "supplier_gstin": i.get("supplier_gstin"),
                "invoice_no": i.get("invoice_no"),
                "amount": round(float(i.get("invoice_total", 0) or 0), 2),
                "evidence": {"reason": "Invoice total significantly above portfolio mean"},
            }
            for i in high_value
            if float(i.get("invoice_total", 0) or 0) >= outlier_cutoff
        ]

        linked_critical = [
            {
                "type": "critical_recon_risk",
                "severity": issue.severity.value,
                "invoice_id": issue.invoice_id,
                "supplier_gstin": issue.supplier_gstin,
                "invoice_no": issue.invoice_no,
                "amount": issue.amount_at_risk,
                "evidence": issue.evidence,
            }
            for issue in result.issues
            if issue.severity.value == "CRITICAL"
        ][:25]

        anomalies = duplicates + outliers + linked_critical
        anomalies = sorted(anomalies, key=lambda x: float(x.get("amount", 0) or 0), reverse=True)
        narration = (
            f"Anomaly triage for job {job_id}. "
            f"Total anomalies {len(anomalies)}. "
            f"Duplicate alerts {len(duplicates)}. "
            f"Critical reconciliation risks {len(linked_critical)}."
        )
        return {"job_id": job_id, "anomalies": anomalies[:60], "narration_text": narration}

    async def build_watchlist(self, job_id: str | None = None) -> dict[str, Any]:
        selected_job_id = job_id
        if job_id:
            status = await self._job_service.get_status(job_id)
            if status is None:
                raise ValueError("Job not found.")
            job_ids = [job_id]
        else:
            job_ids = await self._job_service.list_known_job_ids()
        supplier_stats: dict[str, dict[str, Any]] = {}

        for job_id in job_ids:
            result = await self._job_service.get_result(job_id)
            if result is None:
                continue
            for issue in result.issues:
                row = supplier_stats.setdefault(
                    issue.supplier_gstin,
                    {
                        "supplier_gstin": issue.supplier_gstin,
                        "critical_count": 0,
                        "warning_count": 0,
                        "itc_risk": 0.0,
                        "risk_badge": "LOW",
                        "latest_issue": issue.issue_code,
                        "latest_invoice_id": issue.invoice_id,
                        "latest_invoice_no": issue.invoice_no,
                        "latest_job_id": job_id,
                    },
                )
                row["itc_risk"] += issue.amount_at_risk
                row["latest_issue"] = issue.issue_code
                row["latest_invoice_id"] = issue.invoice_id
                row["latest_invoice_no"] = issue.invoice_no
                row["latest_job_id"] = job_id
                if issue.severity.value == "CRITICAL":
                    row["critical_count"] += 1
                elif issue.severity.value == "WARNING":
                    row["warning_count"] += 1

        watchlist = list(supplier_stats.values())
        for row in watchlist:
            if row["critical_count"] >= 3 or row["itc_risk"] >= 100000:
                row["risk_badge"] = "HIGH"
            elif row["critical_count"] >= 1 or row["itc_risk"] >= 25000:
                row["risk_badge"] = "MEDIUM"
            else:
                row["risk_badge"] = "LOW"
            row["itc_risk"] = round(row["itc_risk"], 2)

        return {
            "job_id": selected_job_id,
            "watchlist": sorted(watchlist, key=lambda x: x["itc_risk"], reverse=True)[:200],
        }

    async def build_hsn_suggestions(self, job_id: str) -> dict[str, Any]:
        result = await self._job_service.get_result(job_id)
        if result is None:
            raise ValueError("Job result not available.")
        suggestions: list[dict[str, Any]] = []

        for issue in result.issues:
            if issue.issue_code != "hsn_mismatch":
                continue
            evidence = issue.evidence or {}
            invoice_codes = evidence.get("invoice_hsn_codes") if isinstance(evidence, dict) else []
            gstr_codes = evidence.get("gstr2b_hsn_codes") if isinstance(evidence, dict) else []
            inv = invoice_codes[0] if isinstance(invoice_codes, list) and invoice_codes else ""
            g2b = gstr_codes[0] if isinstance(gstr_codes, list) and gstr_codes else ""
            suggested = g2b or inv
            confidence = 0.58
            if suggested in RATE_BY_HSN:
                confidence = 0.82
            if inv and g2b and inv in RATE_BY_HSN and g2b in RATE_BY_HSN:
                confidence = 0.74 if RATE_BY_HSN[inv] == RATE_BY_HSN[g2b] else 0.67
            suggestions.append(
                {
                    "invoice_id": issue.invoice_id,
                    "invoice_no": issue.invoice_no,
                    "supplier_gstin": issue.supplier_gstin,
                    "current_hsn": inv,
                    "gstr2b_hsn": g2b,
                    "suggested_hsn": suggested,
                    "suggested_rate": RATE_BY_HSN.get(suggested),
                    "confidence": round(confidence, 2),
                    "reason": "Aligned with supplier filing and GST rate consistency checks.",
                }
            )

        return {"job_id": job_id, "suggestions": suggestions}

    async def build_delta_digest(self) -> dict[str, Any]:
        job_ids = await self._job_service.list_known_job_ids()
        completed: list[dict[str, Any]] = []
        for job_id in job_ids:
            status = await self._job_service.get_status(job_id)
            result = await self._job_service.get_result(job_id)
            if status is None or result is None:
                continue
            completed.append(
                {
                    "job_id": job_id,
                    "created_at": status.created_at,
                    "summary": result.summary.model_dump(),
                }
            )
        completed.sort(key=lambda x: x["created_at"], reverse=True)
        if len(completed) < 2:
            return {
                "current_job_id": completed[0]["job_id"] if completed else None,
                "previous_job_id": None,
                "delta": {},
                "message": "Need at least two completed cycles to compute delta digest.",
            }

        current = completed[0]
        previous = completed[1]
        c = current["summary"]
        p = previous["summary"]
        delta = {
            "critical_count": c["critical_count"] - p["critical_count"],
            "warning_count": c["warning_count"] - p["warning_count"],
            "matched_pct": round(c["matched_pct"] - p["matched_pct"], 2),
            "total_itc_at_risk": round(c["total_itc_at_risk"] - p["total_itc_at_risk"], 2),
        }
        direction = "improved" if delta["total_itc_at_risk"] < 0 and delta["critical_count"] <= 0 else "deteriorated"
        return {
            "current_job_id": current["job_id"],
            "previous_job_id": previous["job_id"],
            "delta": delta,
            "direction": direction,
            "message": f"Cycle quality has {direction} versus previous filing cycle.",
        }

    async def build_inbox(self, role: str, job_id: str | None = None) -> dict[str, Any]:
        selected_job_id = job_id
        normalized_role = role.lower().strip()
        if normalized_role not in SUGGESTED_ROLES:
            normalized_role = "team"
        if job_id:
            status = await self._job_service.get_status(job_id)
            if status is None:
                raise ValueError("Job not found.")
            job_ids = [job_id]
        else:
            job_ids = await self._job_service.list_known_job_ids()
        tasks: list[dict[str, Any]] = []

        for job_id in job_ids:
            result = await self._job_service.get_result(job_id)
            if result is None:
                continue
            for issue in result.issues[:120]:
                assignee = "CA Manager" if issue.severity.value == "CRITICAL" else "Recon Analyst"
                queue = "approval" if issue.severity.value == "CRITICAL" else "ops"
                task = {
                    "job_id": job_id,
                    "invoice_id": issue.invoice_id,
                    "invoice_no": issue.invoice_no,
                    "supplier_gstin": issue.supplier_gstin,
                    "severity": issue.severity.value,
                    "issue_code": issue.issue_code,
                    "amount_at_risk": issue.amount_at_risk,
                    "queue": queue,
                    "assignee": assignee,
                    "status": "OPEN",
                    "due_in_days": 1 if issue.severity.value == "CRITICAL" else 3,
                    "action": issue.suggested_action,
                }
                if normalized_role == "manager" and queue == "approval":
                    tasks.append(task)
                elif normalized_role == "team" and queue == "ops":
                    tasks.append(task)

        return {
            "role": normalized_role,
            "job_id": selected_job_id,
            "tasks": sorted(tasks, key=lambda x: x["amount_at_risk"], reverse=True)[:200],
        }

    async def build_cashflow_simulator(self, job_id: str, annual_interest_pct: float = 14.0) -> dict[str, Any]:
        result = await self._job_service.get_result(job_id)
        if result is None:
            raise ValueError("Job result not available.")
        blocked_itc = result.summary.total_itc_at_risk
        monthly_interest = annual_interest_pct / 12.0 / 100.0
        monthly_cost = round(blocked_itc * monthly_interest, 2)
        quarter_cost = round(monthly_cost * 3, 2)
        year_cost = round(monthly_cost * 12, 2)
        working_capital_ratio = round((blocked_itc / max(1.0, blocked_itc + 500000)) * 100, 2)
        return {
            "job_id": job_id,
            "blocked_itc": round(blocked_itc, 2),
            "annual_interest_pct": annual_interest_pct,
            "monthly_financing_cost": monthly_cost,
            "quarter_financing_cost": quarter_cost,
            "annual_financing_cost": year_cost,
            "working_capital_stress_pct": working_capital_ratio,
        }

    async def build_circular_impact(self, job_id: str) -> dict[str, Any]:
        result = await self._job_service.get_result(job_id)
        if result is None:
            raise ValueError("Job result not available.")
        issue_codes = {issue.issue_code for issue in result.issues}
        circulars = [
            {
                "id": "CIRC-ITC-16",
                "title": "Section 16 ITC eligibility tightening",
                "impact": "High",
                "applies": any(code in issue_codes for code in {"missing_in_2b", "gstin_status_risk"}),
                "summary": "Strengthen supplier filing validation before ITC claim finalization.",
            },
            {
                "id": "CIRC-HSN-2025",
                "title": "HSN reporting scrutiny advisory",
                "impact": "Medium",
                "applies": "hsn_mismatch" in issue_codes,
                "summary": "Mismatch in HSN/SAC may attract notices; corrective invoice collection advised.",
            },
            {
                "id": "CIRC-VAL-DRIFT",
                "title": "Value consistency and reconciliation emphasis",
                "impact": "Medium",
                "applies": any(code in issue_codes for code in {"value_drift", "rate_mismatch"}),
                "summary": "Taxable value and tax-rate consistency should be evidenced in books.",
            },
        ]
        relevant = [c for c in circulars if c["applies"]]
        return {"job_id": job_id, "relevant_circulars": relevant, "all_circulars": circulars}

    async def build_sla_analytics(self, job_id: str | None = None) -> dict[str, Any]:
        selected_job_id = job_id
        if job_id:
            status = await self._job_service.get_status(job_id)
            if status is None:
                raise ValueError("Job not found.")
            job_ids = [job_id]
        else:
            job_ids = await self._job_service.list_known_job_ids()
        supplier_map: dict[str, dict[str, Any]] = {}
        for job_id in job_ids:
            result = await self._job_service.get_result(job_id)
            if result is None:
                continue
            for issue in result.issues:
                row = supplier_map.setdefault(
                    issue.supplier_gstin,
                    {
                        "supplier_gstin": issue.supplier_gstin,
                        "total_tickets": 0,
                        "critical_tickets": 0,
                        "synthetic_avg_resolution_days": 0.0,
                        "sla_breach_pct": 0.0,
                        "compliance_score": 100.0,
                    },
                )
                row["total_tickets"] += 1
                if issue.severity.value == "CRITICAL":
                    row["critical_tickets"] += 1

        analytics: list[dict[str, Any]] = []
        for gstin, row in supplier_map.items():
            seed = sum(ord(c) for c in gstin) % 100
            avg_days = round(1.8 + (seed / 100.0) * 8.5, 2)
            breach_pct = round(min(95.0, (row["critical_tickets"] * 12.5) + (seed % 17)), 2)
            score = round(max(0.0, 100.0 - breach_pct * 0.6 - row["critical_tickets"] * 2.1), 2)
            row["synthetic_avg_resolution_days"] = avg_days
            row["sla_breach_pct"] = breach_pct
            row["compliance_score"] = score
            analytics.append(row)
        analytics.sort(key=lambda x: (x["compliance_score"], -x["total_tickets"]))
        return {"job_id": selected_job_id, "suppliers": analytics[:250]}

    async def build_invoice_preview(self, job_id: str, invoice_id: str) -> dict[str, Any]:
        status = await self._job_service.get_status(job_id)
        if status is None:
            raise ValueError("Job not found.")
        result = await self._job_service.get_result(job_id)
        if result is None:
            raise ValueError("Job result not available.")

        parsed = await self._load_job_data(job_id)
        events = await self._job_service.get_job_events(job_id)
        files = await self._job_service.get_job_files(job_id)

        issue = next((x for x in result.issues if x.invoice_id == invoice_id), None)
        invoice_no = issue.invoice_no if issue else None
        supplier_gstin = issue.supplier_gstin if issue else None

        invoice_row = None
        if invoice_no:
            invoice_row = next((x for x in parsed.invoices if str(x.get("invoice_no", "")).upper() == invoice_no.upper()), None)
        if invoice_row is None:
            compact = "".join(ch for ch in invoice_id.lower() if ch.isalnum())
            for row in parsed.invoices:
                target = "".join(ch for ch in str(row.get("invoice_no", "")).lower() if ch.isalnum())
                if target and target in compact:
                    invoice_row = row
                    break
        if invoice_row and not invoice_no:
            invoice_no = str(invoice_row.get("invoice_no") or "") or None
            supplier_gstin = str(invoice_row.get("supplier_gstin") or "") or supplier_gstin

        gstr2b_row = None
        if invoice_no:
            gstr2b_row = next(
                (
                    x
                    for x in parsed.gstr2b
                    if str(x.get("invoice_no", "")).upper() == invoice_no.upper()
                    and (not supplier_gstin or str(x.get("supplier_gstin", "")).upper() == str(supplier_gstin).upper())
                ),
                None,
            )

        file_tokens = set()
        for value in [invoice_id, invoice_no]:
            if not value:
                continue
            compact = "".join(ch for ch in str(value).lower() if ch.isalnum())
            if compact:
                file_tokens.add(compact)
            digits = "".join(ch for ch in str(value) if ch.isdigit())
            if digits:
                file_tokens.add(digits)
                file_tokens.add(digits[-5:])

        source_meta = None
        for meta in files:
            suffix = Path(str(meta.get("path", ""))).suffix.lower()
            if suffix not in {".png", ".jpg", ".jpeg", ".pdf"}:
                continue
            name_compact = "".join(ch for ch in str(meta.get("filename", "")).lower() if ch.isalnum())
            if not file_tokens or any(token and token in name_compact for token in file_tokens):
                source_meta = meta
                break
        if source_meta is None:
            source_meta = next(
                (
                    meta
                    for meta in files
                    if Path(str(meta.get("path", ""))).suffix.lower() in {".png", ".jpg", ".jpeg", ".pdf"}
                ),
                None,
            )

        source_available = source_meta is not None
        source_file_id = str(source_meta.get("file_id")) if source_meta else None
        source_filename = str(source_meta.get("filename")) if source_meta else None
        source_content_type = str(source_meta.get("content_type") or "") or None
        preview_type = "none"
        if source_filename:
            suffix = Path(source_filename).suffix.lower()
            if suffix == ".pdf":
                preview_type = "pdf"
            elif suffix in {".png", ".jpg", ".jpeg"}:
                preview_type = "image"

        reasons: list[str] = []
        if not source_available:
            reasons.append("Source invoice image/PDF not available for this invoice.")
        if issue is None:
            reasons.append("No issue row matched this invoice id in reconciliation output.")

        ocr_excerpt = None
        if result.notes:
            joined = " ".join(result.notes)
            if "OCR completed on" in joined:
                ocr_excerpt = joined[:420]

        actions: list[dict[str, Any]] = []
        if issue is not None:
            actions.append(
                {
                    "invoice_id": issue.invoice_id,
                    "issue_code": issue.issue_code,
                    "severity": issue.severity.value,
                    "owner": "CA Team",
                    "action": issue.suggested_action,
                    "due_in_days": 2 if issue.severity.value == "CRITICAL" else 5,
                }
            )

        return {
            "job_id": job_id,
            "invoice_id": invoice_id,
            "invoice_no": invoice_no,
            "supplier_gstin": supplier_gstin,
            "source_available": source_available,
            "source_file_id": source_file_id,
            "source_download_url": f"/v1/jobs/{job_id}/files/{source_file_id}/download" if source_file_id else None,
            "source_filename": source_filename,
            "source_content_type": source_content_type,
            "preview_type": preview_type,
            "ocr_excerpt": ocr_excerpt,
            "invoice_record": invoice_row,
            "gstr2b_record": gstr2b_row,
            "issue": issue.model_dump() if issue else None,
            "timeline": [
                {
                    "ts": evt.get("ts"),
                    "stage": evt.get("stage"),
                    "message": evt.get("message"),
                    "type": evt.get("type"),
                }
                for evt in events[-20:]
            ],
            "actions": actions,
            "notes": result.notes[-12:],
            "reasons": reasons,
        }

    async def _load_job_data(self, job_id: str) -> ParsedJobData:
        files = await self._job_service.get_job_files(job_id)
        invoices: list[dict[str, Any]] = []
        gstr2b: list[dict[str, Any]] = []
        for meta in files:
            path = Path(str(meta.get("path", "")))
            if not path.exists() or not path.is_file():
                continue
            suffix = path.suffix.lower()
            try:
                if suffix == ".jsonl":
                    inv, g2b = self._parse_jsonl(path)
                    invoices.extend(inv)
                    gstr2b.extend(g2b)
                elif suffix == ".json":
                    inv, g2b = self._parse_json(path)
                    invoices.extend(inv)
                    gstr2b.extend(g2b)
                elif suffix == ".csv":
                    gstr2b.extend(self._parse_csv(path))
            except Exception:
                continue
        return ParsedJobData(invoices=invoices, gstr2b=gstr2b)

    def _parse_jsonl(self, path: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        invoices: list[dict[str, Any]] = []
        gstr2b: list[dict[str, Any]] = []
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            if not isinstance(row, dict):
                continue
            if self._looks_like_invoice(row):
                invoices.append(row)
            elif self._looks_like_gstr2b(row):
                gstr2b.append(row)
        return invoices, gstr2b

    def _parse_json(self, path: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        payload = json.loads(path.read_text(encoding="utf-8"))
        rows = payload if isinstance(payload, list) else [payload] if isinstance(payload, dict) else []
        invoices: list[dict[str, Any]] = []
        gstr2b: list[dict[str, Any]] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            if self._looks_like_invoice(row):
                invoices.append(row)
            elif self._looks_like_gstr2b(row):
                gstr2b.append(row)
        return invoices, gstr2b

    def _parse_csv(self, path: Path) -> list[dict[str, Any]]:
        entries: list[dict[str, Any]] = []
        with path.open("r", encoding="utf-8", newline="") as fp:
            reader = csv.DictReader(fp)
            for row in reader:
                cleaned = {k: (v.strip() if isinstance(v, str) else v) for k, v in row.items()}
                if "hsn_codes" in cleaned and isinstance(cleaned["hsn_codes"], str):
                    cleaned["hsn_codes"] = [x for x in cleaned["hsn_codes"].split(";") if x]
                entries.append(cleaned)
        return entries

    def _looks_like_invoice(self, row: dict[str, Any]) -> bool:
        return "invoice_no" in row and (
            "line_items" in row or "buyer_gstin" in row or "doc_id" in row or "invoice_total" in row
        )

    def _looks_like_gstr2b(self, row: dict[str, Any]) -> bool:
        return "supplier_gstin" in row and "invoice_no" in row and (
            "return_period" in row or "hsn_codes" in row or "supplier_status" in row
        )
