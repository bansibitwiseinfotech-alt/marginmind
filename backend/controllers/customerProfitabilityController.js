import {
  getCustomerProfitability,
  getCustomerProfitabilityDetails,
  getCustomerOrderHistory,
} from "../services/customerProfitability.service.js";

export const getCustomerProfitabilityController = async (
  req,
  res
) => {
  try {
    /**
     * Shop is normally provided by the internal
     * authentication middleware.
     */
    const shop =
      req.verifiedShop ||
      req.query.shop;

    if (!shop) {
      return res.status(400).json({
        success: false,
        message: "Shop is required",
      });
    }

    /**
     * Pagination
     */
    const first = Math.min(
      Math.max(
        Number(req.query.first || 50),
        1
      ),
      100
    );

    const after =
      req.query.after || null;

    /**
     * Customer search
     */
    const search =
      req.query.search || "";

    const accessToken =
      req.headers["x-shopify-access-token"] || "";

    const result =
      await getCustomerProfitability({
        shop,
        first,
        after,
        search,
        accessToken,
      });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error(
      "[MarginMind] Customer profitability error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to load customer profitability",
    });
  }
};

export const getCustomerProfitabilityDetailsController = async (
  req,
  res
) => {
  try {
    const shop = req.verifiedShop || req.query.shop;
    if (!shop) {
      return res.status(400).json({
        success: false,
        message: "Shop is required",
      });
    }

    const customer = await getCustomerProfitabilityDetails({
      shop,
      customerId: req.params.customerId,
      accessToken: req.headers["x-shopify-access-token"] || "",
    });

    return res.status(200).json({
      success: true,
      data: customer,
    });
  } catch (error) {
    console.error(
      "[MarginMind] Customer profitability details error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load customer details",
    });
  }
};

export const getCustomerOrdersController = async (
  req,
  res
) => {
  try {
    const shop = req.verifiedShop || req.query.shop;
    if (!shop) {
      return res.status(400).json({
        success: false,
        message: "Shop is required",
      });
    }

    const orderHistory = await getCustomerOrderHistory({
      shop,
      customerId: req.params.customerId,
      accessToken: req.headers["x-shopify-access-token"] || "",
    });

    return res.status(200).json({
      success: true,
      data: orderHistory,
    });
  } catch (error) {
    console.error(
      "[MarginMind] Customer order history error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load customer order history",
    });
  }
};