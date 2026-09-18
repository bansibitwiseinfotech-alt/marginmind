/* eslint-env node */
import { authenticate } from "../shopify.server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

/**
 * Resource Route: GET /api/profit-leaks/:id/product-review
 *
 * Secure proxy for the product price review endpoint.
 * Authenticates the Shopify admin session, then forwards to the Express backend
 * with the internal secret and shop domain — both kept strictly server-side.
 */
export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id } = params;

  try {
    const response = await fetch(
      `${BACKEND_URL}/api/profit-leaks/${id}/product-review`,
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
    return Response.json(json, { status: response.status });
  } catch (error) {
    console.error(
      "[MarginMind] API profit-leaks/:id/product-review GET proxy error:",
      error
    );
    return Response.json(
      {
        success: false,
        message: error.message || "Failed to fetch product review data",
      },
      { status: 500 }
    );
  }
};
