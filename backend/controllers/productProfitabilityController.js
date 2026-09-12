import {
    getProductProfitability,
} from "../services/productProfitability.service.js";

export const getProductProfitabilityController = async (
    req,
    res
) => {
    try {
        const shop =
            req.verifiedShop ||
            req.query.shop;

        if (!shop) {
            return res.status(400).json({
                success: false,
                message: "Shop is required",
            });
        }

        // 50 products per page by default
        const first = Number(
            req.query.first || 50                                                              
        );

        const after =
            req.query.after || null;            

        const search =
            req.query.search || "";

        const result =  
            await getProductProfitability({
                shop,
                first,
                after,
                search,
            });

        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error(
            "[MarginMind] Product profitability error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Failed to load product profitability",
        });
    }
};