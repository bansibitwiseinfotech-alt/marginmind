
/**
 * MarginMind
 * Discount Impact Calculator
 *
 * Calculates discount impact on revenue,
 * profit before discount, profit after discount,
 * and margin.
 *
 * This utility does not fetch Shopify data.
 * It processes values provided by the service.
 */

function toNumber(value) {
    const number = Number(value);

    return Number.isFinite(number) ? number : 0;
}

function roundMoney(value) {
    return Number(toNumber(value).toFixed(2));
}

function calculateMargin(profit, revenue) {
    if (revenue <= 0) {
        return null;
    }

    return Number(((profit / revenue) * 100).toFixed(2));
}

function calculateDiscountImpact({
    grossRevenue = 0,
    discountAmount = 0,
    productCost = 0,
    shippingCost = 0,
    paymentFee = 0,
    fulfillmentCost = 0,
    refunds = 0,
}) {
    const revenue = toNumber(grossRevenue);
    const discount = Math.max(0, toNumber(discountAmount));
    const costOfGoods = Math.max(0, toNumber(productCost));
    const shipping = Math.max(0, toNumber(shippingCost));
    const payment = Math.max(0, toNumber(paymentFee));
    const fulfillment = Math.max(0, toNumber(fulfillmentCost));
    const returnedAmount = Math.max(0, toNumber(refunds));

    // Revenue after discounts and refunds.
    const netRevenueAfterDiscount =
        revenue - discount - returnedAmount;

    // Revenue before applying the discount.
    const revenueBeforeDiscount =
        revenue - returnedAmount;

    // Total costs shared by both scenarios.
    const totalCosts =
        costOfGoods +
        shipping +
        payment +
        fulfillment;

    // Profit before discount.
    const profitBeforeDiscount =
        revenueBeforeDiscount - totalCosts;

    // Profit after discount.
    const profitAfterDiscount =
        netRevenueAfterDiscount - totalCosts;

    const marginBeforeDiscount = calculateMargin(
        profitBeforeDiscount,
        revenueBeforeDiscount
    );

    const marginAfterDiscount = calculateMargin(
        profitAfterDiscount,
        netRevenueAfterDiscount
    );

    const profitImpact =
        profitAfterDiscount - profitBeforeDiscount;

    const marginImpact =
        marginBeforeDiscount !== null &&
            marginAfterDiscount !== null
            ? Number(
                (marginAfterDiscount - marginBeforeDiscount).toFixed(2)
            )
            : null;

    return {
        grossRevenue: roundMoney(revenue),

        discountAmount: roundMoney(discount),

        refunds: roundMoney(returnedAmount),

        revenueBeforeDiscount: roundMoney(
            revenueBeforeDiscount
        ),

        netRevenueAfterDiscount: roundMoney(
            netRevenueAfterDiscount
        ),

        productCost: roundMoney(costOfGoods),

        shippingCost: roundMoney(shipping),

        paymentFee: roundMoney(payment),

        fulfillmentCost: roundMoney(fulfillment),

        totalCosts: roundMoney(totalCosts),

        profitBeforeDiscount: roundMoney(
            profitBeforeDiscount
        ),

        profitAfterDiscount: roundMoney(
            profitAfterDiscount
        ),

        marginBeforeDiscount,

        marginAfterDiscount,

        profitImpact: roundMoney(profitImpact),

        marginImpact,

        status:
            profitAfterDiscount < 0
                ? "LOSS"
                : profitAfterDiscount === 0
                    ? "BREAK_EVEN"
                    : "PROFITABLE",
    };
}

export {
    calculateDiscountImpact,
};