import { Outlet, useLoaderData, useRouteError, isRouteErrorResponse } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisAppProvider i18n={enTranslations}>
        <s-app-nav>
          <s-link href="/app">Home</s-link>
          <s-link href="/app/product-profitability">
            Product Profitability
          </s-link>
        </s-app-nav>
        <Outlet />
      </PolarisAppProvider>
    </AppProvider>
  );
}

// Custom Production-Grade Error Boundary for MarginMind
export function ErrorBoundary() {
  const error = useRouteError();

  // If this is a Shopify OAuth redirect response thrown by authenticate.admin,  
  // let Shopify's boundary handle it so iframe redirects complete properly
  if (isRouteErrorResponse(error) && error.status >= 300 && error.status < 400) {
    return boundary.error(error);
  }

  // Log error details strictly server-side (never exposed to client)
  if (typeof window === "undefined") {
    console.error("[MarginMind] Server route error:", error?.message || error); 
  }

  return (
    <s-page heading="MarginMind">         
      <s-section heading="Something went wrong">
        <s-banner tone="critical">
          MarginMind could not load this page.
        </s-banner>
        <s-paragraph style={{ marginTop: "16px" }}>
          Please try refreshing the page. If the problem persists, reopen the app from your Shopify Admin.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
