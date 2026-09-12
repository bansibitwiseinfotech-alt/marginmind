(function () {
    "use strict";

    const shop =
        window.Shopify && window.Shopify.shop
            ? window.Shopify.shop
            : null;

    if (!shop) {
        console.warn("MarginMind: Shopify shop not found");
        return;
    }

    const container = document.getElementById("marginmind-storefront");

    const productId = container
        ? container.dataset.productId
        : "";

    window.MarginMind = window.MarginMind || {};

    window.MarginMind.shop = shop;
    window.MarginMind.productId = productId;

    console.log("MarginMind Storefront loaded");
    console.log("Shop:", shop);
    console.log("Product ID:", productId);
})();