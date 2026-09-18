
function toNumber(value) {
    const number = Number(value);

    return Number.isFinite(number) ? number : 0;
}

/**
 * Calculate shipping performance for one order.
 *
 * shippingCharged:
 *   Amount paid by the customer for shipping.
 *
 * merchantShippingCost:
 *   Actual shipping expense paid by the merchant.
 *   This must come from verified merchant data or configuration.
 */
function calculateShippingCost({
    shippingCharged = 0,
    merchantShippingCost = null,
    orderRevenue = 0,
    productCost = 0,
    paymentFee = 0,
    fulfillmentCost = 0,
    refundAmount = 0,
}) {
    const charged = toNumber(shippingCharged);
    const revenue = toNumber(orderRevenue);
    const costOfProducts = toNumber(productCost);
    const fees = toNumber(paymentFee);
    const fulfillment = toNumber(fulfillmentCost);
    const refunds = toNumber(refundAmount);

    const hasMerchantShippingCost =
        merchantShippingCost !== null &&
        merchantShippingCost !== undefined &&
        merchantShippingCost !== "";

    const shippingCost = hasMerchantShippingCost
        ? toNumber(merchantShippingCost)
        : null;

    // Customer-paid shipping is not merchant shipping expense.
    const shippingProfit =
        shippingCost !== null
            ? charged - shippingCost
            : null;

    const totalRevenue = Math.max(revenue - refunds, 0);

    const profit =
        shippingCost !== null
            ? totalRevenue -
            costOfProducts -
            shippingCost -
            fees -
            fulfillment
            : null;

    const margin =
        profit !== null && totalRevenue > 0
            ? (profit / totalRevenue) * 100
            : null;

    const shippingMargin =
        shippingCost !== null && shippingCost > 0
            ? ((charged - shippingCost) / shippingCost) * 100
            : null;

    return {
        shippingCharged: roundMoney(charged),
        shippingCost:
            shippingCost !== null
                ? roundMoney(shippingCost)
                : null,
        shippingProfit:
            shippingProfit !== null
                ? roundMoney(shippingProfit)
                : null,
        revenue: roundMoney(totalRevenue),
        profit:
            profit !== null
                ? roundMoney(profit)
                : null,
        margin:
            margin !== null
                ? roundMoney(margin)
                : null,
        shippingMargin:
            shippingMargin !== null
                ? roundMoney(shippingMargin)
                : null,
        shippingCostAvailable: shippingCost !== null,
        status:
            shippingCost !== null
                ? "COMPLETE"
                : "SHIPPING_COST_UNAVAILABLE",
    };
}

function roundMoney(value) {
    return Number(toNumber(value).toFixed(2));
}

export {
    calculateShippingCost,
    toNumber,
    roundMoney,
};