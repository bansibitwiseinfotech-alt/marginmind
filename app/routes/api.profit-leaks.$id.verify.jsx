/* eslint-env node */
import { authenticate } from "../shopify.server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id } = params;

  try {
    const response = await fetch(`${BACKEND_URL}/api/profit-leaks/${id}/verify`, {
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
    console.error("[MarginMind] API profit-leaks/:id/verify proxy error:", error);
    return Response.json(
      { success: false, message: error.message || "Unable to verify the latest product data." },
      { status: 500 }
    );
  }
};