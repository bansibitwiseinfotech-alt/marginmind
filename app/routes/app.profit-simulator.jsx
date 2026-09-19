import { useLoaderData, useRouteError } from "react-router";
import { authenticate } from "../shopify.server";
import ProfitSimulator from "../src/pages/ProfitSimulator/ProfitSimulator";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const headers = {
    "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
    "x-shopify-shop-domain": session.shop,
  };

  try {
    const [productsResponse, costsResponse] = await Promise.all([
      fetch(`${BACKEND_URL}/api/product-profitability?first=100`, { headers }),
      fetch(`${BACKEND_URL}/api/costs/config`, { headers }),
    ]);
    const productsJson = await productsResponse.json();
    const costsJson = await costsResponse.json();

    return {
      products: productsJson.success ? productsJson.data?.products || [] : [],
      currency: productsJson.data?.currency || "USD",
      shippingCost: costsJson.success ? Number(costsJson.data?.shippingCost || 0) : 0,
      costConfigurationAvailable: costsJson.success && costsJson.data?.enabled === true,
      error: productsResponse.ok && productsJson.success
        ? null
        : productsJson.message || "Latest Shopify product data could not be loaded.",
    };
  } catch (error) {
    console.error("[MarginMind] Profit Simulator loader error:", error.message);
    return {
      products: [],
      currency: "USD",
      shippingCost: 0,
      error: "Latest Shopify product data could not be loaded.",
    };
  }
};

export default function ProfitSimulatorRoute() {
  return <ProfitSimulator {...useLoaderData()} />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  return (
    <div style={{ padding: "20px" }}>
      <h2>Profit Simulator Error</h2>
      <p>{error?.message || "Unable to load the Profit Simulator."}</p>
    </div>
  );
}