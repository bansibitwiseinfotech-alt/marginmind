import { Outlet, useLoaderData, useRouteError } from "react-router";
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
          <s-link href="/app/order-profit-calculator">           
            Order Profitability
          </s-link>
          <s-link href="/app/customer-profitability">
  Customer Profitability
</s-link>    
          <s-link href="/app/discount-impact">
  Discount Impact
</s-link>
          <s-link href="/app/shipping-cost">
  Shipping Cost Analysis
</s-link>
          <s-link href="/app/profit-leak-detector">
  Profit Leak Detector
</s-link>
        </s-app-nav>
        <Outlet />
      </PolarisAppProvider>
    </AppProvider>   
  );
}

// Shopify App Error Boundary: handles OAuth redirects, session refreshes, and App Bridge authentication
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
