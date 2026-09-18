/* eslint-env node */
import { authenticate } from "../shopify.server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

/**
 * Resource Route: GET /api/profit-leaks/$id — per-leak detail
 * Resource Route: PATCH /api/profit-leaks/$id — status update dispatched via action
 */
export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id } = params;

  try {
    const response = await fetch(`${BACKEND_URL}/api/profit-leaks/${id}`, {
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
    console.error("[MarginMind] API profit-leaks/:id GET proxy error:", error);
    return Response.json(
      { success: false, message: error.message || "Failed to fetch leak details" },
      { status: 500 }
    );
  }
};

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id } = params;

  try {
    const body = await request.json().catch(() => ({}));
    const { status } = body;

    const response = await fetch(`${BACKEND_URL}/api/profit-leaks/${id}/status`, {
      method: "PATCH",
      headers: {
        "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
        "x-shopify-shop-domain": session.shop,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    });

    const json = await response.json();
    return Response.json(json, { status: response.status });
  } catch (error) {
    console.error("[MarginMind] API profit-leaks/:id PATCH proxy error:", error);
    return Response.json(
      { success: false, message: error.message || "Failed to update leak status" },
      { status: 500 }
    );
  }
};
