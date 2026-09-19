/**
 * backend/services/alertReasonService.js
 *
 * Dedicated, reusable service for determining:
 * 1. Severity level (CRITICAL vs WARNING) independently of reason.
 * 2. Dynamic alert reason message (strictly matching Section 2 requirements).
 * 3. Real, data-driven reasonCode, primaryDriver, detailed explanation, and recommended action.
 */

function round(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return 0;
  }
  return Number(Number(value).toFixed(2));
}

function formatMoney(value, currency = "USD") {
  const num = Number(value || 0);
  return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Resolve effective critical threshold.
 * If merchant configured a critical threshold, use it.
 * Otherwise, default to (targetMargin - 10) or (targetMargin / 2), minimum 0.
 */
export function resolveCriticalThreshold(targetMargin, configuredCritical = null) {
  if (configuredCritical !== null && Number.isFinite(Number(configuredCritical))) {
    return Number(configuredCritical);
  }
  const target = Number(targetMargin || 0);
  // Default: 10 pts below target margin, minimum 5% (or 0% if target is <= 5%)
  return round(Math.max(0, Math.min(target > 10 ? target - 10 : target * 0.5, target - 2)));
}

/**
 * Evaluate a Product margin alert.
 */
export function evaluateProductAlert({
  productTitle = "Product",
  variantTitle = "",
  currentMargin,
  targetMargin,
  configuredCritical = null,
  sellingPrice = 0,
  productCost = 0,
  discountAmount = 0,
}) {
  const curMargin = round(currentMargin);
  const tgtMargin = round(targetMargin);
  const critThreshold = resolveCriticalThreshold(tgtMargin, configuredCritical);

  const isCritical = curMargin < critThreshold || curMargin < 0;
  const severity = isCritical ? "CRITICAL" : "WARNING";

  // Dynamic message per Section 2 requirements
  let reason = isCritical
    ? `Critical: Product margin is ${curMargin.toFixed(2)}%, which is below the configured critical threshold of ${critThreshold.toFixed(2)}%.`
    : `Product margin is ${curMargin.toFixed(2)}% — below your configured target of ${tgtMargin.toFixed(2)}%.`;

  // Financial calculations for data-driven reason
  const price = Number(sellingPrice) || 0;
  const cost = Number(productCost) || 0;
  const discount = Number(discountAmount) || 0;
  const unitProfit = round(price - cost);

  const cogsPercent = price > 0 ? round((cost / price) * 100) : 0;
  const discountPercent = price > 0 && discount > 0 ? round((discount / (price + discount)) * 100) : 0;

  let reasonCode = "LOW_MARGIN";
  let primaryDriver = "High Cost per Item";
  let reasonDetails = `Product margin of ${curMargin.toFixed(2)}% did not reach your ${tgtMargin.toFixed(2)}% target.`;
  let recommendedAction = "Review product cost and retail price in Shopify to restore margin.";

  const isHighCogs = cogsPercent >= 70 || cost > price * (1 - tgtMargin / 100);
  const isHighDiscount = discountPercent >= 15;
  const isNegativeProfit = unitProfit <= 0;

  if (isNegativeProfit) {
    reasonCode = "NEGATIVE_UNIT_PROFIT";
    primaryDriver = "Selling Price Too Low";
    reasonDetails = `Negative Unit Profit: Selling at ${formatMoney(price)} with unit cost ${formatMoney(cost)} causes a direct loss of ${formatMoney(Math.abs(unitProfit))} per item.`;
    recommendedAction = `Immediately adjust the selling price above cost per item (${formatMoney(cost)}) to prevent direct financial loss.`;
  } else if (isHighCogs && isHighDiscount) {
    reasonCode = "MULTIPLE_FACTORS";
    primaryDriver = "Multiple Profitability Factors";
    reasonDetails = `Multiple Cost Factors: High COGS (${cogsPercent}% of price) combined with active discounts (${discountPercent}%) eroded unit margin to ${curMargin.toFixed(2)}%.`;
    recommendedAction = "Audit supplier costs and reduce promotional markdown allowances for this variant.";
  } else if (isHighCogs) {
    reasonCode = "HIGH_COGS";
    primaryDriver = "High Cost per Item";
    reasonDetails = `High COGS: Cost per item (${formatMoney(cost)}) represents ${cogsPercent}% of selling price (${formatMoney(price)}).`;
    recommendedAction = `Review unit cost in Shopify Inventory or negotiate supplier pricing. Consider raising price to restore a ${tgtMargin.toFixed(1)}% margin.`;
  } else if (isHighDiscount) {
    reasonCode = "HIGH_DISCOUNT";
    primaryDriver = "Discount Reducing Profit";
    reasonDetails = `Discount Impact: Active promotions and discounts reduced margin by ${discountPercent}%.`;
    recommendedAction = "Review active discount codes applied to this product and set minimum profit protection rules.";
  }

  return {
    severity,
    criticalThreshold: critThreshold,
    reason,
    reasonCode,
    primaryDriver,
    reasonDetails,
    recommendedAction,
  };
}

/**
 * Evaluate an Order margin alert.
 */
export function evaluateOrderAlert({
  orderNumber = "",
  currentMargin,
  targetMargin,
  configuredCritical = null,
  revenue = 0,
  productCost = 0,
  discountAmount = 0,
  shippingCharged = 0,
  shippingCost = 0,
  paymentFee = 0,
  refundAmount = 0,
  otherCosts = 0,
  trueProfit = null,
}) {
  const curMargin = round(currentMargin);
  const tgtMargin = round(targetMargin);
  const critThreshold = resolveCriticalThreshold(tgtMargin, configuredCritical);

  const cleanOrderNumber = String(orderNumber || "").replace(/^#/, "");

  const isCritical = curMargin < critThreshold || curMargin < 0;
  const severity = isCritical ? "CRITICAL" : "WARNING";

  // Dynamic message per Section 2 requirements
  let reason = isCritical
    ? `Critical: Order #${cleanOrderNumber} has a profit margin of ${curMargin.toFixed(2)}%, which is below the configured critical threshold of ${critThreshold.toFixed(2)}%.`
    : `Order #${cleanOrderNumber} has a profit margin of ${curMargin.toFixed(2)}%, below your configured target of ${tgtMargin.toFixed(2)}%.`;

  // Real financial factor analysis
  const rev = Math.max(0.01, Number(revenue) || 1);
  const cogs = Number(productCost) || 0;
  const disc = Number(discountAmount) || 0;
  const shipCharged = Number(shippingCharged) || 0;
  const shipCost = Number(shippingCost) || 0;
  const shipLoss = Math.max(0, shipCost - shipCharged);
  const fee = Number(paymentFee) || 0;
  const refund = Number(refundAmount) || 0;
  const profit = trueProfit !== null ? Number(trueProfit) : rev - cogs - shipCost - fee - refund;

  const cogsPercent = round((cogs / rev) * 100);
  const discPercent = round((disc / rev) * 100);
  const shipLossPercent = round((shipLoss / rev) * 100);
  const feePercent = round((fee / rev) * 100);
  const refundPercent = round((refund / rev) * 100);

  // Identify contributing factors
  const contributingFactors = [];
  if (cogsPercent >= 65 || cogs > rev * (1 - tgtMargin / 100)) {
    contributingFactors.push({
      code: "HIGH_COGS",
      driver: "High Product Cost",
      detail: `COGS represents ${cogsPercent}% of revenue (${formatMoney(cogs)} of ${formatMoney(rev)})`,
      weight: cogsPercent,
    });
  }
  if (shipLoss > 0 && (shipLossPercent >= 5 || shipCost > Math.max(5, shipCharged * 1.5))) {
    contributingFactors.push({
      code: "HIGH_SHIPPING",
      driver: "Shipping or Fulfillment Expense",
      detail: `Merchant shipping cost (${formatMoney(shipCost)}) exceeded shipping charged (${formatMoney(shipCharged)}) by ${formatMoney(shipLoss)}`,
      weight: shipLossPercent,
    });
  }
  if (discPercent >= 15) {
    contributingFactors.push({
      code: "HIGH_DISCOUNT",
      driver: "Discount Impact",
      detail: `Discounts of ${formatMoney(disc)} reduced order margin by ${discPercent}%`,
      weight: discPercent,
    });
  }
  if (feePercent >= 4 && fee > 0) {
    contributingFactors.push({
      code: "HIGH_PAYMENT_FEES",
      driver: "Payment Processing Fees",
      detail: `Payment processing fee of ${formatMoney(fee)} represents ${feePercent}% of revenue`,
      weight: feePercent,
    });
  }
  if (refundPercent >= 10 && refund > 0) {
    contributingFactors.push({
      code: "REFUND_IMPACT",
      driver: "Refund or Return Impact",
      detail: `Refunds of ${formatMoney(refund)} reduced net order profitability by ${refundPercent}%`,
      weight: refundPercent,
    });
  }

  let reasonCode = "LOW_MARGIN";
  let primaryDriver = "High Product Cost";
  let reasonDetails = `Order profit margin (${curMargin.toFixed(2)}%) fell below configured target (${tgtMargin.toFixed(2)}%). True profit: ${formatMoney(profit)}.`;
  let recommendedAction = "Review order items, shipping charged, and promotional discounts.";

  if (contributingFactors.length >= 2) {
    reasonCode = "MULTIPLE_FACTORS";
    primaryDriver = "Multiple Cost Factors";
    const factorList = contributingFactors.map((f) => f.detail).join("; ");
    reasonDetails = `Multiple Cost Factors: ${factorList}.`;
    recommendedAction = "Review combined order expenses including product COGS, carrier fulfillment, and active discount codes to protect order profitability.";
  } else if (contributingFactors.length === 1) {
    const dominant = contributingFactors[0];
    reasonCode = dominant.code;
    primaryDriver = dominant.driver;
    reasonDetails = `${dominant.driver}: ${dominant.detail}.`;

    if (dominant.code === "HIGH_COGS") {
      recommendedAction = "Review product cost per item in Shopify Inventory settings to ensure selling prices maintain adequate profit buffer.";
    } else if (dominant.code === "HIGH_SHIPPING") {
      recommendedAction = "Adjust shipping rates or implement minimum free shipping cart requirements to cover actual fulfillment expenses.";
    } else if (dominant.code === "HIGH_DISCOUNT") {
      recommendedAction = "Audit active coupon codes and apply minimum spend requirements to prevent margin erosion.";
    } else if (dominant.code === "HIGH_PAYMENT_FEES") {
      recommendedAction = "Review transaction fees and evaluate lower-fee payment gateways.";
    } else if (dominant.code === "REFUND_IMPACT") {
      recommendedAction = "Review return reasons and product quality reports for refunded items in this order.";
    }
  } else if (cogsPercent > 50) {
    reasonCode = "HIGH_COGS";
    primaryDriver = "High Product Cost";
    reasonDetails = `High COGS: Product cost represents ${cogsPercent}% of order revenue (${formatMoney(cogs)} of ${formatMoney(rev)}).`;
    recommendedAction = "Check unit costs and evaluate product pricing buffers.";
  }

  return {
    severity,
    criticalThreshold: critThreshold,
    reason,
    reasonCode,
    primaryDriver,
    reasonDetails,
    recommendedAction,
  };
}
