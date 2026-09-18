/* eslint-env node */
import { authenticate } from "../shopify.server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

/**
 * Resource Route: GET /api/profit-leaks/data-status
 * Returns store sync health, data freshness, and cost configuration status.
 */
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  try {
    const response = await fetch(`${BACKEND_URL}/api/profit-leaks/data-status`, {
      method: "GET",
      headers: {
        "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
        "x-shopify-shop-domain": session.shop,
        "Content-Type": "application/json",
      },
    });

    const json = await response.json();
    return Response.json(json, { status: response.status });
  } catch (error) {
    console.error("[MarginMind] API profit-leaks/data-status proxy error:", error);
    return Response.json(
      { success: false, message: error.message || "Failed to fetch data status" },
      { status: 500 }
    );
  }
};
