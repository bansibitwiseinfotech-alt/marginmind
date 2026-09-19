import { calculateMarginPercentage, roundMoney } from "./profitCalculation.js";

export const PRODUCT_LOW_MARGIN_THRESHOLD = 20;

export function calculateProductProfit({ price, cost, costConfig = {} }) {
    const sellingPrice = roundMoney(price);
    const productCost = cost === null || cost === undefined || cost === ""
        ? null
        : roundMoney(cost);

    if (productCost === null || productCost === 0) {
        return {
            sellingPrice,
            productCost: null,
            unitProfit: null,
            margin: null,
            grossProfit: null,
            grossMargin: null,
            referencePrice: null,
        };
    }

    const shippingCost = roundMoney(costConfig.shippingCost);
    const fulfillmentCost = roundMoney(costConfig.fulfillmentCost);
    const paymentFeeRate = Number(costConfig.paymentFeeRate) || 0;
    const paymentFeeFlat = roundMoney(costConfig.paymentFeeFlat);
    const advertisingCostRate = Number(costConfig.advertisingCostRate) || 0;
    const advertisingCostFlat = roundMoney(costConfig.advertisingCostFlat);
    const variableCostRate = (paymentFeeRate + advertisingCostRate) / 100;
    const fixedCosts = productCost + shippingCost + fulfillmentCost + paymentFeeFlat + advertisingCostFlat;
    const paymentFees = roundMoney(sellingPrice * paymentFeeRate / 100 + paymentFeeFlat);
    const advertisingCost = roundMoney(sellingPrice * advertisingCostRate / 100 + advertisingCostFlat);
    const grossProfit = roundMoney(sellingPrice - productCost);
    const unitProfit = roundMoney(sellingPrice - fixedCosts - sellingPrice * variableCostRate);
    const margin = calculateMarginPercentage(unitProfit, sellingPrice);
    const grossMargin = calculateMarginPercentage(grossProfit, sellingPrice);

    return {
        sellingPrice,
        productCost,
        unitProfit,
        margin,
        grossProfit,
        grossMargin,
        shippingCost,
        fulfillmentCost,
        paymentFees,
        advertisingCost,
        referencePrice: variableCostRate + (targetMarginForReference(costConfig) / 100) < 1
            ? roundMoney(fixedCosts / (1 - variableCostRate - targetMarginForReference(costConfig) / 100))
            : null,
    };
}

function targetMarginForReference(costConfig) {
    return Number(costConfig.targetMargin) || PRODUCT_LOW_MARGIN_THRESHOLD;
}

export function detectProductLeak({
    price,
    cost,
    detectionRule,
    targetMargin = PRODUCT_LOW_MARGIN_THRESHOLD,
    costConfig = {},
}) {
    const result = calculateProductProfit({
        price,
        cost,
        costConfig: { ...costConfig, targetMargin },
    });
    const threshold = Number(targetMargin) || PRODUCT_LOW_MARGIN_THRESHOLD;

    let detected = false;
    if (detectionRule === "PRODUCT_MISSING_COGS") {
        detected = result.productCost === null;
    } else if (detectionRule === "PRODUCT_BELOW_COST" || detectionRule === "PRODUCT_NEGATIVE_MARGIN") {
        detected = result.productCost !== null && result.sellingPrice < result.productCost;
    } else if (detectionRule === "PRODUCT_NEGATIVE_PROFIT") {
        detected = result.unitProfit !== null && result.unitProfit < 0;
    } else if (detectionRule === "PRODUCT_LOW_MARGIN") {
        detected = result.margin !== null && result.sellingPrice > 0 && result.margin < threshold;
    }

    return {
        detected,
        targetMargin: threshold,
        currentData: {
            sellingPrice: result.sellingPrice,
            productCost: result.productCost,
            unitProfit: result.unitProfit,
            margin: result.margin,
            grossProfit: result.grossProfit,
            grossMargin: result.grossMargin,
            shippingCost: result.shippingCost,
            fulfillmentCost: result.fulfillmentCost,
            paymentFees: result.paymentFees,
            advertisingCost: result.advertisingCost,
            referencePrice: result.referencePrice,
        },
    };
}