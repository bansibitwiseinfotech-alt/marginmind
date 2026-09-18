const DEFAULT_COST_CONFIG = {
  enabled: false,
  productCost: 0,
  fulfillmentCost: 0,
  shippingCost: 0,
  paymentFeeRate: 0,
  paymentFeeFlat: 0,
  advertisingCostRate: 0,
  advertisingCostFlat: 0,
  taxRate: 0,
};

const RATE_KEYS = [
  "paymentFeeRate",
  "advertisingCostRate",
  "taxRate",
];

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function normalizeMoneyAmount(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  if (typeof value === "object") {
    if (typeof value.amount !== "undefined") {
      return normalizeMoneyAmount(value.amount, fallback);
    }

    if (value.shopMoney && typeof value.shopMoney === "object") {
      return normalizeMoneyAmount(value.shopMoney.amount, fallback);
    }
  }

  return fallback;
}

function flattenShopifyNodes(connection) {
  if (Array.isArray(connection)) return connection;
  if (!connection || typeof connection !== "object") return [];
  if (Array.isArray(connection.nodes)) return connection.nodes;
  if (Array.isArray(connection.edges)) {
    return connection.edges.map((edge) => edge?.node ?? edge).filter(Boolean);
  }
  return [];
}

export function normalizeCostConfig(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const config = { ...DEFAULT_COST_CONFIG };

  for (const [key, defaultValue] of Object.entries(DEFAULT_COST_CONFIG)) {
    const rawValue = source[key];
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      config[key] = defaultValue;
      continue;
    }

    const numericValue = toNumber(rawValue, defaultValue);

    if (key === "enabled") {
      config[key] = Boolean(numericValue || rawValue === true);
      continue;
    }

    if (RATE_KEYS.includes(key)) {
      const clamped = Math.max(0, Math.min(1, numericValue));
      config[key] = Number(clamped.toFixed(6));
      continue;
    }

    config[key] = Math.max(0, numericValue);
  }

  return config;
}

export function calculateOrderCost(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const config = normalizeCostConfig(source.costConfig || source);
  const revenue = Math.max(0, toNumber(source.revenue ?? source.totalRevenue, 0));
  const productCost = Math.max(0, toNumber(source.productCost ?? config.productCost, 0));
  const fulfillmentCost = Math.max(0, toNumber(source.fulfillmentCost ?? config.fulfillmentCost, 0));
  const shippingCost = Math.max(0, toNumber(source.shippingCost ?? config.shippingCost, 0));
  const paymentFeeRate = toNumber(source.paymentFeeRate ?? config.paymentFeeRate, 0);
  const paymentFeeFlat = Math.max(0, toNumber(source.paymentFeeFlat ?? config.paymentFeeFlat, 0));
  const advertisingCostRate = toNumber(source.advertisingCostRate ?? config.advertisingCostRate, 0);
  const advertisingCostFlat = Math.max(0, toNumber(source.advertisingCostFlat ?? config.advertisingCostFlat, 0));
  const taxRate = toNumber(source.taxRate ?? config.taxRate, 0);

  const paymentFee = revenue * paymentFeeRate + paymentFeeFlat;
  const advertisingCost = revenue * advertisingCostRate + advertisingCostFlat;
  const taxAmount = revenue * taxRate;
  const totalCost = productCost + fulfillmentCost + shippingCost + paymentFee + advertisingCost + taxAmount;
  const grossProfit = revenue - totalCost;
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  return {
    revenue,
    productCost,
    fulfillmentCost,
    shippingCost,
    paymentFee,
    paymentFeeRate,
    paymentFeeFlat,
    advertisingCost,
    advertisingCostRate,
    advertisingCostFlat,
    taxAmount,
    taxRate,
    totalCost,
    grossProfit,
    grossMargin,
    costConfig: config,
  };
}

export function summarizeOrderCostMetrics(order = {}) {
  const currency =
    order?.totalPriceSet?.shopMoney?.currencyCode ||
    order?.subtotalPriceSet?.shopMoney?.currencyCode ||
    order?.totalTaxSet?.shopMoney?.currencyCode ||
    order?.totalShippingPriceSet?.shopMoney?.currencyCode ||
    "USD";

  const totalRevenue = Math.max(0, normalizeMoneyAmount(order?.totalPriceSet?.shopMoney?.amount ?? order?.totalPrice ?? 0));
  const subtotal = Math.max(0, normalizeMoneyAmount(order?.subtotalPriceSet?.shopMoney?.amount ?? order?.subtotalPrice ?? 0));
  const taxAmount = Math.max(0, normalizeMoneyAmount(order?.totalTaxSet?.shopMoney?.amount ?? order?.tax ?? 0));
  const shippingCost = Math.max(0, normalizeMoneyAmount(order?.totalShippingPriceSet?.shopMoney?.amount ?? order?.shippingPrice ?? 0));
  const discountAmount = Math.max(0, normalizeMoneyAmount(order?.totalDiscountsSet?.shopMoney?.amount ?? order?.discounts ?? 0));

  const shippingBreakdown = flattenShopifyNodes(order?.shippingLines).map((shippingLine) => {
    const item = shippingLine?.node ?? shippingLine;
    const amount = Math.max(
      0,
      normalizeMoneyAmount(item?.originalPriceSet?.shopMoney?.amount ?? item?.price ?? 0)
    );

    return {
      id: item?.id || null,
      title: item?.title || "Shipping",
      amount,
      currency,
    };
  });

  const discountBreakdown = flattenShopifyNodes(order?.discountApplications).map((discountApplication) => {
    const item = discountApplication?.node ?? discountApplication;
    const amount = item?.value?.amount != null
      ? normalizeMoneyAmount(item.value.amount)
      : item?.value?.percentage != null
        ? subtotal * normalizeMoneyAmount(item.value.percentage) / 100
        : 0;

    return {
      code: item?.code || null,
      type: item?.targetType || item?.allocationMethod || "discount",
      amount,
      percentage: item?.value?.percentage != null ? normalizeMoneyAmount(item.value.percentage) : null,
      currency,
    };
  });

  const refundAmount = flattenShopifyNodes(order?.refunds).reduce((sum, refundEntry) => {
    const refund = refundEntry?.node ?? refundEntry;
    const refundValue = normalizeMoneyAmount(
      refund?.totalRefundedSet?.shopMoney?.amount ?? refund?.totalRefunded ?? 0
    );
    return sum + refundValue;
  }, 0);

  const returnCount = flattenShopifyNodes(order?.returns).length;

  return {
    currency,
    totalRevenue,
    subtotal,
    taxAmount,
    shippingCost,
    discountAmount,
    refundAmount,
    returnCount,
    shippingBreakdown,
    discountBreakdown,
    netRevenue: Math.max(0, totalRevenue - refundAmount),
  };
}
