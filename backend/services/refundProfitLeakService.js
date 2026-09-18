/**
 * backend/services/refundProfitLeakService.js
 *
 * Detects catalog products with abnormal refund frequency or repeated return drag
 * that continually erodes contribution margin.
 */

import { getOrderProfitability } from "./orderProfitability.service.js";
import { evaluateSeverity } from "../utils/profitLeakSeverity.js";
import { roundMoney } from "../utils/profitCalculation.js";

export async function detectRefundProfitLeaks(shop, storeCurrency = "USD") {
    const leaks = [];

    // Query recent orders via existing service
    const result = await getOrderProfitability({
        shop,
        first: 100,
    });

    const orders = result?.orders || [];
    const productRefundMap = new Map();

    for (const order of orders) {
        const refunds = order?.refunds || [];
        if (!Array.isArray(refunds) || refunds.length === 0) continue;

        const lineItems = order?.lineItems || order?.items || [];

        for (const refund of refunds) {
            const refundItems = Array.isArray(refund?.refundLineItems?.nodes)
                ? refund.refundLineItems.nodes
                : Array.isArray(refund?.refundLineItems)
                    ? refund.refundLineItems
                    : [];

            for (const rItem of refundItems) {
                const title = rItem?.lineItem?.title || "Unknown Product";
                const qty = Number(rItem?.quantity || 1);

                // Find corresponding line item to get unit price
                const matchedItem = lineItems.find((l) => l.title === title);
                const unitPrice = Number(matchedItem?.unitPrice || matchedItem?.originalUnitPrice || 0);
                const refundedValue = unitPrice * qty;

                if (!productRefundMap.has(title)) {
                    productRefundMap.set(title, {
                        title,
                        refundCount: 0,
                        refundQuantity: 0,
                        totalRefundedAmount: 0,
                    });
                }

                const entry = productRefundMap.get(title);
                entry.refundCount += 1;
                entry.refundQuantity += qty;
                entry.totalRefundedAmount += refundedValue;
            }
        }
    }

    // Identify products with multiple return events or high refund values
    for (const [title, stats] of productRefundMap.entries()) {
        if (stats.refundCount >= 2 && stats.totalRefundedAmount >= 30) {
            const dedupKey = `prod_refund_drag_${encodeURIComponent(title)}`;
            const severityInfo = evaluateSeverity({
                profitImpact: stats.totalRefundedAmount,
                marginPercent: null,
                revenue: stats.totalRefundedAmount * 2,
                confidence: "HIGH",
                leakType: "REFUND",
            });

            leaks.push({
                shop,
                leakType: "REFUND",
                affectedArea: "Product Quality & Returns",
                title: `Frequent Return Drag: ${title}`,
                description: `Product "${title}" has suffered ${stats.refundCount} return events (${stats.refundQuantity} units returned) totaling ${storeCurrency} ${stats.totalRefundedAmount.toFixed(2)} in refunded value.`,
                resourceId: title,
                resourceType: "Product",
                resourceName: title,
                profitImpact: roundMoney(stats.totalRefundedAmount),
                impactCurrency: storeCurrency,
                impactType: "ACTUAL",
                severity: severityInfo.severity,
                status: "OPEN",
                confidence: "HIGH",
                detectionRule: "PRODUCT_HIGH_REFUND_RATE",
                evidence: {
                    productTitle: title,
                    returnEvents: stats.refundCount,
                    unitsRefunded: stats.refundQuantity,
                    totalRefundedAmount: roundMoney(stats.totalRefundedAmount),
                },
                metadata: {
                    calculationBreakdown: {
                        product: title,
                        totalRefundIncidents: stats.refundCount,
                        financialRefundDrain: stats.totalRefundedAmount,
                        recommendedAction: "Audit product description, sizing, or customer feedback to prevent recurrent returns",
                    },
                },
                deduplicationKey: dedupKey,
            });
        }
    }

    return leaks;
}
