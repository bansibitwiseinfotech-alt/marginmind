/**
 * backend/services/paymentFeeService.js
 *
 * Extracts payment gateway fees from Shopify order transactions.
 * Uses real Shopify transaction fees when available (e.g. Shopify Payments).
 * If fees are unavailable in Shopify, provides an explicitly flagged estimated fee.
 */

import { toNumber, roundMoney } from "../utils/profitCalculation.js";

/**
 * Resolves payment processing fee for an order.
 *
 * @param {object} order - Shopify order object containing transactions
 * @param {object} [storeCostConfig] - Merchant store cost config
 * @returns {{ fee: number, isEstimated: boolean, gateway: string, details: string }}
 */
export function resolvePaymentFee(order, storeCostConfig = null) {
    const transactions = Array.isArray(order?.transactions)
        ? order.transactions
        : order?.transactions?.nodes || [];

    let actualFeeTotal = 0;
    let hasActualFee = false;
    let gatewayName = "Unknown";

    // 1. Check for real Shopify transaction fees
    for (const tx of transactions) {
        if (tx.gateway) {
            gatewayName = tx.gateway;
        }

        const fees = Array.isArray(tx.fees) ? tx.fees : [];
        for (const feeItem of fees) {
            const amount = feeItem?.amount?.amount ?? feeItem?.amount;
            if (amount !== null && amount !== undefined) {
                const parsed = toNumber(amount);
                if (parsed > 0) {
                    actualFeeTotal += parsed;
                    hasActualFee = true;
                }
            }
        }
    }

    if (hasActualFee) {
        return {
            fee: roundMoney(actualFeeTotal),
            isEstimated: false,
            gateway: gatewayName,
            details: `Actual Shopify transaction fee from gateway (${gatewayName})`,
        };
    }

    // 2. Check merchant-configured payment fee rate from Store
    const configuredRate = storeCostConfig?.paymentFeeRate != null
        ? toNumber(storeCostConfig.paymentFeeRate)
        : storeCostConfig?.paymentFeePercent != null
            ? toNumber(storeCostConfig.paymentFeePercent) / 100
            : null;

    const totalOrderAmount = toNumber(
        order?.totalPriceSet?.shopMoney?.amount ||
        order?.total_price ||
        0
    );

    if (configuredRate !== null && configuredRate >= 0) {
        const estimatedFee = roundMoney(totalOrderAmount * configuredRate);
        return {
            fee: estimatedFee,
            isEstimated: true,
            gateway: gatewayName,
            details: `Estimated using merchant configured rate (${(configuredRate * 100).toFixed(2)}%)`,
        };
    }

    return {
        fee: null,
        isEstimated: false,
        gateway: gatewayName,
        details: "No fee data available",
    };
}
