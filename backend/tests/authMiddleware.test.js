import test from "node:test";
import assert from "node:assert/strict";

import { validateInternalRequest } from "../middleware/authMiddleware.js";

test("validateInternalRequest accepts bearer tokens for internal calls", () => {
  const originalSecret = process.env.INTERNAL_API_SECRET;
  process.env.INTERNAL_API_SECRET = "test-secret";

  let nextCalled = false;
  let statusCode = 0;
  let responseBody = null;

  const req = {
    headers: {
      authorization: "Bearer test-secret",
      "x-shopify-shop-domain": "demo.myshopify.com",
    },
  };

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    },
  };

  validateInternalRequest(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(statusCode, 0);
  assert.equal(responseBody, null);

  process.env.INTERNAL_API_SECRET = originalSecret;
});
