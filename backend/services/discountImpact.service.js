import { getOrderProfitability } from "./orderProfitability.service.js";

/**
 * MarginMind
 * Discount Impact Service
 *
 * Processes real Shopify orders via getOrderProfitability.
 * Analyzes discount performance, net revenue, product costs,
 * true profit, and margin impact per discount code and automatic discount.
 */

function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function roundMoney(value) {
    return Number(toNumber(value).toFixed(2));
}

function calculateMargin(profit, revenue) {
    if (revenue == null || revenue <= 0 || profit == null) {
        return null;
    }
    return Number(((profit / revenue) * 100).toFixed(2));
}

/**
 * Extract all discount applications (both codes and automatic discounts) from an order.
 */
function getDiscountApplications(order) {
    if (Array.isArray(order.discountBreakdown) && order.discountBreakdown.length > 0) {
        return order.discountBreakdown.map((item) => ({
            code: item.code || item.title || "Unknown Discount",
            type: item.type || "Discount",
            amount: item.amount != null ? toNumber(item.amount) : null,
            percentage: item.percentage != null ? toNumber(item.percentage) : null,
        }));
    }

    if (Array.isArray(order.discountApplications?.nodes)) {
        return order.discountApplications.nodes.map((node) => ({
            code: node.code || node.title || "Unknown Discount",
            type: node.targetType || node.allocationMethod || node.__typename || "Discount",
            amount: node.value?.amount != null ? toNumber(node.value.amount) : null,
            percentage: node.value?.percentage != null ? toNumber(node.value.percentage) : null,
        }));
    }

    if (Array.isArray(order.discountCodes)) {
        return order.discountCodes.map((c) => ({
            code: typeof c === "string" ? c : c.code || "Unknown Discount",
            type: "Discount Code",
            amount: null,
            percentage: null,
        }));
    }

    if (Array.isArray(order.discount_codes)) {
        return order.discount_codes.map((c) => ({
            code: typeof c === "string" ? c : c.code || "Unknown Discount",
            type: "Discount Code",
            amount: c.amount != null ? toNumber(c.amount) : null,
            percentage: null,
        }));
    }

    return [];
}

/**
 * Aggregate discount impact by discount code / title using real Shopify order data.
 *
 * @param {Object|Array} input - Either { shop, first, after, search, orders } or an array of orders
 * @returns {Promise<Object>} Aggregated discount impact results and metadata
 */
async function getDiscountImpact(input = {}) {
    let orders = [];
    let pageInfo = {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: null,
        endCursor: null,
    };
    let totalOrders = 0;
    let currency = null;

    if (Array.isArray(input)) {
        orders = input;
        totalOrders = input.length;
    } else if (input && typeof input === "object") {
        if (Array.isArray(input.orders)) {
            orders = input.orders;
            totalOrders = input.orders.length;
        } else if (input.shop) {
            const profitabilityData = await getOrderProfitability({
                shop: input.shop,
                first: input.first || 50,
                after: input.after || null,
                search: input.search || "",
            });
            orders = profitabilityData.orders || [];
            pageInfo = profitabilityData.pageInfo || pageInfo;
            totalOrders = profitabilityData.totalOrders || 0;
        } else {
            throw new Error("Shop domain or orders array is required");
        }
    }

    currency = orders.find((order) => order?.currency)?.currency || null;

    const discountMap = new Map();
    const uniqueOrdersWithDiscounts = new Set();
    let totalDiscountedRevenue = 0;
    let totalStoreDiscountAmount = 0;
    let totalStoreProfit = 0;

    for (const order of orders) {
        const discountApps = getDiscountApplications(order);
        if (discountApps.length === 0) {
            continue;
        }

        const orderId = order.id || order.orderNumber || "unknown";
        uniqueOrdersWithDiscounts.add(orderId);

        // Revenue after line discounts and refunds
        const netRevenue = toNumber(order.revenue ?? order.totalRevenue);
        // Total discount given on the order
        const orderDiscount = toNumber(order.discount ?? order.totalDiscounts ?? order.discountAmount);
        // Revenue before discount: net revenue + discount given
        const revenueBeforeDiscount = netRevenue + orderDiscount;
        // COGS
        const hasMissingCost = order.missingCost === true || order.productCost === null || order.productCost === undefined;
        const productCost = hasMissingCost ? 0 : toNumber(order.productCost);
        // Other verified actual costs
        const shippingCost = order.shippingCost != null ? toNumber(order.shippingCost) : 0;
        const paymentFee = order.paymentFee != null ? toNumber(order.paymentFee) : 0;
        const totalCosts = productCost + shippingCost + paymentFee;

        // Order-level profit after discount
        const profitAfterDiscount = hasMissingCost ? null : netRevenue - totalCosts;
        const profitBeforeDiscount = hasMissingCost ? null : revenueBeforeDiscount - totalCosts;

        totalDiscountedRevenue += netRevenue;
        totalStoreDiscountAmount += orderDiscount;
        if (profitAfterDiscount != null) {
            totalStoreProfit += profitAfterDiscount;
        }

        // Avoid multiplying order revenue if an order has multiple discounts:
        // Distribute discount amount to specific applications where possible,
        // or split evenly among applications for the order.
        const appCount = discountApps.length;

        for (const app of discountApps) {
            const code = String(app.code || "Unknown Discount").trim();
            const type = app.type || "Discount";

            if (!discountMap.has(code)) {
                discountMap.set(code, {
                    discountCode: code,
                    discountType: type,
                    orders: 0,
                    orderIds: new Set(),
                    revenue: 0,
                    revenueBeforeDiscount: 0,
                    discountAmount: 0,
                    productCost: 0,
                    shippingCost: 0,
                    paymentFee: 0,
                    hasIncompleteCost: false,
                    profitAfterDiscount: 0,
                    profitBeforeDiscount: 0,
                    affectedOrders: [],
                });
            }

            const item = discountMap.get(code);

            // Record affected order
            if (!item.orderIds.has(orderId)) {
                item.orderIds.add(orderId);
                item.orders += 1;

                // Add to affected order details list (up to 50 for details modal)
                if (item.affectedOrders.length < 50) {
                    item.affectedOrders.push({
                        id: order.id,
                        orderNumber: order.orderNumber || order.name || order.id,
                        createdAt: order.createdAt,
                        customer: order.customer?.name || "Guest",
                        revenue: roundMoney(netRevenue),
                        discount: roundMoney(orderDiscount),
                        profit: profitAfterDiscount != null ? roundMoney(profitAfterDiscount) : null,
                        margin: order.margin != null ? roundMoney(order.margin) : null,
                        missingCost: hasMissingCost,
                    });
                }
            }

            // Allocate discount amount
            const allocatedDiscount = app.amount != null && app.amount > 0
                ? app.amount
                : orderDiscount / appCount;

            const allocatedRevenue = netRevenue / appCount;
            const allocatedRevenueBefore = revenueBeforeDiscount / appCount;
            const allocatedProductCost = productCost / appCount;
            const allocatedShippingCost = shippingCost / appCount;
            const allocatedPaymentFee = paymentFee / appCount;

            item.discountAmount += allocatedDiscount;
            item.revenue += allocatedRevenue;
            item.revenueBeforeDiscount += allocatedRevenueBefore;
            item.productCost += allocatedProductCost;
            item.shippingCost += allocatedShippingCost;
            item.paymentFee += allocatedPaymentFee;

            if (hasMissingCost) {
                item.hasIncompleteCost = true;
            } else {
                item.profitAfterDiscount += (allocatedRevenue - (allocatedProductCost + allocatedShippingCost + allocatedPaymentFee));
                item.profitBeforeDiscount += (allocatedRevenueBefore - (allocatedProductCost + allocatedShippingCost + allocatedPaymentFee));
            }
        }
    }

    const discounts = [];

    for (const item of discountMap.values()) {
        const netRevenue = roundMoney(item.revenue);
        const revenueBefore = roundMoney(item.revenueBeforeDiscount);
        const discountAmount = roundMoney(item.discountAmount);
        const productCost = item.hasIncompleteCost ? null : roundMoney(item.productCost);
        const profitAfter = item.hasIncompleteCost ? null : roundMoney(item.profitAfterDiscount);
        const profitBefore = item.hasIncompleteCost ? null : roundMoney(item.profitBeforeDiscount);

        const marginBefore = profitBefore != null ? calculateMargin(profitBefore, revenueBefore) : null;
        const marginAfter = profitAfter != null ? calculateMargin(profitAfter, netRevenue) : null;

        const profitImpact = (profitAfter != null && profitBefore != null)
            ? roundMoney(profitAfter - profitBefore)
            : null;

        const marginImpact = (marginBefore != null && marginAfter != null)
            ? Number((marginAfter - marginBefore).toFixed(2))
            : null;

        const status = item.hasIncompleteCost
            ? "INCOMPLETE_COST"
            : profitAfter < 0
                ? "LOSS"
                : profitAfter === 0
                    ? "BREAK_EVEN"
                    : "PROFITABLE";

        discounts.push({
            discountCode: item.discountCode,
            discountType: item.discountType,
            orders: item.orders,
            revenue: netRevenue,
            revenueBeforeDiscount: revenueBefore,
            discountAmount,
            productCost,
            profitBeforeDiscount: profitBefore,
            profitAfterDiscount: profitAfter,
            profit: profitAfter, // For backward compatibility with frontend summary
            marginBeforeDiscount: marginBefore,
            marginAfterDiscount: marginAfter,
            marginImpact,
            profitImpact,
            status,
            costDataStatus: item.hasIncompleteCost ? "INCOMPLETE" : "COMPLETE",
            affectedOrders: item.affectedOrders,
        });
    }

    // Sort by total discount amount descending
    discounts.sort((a, b) => b.discountAmount - a.discountAmount);

    const hasIncompleteCostData = discounts.some(
        (discount) => discount.costDataStatus === "INCOMPLETE"
    );

    return {
        discounts,
        currency,
        profitImpactAvailable: !hasIncompleteCostData,
        totalDiscountCodes: discounts.length,
        totalOrders: uniqueOrdersWithDiscounts.size,
        totalOrdersEvaluated: orders.length,
        summary: {
            totalOrders: uniqueOrdersWithDiscounts.size,
            revenue: roundMoney(totalDiscountedRevenue),
            discountAmount: roundMoney(totalStoreDiscountAmount),
            profit: hasIncompleteCostData ? null : roundMoney(totalStoreProfit),
        },
        pageInfo,
    };
}

export {
    getDiscountImpact,
};
