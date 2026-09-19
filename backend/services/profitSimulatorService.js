import { getStoreWithActiveToken } from "../utils/storeHelper.js";
import { createShopifyAdminClient } from "./shopifyClient.js";
import { calculateOrderCost, normalizeCostConfig } from "./costManagement.service.js";

const PRODUCT_GID = /^gid:\/\/shopify\/Product\/\d+$/;
const VARIANT_GID = /^gid:\/\/shopify\/ProductVariant\/\d+$/;

export function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function roundMoney(value) {
    return Number(toNumber(value).toFixed(2));
}

export function roundPercent(value) {
    return Number(toNumber(value).toFixed(2));
}

function createSimulationError(message, statusCode) {    
    const error = new Error(message);      
    error.statusCode = statusCode;
    return error;
}

export function validateSimulationInput({ productId, variantId, price, discount, shipping }) {
    const normalizedProductId = typeof productId === "string" ? productId.trim() : "";
    const normalizedVariantId = typeof variantId === "string" ? variantId.trim() : "";

    if (!PRODUCT_GID.test(normalizedProductId)) {           
        throw createSimulationError("Product ID must be a valid Shopify Product GID.", 400);
    }

    if (!VARIANT_GID.test(normalizedVariantId)) {
        throw createSimulationError("Variant ID must be a valid Shopify Product Variant GID.", 400);
    }

    for (const [name, value] of [["price", price], ["discount", discount], ["shipping", shipping]]) {
        if (value === undefined || value === null || value === "") continue;
        if (!Number.isFinite(Number(value)) || Number(value) < 0 ||
            (name === "discount" && Number(value) > 100)) {
            const labels = {
                price: "Price must be a finite non-negative number.",
                discount: "Discount must be between 0 and 100.",
                shipping: "Shipping must be a finite non-negative number.",
            };
            throw createSimulationError(labels[name], 400);
        }
    }

    return { productId: normalizedProductId, variantId: normalizedVariantId };
}

export function calculateAdditionalCosts({ revenue, shippingCost, productCost, costConfig }) {
    const result = calculateOrderCost({ revenue, productCost, shippingCost, costConfig });
    return {
        shippingCost: roundMoney(result.shippingCost),
        fulfillmentCost: roundMoney(result.fulfillmentCost),
        paymentFee: roundMoney(result.paymentFee),
        advertisingCost: roundMoney(result.advertisingCost),
        taxAmount: roundMoney(result.taxAmount),
    };
}

export function calculateProfit({ sellingPrice, discountPercent = 0, shippingCost, productCost, costConfig }) {
    const safeSellingPrice = Math.max(0, toNumber(sellingPrice));
    const safeDiscountPercent = Math.min(100, Math.max(0, toNumber(discountPercent)));
    const safeProductCost = Math.max(0, toNumber(productCost));
    const safeShippingCost = Math.max(0, toNumber(shippingCost));
    const discountAmount = safeSellingPrice * safeDiscountPercent / 100;
    const netSellingPrice = safeSellingPrice - discountAmount;
    const additionalCosts = calculateAdditionalCosts({
        revenue: netSellingPrice,
        shippingCost: safeShippingCost,
        productCost: safeProductCost,
        costConfig,
    });
    const grossProfit = netSellingPrice - safeProductCost;
    const totalApplicableCosts = safeProductCost + additionalCosts.shippingCost +
        additionalCosts.fulfillmentCost + additionalCosts.paymentFee +
        additionalCosts.advertisingCost + additionalCosts.taxAmount;
    const netProfit = netSellingPrice - totalApplicableCosts;

    return {
        sellingPrice: roundMoney(safeSellingPrice),
        discountPercent: roundPercent(safeDiscountPercent),
        discountAmount: roundMoney(discountAmount),
        netSellingPrice: roundMoney(netSellingPrice),
        productCost: roundMoney(safeProductCost),
        shippingCost: additionalCosts.shippingCost,
        fulfillmentCost: additionalCosts.fulfillmentCost,
        paymentFee: additionalCosts.paymentFee,
        advertisingCost: additionalCosts.advertisingCost,
        totalApplicableCosts: roundMoney(totalApplicableCosts),
        grossProfit: roundMoney(grossProfit),
        netProfit: roundMoney(netProfit),
        grossMargin: roundPercent(netSellingPrice > 0 ? grossProfit / netSellingPrice * 100 : 0),
        netMargin: roundPercent(netSellingPrice > 0 ? netProfit / netSellingPrice * 100 : 0),
    };
}

function hasConfiguredCostConfiguration(store) {
    return Boolean(store?.costConfig && store.costConfig.enabled === true);
}

const PRODUCT_QUERY = `
    query ProfitSimulatorProduct($productId: ID!, $variantId: ID!) {
        shop { currencyCode }
        product(id: $productId) {
            id
            title
            handle
            status
            featuredImage { url altText }
            variants(first: 100) {
                nodes {
                    id
                    title
                    sku
                    price
                    inventoryQuantity
                    inventoryItem { unitCost { amount currencyCode } }
                }
            }
        }
        productVariant(id: $variantId) {
            id
            product { id }
        }
    }
`;

async function fetchShopifyProduct(shop, productId, variantId) {
    try {
        const client = await createShopifyAdminClient(shop);
        return await client.graphql(PRODUCT_QUERY, { productId, variantId });
    } catch (error) {
        const wrapped = createSimulationError(
            "Unable to retrieve the latest Shopify product data.",
            502
        );
        wrapped.cause = error;
        throw wrapped;
    }
}

export async function runProfitSimulation({ shop, productId, variantId, price, discount = 0, shipping, type = "PRICE" }) {
    const normalizedIds = validateSimulationInput({ productId, variantId, price, discount, shipping });
    productId = normalizedIds.productId;
    variantId = normalizedIds.variantId;

    const store = await getStoreWithActiveToken(shop);
    if (!store || !store.accessToken) {
        throw createSimulationError("Store is not connected to MarginMind.", 404);
    }

    const data = await fetchShopifyProduct(shop, productId, variantId);
    const product = data?.product;
    if (!product) throw createSimulationError("Product not found.", 404);

    const variant = product.variants?.nodes?.find((item) => item.id === variantId);
    if (!variant) {
        if (data?.productVariant?.id === variantId) {
            throw createSimulationError("Selected variant does not belong to the selected product.", 400);
        }
        throw createSimulationError("Selected variant not found.", 404);
    }

    const costConfig = normalizeCostConfig(store.costConfig);
    const rawProductCost = variant.inventoryItem?.unitCost?.amount;
    const productCost = rawProductCost === null || rawProductCost === undefined || rawProductCost === ""
        ? null
        : toNumber(rawProductCost, null);

    if (productCost === null) {
        throw createSimulationError(
            "Cost per item is missing for this variant. Add the product cost in Shopify before running an accurate profit simulation.",
            400
        );
    }

    const costConfigurationAvailable = hasConfiguredCostConfiguration(store);
    const currentShipping = costConfig.shippingCost;
    const simulationType = String(type || "PRICE").toUpperCase();
    const supportedTypes = new Set(["PRICE", "DISCOUNT", "SHIPPING"]);
    if (!supportedTypes.has(simulationType)) {
        throw createSimulationError("Please enter valid simulation values.", 400);
    }

    const current = calculateProfit({ sellingPrice: variant.price, shippingCost: currentShipping, productCost, costConfig });
    const projectedPrice = simulationType === "PRICE" && price !== undefined && price !== ""
        ? Number(price)
        : toNumber(variant.price);
    const projectedDiscount = simulationType === "DISCOUNT" && discount !== undefined && discount !== ""
        ? Number(discount)
        : 0;
    const projectedShipping = simulationType === "SHIPPING" && shipping !== undefined && shipping !== ""
        ? Number(shipping)
        : currentShipping;
    const projected = calculateProfit({ sellingPrice: projectedPrice, discountPercent: projectedDiscount, shippingCost: projectedShipping, productCost, costConfig });
    const profitChange = projected.netProfit - current.netProfit;
    const marginChange = projected.netMargin - current.netMargin;

    return {
        product: {
            id: product.id,
            title: product.title,
            handle: product.handle,
            status: product.status,
            image: product.featuredImage?.url || null,
        },
        variant: {
            id: variant.id,
            title: variant.title,
            sku: variant.sku || "",
            inventoryQuantity: variant.inventoryQuantity ?? null,
        },
        currencyCode: data?.shop?.currencyCode || variant.inventoryItem?.unitCost?.currencyCode || store.currency || null,
        dataQuality: {
            productCostAvailable: true,
            costConfigurationAvailable,
        },
        current,
        projected,
        comparison: {
            profitChange: roundMoney(profitChange),
            marginChange: roundPercent(marginChange),
            profitImproved: profitChange > 0,
            marginImproved: marginChange > 0,
            projectedProfitable: projected.netProfit > 0,
        },
        simulation: {
            type: simulationType,
            price: roundMoney(projectedPrice),
            discount: roundPercent(projectedDiscount),
            shipping: roundMoney(projectedShipping),
        },
        generatedAt: new Date().toISOString(),
    };
}