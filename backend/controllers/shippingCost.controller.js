import {
    getShippingCostAnalysis,
} from "../services/shippingCost.service.js";

/**
 * Get shipping cost analysis.
 */
async function getShippingCostAnalysisController(req, res) {
    try {
        // Use the authenticated shop from your existing middleware.
        const shop =
            req.verifiedShop ||
            req.shop ||
            req.shopDomain ||
            req.query.shop;

        if (!shop) {
            return res.status(400).json({
                success: false,
                message: "Shop domain is required",
            });
        }

        const {
            first = 50,
            after = null,
            search = "",
        } = req.query;

        const result = await getShippingCostAnalysis({
            shop,
            first: Number(first),
            after,
            search,
        });

        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error(
            "[MarginMind] Shipping cost analysis error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to fetch shipping cost analysis",
            error: error.message,
        });
    }
}

export {
    getShippingCostAnalysisController,
};