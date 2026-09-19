/* eslint-env node */
import { authenticate } from "../shopify.server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

/**
 * Resource Route: POST /api/profit-alerts/detect
 */
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  try {
    const body = await request.json().catch(() => ({}));

    const response = await fetch(`${BACKEND_URL}/api/profit-alerts/detect`, {
      method: "POST",
      headers: {
        "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
        "x-shopify-shop-domain": session.shop,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const json = await response.json();
    return Response.json(json, { status: response.status });
  } catch (error) {
    console.error("[MarginMind] API profit-alerts/detect POST proxy error:", error);
    return Response.json(
      { success: false, message: error.message || "Failed to run profit alert detection" },
      { status: 500 }
    );
  }
};
