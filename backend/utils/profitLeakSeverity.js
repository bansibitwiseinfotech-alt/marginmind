/**
 * backend/utils/profitLeakSeverity.js
 *
 * Configurable multi-factor severity engine.
 * Evaluates absolute loss, margin erosion, and data confidence
 * rather than relying solely on a fixed dollar threshold.
 */

import { toNumber, roundMoney } from "./profitCalculation.js";

export const DEFAULT_THRESHOLDS = {
    // Critical thresholds
    criticalAbsoluteImpact: 100, // Loss >= $100
    criticalNegativeMarginPercent: -10, // Margin <= -10%
    criticalRefundRatePercent: 40, // Refunds >= 40% of order value

    // Warning thresholds
    warningAbsoluteImpact: 25, // Loss >= $25
    warningLowMarginPercent: 10, // Margin < 10%
    warningDiscountDilutionPercent: 25, // Discounts reducing margin by > 25%
};

/**
 * Evaluates severity level and returns detailed rationale.
 *
 * @param {object} params
 * @param {number} params.profitImpact - Dollar profit reduction
 * @param {number|null} params.marginPercent - Profit margin percentage
 * @param {number} params.revenue - Associated revenue
 * @param {"HIGH"|"MEDIUM"|"LOW"} params.confidence - Data reliability
 * @param {string} params.leakType - Category of leak
 * @param {object} [customThresholds] - Store-configured threshold overrides
 * @returns {{ severity: "CRITICAL"|"WARNING"|"INFO", rule: string, confidence: "HIGH"|"MEDIUM"|"LOW" }}
 */
export function evaluateSeverity({
    profitImpact = 0,
    marginPercent = null,
    revenue = 0,
    confidence = "HIGH",
    leakType = "PRODUCT",
}, customThresholds = {}) {
    const thresholds = { ...DEFAULT_THRESHOLDS, ...customThresholds };
    const impact = roundMoney(Math.abs(toNumber(profitImpact)));
    const margin = marginPercent !== null ? toNumber(marginPercent) : null;
    const rev = roundMoney(toNumber(revenue));

    // Data quality issues without proven loss are informational
    if (leakType === "DATA_QUALITY") {
        return {
            severity: "INFO",
            rule: "Informational: Missing financial parameter or COGS data prevents exact profit assessment",
            confidence,
        };
    }

    // High confidence + Large loss OR Severe negative margin -> CRITICAL
    if (
        (impact >= thresholds.criticalAbsoluteImpact && confidence === "HIGH") ||
        (margin !== null && margin <= thresholds.criticalNegativeMarginPercent && impact >= 20) ||
        (rev > 0 && impact / rev >= 0.5 && impact >= 30)
    ) {
        return {
            severity: "CRITICAL",
            rule: `Critical leak: Substantial financial drag (Impact: $${impact}, Margin: ${margin !== null ? margin + "%" : "N/A"})`,
            confidence,
        };
    }

    // Moderate loss OR low margin OR medium confidence high loss -> WARNING
    if (
        impact >= thresholds.warningAbsoluteImpact ||
        (margin !== null && margin < thresholds.warningLowMarginPercent && impact >= 10) ||
        (impact >= thresholds.criticalAbsoluteImpact && confidence === "MEDIUM")
    ) {
        return {
            severity: "WARNING",
            rule: `Warning leak: Actionable profit erosion identified (Impact: $${impact}, Margin: ${margin !== null ? margin + "%" : "N/A"})`,
            confidence,
        };
    }

    // Minor impact or low-confidence indicators -> INFO
    return {
        severity: "INFO",
        rule: `Informational finding: Low impact or estimated variance (Impact: $${impact})`,
        confidence,
    };
}
