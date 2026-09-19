import ProfitAlert from "../models/ProfitAlert.js";
import ProfitAlertConfig from "../models/ProfitAlertConfig.js";
import { getOrderProfitabilityDetails } from "./orderProfitability.service.js";

function round(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return 0;
  }
  return Number(Number(value).toFixed(2));
}

async function getAlerts({
  shop,
  status,
  severity,
  resourceType,
  unread,
  search,
  page = 1,
  limit = 50,
}) {
  if (!shop) {
    throw new Error("Shop domain is required.");
  }

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));

  const query = { shop };

  if (status) {
    const s = String(status).toUpperCase();
    if (s === "ACTIVE") {
      // Unresolved alerts (Active and Acknowledged)
      query.status = { $in: ["ACTIVE", "ACKNOWLEDGED"] };
    } else if (s === "ACKNOWLEDGED") {
      query.status = "ACKNOWLEDGED";
    } else if (s === "RESOLVED") {
      query.status = "RESOLVED";
    }
    // If "ALL", do not filter by status
  }

  if (
    severity &&
    ["CRITICAL", "WARNING"].includes(String(severity).toUpperCase())
  ) {
    query.severity = String(severity).toUpperCase();
  }

  if (
    resourceType &&
    ["PRODUCT", "CATEGORY", "ORDER", "DISCOUNT"].includes(
      String(resourceType).toUpperCase()
    )
  ) {
    query.resourceType = String(resourceType).toUpperCase();
  }

  if (unread === true || unread === "true") {
    query.isRead = { $ne: true };
  }

  if (search && String(search).trim()) {
    const escaped = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.$or = [
      { resourceName: { $regex: escaped, $options: "i" } },
      { reason: { $regex: escaped, $options: "i" } },
      { primaryDriver: { $regex: escaped, $options: "i" } },
      { "evidence.productTitle": { $regex: escaped, $options: "i" } },
      { "evidence.orderName": { $regex: escaped, $options: "i" } },
      { "evidence.discountTitle": { $regex: escaped, $options: "i" } },
      { "evidence.discountCode": { $regex: escaped, $options: "i" } },
    ];
  }

  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    ProfitAlert.find(query)
      .sort({
        lastDetectedAt: -1,
      })
      .skip(skip)
      .limit(safeLimit)
      .lean(),

    ProfitAlert.countDocuments(query),
  ]);

  return {
    items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1,
    },
  };
}

async function getAlertById({ shop, id, markRead = true }) {
  if (!shop) {
    throw new Error("Shop domain is required.");
  }

  const alert = await ProfitAlert.findOne({
    shop,
    _id: id,
  }).lean();

  if (!alert) {
    const error = new Error("Profit alert not found.");
    error.statusCode = 404;
    throw error;
  }

  if (markRead && !alert.isRead) {
    await ProfitAlert.updateOne(
      { _id: id },
      { $set: { isRead: true, readAt: new Date() } }
    );
    alert.isRead = true;
    alert.readAt = new Date();
  }

  // If this is an ORDER alert, enrich with live order data from Shopify
  if (alert.resourceType === "ORDER" || alert.alertType === "ORDER_MARGIN") {
    try {
      const order = await getOrderProfitabilityDetails({
        shop,
        orderId: alert.resourceId,
      });

      if (order) {
        // Automatic resolution check:
        // If underlying order margin recovered above threshold and not already resolved
        if (
          alert.status !== "RESOLVED" &&
          order.margin !== null &&
          Number.isFinite(Number(order.margin)) &&
          alert.threshold !== null &&
          Number(order.margin) >= Number(alert.threshold)
        ) {
          const now = new Date();
          await ProfitAlert.updateOne(
            { _id: id, shop },
            {
              $set: {
                status: "RESOLVED",
                resolvedAt: now,
                resolutionSource: "AUTOMATIC",
                currentMargin: Number(order.margin),
                marginDifference: round(Number(order.margin) - Number(alert.threshold)),
                lastDetectedAt: now,
              },
            }
          );
          alert.status = "RESOLVED";
          alert.resolvedAt = now;
          alert.resolutionSource = "AUTOMATIC";
        }

        // Enrich evidence with comprehensive Shopify and MarginMind profitability data
        alert.evidence = {
          ...alert.evidence,
          orderId: order.id,
          orderName: order.orderNumber || order.name || alert.evidence?.orderName,
          orderNumber: order.orderNumber || alert.evidence?.orderNumber,
          orderCreatedAt: order.createdAt || alert.evidence?.orderCreatedAt,
          financialStatus: order.financialStatus || alert.evidence?.financialStatus,
          fulfillmentStatus: order.fulfillmentStatus || alert.evidence?.fulfillmentStatus,
          paymentGateway: order.paymentGateway || alert.evidence?.paymentGateway,
          currency: order.currency || alert.evidence?.currency || "USD",
          customer: order.customer?.name || alert.evidence?.customer || "Customer",
          customerEmail: order.customer?.email || alert.evidence?.customerEmail || "",
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
          otherCosts: Number(
            (
              (order.fulfillmentCost || 0) +
              (order.advertisingCost || 0) +
              (order.taxCost || 0)
            ).toFixed(2)
          ),
          trueProfit: order.trueProfit,
          currentMargin: order.margin !== null ? Number(order.margin) : alert.currentMargin,
          shippingBreakdown: order.shippingBreakdown || [],
          refundDetails: order.refundDetails || [],
        };
      }
    } catch (orderErr) {
      console.warn("[ProfitAlertService] Live order enrichment fallback:", orderErr.message);
    }
  }

  return alert;
}

async function getAlertConfig(shop) {
  if (!shop) {
    throw new Error("Shop domain is required.");
  }

    const config =
    (await ProfitAlertConfig.findOne({ shop }).lean()) || {
      shop,
      globalMarginThreshold: null,
      criticalMarginThreshold: null,
      productThresholds: [],
      categoryThresholds: [],
      enabled: true,
      lastDetectedAt: null,
      totalMonitoredResources: 0,
    };

  return config;
}

async function saveAlertConfig({
  shop,
  globalMarginThreshold,
  criticalMarginThreshold,
  productThresholds,
  categoryThresholds,
  enabled = true,
}) {
  if (!shop) {
    throw new Error("Shop domain is required.");
  }

  if (
    globalMarginThreshold !== null &&
    globalMarginThreshold !== undefined &&
    globalMarginThreshold !== "" &&
    (!Number.isFinite(Number(globalMarginThreshold)) ||
      Number(globalMarginThreshold) < 0 ||
      Number(globalMarginThreshold) > 100)
  ) {
    const error = new Error("Global margin threshold must be between 0 and 100.");
    error.statusCode = 400;
    throw error;
  }

  if (
    criticalMarginThreshold !== null &&
    criticalMarginThreshold !== undefined &&
    criticalMarginThreshold !== "" &&
    (!Number.isFinite(Number(criticalMarginThreshold)) ||
      Number(criticalMarginThreshold) < 0 ||
      Number(criticalMarginThreshold) > 100)
  ) {
    const error = new Error("Critical margin threshold must be between 0 and 100.");
    error.statusCode = 400;
    throw error;
  }

  const normalizedProducts = (productThresholds || []).map((item) => ({
    productId: String(item.productId).trim(),
    threshold: Number(item.threshold),
  }));

  const normalizedCategories = (categoryThresholds || []).map((item) => ({
    category: String(item.category).trim(),
    threshold: Number(item.threshold),
  }));

  for (const item of normalizedProducts) {
    if (
      !item.productId ||
      !Number.isFinite(item.threshold) ||
      item.threshold < 0 ||
      item.threshold > 100
    ) {
      const error = new Error("Invalid product threshold configuration.");
      error.statusCode = 400;
      throw error;
    }
  }

  for (const item of normalizedCategories) {
    if (
      !item.category ||
      !Number.isFinite(item.threshold) ||
      item.threshold < 0 ||
      item.threshold > 100
    ) {
      const error = new Error("Invalid category threshold configuration.");
      error.statusCode = 400;
      throw error;
    }
  }

  return ProfitAlertConfig.findOneAndUpdate(
    { shop },
    {
      $set: {
        globalMarginThreshold:
          globalMarginThreshold === null ||
          globalMarginThreshold === undefined ||
          globalMarginThreshold === ""
            ? null
            : Number(globalMarginThreshold),

        criticalMarginThreshold:
          criticalMarginThreshold === null ||
          criticalMarginThreshold === undefined ||
          criticalMarginThreshold === ""
            ? null
            : Number(criticalMarginThreshold),

        productThresholds: normalizedProducts,
        categoryThresholds: normalizedCategories,
        enabled: Boolean(enabled),
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  ).lean();
}

async function acknowledgeAlert({ shop, id }) {
  if (!shop) {
    throw new Error("Shop domain is required.");
  }
  if (!id) {
    throw new Error("Alert ID is required.");
  }

  const updated = await ProfitAlert.findOneAndUpdate(
    {
      _id: id,
      shop,
      status: "ACTIVE",
    },
    {
      $set: {
        status: "ACKNOWLEDGED",
        acknowledgedAt: new Date(),
      },
    },
    {
      new: true,
    }
  ).lean();

  if (!updated) {
    const error = new Error("Active profit alert not found or already acknowledged.");
    error.statusCode = 404;
    throw error;
  }

  return updated;
}

async function resolveAlert({
  shop,
  id,
  resolutionSource = "MERCHANT",
  resolutionNote = null,
}) {
  if (!shop) {
    throw new Error("Shop domain is required.");
  }
  if (!id) {
    throw new Error("Alert ID is required.");
  }

  const existing = await ProfitAlert.findOne({ _id: id, shop });
  if (!existing) {
    const error = new Error("Profit alert not found.");
    error.statusCode = 404;
    throw error;
  }

  // Handle already-resolved alerts safely without overwriting original resolution timestamp
  if (existing.status === "RESOLVED") {
    return existing.toObject ? existing.toObject() : existing;
  }

  existing.status = "RESOLVED";
  existing.resolvedAt = new Date();
  existing.resolutionSource = resolutionSource || "MERCHANT";
  if (resolutionNote) {
    existing.resolutionNote = resolutionNote;
  }

  await existing.save();
  return existing.toObject ? existing.toObject() : existing;
}

async function getAlertSummary(shop) {
  if (!shop) {
    throw new Error("Shop domain is required.");
  }

  const [
    totalAlerts,
    activeAlerts,
    criticalAlerts,
    warningAlerts,
    resolvedAlerts,
    acknowledgedAlerts,
    unreadAlerts,
    productAlerts,
    orderAlerts,
    discountAlerts,
    affectedProducts,
    affectedOrders,
    affectedDiscounts,
    config,
    latestAlert,
  ] = await Promise.all([
    ProfitAlert.countDocuments({ shop }),
    ProfitAlert.countDocuments({
      shop,
      status: { $in: ["ACTIVE", "ACKNOWLEDGED"] },
    }),
    ProfitAlert.countDocuments({
      shop,
      status: { $in: ["ACTIVE", "ACKNOWLEDGED"] },
      severity: "CRITICAL",
    }),
    ProfitAlert.countDocuments({
      shop,
      status: { $in: ["ACTIVE", "ACKNOWLEDGED"] },
      severity: "WARNING",
    }),
    ProfitAlert.countDocuments({ shop, status: "RESOLVED" }),
    ProfitAlert.countDocuments({ shop, status: "ACKNOWLEDGED" }),
    ProfitAlert.countDocuments({
      shop,
      status: { $in: ["ACTIVE", "ACKNOWLEDGED"] },
      isRead: { $ne: true },
    }),
    ProfitAlert.countDocuments({
      shop,
      status: { $in: ["ACTIVE", "ACKNOWLEDGED"] },
      resourceType: "PRODUCT",
    }),
    ProfitAlert.countDocuments({
      shop,
      status: { $in: ["ACTIVE", "ACKNOWLEDGED"] },
      resourceType: "ORDER",
    }),
    ProfitAlert.countDocuments({
      shop,
      status: { $in: ["ACTIVE", "ACKNOWLEDGED"] },
      resourceType: "DISCOUNT",
    }),
    ProfitAlert.distinct("resourceId", {
      shop,
      status: { $in: ["ACTIVE", "ACKNOWLEDGED"] },
      resourceType: "PRODUCT",
    }),
    ProfitAlert.distinct("resourceId", {
      shop,
      status: { $in: ["ACTIVE", "ACKNOWLEDGED"] },
      resourceType: "ORDER",
    }),
    ProfitAlert.distinct("resourceId", {
      shop,
      status: { $in: ["ACTIVE", "ACKNOWLEDGED"] },
      resourceType: "DISCOUNT",
    }),
    getAlertConfig(shop),
    ProfitAlert.findOne({ shop })
      .sort({ lastDetectedAt: -1 })
      .select("lastDetectedAt")
      .lean(),
  ]);

  const totalMonitored = config?.totalMonitoredResources || 0;
  const healthyCount = Math.max(0, totalMonitored - activeAlerts);

  return {
    totalAlerts,
    activeAlerts,
    criticalAlerts,
    warningAlerts,
    resolvedAlerts,
    acknowledgedAlerts,
    unreadAlerts,
    healthyCount,
    totalMonitored,
    productAlerts,
    orderAlerts,
    discountAlerts,
    affectedProductsCount: affectedProducts.length,
    affectedOrdersCount: affectedOrders.length,
    affectedDiscountsCount: affectedDiscounts.length,
    globalMarginThreshold: config?.globalMarginThreshold ?? null,
    criticalMarginThreshold: config?.criticalMarginThreshold ?? null,
    productThresholdsCount: (config?.productThresholds || []).length,
    categoryThresholdsCount: (config?.categoryThresholds || []).length,
    enabled: config?.enabled ?? true,
    lastDetectedAt:
      config?.lastDetectedAt || latestAlert?.lastDetectedAt || null,
  };
}

export {
  getAlerts,
  getAlertById,
  getAlertConfig,
  saveAlertConfig,
  acknowledgeAlert,
  resolveAlert,
  getAlertSummary,
};