import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateOrderCost,
  normalizeCostConfig,
  summarizeOrderCostMetrics,
} from "../services/costManagement.service.js";

test("normalizeCostConfig clamps values and preserves defaults", () => {
  const normalized = normalizeCostConfig({
    productCost: "12.5",
    paymentFeeRate: "0.03",
    taxRate: -0.1,
    shippingCost: null,
  });

  assert.equal(normalized.productCost, 12.5);
  assert.equal(normalized.paymentFeeRate, 0.03);
  assert.equal(normalized.taxRate, 0);
  assert.equal(normalized.shippingCost, 0);
});

test("calculateOrderCost sums all cost components and profit", () => {
  const result = calculateOrderCost({
    revenue: 100,
    productCost: 40,
    fulfillmentCost: 8,
    shippingCost: 5,
    paymentFeeRate: 0.02,
    paymentFeeFlat: 1,
    advertisingCostRate: 0.05,
    advertisingCostFlat: 2,
    taxRate: 0.1,
  });

  assert.equal(result.paymentFee, 3);
  assert.equal(result.advertisingCost, 7);
  assert.equal(result.taxAmount, 10);
  assert.equal(result.totalCost, 73);
  assert.equal(result.grossProfit, 27);
  assert.equal(result.grossMargin, 27);
});

test("summarizeOrderCostMetrics aggregates shipping, discounts, refunds, and tax", () => {
  const summary = summarizeOrderCostMetrics({
    totalPriceSet: { shopMoney: { amount: "127.50", currencyCode: "USD" } },
    subtotalPriceSet: { shopMoney: { amount: "120.00", currencyCode: "USD" } },
    totalTaxSet: { shopMoney: { amount: "7.50", currencyCode: "USD" } },
    totalShippingPriceSet: { shopMoney: { amount: "12.00", currencyCode: "USD" } },
    totalDiscountsSet: { shopMoney: { amount: "12.00", currencyCode: "USD" } },
    shippingLines: {
      nodes: [
        { originalPriceSet: { shopMoney: { amount: "10.00", currencyCode: "USD" } } },
        { originalPriceSet: { shopMoney: { amount: "2.00", currencyCode: "USD" } } },
      ],
    },
    discountApplications: {
      nodes: [
        { code: "SAVE10", value: { amount: "10.00", currencyCode: "USD" } },
        { code: "FREESHIP", value: { percentage: 10 } },
      ],
    },
    refunds: [
      { totalRefundedSet: { shopMoney: { amount: "5.00", currencyCode: "USD" } } },
      { totalRefundedSet: { shopMoney: { amount: "1.50", currencyCode: "USD" } } },
    ],
    returns: {
      edges: [{ node: { id: "gid://shopify/Return/1" } }, { node: { id: "gid://shopify/Return/2" } }],
    },
  });

  assert.equal(summary.totalRevenue, 127.5);
  assert.equal(summary.shippingCost, 12);
  assert.equal(summary.discountAmount, 12);
  assert.equal(summary.taxAmount, 7.5);
  assert.equal(summary.refundAmount, 6.5);
  assert.equal(summary.returnCount, 2);
  assert.equal(summary.shippingBreakdown.length, 2);
});
