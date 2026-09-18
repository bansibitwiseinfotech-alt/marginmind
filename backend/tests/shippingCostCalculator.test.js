import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateShippingCost,
} from "../utils/shippingCostCalculator.js";

test("calculateShippingCost handles orders with unavailable merchant shipping cost", () => {
  const result = calculateShippingCost({
    shippingCharged: 15,
    merchantShippingCost: null,
    orderRevenue: 100,
    productCost: 40,
    paymentFee: 3,
    fulfillmentCost: 5,
    refundAmount: 0,
  });

  assert.equal(result.shippingCharged, 15); 
  assert.equal(result.shippingCost, null);
  assert.equal(result.shippingProfit, null);
  assert.equal(result.shippingCostAvailable, false);
  assert.equal(result.status, "SHIPPING_COST_UNAVAILABLE");
});

test("calculateShippingCost handles orders with merchant shipping cost present", () => {
  const result = calculateShippingCost({
    shippingCharged: 15,
    merchantShippingCost: 10,
    orderRevenue: 100,
    productCost: 40,
    paymentFee: 3,
    fulfillmentCost: 5,
    refundAmount: 0,
  });

  assert.equal(result.shippingCharged, 15);
  assert.equal(result.shippingCost, 10);
  assert.equal(result.shippingProfit, 5);
  assert.equal(result.shippingMargin, 50);
  assert.equal(result.shippingCostAvailable, true);
  assert.equal(result.profit, 42); // 100 - 40 - 10 - 3 - 5
  assert.equal(result.margin, 42);
  assert.equal(result.status, "COMPLETE");
});
