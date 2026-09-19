/**
 * backend/services/productProfitLeakService.js
 *
 * Detects real product-level profit leaks from Shopify catalog data:
 * 1. Below Cost: Selling price is less than COGS.
 * 2. Negative Profit: Net profit is negative after configured costs.
 * 3. Critically Low Margin: Net margin is below the configured target.
 * 4. Missing Product COGS: Flagged under DATA_QUALITY to avoid misleading margins.
 */

import { getProductProfitability } from "./productProfitability.service.js";
import { evaluateSeverity } from "../utils/profitLeakSeverity.js";
import { roundMoney } from "../utils/profitCalculation.js";
import { detectProductLeak, PRODUCT_LOW_MARGIN_THRESHOLD } from "../utils/productLeakRules.js";

export async function detectProductProfitLeaks(shop, storeCurrency = "USD", storeCostConfig = {}) {
    const leaks = [];
    const targetMargin = Number(storeCostConfig?.targetMargin) || PRODUCT_LOW_MARGIN_THRESHOLD;

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

            const missingCostRule = detectProductLeak({
                price,
                cost,
                detectionRule: "PRODUCT_MISSING_COGS",
                targetMargin,
                costConfig: storeCostConfig,
            });

            // Case A: Missing COGS (DATA_QUALITY)
            if (missingCostRule.detected) {
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
                        targetMargin,
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

            const belowCostRule = detectProductLeak({
                price,
                cost,
                detectionRule: "PRODUCT_BELOW_COST",
                targetMargin,
                costConfig: storeCostConfig,
            });
            const negativeProfitRule = detectProductLeak({
                price,
                cost,
                detectionRule: "PRODUCT_NEGATIVE_PROFIT",
                targetMargin,
                costConfig: storeCostConfig,
            });
            const lowMarginRule = detectProductLeak({
                price,
                cost,
                detectionRule: "PRODUCT_LOW_MARGIN",
                targetMargin,
                costConfig: storeCostConfig,
            });
            const unitLoss = cost - price;
            const unitMargin = lowMarginRule.currentData.margin;

            // Case B: Selling below product cost
            if (belowCostRule.detected) {
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
                    title: `Below-Cost Product Price: ${title}`,
                    description: `Selling price (${storeCurrency} ${price.toFixed(2)}) is below product cost (${storeCurrency} ${cost.toFixed(2)}).`,
                    resourceId: variantId,
                    resourceType: "ProductVariant",
                    resourceName: title,
                    profitImpact: totalStockImpact,
                    impactCurrency: storeCurrency,
                    impactType: "ACTUAL",
                    severity: severityInfo.severity,
                    status: "OPEN",
                    confidence: "HIGH",
                    detectionRule: "PRODUCT_BELOW_COST",
                    evidence: {
                        productId: product.id,
                        variantId: variant.id,
                        sellingPrice: price,
                        costPerItem: cost,
                        unitLoss: roundMoney(unitLoss),
                        unitMarginPercent: unitMargin,
                        netProfit: belowCostRule.currentData.unitProfit,
                        netMarginPercent: unitMargin,
                        referencePrice: belowCostRule.currentData.referencePrice,
                        inventoryQuantity: inventory,
                        stockExposure: totalStockImpact,
                    },
                    metadata: {
                        calculationBreakdown: {
                            sellingPrice: price,
                            productCost: cost,
                            unitProfit: belowCostRule.currentData.unitProfit,
                            contributionMarginPercent: unitMargin,
                            inventoryCount: inventory,
                            estimatedLossExposure: totalStockImpact,
                        },
                    },
                    deduplicationKey: dedupKey,
                });
            }
            // Case C: Negative net profit after configured costs
            else if (negativeProfitRule.detected) {
                const netLoss = Math.abs(negativeProfitRule.currentData.unitProfit);
                const totalLoss = inventory > 0 ? roundMoney(netLoss * inventory) : roundMoney(netLoss);
                const dedupKey = `prod_negative_profit_${variantId}`;
                const severityInfo = evaluateSeverity({
                    profitImpact: totalLoss,
                    marginPercent: unitMargin,
                    revenue: price,
                    confidence: "HIGH",
                    leakType: "PRODUCT",
                });

                leaks.push({
                    shop,
                    leakType: "PRODUCT",
                    affectedArea: "Unit Economics",
                    title: `Negative Net Profit: ${title}`,
                    description: `This product's net profit is negative after shipping, fulfillment, payment, and advertising costs.`,
                    resourceId: variantId,
                    resourceType: "ProductVariant",
                    resourceName: title,
                    profitImpact: totalLoss,
                    impactCurrency: storeCurrency,
                    impactType: "ACTUAL",
                    severity: severityInfo.severity,
                    status: "OPEN",
                    confidence: "HIGH",
                    detectionRule: "PRODUCT_NEGATIVE_PROFIT",
                    evidence: {
                        productId: product.id,
                        variantId: variant.id,
                        sellingPrice: price,
                        costPerItem: cost,
                        netProfit: negativeProfitRule.currentData.unitProfit,
                        netMarginPercent: unitMargin,
                        referencePrice: negativeProfitRule.currentData.referencePrice,
                        inventoryQuantity: inventory,
                    },
                    metadata: {
                        targetMargin,
                        calculationBreakdown: negativeProfitRule.currentData,
                    },
                    deduplicationKey: dedupKey,
                });
            }
            // Case D: Net margin below target
            else if (lowMarginRule.detected) {
                const dedupKey = `prod_low_margin_${variantId}`;
                const marginDeficit = roundMoney(price * (targetMargin / 100) - lowMarginRule.currentData.unitProfit);
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
                    description: `This product is profitable, but its current net margin of ${unitMargin}% is below your target of ${targetMargin}%.`,
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
                        netProfit: lowMarginRule.currentData.unitProfit,
                        referencePrice: lowMarginRule.currentData.referencePrice,
                        inventoryQuantity: inventory,
                    },
                    metadata: {
                        targetMargin,
                        calculationBreakdown: {
                            sellingPrice: price,
                            productCost: cost,
                            unitProfit: lowMarginRule.currentData.unitProfit,
                            marginPercent: unitMargin,
                            referencePrice: lowMarginRule.currentData.referencePrice,
                        },
                    },
                    deduplicationKey: dedupKey,
                });
            }
        }
    }

    return leaks;
}
