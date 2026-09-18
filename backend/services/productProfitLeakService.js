/**
 * backend/services/productProfitLeakService.js
 *
 * Detects real product-level profit leaks from Shopify catalog data:
 * 1. Negative Unit Margin: Selling price is less than COGS.
 * 2. Critically Low Margin: Selling price leaves under 10% gross margin.
 * 3. Missing Product COGS: Flagged under DATA_QUALITY to avoid misleading 100% margins.
 */

import { getProductProfitability } from "./productProfitability.service.js";
import { evaluateSeverity } from "../utils/profitLeakSeverity.js";
import { roundMoney, calculateMarginPercentage } from "../utils/profitCalculation.js";

export async function detectProductProfitLeaks(shop, storeCurrency = "USD") {
    const leaks = [];

    // Fetch real Shopify products using existing service
    const productResult = await getProductProfitability({
        shop,
        first: 100,
    });

    const products = productResult?.products || [];

    for (const product of products) {
        const variants = product.variants || [];

        for (const variant of variants) {
            const price = Number(variant.price || 0);
            const cost = variant.cost !== null && variant.cost !== undefined ? Number(variant.cost) : null;
            const inventory = Math.max(Number(variant.inventory || 0), 0);
            const variantId = variant.id || product.id;
            const title = `${product.title}${variant.title && variant.title !== "Default Title" ? ` - ${variant.title}` : ""}`;

            // Case A: Missing COGS (DATA_QUALITY)
            if (cost === null || cost === 0) {
                const dedupKey = `prod_missing_cost_${variantId}`;
                const severityInfo = evaluateSeverity({
                    profitImpact: 0,
                    marginPercent: null,
                    revenue: price,
                    confidence: "LOW",
                    leakType: "DATA_QUALITY",
                });

                leaks.push({
                    shop,
                    leakType: "DATA_QUALITY",
                    affectedArea: "Product Catalog",
                    title: `Missing Cost per Item: ${title}`,
                    description: `This product variant has no recorded cost in Shopify. True profit and margins cannot be accurately verified.`,
                    resourceId: variantId,
                    resourceType: "ProductVariant",
                    resourceName: title,
                    profitImpact: 0,
                    impactCurrency: storeCurrency,
                    impactType: "MISSING_DATA",
                    severity: severityInfo.severity,
                    status: "OPEN",
                    confidence: "LOW",
                    detectionRule: "PRODUCT_MISSING_COGS",
                    evidence: {
                        productId: product.id,
                        variantId: variant.id,
                        sellingPrice: price,
                        costPerItem: null,
                        inventoryQuantity: inventory,
                        sku: variant.sku || null,
                    },
                    metadata: {
                        calculationBreakdown: {
                            sellingPrice: price,
                            recordedCost: "Not configured in Shopify",
                            potentialRisk: "Profits may be significantly overstated",
                        },
                    },
                    deduplicationKey: dedupKey,
                });
                continue;
            }

            const unitLoss = cost - price;
            const unitMargin = calculateMarginPercentage(price - cost, price);

            // Case B: Negative Margin (Selling at a loss)
            if (unitLoss > 0) {
                // Potential impact across stock, or minimum unit loss
                const totalStockImpact = inventory > 0 ? roundMoney(unitLoss * inventory) : roundMoney(unitLoss);
                const dedupKey = `prod_negative_margin_${variantId}`;

                const severityInfo = evaluateSeverity({
                    profitImpact: totalStockImpact,
                    marginPercent: unitMargin,
                    revenue: price,
                    confidence: "HIGH",
                    leakType: "PRODUCT",
                });

                leaks.push({
                    shop,
                    leakType: "PRODUCT",
                    affectedArea: "Unit Economics",
                    title: `Negative Product Margin: ${title}`,
                    description: `Selling price (${storeCurrency} ${price.toFixed(2)}) is lower than product cost (${storeCurrency} ${cost.toFixed(2)}), creating a direct loss of ${storeCurrency} ${unitLoss.toFixed(2)} per unit sold.`,
                    resourceId: variantId,
                    resourceType: "ProductVariant",
                    resourceName: title,
                    profitImpact: totalStockImpact,
                    impactCurrency: storeCurrency,
                    impactType: "ACTUAL",
                    severity: severityInfo.severity,
                    status: "OPEN",
                    confidence: "HIGH",
                    detectionRule: "PRODUCT_NEGATIVE_MARGIN",
                    evidence: {
                        productId: product.id,
                        variantId: variant.id,
                        sellingPrice: price,
                        costPerItem: cost,
                        unitLoss: roundMoney(unitLoss),
                        unitMarginPercent: unitMargin,
                        inventoryQuantity: inventory,
                        stockExposure: totalStockImpact,
                    },
                    metadata: {
                        calculationBreakdown: {
                            sellingPrice: price,
                            productCost: cost,
                            unitProfit: roundMoney(price - cost),
                            contributionMarginPercent: unitMargin,
                            inventoryCount: inventory,
                            estimatedLossExposure: totalStockImpact,
                        },
                    },
                    deduplicationKey: dedupKey,
                });
            }
            // Case C: Dangerously Low Margin (< 10%)
            else if (unitMargin !== null && unitMargin < 10 && price > 0) {
                const dedupKey = `prod_low_margin_${variantId}`;
                const marginDeficit = roundMoney(price * 0.15 - (price - cost)); // gap to healthy 15% margin
                const totalDeficit = inventory > 0 ? roundMoney(marginDeficit * Math.min(inventory, 20)) : marginDeficit;

                const severityInfo = evaluateSeverity({
                    profitImpact: totalDeficit,
                    marginPercent: unitMargin,
                    revenue: price,
                    confidence: "HIGH",
                    leakType: "PRODUCT",
                });

                leaks.push({
                    shop,
                    leakType: "PRODUCT",
                    affectedArea: "Unit Economics",
                    title: `Ultra Low Margin: ${title}`,
                    description: `Margin is only ${unitMargin}%, leaving insufficient room to absorb shipping, payment fees, or marketing.`,
                    resourceId: variantId,
                    resourceType: "ProductVariant",
                    resourceName: title,
                    profitImpact: totalDeficit,
                    impactCurrency: storeCurrency,
                    impactType: "POTENTIAL",
                    severity: severityInfo.severity,
                    status: "OPEN",
                    confidence: "HIGH",
                    detectionRule: "PRODUCT_LOW_MARGIN",
                    evidence: {
                        productId: product.id,
                        variantId: variant.id,
                        sellingPrice: price,
                        costPerItem: cost,
                        unitMarginPercent: unitMargin,
                        inventoryQuantity: inventory,
                    },
                    metadata: {
                        calculationBreakdown: {
                            sellingPrice: price,
                            productCost: cost,
                            unitProfit: roundMoney(price - cost),
                            marginPercent: unitMargin,
                        },
                    },
                    deduplicationKey: dedupKey,
                });
            }
        }
    }

    return leaks;
}
