import crypto from "crypto";

/**
 * Validates internal server-to-server requests from Shopify app routes to Express backend.
 * Uses crypto.timingSafeEqual to prevent timing attacks.
 * Normalizes and sets req.verifiedShop.
 */
export const validateInternalRequest = (req, res, next) => {
  const secret = req.headers["x-internal-secret"];
  const expectedSecret = process.env.INTERNAL_API_SECRET;
  const shop = req.headers["x-shopify-shop-domain"];

  if (!secret || !expectedSecret) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: missing internal authentication",
    });
  }

  const secretBuffer = Buffer.from(String(secret));
  const expectedBuffer = Buffer.from(String(expectedSecret));

  // Verify secret using constant-time comparison
  if (
    secretBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(secretBuffer, expectedBuffer)
  ) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: invalid internal secret",
    });
  }

  if (!shop || typeof shop !== "string" || !shop.trim()) {
    return res.status(400).json({
      success: false,
      message: "Shop domain header (x-shopify-shop-domain) is required",
    });
  }

  // Normalize shop domain strictly from the internal header (never trust req.body.shop)
  let normalized = shop.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!normalized.includes(".")) {
    normalized = `${normalized}.myshopify.com`;
  }

  req.verifiedShop = normalized;
  next();
};