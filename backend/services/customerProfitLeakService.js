/**
 * backend/services/customerProfitLeakService.js
 *
 * Identifies customers whose cumulative order history results in
 * net negative contribution profit (e.g. repeated refunds, high return rates,
 * or unprofitable discounting).
 */

import { getCustomerProfitability } from "./customerProfitability.service.js";
import { evaluateSeverity } from "../utils/profitLeakSeverity.js";
import { roundMoney } from "../utils/profitCalculation.js";

export async function detectCustomerProfitLeaks(shop, storeCurrency = "USD") {
    const leaks = [];

    // Fetch real customer profitability from existing service
    const result = await getCustomerProfitability({
        shop,
        first: 100,
    });

    const customers = result?.customers || [];

    for (const customer of customers) {
        const customerId = customer.id;
        const name = customer.name || customer.displayName || customer.email || "Unknown Customer";
        const ordersCount = Number(customer.ordersCount || 0);
        const revenue = Number(customer.netRevenue ?? customer.totalSpent ?? 0);
        const profit = customer.totalProfit !== null && customer.totalProfit !== undefined
            ? Number(customer.totalProfit)
            : null;
        const margin = customer.margin !== null && customer.margin !== undefined
            ? Number(customer.margin)
            : null;

        // Skip customers with no orders or missing profit
        if (ordersCount === 0 || profit === null) {
            continue;
        }

        // Case A: Cumulative Negative Contribution Profit (Unprofitable Customer)
        if (profit < 0) {
            const lossAmount = Math.abs(profit);
            const dedupKey = `cust_loss_${customerId}`;

            const severityInfo = evaluateSeverity({
                profitImpact: lossAmount,
                marginPercent: margin,
                revenue,
                confidence: "HIGH",
                leakType: "CUSTOMER",
            });

            leaks.push({
                shop,
                leakType: "CUSTOMER",
                affectedArea: "Customer Lifetime Value",
                title: `Negative Lifetime Profit Customer: ${name}`,
                description: `This customer has generated a cumulative contribution loss of ${storeCurrency} ${lossAmount.toFixed(2)} across ${ordersCount} order(s). Product costs and returns have exceeded total spend.`,
                resourceId: customerId,
                resourceType: "Customer",
                resourceName: name,
                profitImpact: roundMoney(lossAmount),
                impactCurrency: storeCurrency,
                impactType: "ACTUAL",
                severity: severityInfo.severity,
                status: "OPEN",
                confidence: "HIGH",
                detectionRule: "CUSTOMER_NEGATIVE_PROFIT",
                evidence: {
                    customerId,
                    customerName: name,
                    email: customer.email || null,
                    totalOrders: ordersCount,
                    totalNetRevenue: revenue,
                    cumulativeProfit: profit,
                    cumulativeMargin: margin,
                },
                metadata: {
                    calculationBreakdown: {
                        ordersPlaced: ordersCount,
                        netRevenue: revenue,
                        cumulativeContributionProfit: profit,
                        lifetimeMarginPercent: margin,
                        primaryCause: "High discount usage or refund volume exceeding merchandise gross margin",
                    },
                },
                deduplicationKey: dedupKey,
            });
        }
    }

    return leaks;
}
