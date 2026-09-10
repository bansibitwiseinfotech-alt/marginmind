/**
 * backend/services/shopifyClient.js
 *
 * Task 2 Architecture Preparation:
 * Provides an authenticated Shopify GraphQL Admin API client for background services,
 * scheduled sync jobs, and webhook processors.
 *
 * Credentials (accessToken) are loaded server-side from MongoDB (tbl_stores)
 * and are NEVER exposed to the frontend or clients.
 */

import { findStoreByShop } from "../controllers/storeController.js";

/**
 * Creates a server-side Shopify Admin API client for the specified store.
 * @param {string} shopDomain - The myshopify.com domain of the store
 * @returns {Promise<{ shop: string, graphql: Function }>}
 */
export const createShopifyAdminClient = async (shopDomain) => {
    const store = await findStoreByShop(shopDomain);

    if (!store || !store.accessToken) {
        throw new Error(
            `[ShopifyClient] No active store or access token found for: ${shopDomain}`
        );
    }

    const shop = store.shop;
    const accessToken = store.accessToken;
    const apiVersion = process.env.SHOPIFY_API_VERSION || "2025-01";

    return {
        shop,
        storeId: store._id,
        /**
         * Executes a GraphQL query or mutation against the Shopify Admin API
         * @param {string} query - GraphQL query or mutation string
         * @param {object} variables - Optional GraphQL query variables
         */
        graphql: async (query, variables = {}) => {
            const endpoint = `https://${shop}/admin/api/${apiVersion}/graphql.json`;

            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Shopify-Access-Token": accessToken,
                },
                body: JSON.stringify({ query, variables }),
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                throw new Error(
                    `[ShopifyClient] GraphQL request failed (${response.status}): ${errorText}`
                );
            }

            const json = await response.json();

            if (json.errors && json.errors.length > 0) {
                const message = json.errors.map((e) => e.message).join("; ");
                throw new Error(`[ShopifyClient] GraphQL errors: ${message}`);
            }

            return json.data;
        },
    };
};
