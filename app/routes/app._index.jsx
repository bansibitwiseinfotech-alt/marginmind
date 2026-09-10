/**
 * app._index.jsx
 *
 * MarginMind — Home page (authenticated index route)
 *
 * Security:
 * - authenticate.admin(request) verifies the Shopify session server-side.
 * - session.shop is sourced from Shopify's verified session — not from the browser.
 * - session.accessToken is synced to MongoDB entirely server-side and is NEVER
 *   returned to the React frontend.
 */

import { useLoaderData } from "react-router";
import { authenticate, sessionStorage } from "../shopify.server";

// ---------------------------------------------------------------------------
// Loader — server-side: authenticate + sync store to MongoDB
// ---------------------------------------------------------------------------
export const loader = async ({ request }) => {
  // 1. Authenticate the Shopify session (redirects to OAuth if not authenticated)
  const { session, admin } = await authenticate.admin(request);

  // 2. Resolve offline access token (from session or session storage)
  let accessToken = session.accessToken;
  if (!accessToken && sessionStorage) {
    try {
      const offlineSession = await sessionStorage.loadSession(
        `offline_${session.shop}`
      );
      accessToken = offlineSession?.accessToken;
    } catch (e) {
      console.warn("[MarginMind] Could not load offline session:", e.message);
    }
  }

  // 3. Query real Shopify store metadata using Admin GraphQL API
  let storeDetails = {};
  if (admin) {
    try {
      const shopResponse = await admin.graphql(`
        query {
          shop {
            name
            email
            contactEmail
            currencyCode
            plan {
              displayName
            }
            billingAddress {
              country
              city
            }
          }
        }
      `);
      const shopData = await shopResponse.json();
      if (shopData?.data?.shop) {
        storeDetails = {
          name: shopData.data.shop.name || "",
          email: shopData.data.shop.contactEmail || shopData.data.shop.email || "",
          currency: shopData.data.shop.currencyCode || "USD",
          plan: shopData.data.shop.plan?.displayName || "",
          country: shopData.data.shop.billingAddress?.country || "",
          city: shopData.data.shop.billingAddress?.city || "",
          scope: session.scope || "",
        };
      }
    } catch (gqlErr) {
      console.warn("[MarginMind] Shop details query error:", gqlErr.message);
    }
  }

  // 4. Sync store to MongoDB (server-to-server internal call, never exposes tokens to browser)
  if (accessToken) {
    try {
      const backendUrl =
        process.env.BACKEND_URL ||
        `http://localhost:${process.env.BACKEND_PORT || 5000}`;

      const syncResponse = await fetch(`${backendUrl}/api/stores`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Internal auth headers — validated by authMiddleware (validateInternalRequest)
          // These are server-side only and never sent to or visible in the browser
          "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
          "x-shopify-shop-domain": session.shop,
        },
        body: JSON.stringify({
          accessToken,
          ...storeDetails,
        }),
      });

      if (!syncResponse.ok) {
        console.error(
          `[MarginMind] Store sync failed for ${session.shop} (${syncResponse.status})`
        );
      }
    } catch (syncError) {
      console.error("[MarginMind] Store sync error:", syncError.message);
    }
  } else {
    console.warn(
      `[MarginMind] No accessToken available for ${session.shop}; skipping MongoDB sync`
    );
  }

  // 5. Return ONLY safe, non-sensitive store information to the React frontend
  // accessToken and refreshToken are strictly omitted
  return {
    shop: session.shop,
    name: storeDetails.name || "",
    currency: storeDetails.currency || "USD",
    plan: storeDetails.plan || "",
  };
};

// ---------------------------------------------------------------------------
// Component — MarginMind home page
// ---------------------------------------------------------------------------
export default function Index() {
  const { shop, name, currency, plan } = useLoaderData();

  return (
    <s-page heading="MarginMind">
      <s-section heading={`Welcome${name ? `, ${name}` : ""}`}>
        <s-paragraph>
          MarginMind is your profit intelligence layer for Shopify. You are now
          securely connected to your store.
        </s-paragraph>
      </s-section>

      <s-section heading="Store Overview">
        <s-unordered-list>
          <s-list-item>
            <strong>Store Domain:</strong> {shop}
          </s-list-item>
          {name && (
            <s-list-item>
              <strong>Store Name:</strong> {name}
            </s-list-item>
          )}
          {currency && (
            <s-list-item>
              <strong>Currency:</strong> {currency}
            </s-list-item>
          )}
          {plan && (
            <s-list-item>
              <strong>Shopify Plan:</strong> {plan}
            </s-list-item>
          )}
        </s-unordered-list>
      </s-section>

      <s-section heading="Connection Status" slot="aside">
        <s-paragraph>
          <s-badge tone="success">Connected to MarginMind</s-badge>
        </s-paragraph>
        <s-paragraph tone="subdued">
          Store credentials and session verified securely server-side.
        </s-paragraph>
      </s-section>

      <s-section heading="Next: Task 2 Data Sync" slot="aside">
        <s-unordered-list>
          <s-list-item>Products & inventory sync</s-list-item>
          <s-list-item>Order and transaction sync</s-list-item>
          <s-list-item>COGS profit margin tracking</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}
