import ProfitAlert from "../models/ProfitAlert.js";
import Store from "../models/Store.js";

import {
  getAlerts,
  getAlertById,
  getAlertConfig,
  saveAlertConfig,
  acknowledgeAlert,
  resolveAlert,
  getAlertSummary,
} from "../services/profitAlertService.js";

import { syncAllProfitAlerts } from "../services/profitAlertEngine.js";

async function resolveShop(req) {
  return (
    req.verifiedShop ||
    req.shopId ||
    req.shop ||
    req.headers["x-shopify-shop-domain"] ||
    req.query.shop ||
    req.body?.shop ||
    ""
  );
}

async function getAccessToken(shop) {
  const store = await Store.findOne({ shop }).lean();

  if (!store?.accessToken) {
    const error = new Error("Shopify access token not found.");
    error.statusCode = 401;
    throw error;
  }

  return store.accessToken;
}

async function listAlerts(req, res) {
  try {
    const shop = await resolveShop(req);

    if (!shop) {
      return res.status(400).json({
        success: false,
        message: "Shop domain is required.",
      });
    }

    const [result, summary] = await Promise.all([
      getAlerts({
        shop,
        status: req.query.status,
        severity: req.query.severity,
        resourceType: req.query.resourceType,
        unread: req.query.unread,
        search: req.query.search,
        page: req.query.page,
        limit: req.query.limit,
      }),
      getAlertSummary(shop),
    ]);

    return res.status(200).json({
      success: true,
      ...result,
      summary,
    });
  } catch (error) {
    console.error("[Profit Alerts] list:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to load profit alerts.",
    });
  }
}

async function getAlertDetails(req, res) {
  try {
    const shop = await resolveShop(req);

    const alert = await getAlertById({
      shop,
      id: req.params.id,
    });

    return res.status(200).json({
      success: true,
      alert,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to load alert details.",
    });
  }
}

async function runDetection(req, res) {
  try {
    const shop = await resolveShop(req);

    if (!shop) {
      return res.status(400).json({
        success: false,
        message: "Shop domain is required.",
      });
    }

    const accessToken = await getAccessToken(shop);

    const result = await syncAllProfitAlerts({
      shop,
      accessToken,
    });

    const summary = await getAlertSummary(shop);

    return res.status(200).json({
      ...result,
      summary,
    });
  } catch (error) {
    console.error("[Profit Alerts] detect:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to detect profit alerts.",
    });
  }
}

async function getConfig(req, res) {
  try {
    const shop = await resolveShop(req);

    const [config, alertProducts] = await Promise.all([
      getAlertConfig(shop),
      ProfitAlert.find({ shop })
        .select("resourceId evidence.productTitle resourceType resourceName")
        .lean(),
    ]);

    const productMap = new Map();
    const categoriesSet = new Set();

    for (const a of alertProducts) {
      if (a.resourceId && a.evidence?.productTitle) {
        productMap.set(a.resourceId, a.evidence.productTitle);
      }
      if (a.resourceType === "CATEGORY" && a.resourceName) {
        categoriesSet.add(a.resourceName);
      }
    }

    const availableProducts = Array.from(productMap.entries()).map(
      ([id, title]) => ({
        id,
        title,
      })
    );

    // If no products found in alerts yet, fetch directly from Shopify Admin API
    if (availableProducts.length === 0) {
      try {
        const accessToken = await getAccessToken(shop);
        const endpoint = `https://${shop}/admin/api/2025-01/graphql.json`;
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          },
          body: JSON.stringify({
            query: `{ products(first: 50) { nodes { id title productType } } }`,
          }),
        });
        if (resp.ok) {
          const gqlData = await resp.json();
          const nodes = gqlData?.data?.products?.nodes || [];
          for (const p of nodes) {
            availableProducts.push({ id: p.id, title: p.title });
            if (p.productType && p.productType.trim()) {
              categoriesSet.add(p.productType.trim());
            }
          }
        }
      } catch (err) {
        console.warn(
          "[Profit Alerts] Fallback products query error:",
          err.message
        );
      }
    }

    const availableCategories = Array.from(categoriesSet);

    return res.status(200).json({
      success: true,
      config,
      availableProducts,
      availableCategories,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to load alert configuration.",
    });
  }
}

async function getSummary(req, res) {
  try {
    const shop = await resolveShop(req);

    if (!shop) {
      return res.status(400).json({
        success: false,
        message: "Shop domain is required.",
      });
    }

    const summary = await getAlertSummary(shop);

    return res.status(200).json({
      success: true,
      summary,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to load alert summary.",
    });
  }
}

async function updateConfig(req, res) {
  try {
    const shop = await resolveShop(req);

    const config = await saveAlertConfig({
      shop,
      globalMarginThreshold: req.body?.globalMarginThreshold,
      criticalMarginThreshold: req.body?.criticalMarginThreshold,
      productThresholds: req.body?.productThresholds,
      categoryThresholds: req.body?.categoryThresholds,
      enabled: req.body?.enabled,
    });

    return res.status(200).json({
      success: true,
      config,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to save alert configuration.",
    });
  }
}

async function acknowledge(req, res) {
  try {
    const shop = await resolveShop(req);

    const alert = await acknowledgeAlert({
      shop,
      id: req.params.id,
    });

    const summary = await getAlertSummary(shop);

    return res.status(200).json({
      success: true,
      alert,
      summary,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to acknowledge alert.",
    });
  }
}

async function resolve(req, res) {
  try {
    const shop = await resolveShop(req);

    const alert = await resolveAlert({
      shop,
      id: req.params.id,
      resolutionSource: req.body?.resolutionSource || "MERCHANT",
      resolutionNote: req.body?.resolutionNote || null,
    });

    const summary = await getAlertSummary(shop);

    return res.status(200).json({
      success: true,
      alert,
      summary,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to resolve alert.",
    });
  }
}

export {
  listAlerts,
  getSummary,
  getAlertDetails,
  runDetection,
  getConfig,
  updateConfig,
  acknowledge,
  resolve,
};