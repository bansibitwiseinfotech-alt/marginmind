/* eslint-env node */
import { authenticate } from "../shopify.server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

/**
 * Resource Route: GET /api/profit-alerts/:id
 */
export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id } = params;

  try {
    const response = await fetch(`${BACKEND_URL}/api/profit-alerts/${id}`, {
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
    console.error("[MarginMind] API profit-alerts/:id GET proxy error:", error);
    return Response.json(
      { success: false, message: error.message || "Failed to fetch alert details" },
      { status: 500 }
    );
  }
};

/**
 * Resource Route: POST /api/profit-alerts/:id (acknowledge or resolve)
 */
export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id } = params;

  try {
    const body = await request.json().catch(() => ({}));
    const endpoint =
      body?.intent === "resolve" || body?.action === "resolve"
        ? `${BACKEND_URL}/api/profit-alerts/${id}/resolve`
        : `${BACKEND_URL}/api/profit-alerts/${id}/acknowledge`;

    const response = await fetch(endpoint, {
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
    console.error("[MarginMind] API profit-alerts/:id action error:", error);
    return Response.json(
      { success: false, message: error.message || "Failed to update alert" },
      { status: 500 }
    );
  }
};
