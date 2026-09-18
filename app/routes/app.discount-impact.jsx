import { useLoaderData, useRouteError } from "react-router";
import { authenticate } from "../shopify.server";
import DiscountImpact from "../src/pages/DiscountImpact/DiscountImpact";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  try {
    const url = new URL(request.url);
    const searchParams = url.searchParams.toString();

    const response = await fetch(
      `${BACKEND_URL}/api/discount-impact${searchParams ? `?${searchParams}` : ""}`,
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
    return {
      initialData: json.data || null,
      shop: session.shop,
      error: json.success === false ? json.message : null,
    };
  } catch (error) {
    console.error("[MarginMind] discount-impact route loader error:", error);
    return {
      initialData: null,
      error: error.message,
    };
  }
};

export default function DiscountImpactRoute() {
  const loaderData = useLoaderData();
  return <DiscountImpact initialData={loaderData?.initialData} initialError={loaderData?.error} />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  console.error("[MarginMind] Discount Impact Route Error:", error);

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h2 style={{ color: "#d72c0d" }}>Discount Impact Analysis Error</h2>
      <p><strong>Message:</strong> {error?.message || String(error)}</p>
    </div>
  );
}