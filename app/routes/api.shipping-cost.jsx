/* eslint-env node */
import { authenticate } from "../shopify.server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

/**
 * Resource Route: GET /api/shipping-cost
 *
 * Secure internal bridge between Shopify embedded client and Express backend.
 * Authenticates the admin session and forwards to Express backend with internal secrets.
 */
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  try {
    const url = new URL(request.url);
    const searchParams = url.searchParams.toString();

    const response = await fetch(
      `${BACKEND_URL}/api/shipping-cost${searchParams ? `?${searchParams}` : ""}`,
      {
        method: "GET",
        headers: {
          "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
          "x-shopify-shop-domain": session.shop,
          "Content-Type": "application/json",
        },
      }
    );

    const json = await response.json();
    return Response.json(json, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("[MarginMind] API Shipping Cost proxy error:", error);
    return Response.json(
      {
        success: false,
        message: error.message || "Failed to authenticate or fetch shipping cost data",
      },
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
};
