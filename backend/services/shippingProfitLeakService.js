/**
 * backend/services/shippingProfitLeakService.js
 *
 * Detects shipping deficit leaks:
 * Shipping rates or delivery methods where actual merchant courier expenses
 * exceed customer-paid shipping charges.
 */

import { getShippingCostAnalysis } from "./shippingCost.service.js";
import { evaluateSeverity } from "../utils/profitLeakSeverity.js";
import { roundMoney } from "../utils/profitCalculation.js";

export async function detectShippingProfitLeaks(shop, storeCurrency = "USD") {
    const leaks = [];

    // Fetch real shipping method metrics from existing service
    const result = await getShippingCostAnalysis({ shop });
    const shippingMethods = result?.methods || result?.shippingMethods || [];
    const isConfigured = result?.config?.enabled === true;

    for (const method of shippingMethods) {
        const methodName = method.shippingMethod || method.title || "Standard Shipping";
        const ordersCount = Number(method.orders ?? method.orderCount ?? 0);
        const shippingCharged = Number(method.shippingCharged || 0);
        const merchantCost = method.shippingCost !== null && method.shippingCost !== undefined
            ? Number(method.shippingCost)
            : null;

        // Skip methods with 0 orders
        if (ordersCount === 0) {
            continue;
        }

        // Case A: Missing merchant shipping cost configuration
        if (merchantCost === null || !isConfigured) {
            const dedupKey = `ship_missing_config_${encodeURIComponent(methodName)}`;
            leaks.push({
                shop,
                leakType: "DATA_QUALITY",
                affectedArea: "Shipping & Fulfillment",
                title: `Unconfigured Courier Cost: ${methodName}`,
                description: `Merchant courier delivery expenses are not configured for "${methodName}". Shipping subsidies cannot be automatically reconciled against carrier bills.`,
                resourceId: methodName,
                resourceType: "ShippingLine",
                resourceName: methodName,
                profitImpact: 0,
                impactCurrency: storeCurrency,
                impactType: "MISSING_DATA",
                severity: "INFO",
                status: "OPEN",
                confidence: "LOW",
                detectionRule: "SHIPPING_COST_UNCONFIGURED",
                evidence: {
                    shippingMethod: methodName,
                    ordersCount,
                    totalShippingCharged: roundMoney(shippingCharged),
                },
                metadata: {
                    calculationBreakdown: {
                        courierCostStatus: "Not configured in MarginMind Cost Settings",
                        action: "Configure your flat courier cost in Settings to enable automatic deficit detection",
                    },
                },
                deduplicationKey: dedupKey,
            });
            continue;
        }

        // Case B: Confirmed Shipping Deficit (Merchant cost > shipping charged)
        const shippingDeficit = roundMoney(merchantCost - shippingCharged);

        if (shippingDeficit > 0) {
            const dedupKey = `ship_deficit_${encodeURIComponent(methodName)}`;
            const severityInfo = evaluateSeverity({
                profitImpact: shippingDeficit,
                marginPercent: null,
                revenue: shippingCharged,
                confidence: "HIGH",
                leakType: "SHIPPING",
            });

            leaks.push({
                shop,
                leakType: "SHIPPING",
                affectedArea: "Shipping & Fulfillment",
                title: `Shipping Cost Deficit: ${methodName}`,
                description: `Merchant delivery expense (${storeCurrency} ${merchantCost.toFixed(2)}) exceeds revenue collected from customers (${storeCurrency} ${shippingCharged.toFixed(2)}) across ${ordersCount} orders, resulting in a net shipping subsidy of ${storeCurrency} ${shippingDeficit.toFixed(2)}.`,
                resourceId: methodName,
                resourceType: "ShippingLine",
                resourceName: methodName,
                profitImpact: shippingDeficit,
                impactCurrency: storeCurrency,
                impactType: "ACTUAL",
                severity: severityInfo.severity,
                status: "OPEN",
                confidence: "HIGH",
                detectionRule: "SHIPPING_SUBSIDY_DEFICIT",
                evidence: {
                    shippingMethod: methodName,
                    ordersCount,
                    shippingCharged: roundMoney(shippingCharged),
                    merchantCost: roundMoney(merchantCost),
                    netDeficit: shippingDeficit,
                },
                metadata: {
                    calculationBreakdown: {
                        totalOrders: ordersCount,
                        customerPaidShipping: shippingCharged,
                        merchantCourierExpense: merchantCost,
                        netShippingLoss: shippingDeficit,
                        recommendation: "Increase shipping rates or introduce a minimum order threshold for free shipping",
                    },
                },
                deduplicationKey: dedupKey,
            });
        }
    }

    return leaks;
}
