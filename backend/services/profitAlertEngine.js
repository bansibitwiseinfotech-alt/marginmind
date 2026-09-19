import ProfitAlert from "../models/ProfitAlert.js";
import ProfitAlertConfig from "../models/ProfitAlertConfig.js";
import { getOrderProfitability } from "./orderProfitability.service.js";
import { getDiscountImpact } from "./discountImpact.service.js";
import {
  evaluateProductAlert,
  evaluateOrderAlert,
  resolveCriticalThreshold,
} from "./alertReasonService.js";

async function shopifyGraphQL(shop, accessToken, query, variables = {}) {
  const apiVersion = process.env.SHOPIFY_API_VERSION || "2025-01";
  const endpoint = `https://${shop}/admin/api/${apiVersion}/graphql.json`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`[Shopify GraphQL] Failed (${response.status}): ${errText}`);
  }
  const json = await response.json();
  if (json.errors && json.errors.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  return json.data;
}

const PRODUCTS_QUERY = `
  query ProfitAlertProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      nodes {
        id
        title
        productType
        vendor

        variants(first: 100) {
          nodes {
            id
            title
            price
            inventoryItem {
              unitCost {
                amount
                currencyCode
              }
            }
          }
        }
      }

      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

function round(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Precedence Rule:
 * 1. Product-specific threshold
 * 2. Category-specific threshold
 * 3. Global threshold
 */
function getThreshold({ product, config }) {
  const productId = String(product.id);

  const productOverride = config?.productThresholds?.find(
    (item) => String(item.productId) === productId
  );

  if (productOverride && Number.isFinite(Number(productOverride.threshold))) {
    return {
      threshold: Number(productOverride.threshold),
      source: "PRODUCT",
    };
  }

  const category = String(product.productType || "").trim();

  if (category) {
    const categoryOverride = config?.categoryThresholds?.find(
      (item) => String(item.category).toLowerCase() === category.toLowerCase()
    );

    if (categoryOverride && Number.isFinite(Number(categoryOverride.threshold))) {
      return {
        threshold: Number(categoryOverride.threshold),
        source: "CATEGORY",
      };
    }
  }

  if (Number.isFinite(Number(config?.globalMarginThreshold))) {
    return {
      threshold: Number(config.globalMarginThreshold),
      source: "GLOBAL",
    };
  }

  return null;
}

function calculateProductMargin(variant) {
  const price = Number(variant.price);
  const cost = Number(variant.inventoryItem?.unitCost?.amount);

  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(cost)) {
    return null;
  }

  return round(((price - cost) / price) * 100);
}

function determineSeverity(currentMargin, threshold) {
  const difference = threshold - currentMargin;
  if (difference >= 10 || currentMargin < 0) {
    return "CRITICAL";
  }
  return "WARNING";
}

/**
 * Sync Product Alerts against thresholds
 */
async function syncProductAlerts({ shop, accessToken, config }) {
  const summary = {
    evaluated: 0,
    created: 0,
    updated: 0,
    resolved: 0,
    skipped: 0,
  };

  let after = null;

  do {
    const data = await shopifyGraphQL(shop, accessToken, PRODUCTS_QUERY, {
      first: 100,
      after,
    });

    const products = data?.products?.nodes || [];

    for (const product of products) {
      const thresholdData = getThreshold({ product, config });

      if (!thresholdData) {
        summary.skipped += 1;
        continue;
      }

      const variants = product.variants?.nodes || [];
      if (!variants.length) {
        summary.skipped += 1;
        continue;
      }

      for (const variant of variants) {
        const currentMargin = calculateProductMargin(variant);

        if (currentMargin === null) {
          summary.skipped += 1;
          continue;
        }

        summary.evaluated += 1;
        const threshold = thresholdData.threshold;
        const deduplicationKey = `PRODUCT_MARGIN:${product.id}:${variant.id}`;

        const existing = await ProfitAlert.findOne({ shop, deduplicationKey });

        // If alert was resolved by merchant, keep it resolved and do not reopen
        if (existing?.status === "RESOLVED" && existing?.resolutionSource === "MERCHANT") {
          summary.skipped += 1;
          continue;
        }

        if (currentMargin < threshold) {
          const evalResult = evaluateProductAlert({
            productTitle: product.title,
            variantTitle: variant.title,
            currentMargin,
            targetMargin: threshold,
            configuredCritical: config?.criticalMarginThreshold,
            sellingPrice: Number(variant.price),
            productCost: Number(variant.inventoryItem?.unitCost?.amount),
          });

          const marginDifference = round(currentMargin - threshold);

          let nextStatus = "ACTIVE";
          if (existing?.status === "ACKNOWLEDGED") {
            nextStatus = "ACKNOWLEDGED";
          }

          await ProfitAlert.findOneAndUpdate(
            { shop, deduplicationKey },
            {
              $set: {
                alertType: "PRODUCT_MARGIN",
                resourceType: "PRODUCT",
                resourceId: product.id,
                resourceName: `${product.title} — ${variant.title}`,
                currentMargin,
                threshold,
                criticalThreshold: evalResult.criticalThreshold,
                marginDifference,
                severity: evalResult.severity,
                status: nextStatus,
                reason: evalResult.reason,
                reasonCode: evalResult.reasonCode,
                reasonDetails: evalResult.reasonDetails,
                primaryDriver: evalResult.primaryDriver,
                recommendedAction: evalResult.recommendedAction,
                detectionSource: "PRODUCT_DATA",
                evidence: {
                  productId: product.id,
                  variantId: variant.id,
                  productTitle: product.title,
                  variantTitle: variant.title,
                  sellingPrice: Number(variant.price),
                  productCost: Number(variant.inventoryItem?.unitCost?.amount),
                  currentMargin,
                  threshold,
                  criticalThreshold: evalResult.criticalThreshold,
                  thresholdSource: thresholdData.source,
                },
                lastDetectedAt: new Date(),
                resolvedAt: null,
                resolutionSource: null,
              },
              $setOnInsert: {
                firstDetectedAt: new Date(),
              },
            },
            {
              upsert: true,
              new: true,
              setDefaultsOnInsert: true,
            }
          );

          if (existing) {
            summary.updated += 1;
          } else {
            summary.created += 1;
          }
        } else if (existing && existing.status !== "RESOLVED") {
          // Margin recovered back above threshold -> auto-resolve
          await ProfitAlert.updateOne(
            { _id: existing._id, shop },
            {
              $set: {
                status: "RESOLVED",
                resolvedAt: new Date(),
                resolutionSource: "AUTOMATIC",
                lastDetectedAt: new Date(),
                currentMargin,
                threshold,
                marginDifference: round(currentMargin - threshold),
              },
            }
          );
          summary.resolved += 1;
        }
      }
    }

    after = data?.products?.pageInfo?.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (after);

  return summary;
}

/**
 * Sync Order Alerts against thresholds
 */
async function syncOrderAlerts({ shop, config, orders = [] }) {
  const summary = {
    evaluated: 0,
    created: 0,
    updated: 0,
    resolved: 0,
    skipped: 0,
  };

  const threshold = Number.isFinite(Number(config?.globalMarginThreshold))
    ? Number(config.globalMarginThreshold)
    : null;

  if (threshold === null || !orders.length) {
    return summary;
  }

  for (const order of orders) {
    // Determine order margin
    let orderMargin = null;
    if (order.margin !== null && Number.isFinite(Number(order.margin))) {
      orderMargin = round(Number(order.margin));
    } else if (
      order.revenue > 0 &&
      order.productCost !== null &&
      Number.isFinite(Number(order.productCost))
    ) {
      // Gross merchandise margin
      orderMargin = round(((order.revenue - order.productCost) / order.revenue) * 100);
    }

    if (orderMargin === null) {
      summary.skipped += 1;
      continue;
    }

    summary.evaluated += 1;
    const orderId = String(order.id || order.orderNumber);
    const deduplicationKey = `ORDER_MARGIN:${orderId}`;
    const existing = await ProfitAlert.findOne({ shop, deduplicationKey });

    // If alert was resolved by merchant, keep it resolved and do not reopen
    if (existing?.status === "RESOLVED" && existing?.resolutionSource === "MERCHANT") {
      summary.skipped += 1;
      continue;
    }

    if (orderMargin < threshold) {
      const evalResult = evaluateOrderAlert({
        orderNumber: order.orderNumber || order.name || orderId,
        currentMargin: orderMargin,
        targetMargin: threshold,
        configuredCritical: config?.criticalMarginThreshold,
        revenue: order.revenue,
        productCost: order.productCost,
        discountAmount: order.discount || 0,
        shippingCharged: order.shippingCharged ?? order.shipping ?? 0,
        shippingCost: order.shippingCost ?? 0,
        paymentFee: order.paymentFee || 0,
        refundAmount: order.refund || 0,
        otherCosts: (order.fulfillmentCost || 0) + (order.advertisingCost || 0) + (order.taxCost || 0),
        trueProfit: order.trueProfit,
      });

      const marginDifference = round(orderMargin - threshold);

      let nextStatus = "ACTIVE";
      if (existing?.status === "ACKNOWLEDGED") {
        nextStatus = "ACKNOWLEDGED";
      }

      await ProfitAlert.findOneAndUpdate(
        { shop, deduplicationKey },
        {
          $set: {
            alertType: "ORDER_MARGIN",
            resourceType: "ORDER",
            resourceId: orderId,
            resourceName: `Order ${order.orderNumber || order.name || orderId}`,
            currentMargin: orderMargin,
            threshold,
            criticalThreshold: evalResult.criticalThreshold,
            marginDifference,
            severity: evalResult.severity,
            status: nextStatus,
            reason: evalResult.reason,
            reasonCode: evalResult.reasonCode,
            reasonDetails: evalResult.reasonDetails,
            primaryDriver: evalResult.primaryDriver,
            recommendedAction: evalResult.recommendedAction,
            detectionSource: "ORDER_DATA",
            evidence: {
              orderId,
              orderName: order.orderNumber || order.name || orderId,
              orderNumber: order.orderNumber || order.name || orderId,
              orderCreatedAt: order.createdAt || null,
              financialStatus: order.financialStatus || null,
              fulfillmentStatus: order.fulfillmentStatus || null,
              paymentGateway: order.paymentGateway || null,
              customer: order.customer?.name || "Customer",
              customerEmail: order.customer?.email || "",
              currency: order.currency || "USD",
              sellingPrice: order.revenue,
              productCost: order.productCost,
              discountAmount: order.discount || 0,
              shippingCharged: order.shippingCharged ?? order.shipping ?? 0,
              shippingCost: order.shippingCost ?? 0,
              actualShippingExpense: order.shippingCost ?? 0,
              paymentFee: order.paymentFee || 0,
              refundAmount: order.refund || 0,
              fulfillmentCost: order.fulfillmentCost || 0,
              advertisingCost: order.advertisingCost || 0,
              taxCost: order.taxCost || order.tax || 0,
              otherCosts: round((order.fulfillmentCost || 0) + (order.advertisingCost || 0) + (order.taxCost || 0)),
              trueProfit: order.trueProfit ?? (order.productCost != null ? round(order.revenue - order.productCost - (order.discount || 0) - (order.shippingCost || 0)) : null),
              currentMargin: orderMargin,
              threshold,
              criticalThreshold: evalResult.criticalThreshold,
              thresholdSource: "GLOBAL",
              shippingBreakdown: order.shippingBreakdown || [],
              refundDetails: order.refundDetails || [],
            },
            lastDetectedAt: new Date(),
            resolvedAt: null,
            resolutionSource: null,
          },
          $setOnInsert: {
            firstDetectedAt: new Date(),
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );

      if (existing) {
        summary.updated += 1;
      } else {
        summary.created += 1;
      }
    } else if (existing && existing.status !== "RESOLVED") {
      // Auto-resolve when order margin recovers above configured threshold
      await ProfitAlert.updateOne(
        { _id: existing._id, shop },
        {
          $set: {
            status: "RESOLVED",
            resolvedAt: new Date(),
            resolutionSource: "AUTOMATIC",
            lastDetectedAt: new Date(),
            currentMargin: orderMargin,
            threshold,
            marginDifference: round(orderMargin - threshold),
          },
        }
      );
      summary.resolved += 1;
    }
  }

  return summary;
}

/**
 * Sync Discount Alerts against thresholds
 */
async function syncDiscountAlerts({ shop, config, orders = [] }) {
  const summary = {
    evaluated: 0,
    created: 0,
    updated: 0,
    resolved: 0,
    skipped: 0,
  };

  const threshold = Number.isFinite(Number(config?.globalMarginThreshold))
    ? Number(config.globalMarginThreshold)
    : null;

  if (threshold === null || !orders.length) {
    return summary;
  }

  try {
    const discountData = await getDiscountImpact({ shop, orders });
    const discounts = discountData?.discounts || [];

    for (const disc of discounts) {
      if (disc.marginAfter === null || !Number.isFinite(Number(disc.marginAfter))) {
        summary.skipped += 1;
        continue;
      }

      summary.evaluated += 1;
      const currentMargin = round(Number(disc.marginAfter));
      const code = String(disc.discountCode || "DISCOUNT").trim();
      const deduplicationKey = `DISCOUNT_MARGIN:${code}`;
      const existing = await ProfitAlert.findOne({ shop, deduplicationKey });

      // If alert was resolved by merchant, keep it resolved and do not reopen
      if (existing?.status === "RESOLVED" && existing?.resolutionSource === "MERCHANT") {
        summary.skipped += 1;
        continue;
      }

      if (currentMargin < threshold) {
        const severity = determineSeverity(currentMargin, threshold);
        const marginDifference = round(currentMargin - threshold);

        let nextStatus = "ACTIVE";
        if (existing?.status === "ACKNOWLEDGED") {
          nextStatus = "ACKNOWLEDGED";
        }

        await ProfitAlert.findOneAndUpdate(
          { shop, deduplicationKey },
          {
            $set: {
              alertType: "DISCOUNT_MARGIN",
              resourceType: "DISCOUNT",
              resourceId: code,
              resourceName: `Discount: ${code}`,
              currentMargin,
              threshold,
              marginDifference,
              severity,
              status: nextStatus,
              reason: `Orders with discount "${code}" yielded ${currentMargin.toFixed(2)}% margin, below target (${threshold.toFixed(2)}%).`,
              primaryDriver: "Discount Rate / Markdown",
              detectionSource: "DISCOUNT_DATA",
              evidence: {
                discountCode: code,
                discountType: disc.discountType || "Code",
                ordersCount: disc.orders || 1,
                sellingPrice: disc.revenue || 0,
                discountAmount: disc.discountAmount || 0,
                productCost: disc.productCost || 0,
                trueProfit: disc.profitAfter ?? null,
                currentMargin,
                threshold,
                thresholdSource: "GLOBAL",
              },
              lastDetectedAt: new Date(),
              resolvedAt: null,
              resolutionSource: null,
            },
            $setOnInsert: {
              firstDetectedAt: new Date(),
            },
          },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
          }
        );

        if (existing) {
          summary.updated += 1;
        } else {
          summary.created += 1;
        }
      } else if (existing && existing.status !== "RESOLVED") {
        await ProfitAlert.updateOne(
          { _id: existing._id, shop },
          {
            $set: {
              status: "RESOLVED",
              resolvedAt: new Date(),
              resolutionSource: "AUTOMATIC",
              lastDetectedAt: new Date(),
              currentMargin,
              threshold,
              marginDifference: round(currentMargin - threshold),
            },
          }
        );
        summary.resolved += 1;
      }
    }
  } catch (err) {
    console.warn("[Profit Alerts] syncDiscountAlerts warning:", err.message);
  }

  return summary;
}

/**
 * Main detection runner evaluating Products, Orders, and Discounts
 */
async function syncAllProfitAlerts({ shop, accessToken }) {
  if (!shop) {
    throw new Error("Shop domain is required.");
  }

  if (!accessToken) {
    throw new Error("Shopify access token is required.");
  }

  const config = (await ProfitAlertConfig.findOne({ shop }).lean()) || null;

  if (!config?.enabled) {
    return {
      success: true,
      created: 0,
      updated: 0,
      resolved: 0,
      skipped: 0,
      totalEvaluated: 0,
      reason: "Profit alerts are disabled.",
    };
  }

  // 1. Sync Product Alerts
  const productSummary = await syncProductAlerts({ shop, accessToken, config });

  // 2. Fetch recent orders for Order & Discount profitability detection
  let orderSummary = { evaluated: 0, created: 0, updated: 0, resolved: 0, skipped: 0 };
  let discountSummary = { evaluated: 0, created: 0, updated: 0, resolved: 0, skipped: 0 };

  try {
    const orderData = await getOrderProfitability({ shop, first: 50 });
    const orders = orderData?.orders || [];

    if (orders.length > 0) {
      orderSummary = await syncOrderAlerts({ shop, config, orders });
      discountSummary = await syncDiscountAlerts({ shop, config, orders });
    }
  } catch (err) {
    console.warn("[Profit Alerts] Order/Discount detection warning:", err.message);
  }

  const totalEvaluated =
    productSummary.evaluated + orderSummary.evaluated + discountSummary.evaluated;
  const totalCreated =
    productSummary.created + orderSummary.created + discountSummary.created;
  const totalUpdated =
    productSummary.updated + orderSummary.updated + discountSummary.updated;
  const totalResolved =
    productSummary.resolved + orderSummary.resolved + discountSummary.resolved;
  const totalSkipped =
    productSummary.skipped + orderSummary.skipped + discountSummary.skipped;

  const now = new Date();

  // Persist detection run in ProfitAlertConfig
  await ProfitAlertConfig.updateOne(
    { shop },
    {
      $set: {
        lastDetectedAt: now,
        totalMonitoredResources: totalEvaluated,
      },
    }
  );

  return {
    success: true,
    created: totalCreated,
    updated: totalUpdated,
    resolved: totalResolved,
    skipped: totalSkipped,
    totalEvaluated,
    productStats: productSummary,
    orderStats: orderSummary,
    discountStats: discountSummary,
    lastDetectedAt: now,
  };
}

// Backward compatibility alias
const syncProductAlertsLegacy = syncAllProfitAlerts;

export {
  syncAllProfitAlerts,
  syncProductAlertsLegacy as syncProductAlerts,
  getThreshold,
  calculateProductMargin,
};