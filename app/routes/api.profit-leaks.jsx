/* eslint-env node */
import { authenticate } from "../shopify.server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

/**
 * Resource Route: GET /api/profit-leaks
 * Secure internal bridge — authenticates admin session, forwards to Express backend.
 */
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  try {
    const url = new URL(request.url);
    const searchParams = url.searchParams.toString();

    const response = await fetch(
      `${BACKEND_URL}/api/profit-leaks${searchParams ? `?${searchParams}` : ""}`,
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
    console.error("[MarginMind] API profit-leaks GET proxy error:", error);
    return Response.json(
      { success: false, message: error.message || "Failed to fetch profit leaks" },
      { status: 500 }
    );
  }
};

/**
 * Resource Route: POST /api/profit-leaks (body action discriminated by _action field)
 * Forwards to the detect endpoint when _action === "detect".
 */
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  try {
    const body = await request.json().catch(() => ({}));
    const endpoint =
      body?._action === "detect"
        ? `${BACKEND_URL}/api/profit-leaks/detect`
        : `${BACKEND_URL}/api/profit-leaks`;

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
    console.error("[MarginMind] API profit-leaks POST proxy error:", error);
    return Response.json(
      { success: false, message: error.message || "Failed to trigger detection" },
      { status: 500 }
    );
  }
};
