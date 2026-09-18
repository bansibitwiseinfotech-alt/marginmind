/* eslint-env node */
import { useLoaderData, useRouteError } from "react-router";
import { authenticate } from "../shopify.server";
import ProfitLeakDetector from "../src/pages/ProfitLeakDetector/ProfitLeakDetector";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  try {
    // Load initial summary on the server side
    const summaryRes = await fetch(`${BACKEND_URL}/api/profit-leaks/summary`, {
      method: "GET",
      headers: {
        "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
        "x-shopify-shop-domain": session.shop,
        "Content-Type": "application/json",
      },
    });

    const summaryJson = summaryRes.ok ? await summaryRes.json() : { success: false };

    return {
      shop: session.shop,
      initialSummary: summaryJson.success ? summaryJson.data : null,
      error: summaryJson.success === false ? summaryJson.message : null,
    };
  } catch (error) {
    console.error("[MarginMind] profit-leak-detector route loader error:", error);
    return {
      shop: session.shop,
      initialSummary: null,
      error: error.message || "Failed to load profit leak data",
    };
  }
};

export default function ProfitLeakDetectorRoute() {
  const loaderData = useLoaderData();
  return (
    <ProfitLeakDetector
      shop={loaderData?.shop}
      initialSummary={loaderData?.initialSummary}
      initialError={loaderData?.error}
    />
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  console.error("[MarginMind] Profit Leak Detector Route Error:", error);

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h2 style={{ color: "#d72c0d" }}>Profit Leak Detector Error</h2>
      <p>
        <strong>Message:</strong> {error?.message || String(error)}
      </p>
      {error?.stack && (
        <pre
          style={{
            background: "#f4f6f8",
            padding: "12px",
            borderRadius: "6px",
            overflowX: "auto",
          }}
        >
          {error.stack}
        </pre>
      )}
    </div>
  );
}
