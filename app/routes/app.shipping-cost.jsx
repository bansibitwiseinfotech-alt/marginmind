/* eslint-env node */
import { useLoaderData, useRouteError, useActionData } from "react-router";
import { authenticate } from "../shopify.server";
import ShippingCost from "../src/pages/ShippingCost/ShippingCost";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

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

    const text = await response.text();
    let json = {};
    try {
      json = JSON.parse(text);
    } catch {
      json = { success: false, message: "Invalid response from backend service" };
    }

    return {
      initialData: json.data || null,
      shop: session.shop,
      error: json.success === false ? json.message : null,
    };
  } catch (error) {
    console.error("[MarginMind] shipping-cost route loader error:", error);
    return {
      initialData: null,
      shop: session.shop,
      error: error.message || "Failed to load shipping cost data",
    };
  }
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const shippingCost = Number(formData.get("shippingCost")) || 0;

  try {
    const response = await fetch(`${BACKEND_URL}/api/costs/config`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
        "x-shopify-shop-domain": session.shop,
      },
      body: JSON.stringify({
        enabled: true,
        shippingCost,
      }),
    });

    const text = await response.text();
    let json = {};
    try {
      json = JSON.parse(text);
    } catch {
      json = { success: false, message: "Invalid response from backend service" };
    }

    return { success: json.success ?? response.ok, message: json.message || "Courier cost saved" };
  } catch (err) {
    return { success: false, message: err.message };
  }
};

export default function ShippingCostRoute() {
  const loaderData = useLoaderData();
  const actionData = useActionData();

  return (
    <ShippingCost
      initialData={loaderData?.initialData}
      initialError={loaderData?.error}
      actionData={actionData}
      shop={loaderData?.shop}
    />
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  console.error("[MarginMind] Shipping Cost Route Error:", error);

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h2 style={{ color: "#d72c0d" }}>Shipping Cost Analysis Error</h2>
      <p><strong>Message:</strong> {error?.message || String(error)}</p>
      {error?.stack && (
        <pre style={{ background: "#f4f6f8", padding: "12px", borderRadius: "6px", overflowX: "auto" }}>
          {error.stack}
        </pre>
      )}
    </div>
  );
}
