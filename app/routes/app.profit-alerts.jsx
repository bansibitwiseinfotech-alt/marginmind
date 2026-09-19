/* eslint-env node */
import { useLoaderData, useRouteError } from "react-router";
import { authenticate } from "../shopify.server";
import ProfitAlerts from "../src/pages/ProfitAlerts/ProfitAlerts";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  try {
    const res = await fetch(`${BACKEND_URL}/api/profit-alerts?status=ACTIVE&page=1&limit=50`, {
      method: "GET",
      headers: {
        "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
        "x-shopify-shop-domain": session.shop,
        "Content-Type": "application/json",
      },
    });

    const json = res.ok ? await res.json() : { success: false };

    return {
      shop: session.shop,
      initialData: json.success ? json : null,
      error: json.success === false ? (json.message || "Failed to load profit alerts") : null,
    };
  } catch (error) {
    console.error("[MarginMind] profit-alerts route loader error:", error);
    return {
      shop: session.shop,
      initialData: null,
      error: error.message || "Failed to load profit alerts",
    };
  }
};

export default function ProfitAlertsRoute() {
  const loaderData = useLoaderData();
  return (
    <>
      <style>{`
        /* Force Polaris Page to fill 100% of available width */
        [class*="Polaris-Page"] {
          max-width: 100% !important;
        }
        [class*="Polaris-Page--fullWidth"] {
          padding-left: 16px !important;
          padding-right: 16px !important;
        }
        [class*="Polaris-Page__Content"] {
          padding-left: 0 !important;
          padding-right: 0 !important;
        }
        /* Remove iframe body padding in embedded context */
        body {
          padding: 0 !important;
        }
      `}</style>
      <ProfitAlerts
        shop={loaderData?.shop}
        initialData={loaderData?.initialData}
        initialError={loaderData?.error}
      />
    </>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  console.error("[MarginMind] Profit Alerts Route Error:", error);

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h2 style={{ color: "#d72c0d" }}>Profit Alerts Error</h2>
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
