import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../.env");

dotenv.config({ path: envPath });

const getInternalSecret = () => {
  const envSecret = process.env.INTERNAL_API_SECRET;
  if (envSecret && envSecret.trim()) return envSecret.trim();

  const envResult = dotenv.config({ path: envPath });
  const parsedSecret = envResult?.parsed?.INTERNAL_API_SECRET;

  return parsedSecret && parsedSecret.trim() ? parsedSecret.trim() : "";
};

const getRequestSecret = (req) => {
  const headerSecret = req.headers["x-internal-secret"];
  const authHeader = req.headers.authorization;

  const normalizedHeaderSecret = Array.isArray(headerSecret)
    ? headerSecret[0]
    : headerSecret;

  if (normalizedHeaderSecret && String(normalizedHeaderSecret).trim()) {
    return String(normalizedHeaderSecret).trim();
  }

  if (typeof authHeader === "string") {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return "";
};

/**
 * Validates internal server-to-server requests from Shopify app routes to Express backend.
 * Uses crypto.timingSafeEqual to prevent timing attacks.
 * Normalizes and sets req.verifiedShop.
 */
export const validateInternalRequest = (req, res, next) => {
  const secret = getRequestSecret(req);
  const expectedSecret = getInternalSecret();
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