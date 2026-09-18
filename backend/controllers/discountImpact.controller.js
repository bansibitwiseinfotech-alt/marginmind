import {
    getDiscountImpact,
} from "../services/discountImpact.service.js";

/**
 * GET /api/discount-impact
 * POST /api/discount-impact
 *
 * Calculates discount performance and profit impact for the authenticated Shopify store.
 * Reuses verified shop identity and existing Shopify GraphQL order profitability service.
 */
async function getDiscountImpactController(req, res) {
    try {
        const shop = req.verifiedShop || req.query.shop;

        if (!shop) {
            return res.status(400).json({
                success: false,
                message: "Shop domain is required",
            });
        }

        const first = Math.min(
            Math.max(Number(req.query.first || req.body?.first || 50), 1),
            100
        );

        const after = req.query.after || req.body?.after || null;
        const search = req.query.search || req.body?.search || "";
        const orders = Array.isArray(req.body?.orders) ? req.body.orders : null;

        const results = await getDiscountImpact({
            shop,
            first,
            after,
            search,
            orders,
        });

        return res.status(200).json({
            success: true,
            data: results,
        });
    } catch (error) {
        console.error(
            "[MarginMind] Discount Impact Error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: error.message || "Failed to calculate discount impact",
        });
    }
}

export {
    getDiscountImpactController,
};