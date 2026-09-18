/**
 * backend/utils/profitCalculation.js
 *
 * Unified, decimal-safe contribution profit calculations for MarginMind.
 * Distinguishes Actual, Estimated, and Missing cost components to prevent
 * misleading profit figures.
 */

/**
 * Safe conversion to finite number with optional default fallback.
 */
export function toNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === "") {
        return fallback;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

/**
 * Decimal-safe rounding to 2 decimal places to prevent floating-point anomalies.
 */
export function roundMoney(amount) {
    const num = toNumber(amount, 0);
    return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Calculate margin percentage: (Profit / Revenue) * 100.
 * Returns null if revenue is zero or negative, or profit is unavailable.
 */
export function calculateMarginPercentage(profit, revenue) {
    const numProfit = toNumber(profit, null);
    const numRev = toNumber(revenue, 0);

    if (numProfit === null || numRev <= 0) {
        return null;
    }

    return roundMoney((numProfit / numRev) * 100);
}

/**
 * Product Unit Contribution Profit
 *
 * Formula: Selling Price - Unit Cost - Allocated Shipping - Estimated Fee
 * Clearly indicates whether COGS is actual or missing.
 */
export function calculateUnitContribution({
    price,
    cost,
    allocatedShipping = 0,
    estimatedFee = 0,
}) {
    const unitPrice = roundMoney(price);
    const hasActualCost = cost !== null && cost !== undefined && cost !== "";
    const unitCost = hasActualCost ? roundMoney(cost) : null;
    const shipping = roundMoney(allocatedShipping);
    const fee = roundMoney(estimatedFee);

    if (!hasActualCost) {
        return {
            unitPrice,
            unitCost: null,
            unitProfit: null,
            unitMargin: null,
            costStatus: "MISSING",
            isProfitable: null,
        };
    }

    const unitProfit = roundMoney(unitPrice - unitCost - shipping - fee);
    const unitMargin = calculateMarginPercentage(unitProfit, unitPrice);

    return {
        unitPrice,
        unitCost,
        allocatedShipping: shipping,
        estimatedFee: fee,
        unitProfit,
        unitMargin,
        costStatus: "ACTUAL",
        isProfitable: unitProfit > 0,
    };
}

/**
 * Order Contribution Profit Breakdown
 *
 * Contribution Profit =
 *   Net Merchandise Revenue
 *   - Product Cost (COGS)
 *   - Merchant Shipping Expense
 *   - Payment Processing Fee
 *   - Allocated Packaging / Fulfillment Cost
 *
 * Returns complete auditable breakdown with data quality markers.
 */
export function calculateOrderContributionBreakdown({
    revenue = 0,
    productCost = 0,
    hasMissingProductCost = false,
    shippingCharged = 0,
    merchantShippingCost = null,
    paymentFee = null,
    refundAmount = 0,
    fulfillmentCost = 0,
}) {
    const netRevenue = roundMoney(Math.max(revenue - refundAmount, 0));
    const safeProductCost = roundMoney(productCost);
    const safeFulfillmentCost = roundMoney(fulfillmentCost);

    const isShippingCostEstimated = merchantShippingCost !== null;
    const safeMerchantShippingCost = merchantShippingCost !== null ? roundMoney(merchantShippingCost) : 0;

    const isPaymentFeeActual = paymentFee !== null && paymentFee > 0;
    const safePaymentFee = paymentFee !== null ? roundMoney(paymentFee) : 0;

    // Total expenses accounted for
    const totalKnownExpenses = roundMoney(
        safeProductCost +
        safeMerchantShippingCost +
        safePaymentFee +
        safeFulfillmentCost
    );

    const contributionProfit = roundMoney(netRevenue - totalKnownExpenses);
    const contributionMargin = calculateMarginPercentage(contributionProfit, netRevenue);

    // Shipping balance: Customer paid shipping minus merchant shipping expense
    const shippingDeficit = roundMoney(safeMerchantShippingCost - shippingCharged);

    return {
        netRevenue,
        productCost: safeProductCost,
        hasMissingProductCost,
        shippingCharged: roundMoney(shippingCharged),
        merchantShippingCost: safeMerchantShippingCost,
        isShippingCostEstimated,
        hasMissingShippingCost: merchantShippingCost === null,
        paymentFee: safePaymentFee,
        isPaymentFeeActual,
        fulfillmentCost: safeFulfillmentCost,
        refundAmount: roundMoney(refundAmount),
        totalKnownExpenses,
        contributionProfit,
        contributionMargin,
        shippingDeficit: shippingDeficit > 0 ? shippingDeficit : 0,
        isLossMaking: contributionProfit < 0,
        isLowMargin: contributionMargin !== null && contributionMargin >= 0 && contributionMargin < 15,
    };
}
