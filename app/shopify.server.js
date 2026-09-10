import "dotenv/config";
import "@shopify/shopify-app-react-router/adapters/node";

import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";

import {
  MongoDBSessionStorage,
} from "@shopify/shopify-app-session-storage-mongodb";

const mongodbSessionStorage = new MongoDBSessionStorage(
  process.env.MONGODB_URI,
  "db_marginmind"
);

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,

  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",

  apiVersion: ApiVersion.July26,

  // appUrl is required by shopifyApp — falls back to HOST (set by shopify app dev tunnel)
  appUrl:
    process.env.SHOPIFY_APP_URL ||
    process.env.HOST ||
    "https://marginmind.myshopify.com",

  scopes: process.env.SCOPES?.split(",").map((s) => s.trim()),

  authPathPrefix: "/auth",

  sessionStorage: mongodbSessionStorage,

  distribution: AppDistribution.AppStore,

  future: {
    unstable_newEmbeddedAuthStrategy: true,
    expiringOfflineAccessTokens: true,
  },

  hooks: {
    afterAuth: async ({ session }) => {
      // Only log the shop domain — never log tokens or secrets
      console.log(`[MarginMind] afterAuth: syncing store ${session.shop}`);

      const backendUrl = process.env.BACKEND_URL || "http://localhost:5000";

      try {
        const response = await fetch(`${backendUrl}/api/stores`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": process.env.INTERNAL_API_SECRET,
            "x-shopify-shop-domain": session.shop,
          },
          body: JSON.stringify({
            // Token is sent only server-to-server; never returned to browser
            accessToken: session.accessToken,
            scope: session.scope,
          }),
        });

        if (!response.ok) {
          // Log status only — not the token
          console.error(
            `[MarginMind] afterAuth store sync failed for ${session.shop}: HTTP ${response.status}`
          );
        } else {
          console.log(`[MarginMind] afterAuth store sync complete: ${session.shop}`);
        }
      } catch (error) {
        console.error(
          `[MarginMind] afterAuth store sync error for ${session.shop}:`,
          error.message
        );
      }
    },
  },
});

export default shopify;

export const authenticate = shopify.authenticate;

export const unauthenticated = shopify.unauthenticated;

export const login = shopify.login;

export const registerWebhooks = shopify.registerWebhooks;

export const sessionStorage = shopify.sessionStorage;

export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;