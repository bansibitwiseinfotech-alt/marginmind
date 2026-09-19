/**
 * backend/services/orderProfitLeakService.js
 *
 * Detects real order-level profit leaks using Shopify order data:
 * 1. Negative Contribution Profit: Orders where total expenses (COGS + Shipping + Fees) exceed net revenue.
 * 2. Refund Drag: Orders where refunds eliminated profit.
 * 3. Severe Margin Erosion: Orders with contribution margin < 5%.
 */

import { getOrderProfitability } from "./orderProfitability.service.js";
import { resolvePaymentFee } from "./paymentFeeService.js";
import { evaluateSeverity } from "../utils/profitLeakSeverity.js";
import {
    calculateOrderContributionBreakdown,
    roundMoney,
} from "../utils/profitCalculation.js";

export async function detectOrderProfitLeaks(shop, storeCostConfig = null, storeCurrency = "USD") {
    const leaks = [];

    // Fetch real orders via existing service (orders + line item COGS + refunds + discounts)
    const result = await getOrderProfitability({
        shop,
        first: 100,
    });

    const orders = result?.orders || [];

    for (const order of orders) {
        const orderId = order.id;
        const orderName = order.orderNumber || order.name || `Order #${orderId}`;
        const revenue = Number(order.revenue || 0);
        const productCost = Number(order.productCost || 0);
        const hasMissingCost = order.missingCost === true;
        if (hasMissingCost) {
            continue;
        }
        const shippingCharged = Number(order.shippingCharged || 0);
        const merchantShippingCost = order.shippingCost !== null && order.shippingCost !== undefined
            ? Number(order.shippingCost)
            : (storeCostConfig?.enabled && storeCostConfig?.shippingCost > 0 ? Number(storeCostConfig.shippingCost) : null);

        const refundAmount = Number(order.refund || 0);

        // Resolve real or merchant-configured payment fee only.
        const feeInfo = resolvePaymentFee(order, storeCostConfig);
        if (merchantShippingCost === null || feeInfo.fee === null || !storeCostConfig?.enabled) {
            continue;
        }

        const breakdown = calculateOrderContributionBreakdown({
            revenue,
            productCost,
            hasMissingProductCost: hasMissingCost,
            shippingCharged,
            merchantShippingCost,
            paymentFee: feeInfo.fee,
            refundAmount,
            fulfillmentCost: storeCostConfig?.fulfillmentCost ? Number(storeCostConfig.fulfillmentCost) : 0,
        });

        // Case A: Negative Contribution Profit
        if (breakdown.isLossMaking && revenue > 0) {
            const lossAmount = Math.abs(breakdown.contributionProfit);
            const dedupKey = `order_loss_${orderId}`;

            const severityInfo = evaluateSeverity({
                profitImpact: lossAmount,
                marginPercent: breakdown.contributionMargin,
                revenue: breakdown.netRevenue,
                confidence: hasMissingCost ? "MEDIUM" : "HIGH",
                leakType: "ORDER",
            });

            leaks.push({
                shop,
                leakType: "ORDER",
                affectedArea: "Order Profitability",
                title: `Negative Contribution Order: ${orderName}`,
                description: `This order resulted in a net loss of ${storeCurrency} ${lossAmount.toFixed(2)}. Net revenue of ${storeCurrency} ${breakdown.netRevenue.toFixed(2)} was insufficient to cover product costs and delivery fees.`,
                resourceId: orderId,
                resourceType: "Order",
                resourceName: orderName,
                profitImpact: lossAmount,
                impactCurrency: storeCurrency,
                impactType: "ACTUAL",
                severity: severityInfo.severity,
                status: "OPEN",
                confidence: hasMissingCost ? "MEDIUM" : "HIGH",
                detectionRule: "ORDER_NEGATIVE_CONTRIBUTION",
                evidence: {
                    orderId,
                    orderName,
                    netRevenue: breakdown.netRevenue,
                    productCost: breakdown.productCost,
                    merchantShippingCost: breakdown.merchantShippingCost,
                    paymentFee: breakdown.paymentFee,
                    refundAmount: breakdown.refundAmount,
                    contributionProfit: breakdown.contributionProfit,
                    contributionMargin: breakdown.contributionMargin,
                },
                metadata: {
                    calculationBreakdown: {
                        netRevenue: breakdown.netRevenue,
                        productCost: breakdown.productCost,
                        shippingCost: breakdown.merchantShippingCost,
                        paymentProcessingFee: breakdown.paymentFee,
                        refundDeduction: breakdown.refundAmount,
                        trueContributionProfit: breakdown.contributionProfit,
                        formula: "Net Revenue - Product Cost - Shipping - Payment Fee",
                    },
                },
                deduplicationKey: dedupKey,
            });
        }

        // Case B: High Refund Erosion (Refunds > 50% of revenue)
        if (refundAmount > 0 && revenue > 0 && (refundAmount / revenue) >= 0.5) {
            const dedupKey = `order_high_refund_${orderId}`;
            const severityInfo = evaluateSeverity({
                profitImpact: refundAmount,
                marginPercent: breakdown.contributionMargin,
                revenue,
                confidence: "HIGH",
                leakType: "REFUND",
            });

            leaks.push({
                shop,
                leakType: "REFUND",
                affectedArea: "Refunds & Returns",
                title: `Significant Refund Impact: ${orderName}`,
                description: `${storeCurrency} ${refundAmount.toFixed(2)} was refunded out of ${storeCurrency} ${revenue.toFixed(2)} original revenue (${Math.round((refundAmount / revenue) * 100)}% refunded), eroding the order's contribution margin.`,
                resourceId: orderId,
                resourceType: "Order",
                resourceName: orderName,
                profitImpact: refundAmount,
                impactCurrency: storeCurrency,
                impactType: "ACTUAL",
                severity: severityInfo.severity,
                status: "OPEN",
                confidence: "HIGH",
                detectionRule: "ORDER_HIGH_REFUND",
                evidence: {
                    orderId,
                    orderName,
                    originalRevenue: revenue,
                    refundAmount,
                    refundPercentage: Math.round((refundAmount / revenue) * 100),
                },
                metadata: {
                    calculationBreakdown: {
                        originalRevenue: revenue,
                        totalRefunded: refundAmount,
                        remainingNetRevenue: breakdown.netRevenue,
                    },
                },
                deduplicationKey: dedupKey,
            });
        }
    }

    return leaks;
}
