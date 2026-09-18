import {
  getOrderProfitability,
  getOrderProfitabilityDetails,
} from "../services/orderProfitability.service.js";

export const getOrderProfitabilityController =
  async (req, res) => {
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

      const first =
        Number(req.query.first || 50);

      const after =
        req.query.after || null;

      const search =
        req.query.search || "";

      const result =
        await getOrderProfitability({
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
        "[MarginMind] Order profitability error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Failed to load order profitability",
      });
    }
  };

export const getOrderProfitabilityDetailsController =
  async (req, res) => {
    try {
      const order = await getOrderProfitabilityDetails({
        shop: req.verifiedShop,
        orderId: req.params.orderId,
      });

      return res.status(200).json({
        success: true,
        data: {
          order,
          costBreakdown: order.costBreakdown,
        },
      });
    } catch (error) {
      console.error(
        "[MarginMind] Order profitability detail error:",
        error
      );

      return res.status(
        error.message === "Order not found" ? 404 : 500
      ).json({
        success: false,
        message:
          error.message ||
          "Failed to load order profitability details",
      });
    }
  };