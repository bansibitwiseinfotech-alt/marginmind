/**
 * backend/services/discountProfitLeakService.js
 *
 * Detects discount campaigns and automatic codes that result in
 * negative contribution margins or excessive margin cannibalization.
 */

import { getDiscountImpact } from "./discountImpact.service.js";
import { evaluateSeverity } from "../utils/profitLeakSeverity.js";
import { roundMoney } from "../utils/profitCalculation.js";

export async function detectDiscountProfitLeaks(shop, storeCurrency = "USD") {
    const leaks = [];

    // Fetch real discount analytics from existing discountImpact service
    const result = await getDiscountImpact({ shop });
    const discounts = result?.discounts || [];

    for (const discount of discounts) {
        const code = discount.code || discount.title || "Unknown Discount";
        const ordersCount = Number(discount.orderCount ?? discount.orders ?? 0);
        const totalDiscountGiven = Number(discount.totalDiscount ?? discount.totalDiscountAmount ?? 0);
        const trueProfit = discount.trueProfit !== null && discount.trueProfit !== undefined
            ? Number(discount.trueProfit)
            : null;
        const margin = discount.trueMargin !== null && discount.trueMargin !== undefined
            ? Number(discount.trueMargin)
            : null;
        const totalRevenue = Number(discount.totalRevenue ?? discount.netSales ?? 0);

        if (ordersCount === 0 || totalDiscountGiven <= 0) {
            continue;
        }

        // Case A: Discount rendered orders completely unprofitable
        if (trueProfit !== null && trueProfit < 0) {
            const lossAmount = Math.abs(trueProfit);
            const dedupKey = `disc_loss_${encodeURIComponent(code)}`;

            const severityInfo = evaluateSeverity({
                profitImpact: lossAmount,
                marginPercent: margin,
                revenue: totalRevenue,
                confidence: "HIGH",
                leakType: "DISCOUNT",
            });

            leaks.push({
                shop,
                leakType: "DISCOUNT",
                affectedArea: "Promotions & Discounts",
                title: `Unprofitable Discount Promotion: ${code}`,
                description: `Discount code "${code}" resulted in a net loss of ${storeCurrency} ${lossAmount.toFixed(2)} across ${ordersCount} orders. The discount given (${storeCurrency} ${totalDiscountGiven.toFixed(2)}) completely eliminated gross profit margins.`,
                resourceId: code,
                resourceType: "Discount",
                resourceName: code,
                profitImpact: roundMoney(lossAmount),
                impactCurrency: storeCurrency,
                impactType: "ACTUAL",
                severity: severityInfo.severity,
                status: "OPEN",
                confidence: "HIGH",
                detectionRule: "DISCOUNT_NEGATIVE_PROFIT",
                evidence: {
                    discountCode: code,
                    ordersApplied: ordersCount,
                    totalDiscountGiven: roundMoney(totalDiscountGiven),
                    netRevenue: roundMoney(totalRevenue),
                    resultingProfit: roundMoney(trueProfit),
                    resultingMarginPercent: margin,
                },
                metadata: {
                    calculationBreakdown: {
                        discountAmount: totalDiscountGiven,
                        totalNetRevenue: totalRevenue,
                        netContributionProfit: trueProfit,
                        marginPercentage: margin,
                        actionableRecommendation: "Reduce discount percentage or set a higher minimum order subtotal requirement",
                    },
                },
                deduplicationKey: dedupKey,
            });
        }
        // Case B: Excessive Discount Dilution (Discount amount > 1.5x of resulting profit)
        else if (trueProfit !== null && trueProfit > 0 && totalDiscountGiven > (trueProfit * 1.5)) {
            const dilutionAmount = roundMoney(totalDiscountGiven - trueProfit);
            const dedupKey = `disc_dilution_${encodeURIComponent(code)}`;

            const severityInfo = evaluateSeverity({
                profitImpact: dilutionAmount,
                marginPercent: margin,
                revenue: totalRevenue,
                confidence: "HIGH",
                leakType: "DISCOUNT",
            });

            leaks.push({
                shop,
                leakType: "DISCOUNT",
                affectedArea: "Promotions & Discounts",
                title: `High Discount Cannibalization: ${code}`,
                description: `For discount code "${code}", ${storeCurrency} ${totalDiscountGiven.toFixed(2)} in discounts was distributed to generate only ${storeCurrency} ${trueProfit.toFixed(2)} in net profit.`,
                resourceId: code,
                resourceType: "Discount",
                resourceName: code,
                profitImpact: dilutionAmount,
                impactCurrency: storeCurrency,
                impactType: "POTENTIAL",
                severity: severityInfo.severity,
                status: "OPEN",
                confidence: "MEDIUM",
                detectionRule: "DISCOUNT_EXCESSIVE_DILUTION",
                evidence: {
                    discountCode: code,
                    ordersApplied: ordersCount,
                    totalDiscountGiven: roundMoney(totalDiscountGiven),
                    resultingProfit: roundMoney(trueProfit),
                    resultingMarginPercent: margin,
                },
                metadata: {
                    calculationBreakdown: {
                        totalDiscountGiven,
                        achievedProfit: trueProfit,
                        dilutionRatio: (totalDiscountGiven / trueProfit).toFixed(2),
                    },
                },
                deduplicationKey: dedupKey,
            });
        }
    }

    return leaks;
}
