import Store from "../models/Store.js";
import { normalizeCostConfig, calculateOrderCost } from "../services/costManagement.service.js";

export const getCostConfig = async (req, res) => {
  try {
    const shop = req.verifiedShop;
    if (!shop) {
      return res.status(400).json({ success: false, message: "Shop is required" });
    }

    const store = await Store.findOne({ shop }).select("costConfig");
    const config = normalizeCostConfig(store?.costConfig || {});

    return res.status(200).json({
      success: true,
      data: config,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load cost configuration",
    });
  }
};

export const saveCostConfig = async (req, res) => {
  try {
    const shop = req.verifiedShop;
    if (!shop) {
      return res.status(400).json({ success: false, message: "Shop is required" });
    }

    const normalized = normalizeCostConfig(req.body || {});

    const store = await Store.findOneAndUpdate(
      { shop },
      { $set: { costConfig: normalized } },
      { new: true, upsert: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: "Cost configuration saved",
      data: normalizeCostConfig(store.costConfig || {}),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to save cost configuration",
    });
  }
};

export const calculateCostPreview = async (req, res) => {
  try {
    const shop = req.verifiedShop;
    if (!shop) {
      return res.status(400).json({ success: false, message: "Shop is required" });
    }

    const store = await Store.findOne({ shop }).select("costConfig");
    const config = normalizeCostConfig(store?.costConfig || {});
    const result = calculateOrderCost({
      ...req.body,
      costConfig: config,
    });                                             

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to calculate cost preview",
    });
  }
};
