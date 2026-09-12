import Store from "../models/Store.js";

const SHOPIFY_API_VERSION = "2026-07";

function normalizeShop(shop) {
  if (!shop) return null;
  const value = String(shop).trim().toLowerCase();
  return value.endsWith(".myshopify.com") ? value : `${value}.myshopify.com`;
}

async function shopifyGraphQL(shop, accessToken, query, variables = {}) {
  const response = await fetch(
    `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  const json = await response.json();

  if (!response.ok) {
    throw new Error(json?.errors?.[0]?.message || "Shopify request failed");
  }

  if (json.errors?.length) {
    throw new Error(json.errors.map((error) => error.message).join(", "));
  }

  return json.data;
}

function flattenShopifyNodes(connection) {
  if (Array.isArray(connection)) return connection;
  if (!connection || typeof connection !== "object") return [];
  if (Array.isArray(connection.nodes)) return connection.nodes;
  if (Array.isArray(connection.edges)) {
    return connection.edges.map((edge) => edge?.node ?? edge).filter(Boolean);
  }
  return [];
}

const PRODUCTS_QUERY = `
  query ProductsSync($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: TITLE) {
      nodes {
        id
        title
        handle
        vendor
        status
        totalInventory
        featuredImage {
          url
          altText
        }                 
        variants(first: 100) {
          nodes {
            id
            title
            sku
            price
            inventoryQuantity
            inventoryItem {
              id
              unitCost {
                amount
                currencyCode
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const VARIANTS_QUERY = `
  query VariantsSync($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: TITLE) {
      nodes {
        id
        title
        variants(first: 100) {
          nodes {
            id
            title
            sku
            price
            inventoryQuantity
            inventoryItem {
              id
              unitCost {
                amount
                currencyCode
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const ORDERS_QUERY = `
  query OrdersSync($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        name
        createdAt
        processedAt
        displayFinancialStatus
        displayFulfillmentStatus
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        subtotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalTaxSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalShippingPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalDiscountsSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        customer {
          id
          firstName
          lastName
          email
        }
        shippingAddress {
          firstName
          lastName
          city
          country
          zip
        }
        lineItems(first: 100) {
          nodes {
            id
            title
            quantity
            variant {
              id
              title
              sku
              price
            }
            discountedTotalSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            originalTotalSet {
              shopMoney {
                amount
                currencyCode
              }
            }
          }
        }
        shippingLines(first: 50) {
          nodes {
            id
            title
            originalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            discountedPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
          }
        }
        discountApplications(first: 20) {
          nodes {
            ... on DiscountCodeApplication {
              code
              allocationMethod
              targetType
              value {
                ... on MoneyV2 {
                  amount
                  currencyCode
                }
                ... on PricingPercentageValue {
                  percentage
                }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const DISCOUNTS_QUERY = `
  query DiscountsSync($first: Int!, $after: String) {
    discountNodes(first: $first, after: $after) {
      nodes {
        id
        discount {
          ... on DiscountCodeBasic {
            title
            status
            summary
            codes(first: 1) {
              nodes {
                code
              }
            }
          }
          ... on DiscountAutomaticBasic {
            title
            status
            summary
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const CUSTOMERS_QUERY = `
  query CustomersSync($first: Int!, $after: String) {
    customers(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        firstName
        lastName
        email
        createdAt
        updatedAt
        state
        displayName
        phone
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const RETURNS_AND_REFUNDS_QUERY = `
  query ReturnsAndRefundsSync($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        name
        createdAt
        returns(first: 50) {
          edges {
            node {
              id
              name
              status
              createdAt
              requestApprovedAt
              totalQuantity
              returnLineItems(first: 50) {
                edges {
                  node {
                    id
                    quantity
                  }
                }
              }
            }
          }
        }
        refunds {
          id
          processedAt
          totalRefundedSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          note
          return {
            id
            name
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const syncProducts = async (req, res) => {
  try {
    const shop = req.verifiedShop;
    const store = await Store.findOne({ shop });
    const accessToken =
      store?.accessToken ||
      req.headers["x-shopify-access-token"] ||
      req.headers["x-shopify-access-token"];

    if (!store && !accessToken) {
      return res.status(404).json({
        success: false,
        message: "Store not found and no Shopify access token was supplied",
      });
    }

    if (!accessToken) {
      return res.status(400).json({ success: false, message: "Shopify access token missing" });
    }

    if (store) {
      store.syncStatus = "syncing";
      store.lastSyncStartedAt = new Date();
      store.lastSyncError = "";
      await store.save();
    }

    const data = await shopifyGraphQL(
      normalizeShop(shop),
      accessToken,
      PRODUCTS_QUERY,
      { first: 50, after: null }
    );

    const products = data?.products?.nodes || [];

    const productSummary = products.map((product) => ({
      id: product.id,
      title: product.title,
      handle: product.handle,
      vendor: product.vendor,
      status: product.status,
      totalInventory: product.totalInventory,
      image: product.featuredImage?.url || null,
      variantsCount: product.variants?.nodes?.length || 0,
      variants: (product.variants?.nodes || []).map((variant) => ({
        id: variant.id,
        title: variant.title,
        sku: variant.sku,
        price: variant.price,
        inventoryQuantity: variant.inventoryQuantity,
        unitCost: variant.inventoryItem?.unitCost?.amount || null,
      })),
    }));

    if (store) {
      store.syncStatus = "success";
      store.lastSyncedAt = new Date();
      store.productsSynced = productSummary.length;
      store.lastSyncError = "";
      await store.save();
    }

    return res.status(200).json({
      success: true,
      message: "Product sync completed successfully",
      shop,
      syncedAt: store.lastSyncedAt,
      totalProducts: productSummary.length,
      products: productSummary,
    });
  } catch (error) {
    if (req.verifiedShop) {
      const store = await Store.findOne({ shop: req.verifiedShop });
      if (store) {
        store.syncStatus = "failed";
        store.lastSyncError = error.message || "Product sync failed";
        await store.save();
      }
    }

    return res.status(500).json({
      success: false,
      message: "Product sync failed",
      error: error.message,
    });
  }
};

export const syncVariants = async (req, res) => {
  try {
    const shop = req.verifiedShop;
    const store = await Store.findOne({ shop });
    const accessToken =
      store?.accessToken ||
      req.headers["x-shopify-access-token"] ||
      req.headers["x-shopify-access-token"];

    if (!store && !accessToken) {
      return res.status(404).json({
        success: false,
        message: "Store not found and no Shopify access token was supplied",
      });
    }

    if (!accessToken) {
      return res.status(400).json({ success: false, message: "Shopify access token missing" });
    }

    if (store) {
      store.syncStatus = "syncing";
      store.lastSyncStartedAt = new Date();
      store.lastSyncError = "";
      await store.save();
    }

    const data = await shopifyGraphQL(
      normalizeShop(shop),
      accessToken,
      VARIANTS_QUERY,
      { first: 50, after: null }
    );

    const variants = (data?.products?.nodes || []).flatMap((product) => {
      return (product.variants?.nodes || []).map((variant) => ({
        productId: product.id,
        productTitle: product.title,
        id: variant.id,
        title: variant.title,
        sku: variant.sku,
        price: variant.price,
        inventoryQuantity: variant.inventoryQuantity,
        unitCost: variant.inventoryItem?.unitCost?.amount || null,
        currency: variant.inventoryItem?.unitCost?.currencyCode || "USD",
      }));
    });

    if (store) {
      store.syncStatus = "success";
      store.lastSyncedAt = new Date();
      store.productsSynced = variants.length;
      store.lastSyncError = "";
      await store.save();
    }

    return res.status(200).json({
      success: true,
      message: "Variant sync completed successfully",
      shop,
      syncedAt: store.lastSyncedAt,
      totalVariants: variants.length,
      variants,
    });
  } catch (error) {
    if (req.verifiedShop) {
      const store = await Store.findOne({ shop: req.verifiedShop });
      if (store) {
        store.syncStatus = "failed";
        store.lastSyncError = error.message || "Variant sync failed";
        await store.save();
      }
    }

    return res.status(500).json({
      success: false,
      message: "Variant sync failed",
      error: error.message,
    });
  }
};

export const syncOrders = async (req, res) => {
  try {
    const shop = req.verifiedShop;
    const store = await Store.findOne({ shop });
    const accessToken =
      store?.accessToken ||
      req.headers["x-shopify-access-token"] ||
      req.headers["x-shopify-access-token"];

    if (!store && !accessToken) {
      return res.status(404).json({
        success: false,
        message: "Store not found and no Shopify access token was supplied",
      });
    }

    if (!accessToken) {
      return res.status(400).json({ success: false, message: "Shopify access token missing" });
    }

    if (store) {
      store.syncStatus = "syncing";
      store.lastSyncStartedAt = new Date();
      store.lastSyncError = "";
      await store.save();
    }

    const data = await shopifyGraphQL(
      normalizeShop(shop),
      accessToken,
      ORDERS_QUERY,
      { first: 50, after: null }
    );

    const orders = (data?.orders?.nodes || []).map((order) => ({
      id: order.id,
      name: order.name,
      createdAt: order.createdAt,
      processedAt: order.processedAt,
      financialStatus: order.displayFinancialStatus,
      fulfillmentStatus: order.displayFulfillmentStatus,
      totalPrice: order.totalPriceSet?.shopMoney?.amount || null,
      subtotalPrice: order.subtotalPriceSet?.shopMoney?.amount || null,
      tax: order.totalTaxSet?.shopMoney?.amount || null,
      shippingPrice: order.totalShippingPriceSet?.shopMoney?.amount || null,
      discounts: order.totalDiscountsSet?.shopMoney?.amount || null,
      customer: order.customer ? {
        id: order.customer.id,
        firstName: order.customer.firstName,
        lastName: order.customer.lastName,
        email: order.customer.email,
      } : null,
      shippingAddress: order.shippingAddress ? {
        firstName: order.shippingAddress.firstName,
        lastName: order.shippingAddress.lastName,
        city: order.shippingAddress.city,
        country: order.shippingAddress.country,
        zip: order.shippingAddress.zip,
      } : null,
      lineItems: (order.lineItems?.nodes || []).map((item) => ({
        id: item.id,
        title: item.title,
        quantity: item.quantity,
        variantId: item.variant?.id || null,
        variantTitle: item.variant?.title || null,
        sku: item.variant?.sku || null,
        price: item.variant?.price || null,
        originalTotal: item.originalTotalSet?.shopMoney?.amount || null,
        discountedTotal: item.discountedTotalSet?.shopMoney?.amount || null,
      })),
      shippingLines: (order.shippingLines?.nodes || []).map((line) => ({
        id: line.id,
        title: line.title,
        price: line.originalPriceSet?.shopMoney?.amount || null,
      })),
      discountsApplied: (order.discountApplications?.nodes || []).map((discount) => ({
        code: discount.code,
        amount: discount.value?.amount || null,
        type: discount.targetType,
      })),
    }));

    if (store) {
      store.syncStatus = "success";
      store.lastSyncedAt = new Date();
      store.productsSynced = orders.length;
      store.lastSyncError = "";
      await store.save();
    }

    return res.status(200).json({
      success: true,
      message: "Order sync completed successfully",
      shop,
      syncedAt: store?.lastSyncedAt || new Date(),
      totalOrders: orders.length,
      orders,
    });
  } catch (error) {
    if (req.verifiedShop) {
      const store = await Store.findOne({ shop: req.verifiedShop });
      if (store) {
        store.syncStatus = "failed";
        store.lastSyncError = error.message || "Order sync failed";
        await store.save();
      }
    }

    return res.status(500).json({
      success: false,
      message: "Order sync failed",
      error: error.message,
    });
  }
};

export const syncDiscounts = async (req, res) => {
  try {
    const shop = req.verifiedShop;
    const store = await Store.findOne({ shop });
    const accessToken =
      store?.accessToken ||
      req.headers["x-shopify-access-token"] ||
      req.headers["x-shopify-access-token"];

    if (!store && !accessToken) {
      return res.status(404).json({
        success: false,
        message: "Store not found and no Shopify access token was supplied",
      });
    }

    if (!accessToken) {
      return res.status(400).json({ success: false, message: "Shopify access token missing" });
    }

    if (store) {
      store.syncStatus = "syncing";
      store.lastSyncStartedAt = new Date();
      store.lastSyncError = "";
      await store.save();
    }

    const data = await shopifyGraphQL(
      normalizeShop(shop),
      accessToken,
      DISCOUNTS_QUERY,
      { first: 50, after: null }
    );

    const discounts = (data?.discountNodes?.nodes || []).map((node) => {
      const discount = node?.discount;
      const code =
        discount?.codes?.nodes?.[0]?.code ||
        null;

      return {
        id: node?.id || null,
        title: discount?.title || null,
        status: discount?.status || null,
        summary: discount?.summary || null,
        code,
      };
    });

    if (store) {
      store.syncStatus = "success";
      store.lastSyncedAt = new Date();
      store.productsSynced = discounts.length;
      store.lastSyncError = "";
      await store.save();
    }

    return res.status(200).json({
      success: true,
      message: "Discount sync completed successfully",
      shop,
      syncedAt: store?.lastSyncedAt || new Date(),
      totalDiscounts: discounts.length,
      discounts,
    });
  } catch (error) {
    if (req.verifiedShop) {
      const store = await Store.findOne({ shop: req.verifiedShop });
      if (store) {
        store.syncStatus = "failed";
        store.lastSyncError = error.message || "Discount sync failed";
        await store.save();
      }
    }

    return res.status(500).json({
      success: false,
      message: "Discount sync failed",
      error: error.message,
    });
  }
};

export const syncCustomers = async (req, res) => {
  try {
    const shop = req.verifiedShop;
    const store = await Store.findOne({ shop });
    const accessToken =
      store?.accessToken ||
      req.headers["x-shopify-access-token"] ||
      req.headers["x-shopify-access-token"];

    if (!store && !accessToken) {
      return res.status(404).json({
        success: false,
        message: "Store not found and no Shopify access token was supplied",
      });
    }

    if (!accessToken) {
      return res.status(400).json({ success: false, message: "Shopify access token missing" });
    }

    if (store) {
      store.syncStatus = "syncing";
      store.lastSyncStartedAt = new Date();
      store.lastSyncError = "";
      await store.save();
    }

    const data = await shopifyGraphQL(
      normalizeShop(shop),
      accessToken,
      CUSTOMERS_QUERY,
      { first: 50, after: null }
    );

    const customers = (data?.customers?.nodes || []).map((customer) => ({
      id: customer.id,
      firstName: customer.firstName || null,
      lastName: customer.lastName || null,
      email: customer.email || null,
      displayName: customer.displayName || null,
      phone: customer.phone || null,
      createdAt: customer.createdAt || null,
      updatedAt: customer.updatedAt || null,
      state: customer.state || null,
    }));

    if (store) {
      store.syncStatus = "success";
      store.lastSyncedAt = new Date();
      store.productsSynced = customers.length;
      store.lastSyncError = "";
      await store.save();
    }

    return res.status(200).json({
      success: true,
      message: "Customer sync completed successfully",
      shop,
      syncedAt: store?.lastSyncedAt || new Date(),
      totalCustomers: customers.length,
      customers,
    });
  } catch (error) {
    if (req.verifiedShop) {
      const store = await Store.findOne({ shop: req.verifiedShop });
      if (store) {
        store.syncStatus = "failed";
        store.lastSyncError = error.message || "Customer sync failed";
        await store.save();
      }
    }

    return res.status(500).json({
      success: false,
      message: "Customer sync failed",
      error: error.message,
    });
  }
};

export const syncReturns = async (req, res) => {
  try {
    const shop = req.verifiedShop;
    const store = await Store.findOne({ shop });
    const accessToken =
      store?.accessToken ||
      req.headers["x-shopify-access-token"] ||
      req.headers["x-shopify-access-token"];

    if (!store && !accessToken) {
      return res.status(404).json({
        success: false,
        message: "Store not found and no Shopify access token was supplied",
      });
    }

    if (!accessToken) {
      return res.status(400).json({ success: false, message: "Shopify access token missing" });
    }

    if (store) {
      store.syncStatus = "syncing";
      store.lastSyncStartedAt = new Date();
      store.lastSyncError = "";
      await store.save();
    }

    const data = await shopifyGraphQL(
      normalizeShop(shop),
      accessToken,
      RETURNS_AND_REFUNDS_QUERY,
      { first: 50, after: null }
    );

    const returns = (data?.orders?.nodes || []).flatMap((order) => {
      const returnItems = flattenShopifyNodes(order?.returns);

      return returnItems.map((returnItem) => {
        const item = returnItem?.node ?? returnItem;
        const lineItems = flattenShopifyNodes(item?.returnLineItems);

        return {
          orderId: order.id,
          orderName: order.name,
          id: item.id,
          name: item.name,
          status: item.status,
          createdAt: item.createdAt,
          requestApprovedAt: item.requestApprovedAt,
          totalQuantity: item.totalQuantity,
          returnLineItems: lineItems.map((lineItem) => {
            const node = lineItem?.node ?? lineItem;
            return {
              id: node.id,
              quantity: node.quantity,
            };
          }),
        };
      });
    });

    if (store) {
      store.syncStatus = "success";
      store.lastSyncedAt = new Date();
      store.productsSynced = returns.length;
      store.lastSyncError = "";
      await store.save();
    }

    return res.status(200).json({
      success: true,
      message: "Return sync completed successfully",
      shop,
      syncedAt: store?.lastSyncedAt || new Date(),
      totalReturns: returns.length,
      returns,
    });
  } catch (error) {
    if (req.verifiedShop) {
      const store = await Store.findOne({ shop: req.verifiedShop });
      if (store) {
        store.syncStatus = "failed";
        store.lastSyncError = error.message || "Return sync failed";
        await store.save();
      }
    }

    return res.status(500).json({
      success: false,
      message: "Return sync failed",
      error: error.message,
    });
  }
};

export const syncRefunds = async (req, res) => {
  try {
    const shop = req.verifiedShop;
    const store = await Store.findOne({ shop });
    const accessToken =
      store?.accessToken ||
      req.headers["x-shopify-access-token"] ||
      req.headers["x-shopify-access-token"];

    if (!store && !accessToken) {
      return res.status(404).json({
        success: false,
        message: "Store not found and no Shopify access token was supplied",
      });
    }

    if (!accessToken) {
      return res.status(400).json({ success: false, message: "Shopify access token missing" });
    }

    if (store) {
      store.syncStatus = "syncing";
      store.lastSyncStartedAt = new Date();
      store.lastSyncError = "";
      await store.save();
    }

    const data = await shopifyGraphQL(
      normalizeShop(shop),
      accessToken,
      RETURNS_AND_REFUNDS_QUERY,
      { first: 50, after: null }
    );

    const refunds = (data?.orders?.nodes || []).flatMap((order) => {
      const refundItems = flattenShopifyNodes(order?.refunds);

      return refundItems.map((refund) => ({
        id: refund.id,
        orderId: order.id,
        orderName: order.name,
        processedAt: refund.processedAt,
        totalRefunded: refund.totalRefundedSet?.shopMoney?.amount || null,
        currency: refund.totalRefundedSet?.shopMoney?.currencyCode || null,
        note: refund.note || null,
        returnId: refund.return?.id || null,
        returnName: refund.return?.name || null,
      }));
    });

    if (store) {
      store.syncStatus = "success";
      store.lastSyncedAt = new Date();
      store.productsSynced = refunds.length;
      store.lastSyncError = "";
      await store.save();
    }

    return res.status(200).json({
      success: true,
      message: "Refund sync completed successfully",
      shop,
      syncedAt: store?.lastSyncedAt || new Date(),
      totalRefunds: refunds.length,
      refunds,
    });
  } catch (error) {
    if (req.verifiedShop) {
      const store = await Store.findOne({ shop: req.verifiedShop });
      if (store) {
        store.syncStatus = "failed";
        store.lastSyncError = error.message || "Refund sync failed";
        await store.save();
      }
    }

    return res.status(500).json({
      success: false,
      message: "Refund sync failed",
      error: error.message,
    });
  }
};

export const syncAll = async (req, res) => {
  try {
    const shop = req.verifiedShop;
    const store = await Store.findOne({ shop });
    const accessToken =
      store?.accessToken ||
      req.headers["x-shopify-access-token"] ||
      req.headers["x-shopify-access-token"];

    if (!store && !accessToken) {
      return res.status(404).json({
        success: false,
        message: "Store not found and no Shopify access token was supplied",
      });
    }

    if (!accessToken) {
      return res.status(400).json({
        success: false,
        message: "Shopify access token missing",
      });
    }

    if (store) {
      store.syncStatus = "syncing";
      store.lastSyncStartedAt = new Date();
      store.lastSyncError = "";
      await store.save();
    }

    const results = {};

    const productData = await shopifyGraphQL(
      normalizeShop(shop),
      accessToken,
      PRODUCTS_QUERY,
      { first: 50, after: null }
    );
    results.products = { total: productData?.products?.nodes?.length || 0 };

    const variantData = await shopifyGraphQL(
      normalizeShop(shop),
      accessToken,
      VARIANTS_QUERY,
      { first: 50, after: null }
    );
    results.variants = {
      total: (variantData?.products?.nodes || []).reduce(
        (count, product) => count + ((product.variants?.nodes || []).length),
        0
      ),
    };

    const discountData = await shopifyGraphQL(
      normalizeShop(shop),
      accessToken,
      DISCOUNTS_QUERY,
      { first: 50, after: null }
    );
    results.discounts = {
      total: discountData?.discountNodes?.nodes?.length || 0,
    };

    const customerData = await shopifyGraphQL(
      normalizeShop(shop),
      accessToken,
      CUSTOMERS_QUERY,
      { first: 50, after: null }
    );
    results.customers = {
      total: customerData?.customers?.nodes?.length || 0,
    };

    const returnsAndRefundsData = await shopifyGraphQL(
      normalizeShop(shop),
      accessToken,
      RETURNS_AND_REFUNDS_QUERY,
      { first: 50, after: null }
    );
    const allReturns = (returnsAndRefundsData?.orders?.nodes || []).flatMap((order) =>
      flattenShopifyNodes(order?.returns).map((returnItem) => {
        const item = returnItem?.node ?? returnItem;
        return { ...item, orderId: order.id, orderName: order.name };
      })
    );
    const allRefunds = (returnsAndRefundsData?.orders?.nodes || []).flatMap((order) =>
      flattenShopifyNodes(order?.refunds).map((refund) => ({ ...refund, orderId: order.id, orderName: order.name }))
    );
    results.returns = { total: allReturns.length };
    results.refunds = { total: allRefunds.length };

    if (store) {
      store.syncStatus = "success";
      store.lastSyncedAt = new Date();
      store.productsSynced = results.products.total;
      store.lastSyncError = "";
      await store.save();
    }

    return res.status(200).json({
      success: true,
      message: "All available syncs completed successfully",
      shop,
      results,
    });
  } catch (error) {
    if (req.verifiedShop) {
      const store = await Store.findOne({ shop: req.verifiedShop });
      if (store) {
        store.syncStatus = "failed";
        store.lastSyncError = error.message || "Sync all failed";
        await store.save();
      }
    }

    return res.status(500).json({
      success: false,
      message: "Sync all failed",
      error: error.message,
    });
  }
};

export const getSyncStatus = async (req, res) => {
  try {
    const shop = req.verifiedShop;
    const store = await Store.findOne({ shop }).select(
      "syncStatus lastSyncedAt lastSyncStartedAt lastSyncError productsSynced"
    );

    if (!store) {
      return res.status(404).json({ success: false, message: "Store not found" });
    }

    return res.status(200).json({
      success: true,
      syncStatus: store.syncStatus || "not_started",
      lastSyncedAt: store.lastSyncedAt,
      lastSyncStartedAt: store.lastSyncStartedAt,
      lastSyncError: store.lastSyncError || "",
      productsSynced: store.productsSynced || 0,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to get sync status",
      error: error.message,
    });
  }
};
