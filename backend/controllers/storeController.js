import Store from "../models/Store.js";

/**
 * Normalize shop domain string
 * e.g., "promobile-hub" -> "promobile-hub.myshopify.com"
 */
export const normalizeShopDomain = (shop) => {
    if (!shop || typeof shop !== "string") return "";
    let clean = shop.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    if (!clean.includes(".")) {
        clean = `${clean}.myshopify.com`;
    }
    return clean;
};   

/**
 * Fetch real Shopify store profile from Admin GraphQL API using the access token
 * Called during store sync if metadata was not already provided by the loader.
 */
async function fetchShopifyStoreDetails(shop, accessToken) {
    try {
        const response = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": accessToken,
            },
            body: JSON.stringify({
                query: `
                    query {
                        shop {
                            id
                            name
                            email
                            contactEmail
                            myshopifyDomain
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
                `,
            }),
        });

        if (!response.ok) {
            return null;
        }

        const json = await response.json();
        const shopData = json?.data?.shop;
        if (!shopData) return null;

        return {
            name: shopData.name || "",
            email: shopData.contactEmail || shopData.email || "",
            currency: shopData.currencyCode || "USD",
            plan: shopData.plan?.displayName || "",
            country: shopData.billingAddress?.country || "",
            city: shopData.billingAddress?.city || "",
        };
    } catch {
        return null;
    }
}

/**
 * Find store internally by domain (for background workers & Task 2 services)
 * Returns full store document including server-side credentials
 */
export const findStoreByShop = async (shopDomain) => {
    const normalized = normalizeShopDomain(shopDomain);
    if (!normalized) return null;
    return await Store.findOne({
        $or: [{ shop: normalized }, { shop: shopDomain.toLowerCase().trim() }],
    });
};

/**
 * Save / Upsert real Shopify store
 * POST /api/stores (Internal server-to-server only)
 */
export const saveStore = async (req, res) => {
    try {
        // Authenticated shop is strictly obtained from verified middleware header
        const shop = req.verifiedShop;

        if (!shop) {
            return res.status(400).json({
                success: false,
                message: "Shop domain is required and must be verified",
            });
        }

        const {
            accessToken,
            refreshToken,
            expiresIn,
            scope,
            scopes,
        } = req.body;

        let {
            name,
            email,
            currency,
            plan,
            country,
            city,
        } = req.body;

        if (!accessToken) {
            return res.status(400).json({
                success: false,
                message: "Shopify access token is required",
            });
        }

        // If store details are not already provided in the sync payload, query live Shopify profile
        if (!name || !email) {
            const fetched = await fetchShopifyStoreDetails(shop, accessToken);
            if (fetched) {
                name = name || fetched.name;
                email = email || fetched.email;
                currency = currency || fetched.currency;
                plan = plan || fetched.plan;
                country = country || fetched.country;
                city = city || fetched.city;
            }
        }

        const updateData = {
            shop,
            accessToken,
            isActive: true,
        };

        if (refreshToken) updateData.refreshToken = refreshToken;
        if (expiresIn) {
            updateData.expiresAt = new Date(Date.now() + expiresIn * 1000);
        }
        if (name) updateData.name = name;
        if (email) updateData.email = email;
        if (currency) updateData.currency = currency;
        if (plan) updateData.plan = plan;
        if (country) updateData.country = country;
        if (city) updateData.city = city;
        if (scope) updateData.scope = scope;
        if (scopes && Array.isArray(scopes)) {
            updateData.scopes = scopes;
        } else if (scope) {
            updateData.scopes = scope.split(",").map((s) => s.trim()).filter(Boolean);
        }

        // Atomic upsert: prevents duplicate records on repeated logins or reinstalls
        const store = await Store.findOneAndUpdate(
            { shop },
            { $set: updateData },
            {
                new: true,
                upsert: true,
                runValidators: true,
            }
        );

        // Return strictly safe store information — NEVER expose tokens
        return res.status(200).json({
            success: true,
            message: "Shopify store synchronized successfully",
            store: {
                _id: store._id,
                shop: store.shop,
                name: store.name,
                email: store.email,
                currency: store.currency,
                plan: store.plan,
                country: store.country,
                city: store.city,
                scope: store.scope,
                scopes: store.scopes,
                isActive: store.isActive,
                createdAt: store.createdAt,
                updatedAt: store.updatedAt,
            },
        });
    } catch (error) {
        console.error("[storeController] Save store error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to synchronize Shopify store",
            error: error.message,
        });
    }
};

/**
 * Get safe Shopify store profile by domain
 * GET /api/stores/:shop
 */
export const getStore = async (req, res) => {
    try {
        const { shop } = req.params;

        if (!shop) {
            return res.status(400).json({
                success: false,
                message: "Shop domain is required",
            });
        }

        const normalized = normalizeShopDomain(shop);

        // Find store by normalized domain or raw shop param
        const store = await Store.findOne({
            $or: [{ shop: normalized }, { shop: shop.toLowerCase().trim() }],
        }).select("-accessToken -refreshToken");

        if (!store) {
            return res.status(404).json({
                success: false,
                message: "Shopify store not found",
            });
        }

        return res.status(200).json({
            success: true,
            store,
        });
    } catch (error) {
        console.error("[storeController] Get store error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to get Shopify store",
            error: error.message,
        });
    }
};

/**
 * Get all registered active stores (safe public listing)
 * GET /api/stores
 */
export const getAllStores = async (req, res) => {
    try {
        const stores = await Store.find({ isActive: { $ne: false } })
            .select("-accessToken -refreshToken")
            .sort({ updatedAt: -1 });

        return res.status(200).json({
            success: true,
            count: stores.length,
            stores,
        });
    } catch (error) {
        console.error("[storeController] Get all stores error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to get Shopify stores",
            error: error.message,
        });
    }
};