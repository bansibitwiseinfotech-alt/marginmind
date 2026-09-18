/**
 * backend/controllers/profitLeakController.js
 *
 * Controller handling Profit Leak Detector API endpoints.
 * All operations are strictly scoped to the authenticated store.
 */

import mongoose from "mongoose";
import Store from "../models/Store.js";
import {
    getStoreProfitLeaks,
    getSingleProfitLeak,
    updateProfitLeakStatus,
    getProfitLeakStoreSummary,
    runProfitLeakEngine,
} from "../services/profitLeakService.js";
import { getProductProfitability } from "../services/productProfitability.service.js";
import { createShopifyAdminClient } from "../services/shopifyClient.js";

/**
 * Resolves the store domain strictly from the verified request header
 */
function resolveShop(req) {
    return req.verifiedShop || req.headers["x-shopify-shop-domain"] || null;
}

/**
 * GET /api/profit-leaks
 * Lists leaks with pagination, search, category, and severity filtering.
 */
export const getProfitLeaks = async (req, res) => {
    try {
        const shop = resolveShop(req);
        if (!shop) {
            return res.status(400).json({
                success: false,
                message: "Shop domain is required via authenticated internal headers",
            });
        }

        const {
            leakType,
            severity,
            status = "OPEN",
            search,
            page = 1,
            limit = 50,
            startDate,
            endDate,
            sortBy = "detectedAt",
            sortOrder = "desc",
        } = req.query;

        const result = await getStoreProfitLeaks({
            shop,
            leakType,
            severity,
            status,
            search,
            page,
            limit,
            startDate,
            endDate,
            sortBy,
            sortOrder,
        });

        return res.status(200).json({
            success: true,
            data: result.leaks,
            pagination: result.pagination,
        });
    } catch (error) {
        console.error("[MarginMind] getProfitLeaks error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch profit leaks",
            error: error.message,
        });
    }
};

/**
 * GET /api/profit-leaks/:id
 * Returns deep audit breakdown, calculation steps, and evidence for a single leak.
 */
export const getProfitLeakDetails = async (req, res) => {
    try {
        const shop = resolveShop(req);
        const { id } = req.params;

        if (!shop) {
            return res.status(400).json({
                success: false,
                message: "Shop domain is required",
            });
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid profit leak ID format",
            });
        }

        const leak = await getSingleProfitLeak(shop, id);
        if (!leak) {
            return res.status(404).json({
                success: false,
                message: "Profit leak record not found for this store",
            });
        }

        return res.status(200).json({
            success: true,
            data: leak,
        });
    } catch (error) {
        console.error("[MarginMind] getProfitLeakDetails error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch profit leak details",
            error: error.message,
        });
    }
};

/**
 * POST /api/profit-leaks/detect
 * Manually or periodically triggers the Profit Leak Detection Engine.
 */
export const triggerDetection = async (req, res) => {
    try {
        const shop = resolveShop(req);
        if (!shop) {
            return res.status(400).json({
                success: false,
                message: "Shop domain is required to trigger detection",
            });
        }

        const result = await runProfitLeakEngine(shop);

        return res.status(200).json({
            success: true,
            message: "Profit leak detection completed successfully",
            summary: result.summary,
        });
    } catch (error) {
        console.error("[MarginMind] triggerDetection error:", error);
        return res.status(500).json({
            success: false,
            message: "Profit leak detection execution failed",
            error: error.message,
        });
    }
};

/**
 * GET /api/profit-leaks/summary
 * Returns total count, critical/warning breakdown, and overall estimated loss.
 */
export const getProfitLeakSummary = async (req, res) => {
    try {
        const shop = resolveShop(req);
        if (!shop) {
            return res.status(400).json({
                success: false,
                message: "Shop domain is required",
            });
        }

        const summary = await getProfitLeakStoreSummary(shop);

        return res.status(200).json({
            success: true,
            data: summary,
        });
    } catch (error) {
        console.error("[MarginMind] getProfitLeakSummary error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch profit leak summary",
            error: error.message,
        });
    }
};

/**
 * PATCH /api/profit-leaks/:id/status
 * Updates leak status (OPEN, RESOLVED, IGNORED).
 */
export const updateLeakStatus = async (req, res) => {
    try {
        const shop = resolveShop(req);
        const { id } = req.params;
        const { status } = req.body;

        if (!shop) {
            return res.status(400).json({
                success: false,
                message: "Shop domain is required",
            });
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid profit leak ID format",
            });
        }

        if (!status) {
            return res.status(400).json({
                success: false,
                message: "Status field is required (OPEN, RESOLVED, IGNORED)",
            });
        }

        const updated = await updateProfitLeakStatus(shop, id, status);
        if (!updated) {
            return res.status(404).json({
                success: false,
                message: "Profit leak record not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: `Profit leak status updated to ${status.toUpperCase()}`,
            data: updated,
        });
    } catch (error) {
        console.error("[MarginMind] updateLeakStatus error:", error);
        return res.status(400).json({
            success: false,
            message: error.message || "Failed to update status",
        });
    }
};

/**
 * GET /api/profit-leaks/data-status
 * Returns data freshness, sync health, and cost configuration status.
 */
export const getDataStatus = async (req, res) => {
    try {
        const shop = resolveShop(req);
        if (!shop) {
            return res.status(400).json({
                success: false,
                message: "Shop domain is required",
            });
        }

        const store = await Store.findOne({ shop }).lean();
        if (!store) {
            return res.status(404).json({
                success: false,
                message: "Store not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                shop: store.shop,
                currency: store.currency || "USD",
                syncStatus: store.syncStatus || "idle",
                lastSyncedAt: store.lastSyncedAt || null,
                productsSynced: store.productsSynced || 0,
                costConfiguration: {
                    enabled: store.costConfig?.enabled || false,
                    configuredShippingCost: store.costConfig?.shippingCost || 0,
                    configuredFulfillmentCost: store.costConfig?.fulfillmentCost || 0,
                },
                isActive: store.isActive !== false,
            },
        });
    } catch (error) {
        console.error("[MarginMind] getDataStatus error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve store data status",
            error: error.message,
        });
    }
};

// ---------------------------------------------------------------------------
// Shopify product GID helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the numeric Shopify product ID from a GID string.
 * e.g. "gid://shopify/Product/8765432" -> "8765432"
 */
function extractNumericId(gid) {
    if (!gid) return null;
    const parts = String(gid).split("/");
    return parts[parts.length - 1] || null;
}

/**
 * GraphQL query to fetch a single product's details needed for the price review.
 */
const PRODUCT_REVIEW_QUERY = `
  query ProductReview($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      featuredImage {
        url
        altText
      }
      images(first: 5) {
        nodes {
          url
          altText
        }
      }
      variants(first: 50) {
        nodes {
          id
          title
          sku
          price
          inventoryQuantity
          image {
            url
            altText
          }
          inventoryItem {
            unitCost {
              amount
              currencyCode
            }
          }
        }
      }
    }
    shop {
      currencyCode
    }
  }
`;

/**
 * GET /api/profit-leaks/:id/product-review
 *
 * Returns a rich product review payload for PRODUCT and DATA_QUALITY leaks.
 * Fetches real-time product data from Shopify (server-side, authenticated).
 * Also returns the store cost configuration for full profitability context.
 * No price mutations are performed.
 */
export const getProductReviewData = async (req, res) => {
    try {
        const shop = resolveShop(req);
        const { id } = req.params;

        if (!shop) {
            return res.status(400).json({
                success: false,
                message: "Shop domain is required",
            });
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid profit leak ID format",
            });
        }

        // Load the ProfitLeak record from MongoDB
        const leak = await getSingleProfitLeak(shop, id);
        if (!leak) {
            return res.status(404).json({
                success: false,
                message: "Profit leak record not found for this store",
            });
        }

        // Only PRODUCT and DATA_QUALITY leaks have product-level evidence
        const supportedTypes = ["PRODUCT", "DATA_QUALITY"];
        if (!supportedTypes.includes(leak.leakType)) {
            return res.status(400).json({
                success: false,
                message: `Product review is only available for PRODUCT or DATA_QUALITY leaks (this is ${leak.leakType})`,
            });
        }

        // Extract the Shopify product GID from the evidence stored at detection time
        const productGid = leak.evidence?.productId || null;
        const numericProductId = extractNumericId(productGid);

        // Load store for costConfig and access token
        const store = await Store.findOne({ shop }).lean();
        if (!store) {
            return res.status(404).json({
                success: false,
                message: "Store not found",
            });
        }

        const storeCurrency = store.currency || "USD";
        const costConfig = store.costConfig || {};

        // Fetch real-time product data from Shopify if we have a product GID
        let productData = null;
        let shopifyCurrency = storeCurrency;

        if (productGid) {
            try {
                const client = await createShopifyAdminClient(shop);
                const shopifyData = await client.graphql(PRODUCT_REVIEW_QUERY, {
                    id: productGid,
                });

                shopifyCurrency = shopifyData?.shop?.currencyCode || storeCurrency;

                if (shopifyData?.product) {
                    const sp = shopifyData.product;
                    const variants = (sp.variants?.nodes || []).map((v) => {
                        const price = Number(v.price || 0);
                        const cost =
                            v.inventoryItem?.unitCost?.amount != null
                                ? Number(v.inventoryItem.unitCost.amount)
                                : null;
                        const unitProfit = cost !== null ? Number((price - cost).toFixed(2)) : null;
                        const unitMargin =
                            cost !== null && price > 0
                                ? Number((((price - cost) / price) * 100).toFixed(2))
                                : null;

                        return {
                            id: v.id,
                            title: v.title,
                            sku: v.sku || "",
                            price,
                            cost,
                            unitProfit,
                            unitMargin,
                            inventoryQuantity: Number(v.inventoryQuantity || 0),
                            costCurrency:
                                v.inventoryItem?.unitCost?.currencyCode || shopifyCurrency,
                        };
                    });

                    const resolvedImage =
                        sp.featuredImage?.url ||
                        sp.images?.nodes?.[0]?.url ||
                        sp.variants?.nodes?.find((v) => v.image?.url)?.image?.url ||
                        null;

                    const resolvedImageAlt =
                        sp.featuredImage?.altText ||
                        sp.images?.nodes?.[0]?.altText ||
                        sp.title;

                    productData = {
                        id: sp.id,
                        numericId: numericProductId,
                        title: sp.title,
                        handle: sp.handle,
                        status: sp.status,
                        image: resolvedImage,
                        imageAlt: resolvedImageAlt,
                        // Safe admin URL — numeric ID from GID, no access token exposed
                        adminUrl: `https://${shop}/admin/products/${numericProductId}`,
                        variants,
                    };
                }
            } catch (shopifyErr) {
                // Non-fatal: product may have been deleted from Shopify.
                // Return the leak data with a warning rather than a hard failure.
                console.warn(
                    `[MarginMind] Could not fetch Shopify product ${productGid}:`,
                    shopifyErr.message
                );
            }
        }

        // Build the cost context the merchant sees in the modal
        const storeCosts = {
            shippingCost: costConfig.shippingCost || 0,
            fulfillmentCost: costConfig.fulfillmentCost || 0,
            paymentFeeRate: costConfig.paymentFeeRate || 0,
            paymentFeeFlat: costConfig.paymentFeeFlat || 0,
            advertisingCostRate: costConfig.advertisingCostRate || 0,
            advertisingCostFlat: costConfig.advertisingCostFlat || 0,
            taxRate: costConfig.taxRate || 0,
            costConfigEnabled: costConfig.enabled || false,
        };

        return res.status(200).json({
            success: true,
            data: {
                leak,
                product: productData,
                storeCosts,
                currency: shopifyCurrency,
                // Surfaces the variantId from evidence so we can highlight it in the variants list
                focusedVariantId: leak.evidence?.variantId || null,
            },
        });
    } catch (error) {
        console.error("[MarginMind] getProductReviewData error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to load product review data",
            error: error.message,
        });
    }
};