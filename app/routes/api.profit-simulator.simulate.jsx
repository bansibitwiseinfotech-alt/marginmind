/* eslint-env node */
import { authenticate } from "../shopify.server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

async function requestSimulation(body, session) {
  const headers = {
    "Content-Type": "application/json",
    "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
    "x-shopify-shop-domain": session.shop,
  };

  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetch(`${BACKEND_URL}/api/profit-simulator/simulate`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  }

  throw lastError;
}

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  try {
    const body = await request.json().catch(() => ({}));
    const response = await requestSimulation(body, session);

    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { success: false, message: "Invalid response from backend service" };
    }

    return Response.json(json, { status: response.status });
  } catch (error) {
    console.error("[MarginMind] Profit Simulator proxy error:", error.message);
    return Response.json(
      { success: false, message: "Unable to run the simulation. Please try again." },
      { status: 500 }
    );
  }
};