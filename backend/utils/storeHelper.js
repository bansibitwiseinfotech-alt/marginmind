import mongoose from "mongoose";
import Store from "../models/Store.js";

export function normalizeShopDomain(shop) {
    if (!shop) return "";
    let domain = String(shop).trim().toLowerCase().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    if (!domain.includes(".")) {
        domain = `${domain}.myshopify.com`;
    }
    return domain;
}

/**
 * Retrieves the Store document for a shop and guarantees it has the latest
 * active Shopify OAuth accessToken by automatically syncing from shopify_sessions.
 */
export async function getStoreWithActiveToken(shop, explicitToken = null) {
    const normalizedShop = normalizeShopDomain(shop);
    if (!normalizedShop) {
        throw new Error("Shop is required");
    }

    let store = await Store.findOne({ shop: normalizedShop });

    // Look for latest session in shopify_sessions
    try {
        const db = mongoose.connection?.db;
        if (db) {
            const session = await db.collection("shopify_sessions").findOne({
                id: `offline_${normalizedShop}`,
            });

            if (session?.accessToken) {
                if (!store) {
                    store = await Store.create({
                        shop: normalizedShop,
                        accessToken: session.accessToken,
                        scope: session.scope || "",
                    });
                } else if (store.accessToken !== session.accessToken) {
                    store.accessToken = session.accessToken;
                    const updateObj = {};
                    updateObj["$set"] = { accessToken: session.accessToken };
                    await Store.updateOne({ _id: store._id }, updateObj);
                }
            }
        }
    } catch (err) {
        console.warn("[MarginMind] Could not auto-sync session token:", err.message);
    }

    if (!store && explicitToken) {
        store = await Store.create({
            shop: normalizedShop,
            accessToken: explicitToken,
        });
    } else if (store && !store.accessToken && explicitToken) {
        store.accessToken = explicitToken;
        const updateObj = {};
        updateObj["$set"] = { accessToken: explicitToken };
        await Store.updateOne({ _id: store._id }, updateObj);
    }

    return store;
}
