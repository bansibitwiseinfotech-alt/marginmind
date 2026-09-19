export function extractShopifyNumericId(resourceId) {
    if (!resourceId) return null;
    const value = String(resourceId);
    const parts = value.split("/");
    return parts[parts.length - 1] || null;
}

function shopSlug(shop) {
    return String(shop || "")
        .trim()
        .toLowerCase()
        .replace(/\.myshopify\.com$/, "")
        .replace(/[^a-z0-9-]/g, "");
}

export function buildShopifyAdminResourceUrl(shop, resourceType, resourceId) {
    const slug = shopSlug(shop);
    if (!slug) return null;

    const numericId = resourceId ? extractShopifyNumericId(resourceId) : null;
    const paths = {
        Product: numericId ? `products/${encodeURIComponent(numericId)}` : null,
        ProductVariant: numericId ? `products/${encodeURIComponent(numericId)}` : null,
        Order: numericId ? `orders/${encodeURIComponent(numericId)}` : null,
        Customer: numericId ? `customers/${encodeURIComponent(numericId)}` : null,
        Discount: resourceId ? `discounts/${encodeURIComponent(String(resourceId))}` : null,
        ShippingLine: "settings/shipping",
        Store: "settings",
    };

    const path = paths[resourceType] || "settings";
    return `https://admin.shopify.com/store/${encodeURIComponent(slug)}/${path}`;
}