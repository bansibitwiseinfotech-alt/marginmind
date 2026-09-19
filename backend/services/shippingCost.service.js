import {
    getOrderProfitability,
} from "./orderProfitability.service.js";
import Store from "../models/Store.js";
import { getStoreWithActiveToken } from "../utils/storeHelper.js";
import {
    calculateShippingCost,
} from "../utils/shippingCostCalculator.js";

/**
 * Analyze shipping performance by shipping method from real Shopify orders.
 */
function analyzeShippingMethods(orders, storeConfig = null) {
    const shippingMap = new Map();
    let totalShippingCharged = 0;
    let totalRevenue = 0;
    let totalRealProfit = 0;
    let totalProfitRevenue = 0;
    let ordersWithProfitCount = 0;
    const allOrders = [];

    const configuredShippingCost =
        storeConfig?.enabled && storeConfig?.shippingCost > 0
            ? Number(storeConfig.shippingCost)
            : null;

    for (const order of orders) {
        const shippingBreakdown =
            order.shippingBreakdown || [];

        const shippingMethod =
            shippingBreakdown.length > 0
                ? shippingBreakdown
                    .map((shipping) => shipping.title)
                    .join(", ")
                : "No Shipping Method";

        const shippingCharged = Number(
            order.shippingCharged || 0
        );
                                                                                               
        const isFreeShipping = shippingCharged === 0;

        // Use configured store courier cost or order.shippingCost     
        const merchantCost =
            order.shippingCost !== null && order.shippingCost !== undefined
                ? Number(order.shippingCost)
                : configuredShippingCost;

        if (!shippingMap.has(shippingMethod)) {
            shippingMap.set(shippingMethod, {
                shippingMethod,
                orders: 0,
                freeShippingOrders: 0,
                paidShippingOrders: 0,
                revenue: 0,
                shippingCharged: 0,
                shippingCost: merchantCost !== null ? 0 : null,
                shippingProfit: merchantCost !== null ? 0 : null,
                realProfit: 0,
                profitRevenue: 0,
                ordersWithProfit: 0,
                shippingCostAvailable: merchantCost !== null,
                sampleOrders: [],
            });
        }

        const record = shippingMap.get(shippingMethod);

        record.orders += 1;
        if (isFreeShipping) {
            record.freeShippingOrders += 1;
        } else {
            record.paidShippingOrders += 1;
        }

        record.revenue += Number(order.revenue || 0);
        record.shippingCharged += shippingCharged;

        totalShippingCharged += shippingCharged;
        totalRevenue += Number(order.revenue || 0);

        if (merchantCost !== null) {
            record.shippingCostAvailable = true;
            record.shippingCost = (record.shippingCost || 0) + merchantCost;
            record.shippingProfit = (record.shippingProfit || 0) + (shippingCharged - merchantCost);
        }

        if (order.trueProfit !== null && order.trueProfit !== undefined) {
            record.realProfit += Number(order.trueProfit);
            record.ordersWithProfit += 1;
            record.profitRevenue += Number(order.revenue || 0);

            totalRealProfit += Number(order.trueProfit);
            totalProfitRevenue += Number(order.revenue || 0);
            ordersWithProfitCount += 1;
        }

        const orderData = {
            id: order.id,
            orderNumber: order.orderNumber || order.name || String(order.id).split("/").pop(),
            createdAt: order.createdAt || null,
            customerName: order.customer?.name || "Guest Customer",
            shippingMethod,
            revenue: roundMoney(order.revenue || 0),
            shippingCharged: roundMoney(shippingCharged),
            isFreeShipping,
            merchantCost: merchantCost !== null ? roundMoney(merchantCost) : null,
            profit: order.trueProfit !== null && order.trueProfit !== undefined ? roundMoney(order.trueProfit) : null,
            margin: order.margin !== null && order.margin !== undefined ? roundMoney(order.margin) : null,
            currency: order.currency || "USD",
        };

        allOrders.push(orderData);

        if (record.sampleOrders.length < 50) {
            record.sampleOrders.push(orderData);
        }
    }

    const shippingMethods = Array.from(shippingMap.values()).map(
        (record) => {
            const hasProfitData = record.ordersWithProfit > 0 && record.profitRevenue > 0;
            const margin = hasProfitData
                ? roundMoney((record.realProfit / record.profitRevenue) * 100)
                : null;

            const shippingMargin =
                record.shippingCost !== null && record.shippingCost > 0
                    ? roundMoney(((record.shippingCharged - record.shippingCost) / record.shippingCost) * 100)
                    : null;

            return {
                shippingMethod: record.shippingMethod,
                orders: record.orders,
                freeShippingOrders: record.freeShippingOrders,
                paidShippingOrders: record.paidShippingOrders,
                revenue: roundMoney(record.revenue),
                shippingCharged: roundMoney(record.shippingCharged),
                shippingCost: record.shippingCost !== null ? roundMoney(record.shippingCost) : null,
                shippingProfit: record.shippingProfit !== null ? roundMoney(record.shippingProfit) : null,
                shippingMargin: shippingMargin,
                profit: hasProfitData ? roundMoney(record.realProfit) : null,
                margin: margin,
                ordersWithProfit: record.ordersWithProfit,
                highCostIndicator: record.shippingCostAvailable
                    ? (record.shippingProfit !== null && record.shippingProfit < 0 ? "UNPROFITABLE_SHIPPING" : "PROFITABLE_SHIPPING")
                    : (record.freeShippingOrders > 0 && record.shippingCharged === 0 ? "FREE_SHIPPING" : "CHARGED_SHIPPING"),
                status: record.shippingCostAvailable ? "COMPLETE" : "CUSTOMER_SHIPPING_ONLY",
                sampleOrders: record.sampleOrders,
            };
        }
    );

    const overallMargin =
        totalProfitRevenue > 0 && ordersWithProfitCount > 0
            ? roundMoney((totalRealProfit / totalProfitRevenue) * 100)
            : null;

    return {
        shippingMethods,
        orders: allOrders,
        totalShippingCharged: roundMoney(totalShippingCharged),
        totalRevenue: roundMoney(totalRevenue),
        totalProfit: ordersWithProfitCount > 0 ? roundMoney(totalRealProfit) : null,
        overallMargin: overallMargin,
        ordersWithProfitCount,
        configuredCourierCost: configuredShippingCost,
    };
}

/**
 * Get shipping cost analysis from real Shopify orders.
 */
async function getShippingCostAnalysis({
    shop,
    first = 50,
    after = null,
    search = "",
}) {
    const result = await getOrderProfitability({
        shop,
        first,
        after,
        search,
    });

    let store = null;
    try {
        const normalized = String(shop).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
        const shopDomain = normalized.includes(".") ? normalized : `${normalized}.myshopify.com`;
        store = await getStoreWithActiveToken(shopDomain);
    } catch (err) {
        console.warn("[MarginMind] Could not fetch store costConfig:", err.message);
    }

    const analysis = analyzeShippingMethods(
        result.orders || [],
        store?.costConfig || null
    );
    const currency = result.orders?.find((order) => order?.currency)?.currency || null;

    return {
        shippingMethods: analysis.shippingMethods,
        orders: analysis.orders,
        totalShippingMethods: analysis.shippingMethods.length,
        totalShippingCharged: analysis.totalShippingCharged,
        totalRevenue: analysis.totalRevenue,
        totalProfit: analysis.totalProfit,
        overallMargin: analysis.overallMargin,
        ordersWithProfitCount: analysis.ordersWithProfitCount,
        configuredCourierCost: analysis.configuredCourierCost,
        costConfig: store?.costConfig || null,
        totalOrders: result.totalOrders || (result.orders || []).length,
        pageInfo: result.pageInfo,
        dataStatus: analysis.configuredCourierCost !== null
            ? "Merchant shipping cost and customer-paid shipping calculated"
            : "Real Shopify customer-paid shipping lines analyzed",
        currency,
    };
}

function roundMoney(value) {
    return Number(Number(value || 0).toFixed(2));
}

export {
    getShippingCostAnalysis,
    analyzeShippingMethods,
};