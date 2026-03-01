from __future__ import annotations

import re
from typing import Any

from app.schemas import ChatResponse, ResultSummary, ScenarioCard, ScenarioMetric


class ChatService:
    def __init__(self, mistral_service: Any) -> None:
        self._mistral = mistral_service

    def _looks_like_sandbox(self, question: str) -> bool:
        q = (question or "").strip().lower()
        if not q:
            return False
        patterns = (
            "what if",
            "suppose",
            "assume",
            "if we",
            "if supplier",
            "if gst rate",
            "scenario",
            "simulate",
            "impact if",
            "yaar if",
            "என்றால்",
            "अगर",
        )
        return any(p in q for p in patterns)

    def _extract_amount(self, text: str) -> float | None:
        match = re.search(r"₹?\s*([\d,]+(?:\.\d+)?)", text)
        if not match:
            return None
        try:
            value = float(match.group(1).replace(",", ""))
            return value if value > 0 else None
        except ValueError:
            return None

    def _extract_rate(self, text: str) -> float | None:
        match = re.search(r"(\d{1,2}(?:\.\d{1,2})?)\s*%", text)
        if not match:
            return None
        try:
            value = float(match.group(1))
            return value if 0 < value <= 40 else None
        except ValueError:
            return None

    def _format_currency(self, value: float) -> str:
        return f"₹{value:,.2f}"

    def _scenario_card(
        self,
        question: str,
        language: str,
        summary: ResultSummary,
        issues: list[dict[str, Any]],
    ) -> ScenarioCard:
        q = question.lower()
        base_risk = float(summary.total_itc_at_risk or 0.0)
        amount_hint = self._extract_amount(question) or max(base_risk * 0.2, 0.0)
        rate_hint = self._extract_rate(question) or 18.0

        recovery_factor = 0.35
        assumption_text = "supplier files/amends within current cycle"
        if "supplier" in q and ("file" in q or "amend" in q):
            recovery_factor = 0.55
            assumption_text = "supplier filing correction lands in current 2B cycle"
        elif "rate" in q or "hsn" in q:
            recovery_factor = 0.28
            assumption_text = "rate/HSN correction accepted on disputed invoices"
        elif "defer" in q or "next month" in q:
            recovery_factor = 0.18
            assumption_text = "credit recovery deferred to next filing month"

        simulated_itc = amount_hint * (rate_hint / 100.0)
        recoverable = min(base_risk, simulated_itc * recovery_factor)
        projected_risk = max(base_risk - recoverable, 0.0)
        monthly_interest = projected_risk * (14.0 / 12.0 / 100.0)
        impacted_invoices = len([i for i in issues if float(i.get("amount_at_risk", 0) or 0) > 0])

        if language == "hi":
            title = "टैक्स इम्प्लिकेशन सिमुलेशन"
            subtitle = "काल्पनिक परिदृश्य पर आधारित अनुमानित प्रभाव (फाइनल सलाह नहीं)"
            assumptions = [
                f"मान लिया: {assumption_text}",
                f"मान्य GST दर: {rate_hint:.2f}%",
            ]
            disclaimer = "यह डेमो-स्तरीय अनुमान है। अंतिम दावा करने से पहले CA समीक्षा अनिवार्य है।"
            metrics = [
                ScenarioMetric(label="वर्तमान ITC जोखिम", value=self._format_currency(base_risk), tone="critical"),
                ScenarioMetric(label="अनुमानित रिकवरी", value=self._format_currency(recoverable), tone="good"),
                ScenarioMetric(label="प्रोजेक्टेड जोखिम", value=self._format_currency(projected_risk), tone="warning"),
                ScenarioMetric(label="मासिक वित्त लागत", value=self._format_currency(monthly_interest), tone="info"),
                ScenarioMetric(label="प्रभावित इनवॉइस", value=str(impacted_invoices), tone="default"),
            ]
        elif language == "ta":
            title = "வரி தாக்கம் சிமுலேஷன்"
            subtitle = "இந்த வேலை தரவை அடிப்படையாக கொண்ட கணிப்பு (இது இறுதி ஆலோசனை அல்ல)"
            assumptions = [
                f"கருதல்: {assumption_text}",
                f"கணிக்கப்பட்ட GST விகிதம்: {rate_hint:.2f}%",
            ]
            disclaimer = "இது டெமோ கணிப்பு மட்டுமே. இறுதி filingக்கு முன் CA சரிபார்ப்பு அவசியம்."
            metrics = [
                ScenarioMetric(label="தற்போதைய ITC ஆபத்து", value=self._format_currency(base_risk), tone="critical"),
                ScenarioMetric(label="மீட்கக்கூடிய ITC", value=self._format_currency(recoverable), tone="good"),
                ScenarioMetric(label="புதிய ஆபத்து நிலை", value=self._format_currency(projected_risk), tone="warning"),
                ScenarioMetric(label="மாதாந்திர நிதிச்செலவு", value=self._format_currency(monthly_interest), tone="info"),
                ScenarioMetric(label="பாதிக்கும் இன்வாய்ஸ்கள்", value=str(impacted_invoices), tone="default"),
            ]
        elif language == "hinglish":
            title = "Tax Implication Simulator"
            subtitle = "Ye hypothetical scenario hai, filing decision se pehle CA validate kare"
            assumptions = [
                f"Assumption: {assumption_text}",
                f"Assumed GST rate: {rate_hint:.2f}%",
            ]
            disclaimer = "Demo estimate only. Final ITC claim se pehle CA review mandatory."
            metrics = [
                ScenarioMetric(label="Current ITC risk", value=self._format_currency(base_risk), tone="critical"),
                ScenarioMetric(label="Likely recovery", value=self._format_currency(recoverable), tone="good"),
                ScenarioMetric(label="Projected risk", value=self._format_currency(projected_risk), tone="warning"),
                ScenarioMetric(label="Monthly finance cost", value=self._format_currency(monthly_interest), tone="info"),
                ScenarioMetric(label="Impacted invoices", value=str(impacted_invoices), tone="default"),
            ]
        elif language == "tanglish":
            title = "Tax Implication Simulator"
            subtitle = "Idhu hypothetical scenario; final filing-ku munadi CA validate pannunga"
            assumptions = [
                f"Assumption: {assumption_text}",
                f"Assumed GST rate: {rate_hint:.2f}%",
            ]
            disclaimer = "Demo estimate only. Final ITC claim-ku CA review mandatory."
            metrics = [
                ScenarioMetric(label="Current ITC risk", value=self._format_currency(base_risk), tone="critical"),
                ScenarioMetric(label="Likely recovery", value=self._format_currency(recoverable), tone="good"),
                ScenarioMetric(label="Projected risk", value=self._format_currency(projected_risk), tone="warning"),
                ScenarioMetric(label="Monthly finance cost", value=self._format_currency(monthly_interest), tone="info"),
                ScenarioMetric(label="Impacted invoices", value=str(impacted_invoices), tone="default"),
            ]
        else:
            title = "Tax Implication Simulator"
            subtitle = "Estimated impact from your hypothetical scenario (not final advice)."
            assumptions = [
                f"Assumption: {assumption_text}",
                f"Assumed GST rate: {rate_hint:.2f}%",
            ]
            disclaimer = "Demo estimate only. Validate with your CA before filing or reversing ITC."
            metrics = [
                ScenarioMetric(label="Current ITC risk", value=self._format_currency(base_risk), tone="critical"),
                ScenarioMetric(label="Likely recovery", value=self._format_currency(recoverable), tone="good"),
                ScenarioMetric(label="Projected risk", value=self._format_currency(projected_risk), tone="warning"),
                ScenarioMetric(label="Monthly finance cost", value=self._format_currency(monthly_interest), tone="info"),
                ScenarioMetric(label="Impacted invoices", value=str(impacted_invoices), tone="default"),
            ]

        return ScenarioCard(
            title=title,
            subtitle=subtitle,
            assumptions=assumptions,
            metrics=metrics,
            disclaimer=disclaimer,
        )

    def answer(
        self,
        question: str,
        language: str,
        response_style: str,
        summary: ResultSummary,
        issues: list[dict[str, Any]],
        notes: list[str],
        simulator_mode: bool = False,
    ) -> ChatResponse:
        q = (question or "").strip()
        if not q:
            raise ValueError("Question cannot be empty.")

        scenario_mode = bool(simulator_mode or self._looks_like_sandbox(q))
        citations: list[str] = []
        filters: list[str] = []
        scenario_card = self._scenario_card(q, language, summary, issues) if scenario_mode else None

        if getattr(self._mistral, "chat_enabled", False):
            ai_answer = self._mistral.answer_reconciliation_question(
                q,
                language,
                response_style,
                summary.model_dump(),
                issues,
                notes,
                scenario_mode=scenario_mode,
            )
            if ai_answer:
                citations = [str(i.get("invoice_id", "")) for i in issues[:10] if str(i.get("invoice_id", ""))]
                return ChatResponse(
                    answer=ai_answer,
                    citations=citations,
                    filters_applied=filters,
                    followups=[
                        "Show top 10 critical issues by amount",
                        "List suppliers with inactive GSTIN risk",
                        "Show period mismatch invoices",
                        "What if supplier files pending invoices this month?",
                    ],
                    simulator_card=scenario_card,
                )

        question_lower = q.lower()
        amount_match = re.search(r"(?:above|over|>)\s*₹?\s*([\d,]+(?:\.\d+)?)", question_lower)
        if not amount_match:
            amount_match = re.search(r"₹\s*([\d,]+(?:\.\d+)?)", question_lower)

        if amount_match:
            threshold = float(amount_match.group(1).replace(",", ""))
            filtered = [i for i in issues if float(i.get("amount_at_risk", 0) or 0) >= threshold]
            filters.append(f"amount_at_risk >= {threshold:.2f}")
            top = filtered[:15]
            citations = [str(x.get("invoice_id", "")) for x in top if str(x.get("invoice_id", ""))]
            answer = (
                f"Found {len(filtered)} issues with ITC risk >= ₹{threshold:,.2f}. "
                f"Top invoices: {', '.join(citations[:8]) if citations else 'none'}."
            )
        else:
            critical = summary.critical_count
            warning = summary.warning_count
            risk = summary.total_itc_at_risk
            citations = [str(i.get("invoice_id", "")) for i in issues[:10] if str(i.get("invoice_id", ""))]
            answer = (
                f"Total ITC at risk is ₹{risk:,.2f}. Critical: {critical}, Warning: {warning}, "
                f"Match rate: {summary.matched_pct:.2f}%."
            )

        return ChatResponse(
            answer=answer,
            citations=citations,
            filters_applied=filters,
            followups=[
                "Show top 10 critical issues by amount",
                "List suppliers with inactive GSTIN risk",
                "Show period mismatch invoices",
                "What if supplier files pending invoices this month?",
            ],
            simulator_card=scenario_card,
        )
