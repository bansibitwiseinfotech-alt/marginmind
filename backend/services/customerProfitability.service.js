import Store from "../models/Store.js";
import {
  normalizeCostConfig,
  calculateOrderCost,
} from "./costManagement.service.js";

/**
 * Customer Profitability Service
 *
 * Uses Shopify Admin GraphQL as the source of truth for:
 * - Customers
 * - Orders
 * - Revenue (Gross, Discounts, Refunds, Net)
 * - Line item Product COGS (Shopify InventoryItem.unitCost)
 * - Customer-paid shipping & Merchant shipping
 * - Payment fees & Fulfillment costs
 *
 * MongoDB is used only to retrieve the Shopify store/access token & cost config.
 */

const SHOPIFY_API_VERSION = "2026-07";

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const normalizeShop = (shop) => {
  if (!shop) return "";

  return String(shop)
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
};

const moneyValue = (money) => {
  return Number(money?.amount || 0);
};

/**
 * Segment customer / order based on profit and margin.
 *
 * Requirements:
 * - Profitable: margin >= 20%
 * - Low Margin: 0% <= margin < 20%
 * - Loss: profit < 0 or margin < 0%
 * - No Cost: missing required cost data or no orders
 */
export const getProfitabilitySegmentation = (
  profit,
  margin,
  hasMissingCost = false,
  hasOrders = true
) => {
  if (!hasOrders) {
    return {
      status: "NO_COST",
      segment: "NO_ORDERS",
      label: "No orders",
    };
  }

  if (hasMissingCost || profit === null || margin === null) {
    return {
      status: "NO_COST",
      segment: "NO_COST",
      label: "No cost data",
    };
  }

  if (profit < 0 || margin < 0) {
    return {
      status: "LOSS",
      segment: "LOSS",
      label: "Loss making",
    };
  }

  if (margin >= 20) {
    return {
      status: "PROFITABLE",
      segment: "HIGH_PROFIT",
      label: "Profitable",
    };
  }

  return {
    status: "LOW_MARGIN",
    segment: "LOW_PROFIT",
    label: "Low margin",
  };
};

/**
 * Process a single Shopify customer node into standardized MarginMind customer profitability format.
 */
export const processCustomerNode = (customer, costConfig) => {
  const costsConfigured = costConfig.enabled === true;
  const orders = customer.orders?.nodes || [];
  const ordersCount = Number(customer.numberOfOrders ?? orders.length);

  let customerGrossRevenue = 0;
  let customerDiscounts = 0;
  let customerReturns = 0;
  let customerShippingCharged = 0;
  let customerTax = 0;

  let customerTotalProductCost = 0;
  let customerTotalShippingCost = 0;
  let customerTotalPaymentFees = 0;
  let customerTotalFulfillmentCost = 0;

  let customerHasAnyMissingCost = false;
  let customerHasAnyProductCost = false;
  let hasConfiguredShipping = false;
  let hasConfiguredFulfillment = false;
  let hasAnyPaymentFee = false;

  const orderDetails = [];

  for (const order of orders) {
    const orderDiscount = moneyValue(order.totalDiscountsSet?.shopMoney);
    const orderShipping = moneyValue(order.totalShippingPriceSet?.shopMoney);
    const orderTax = moneyValue(order.totalTaxSet?.shopMoney);

    // Actual payment fees from Shopify transactions
    const validTransactions = (order.transactions || []).filter((t) =>
      ["SUCCESS", "SUCCESSFUL"].includes(t.status)
    );
    const transactionFees = (validTransactions.length ? validTransactions : order.transactions || [])
      .flatMap((transaction) => transaction.fees || [])
      .map((fee) => moneyValue(fee.amount));

    const actualPaymentFee = transactionFees.length
      ? roundMoney(transactionFees.reduce((total, fee) => total + fee, 0))
      : null;

    let orderProductCost = 0;
    let orderGrossRevenue = 0;
    let orderHasMissingCost = false;
    const orderUnavailableCosts = [];

    const lineItems = order.lineItems?.nodes || [];
    for (const item of lineItems) {
      const quantity = Number(item.quantity || 0);
      const originalUnitPrice = moneyValue(item.originalUnitPriceSet?.shopMoney);
      orderGrossRevenue += originalUnitPrice * quantity;

      const unitCostValue = item.variant?.inventoryItem?.unitCost?.amount;
      if (unitCostValue === null || unitCostValue === undefined || unitCostValue === "") {
        orderHasMissingCost = true;
        customerHasAnyMissingCost = true;
      } else {
        orderProductCost += Number(unitCostValue) * quantity;
        customerHasAnyProductCost = true;
      }
    }

    if (orderHasMissingCost) {
      orderUnavailableCosts.push("Product Cost (missing Shopify COGS on 1 or more line items)");
    }

    const orderRevenue = orderGrossRevenue > 0
      ? roundMoney(orderGrossRevenue)
      : roundMoney(moneyValue(order.subtotalPriceSet?.shopMoney));

    let orderRefund = 0;
    for (const refund of order.refunds || []) {
      orderRefund += moneyValue(refund.totalRefundedSet?.shopMoney);
    }
    orderRefund = roundMoney(orderRefund);

    // Formula: Net Revenue = Gross Revenue − Discounts − Refunds
    const orderNetRevenue = Math.max(
      roundMoney(orderRevenue - orderDiscount - orderRefund),
      0
    );

    // Costs calculation
    const calculatedCosts = calculateOrderCost({
      revenue: orderNetRevenue,
      productCost: orderProductCost,
      costConfig,
    });

    const shippingCost = costsConfigured
      ? roundMoney(calculatedCosts.shippingCost)
      : null;
    if (shippingCost === null) {
      orderUnavailableCosts.push("Merchant Shipping Cost (not configured)");
    } else {
      hasConfiguredShipping = true;
      customerTotalShippingCost += shippingCost;
    }

    const fulfillmentCost = costsConfigured
      ? roundMoney(calculatedCosts.fulfillmentCost)
      : null;
    if (fulfillmentCost === null) {
      orderUnavailableCosts.push("Fulfillment Cost (not configured)");
    } else {
      hasConfiguredFulfillment = true;
      customerTotalFulfillmentCost += fulfillmentCost;
    }

    const effectivePaymentFee = actualPaymentFee !== null
      ? actualPaymentFee
      : (costsConfigured ? roundMoney(calculatedCosts.paymentFee) : null);

    if (effectivePaymentFee === null) {
      orderUnavailableCosts.push("Payment Fee (unavailable from gateway)");
    } else {
      hasAnyPaymentFee = true;
      customerTotalPaymentFees += effectivePaymentFee;
    }

    // Order-level profit calculation
    let orderTotalCosts = null;
    let orderProfit = null;
    let orderMargin = null;

    if (orderProductCost > 0 || !orderHasMissingCost) {
      orderTotalCosts = roundMoney(
        orderProductCost +
        (shippingCost || 0) +
        (effectivePaymentFee || 0) +
        (fulfillmentCost || 0)
      );
      orderProfit = roundMoney(orderNetRevenue - orderTotalCosts);

      if (orderNetRevenue > 0) {
        orderMargin = roundMoney((orderProfit / orderNetRevenue) * 100);
      } else {
        orderMargin = orderProfit < 0 ? -100 : 0;
      }
    }

    const orderSegmentation = getProfitabilitySegmentation(
      orderProfit,
      orderMargin,
      orderProductCost === 0 && orderHasMissingCost,
      true
    );

    customerGrossRevenue += orderRevenue;
    customerDiscounts += orderDiscount;
    customerReturns += orderRefund;
    customerShippingCharged += orderShipping;
    customerTax += orderTax;

    customerTotalProductCost += orderProductCost;

    orderDetails.push({
      id: order.id,
      orderNumber: order.name,
      date: order.createdAt,
      financialStatus: order.displayFinancialStatus,
      fulfillmentStatus: order.displayFulfillmentStatus,

      revenue: orderRevenue,
      discounts: orderDiscount,
      returns: orderRefund,
      netRevenue: orderNetRevenue,

      shippingCharged: orderShipping,
      shippingCost,
      shippingCostSource: shippingCost !== null ? "Store Cost Settings" : "Not configured",

      paymentFee: effectivePaymentFee,
      paymentFeeSource: actualPaymentFee !== null
        ? "Shopify Payment Gateway"
        : (costsConfigured ? "Store Cost Settings" : "Unavailable from gateway"),

      fulfillmentCost,
      fulfillmentCostSource: fulfillmentCost !== null ? "Store Cost Settings" : "Not configured",

      tax: orderTax,

      productCost: orderProductCost > 0 ? roundMoney(orderProductCost) : null,
      totalCosts: orderTotalCosts,

      trueProfit: orderProfit,
      margin: orderMargin,

      status: orderSegmentation.status,
      segment: orderSegmentation.segment,
      statusLabel: orderSegmentation.label,

      costDataComplete: !orderHasMissingCost && orderProductCost > 0,
      unavailableCosts: orderUnavailableCosts,
    });
  }

  // Customer-level metrics
  const customerNetRevenue = Math.max(
    roundMoney(customerGrossRevenue - customerDiscounts - customerReturns),
    0
  );

  const hasOrders = orders.length > 0;
  const customerUnavailableCosts = [];

  let customerProductCost = customerHasAnyProductCost
    ? roundMoney(customerTotalProductCost)
    : null;
  let customerShippingCost = hasConfiguredShipping
    ? roundMoney(customerTotalShippingCost)
    : 0;
  let customerPaymentFees = hasAnyPaymentFee
    ? roundMoney(customerTotalPaymentFees)
    : 0;
  let customerFulfillmentCost = hasConfiguredFulfillment
    ? roundMoney(customerTotalFulfillmentCost)
    : 0;

  let customerTotalCosts = null;
  let customerProfit = null;
  let customerMargin = null;

  if (!hasOrders) {
    customerUnavailableCosts.push("No order history for this customer");
  } else {
    if (customerHasAnyMissingCost) {
      const incompleteCount = orderDetails.filter((o) => !o.costDataComplete).length;
      customerUnavailableCosts.push(
        `Product Cost (Shopify COGS missing on ${incompleteCount} of ${orderDetails.length} orders)`
      );
    }

    if (!hasConfiguredShipping) {
      customerUnavailableCosts.push("Merchant Shipping Cost (not configured in settings)");
    }
    if (!hasAnyPaymentFee) {
      customerUnavailableCosts.push("Payment Fee (unavailable from gateway)");
    }
    if (!hasConfiguredFulfillment) {
      customerUnavailableCosts.push("Fulfillment Cost (not configured in settings)");
    }

    // Calculate True Profit from available product costs and configured costs
    if (customerProductCost !== null) {
      customerTotalCosts = roundMoney(
        customerProductCost +
        (customerShippingCost || 0) +
        (customerPaymentFees || 0) +
        (customerFulfillmentCost || 0)
      );

      customerProfit = roundMoney(customerNetRevenue - customerTotalCosts);

      if (customerNetRevenue > 0) {
        customerMargin = roundMoney((customerProfit / customerNetRevenue) * 100);
      } else {
        customerMargin = customerProfit < 0 ? -100 : 0;
      }
    }
  }

  const segmentation = getProfitabilitySegmentation(
    customerProfit,
    customerMargin,
    customerProductCost === null,
    hasOrders
  );

  const dataScope = !hasOrders
    ? "No orders"
    : customerHasAnyMissingCost && customerHasAnyProductCost
      ? "Partial COGS (incomplete)"
      : customerHasAnyProductCost
        ? "All customer orders"
        : "No cost data";

  return {
    customer: {
      id: customer.id,
      name:
        customer.displayName ||
        [customer.firstName, customer.lastName]
          .filter(Boolean)
          .join(" ") ||
        "Guest Customer",
      email: customer.email || null,
      createdAt: customer.createdAt,
    },

    ordersCount,

    revenue: roundMoney(customerGrossRevenue),
    discounts: roundMoney(customerDiscounts),
    returns: roundMoney(customerReturns),
    netRevenue: customerNetRevenue,

    shippingCharged: roundMoney(customerShippingCharged),
    shippingCost: customerShippingCost,
    paymentFees: customerPaymentFees,
    fulfillmentCost: customerFulfillmentCost,
    tax: roundMoney(customerTax),

    productCost: customerProductCost,
    totalCosts: customerTotalCosts,

    profit: customerProfit,
    margin: customerMargin,

    status: segmentation.status,
    segment: segmentation.segment,
    statusLabel: segmentation.label,

    costDataComplete: hasOrders && !customerHasAnyMissingCost && customerProductCost !== null,
    unavailableCosts: customerUnavailableCosts,
    dataScope,

    orderDetails,
  };
};

/**
 * Calculate profitability for all customers.
 */
export const getCustomerProfitability = async ({
  shop,
  first = 50,
  after = null,
  search = "",
  accessToken: requestAccessToken = "",
  ordersFirst = 25,
}) => {
  const normalizedShop = normalizeShop(shop);

  if (!normalizedShop) {
    throw new Error("Shop domain is required");
  }

  const store = await Store.findOne({
    shop: normalizedShop,
  }).lean();

  if (!store) {
    throw new Error(`Shopify store not found: ${normalizedShop}`);
  }

  const accessToken =
    requestAccessToken ||
    store.accessToken ||
    store.access_token ||
    store.token;

  if (!accessToken) {
    throw new Error(
      `Shopify access token not found for ${normalizedShop}`
    );
  }

  const safeFirst = Math.min(
    Math.max(Number(first) || 25, 1),
    25
  );
  const safeOrdersFirst = Math.min(
    Math.max(Number(ordersFirst) || 10, 1),
    15
  );

  const costConfig = normalizeCostConfig(store?.costConfig);
  const customerQuery = search.trim() ? `query: $search` : "";

  const query = `#graphql
    query CustomerProfitability(
      $first: Int!
      $after: String
      ${search.trim() ? "$search: String!" : ""}
    ) {
      shop {
        name
        currencyCode
      }

      customers(
        first: $first
        after: $after
        ${customerQuery}
        sortKey: UPDATED_AT
        reverse: true
      ) {
        nodes {
          id
          displayName
          firstName
          lastName
          email
          numberOfOrders
          createdAt
          updatedAt

          orders(
            first: ${safeOrdersFirst}
            sortKey: CREATED_AT
            reverse: true
          ) {
            nodes {
              id
              name
              createdAt
              currencyCode
              displayFinancialStatus
              displayFulfillmentStatus

              customer {
                id
                displayName
                email
              }

              subtotalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }

              totalPriceSet {
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

              totalShippingPriceSet {
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

              transactions(first: 5) {
                status
                kind
                gateway
                fees {
                  amount {
                    amount
                    currencyCode
                  }
                }
              }

              lineItems(first: 10) {
                nodes {
                  id
                  title
                  quantity

                  originalUnitPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }

                  discountedUnitPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }

                  variant {
                    id
                    title
                    sku
                    inventoryItem {
                      unitCost {
                        amount
                        currencyCode
                      }
                    }
                  }
                }
              }

              refunds {
                id
                createdAt
                totalRefundedSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }

        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
      }
    }
  `;

  const variables = {
    first: safeFirst,
    after,
  };

  if (search.trim()) {
    variables.search = search.trim();
  }

  const response = await fetch(
    `https://${normalizedShop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Shopify GraphQL request failed: ${response.status} ${text}`
    );
  }

  const result = await response.json();

  if (result.errors?.length) {
    console.error(
      "[MarginMind] Shopify customer profitability GraphQL errors:",
      result.errors
    );
    throw new Error(
      result.errors.map((error) => error.message).join("; ")
    );
  }

  const customers = result.data?.customers;
  if (!customers) {
    throw new Error("Shopify did not return customer data");
  }

  const currency = result.data?.shop?.currencyCode || "USD";
  const customerResults = (customers.nodes || []).map((customer) =>
    processCustomerNode(customer, costConfig)
  );

  // Summary aggregation
  const totalCustomers = customerResults.length;
  const profitableCustomers = customerResults.filter(
    (c) => c.status === "PROFITABLE"
  ).length;
  const lowMarginCustomers = customerResults.filter(
    (c) => c.status === "LOW_MARGIN"
  ).length;
  const lossCustomers = customerResults.filter(
    (c) => c.status === "LOSS"
  ).length;
  const noCostCustomers = customerResults.filter(
    (c) => c.status === "NO_COST"
  ).length;

  return {
    customers: customerResults,
    totalCustomers,
    summary: {
      profitableCustomers,
      lowMarginCustomers,
      lossCustomers,
      noCostCustomers,
    },
    currency,
    pageInfo: customers.pageInfo,
    precision: 2,
    dataType: "REAL_SHOPIFY_DATA",
  };
};

/**
 * Get detailed customer profitability with all customer orders using direct customer lookup.
 */
export const getCustomerProfitabilityDetails = async ({
  shop,
  customerId,
  accessToken: requestAccessToken = "",
}) => {
  if (!customerId) {
    throw new Error("Customer id is required");
  }

  const normalizedShop = normalizeShop(shop);
  if (!normalizedShop) {
    throw new Error("Shop domain is required");
  }

  const store = await Store.findOne({
    shop: normalizedShop,
  }).lean();

  if (!store) {
    throw new Error(`Shopify store not found: ${normalizedShop}`);
  }

  const accessToken =
    requestAccessToken ||
    store.accessToken ||
    store.access_token ||
    store.token;

  if (!accessToken) {
    throw new Error(`Shopify access token not found for ${normalizedShop}`);
  }

  const costConfig = normalizeCostConfig(store?.costConfig);

  const numericCustomerId = String(customerId).split("/").pop();
  const fullGid = String(customerId).startsWith("gid://")
    ? customerId
    : `gid://shopify/Customer/${numericCustomerId}`;

  const query = `#graphql
    query SingleCustomerProfitability($id: ID!) {
      shop {
        currencyCode
      }
      customer(id: $id) {
        id
        displayName
        firstName
        lastName
        email
        numberOfOrders
        createdAt
        updatedAt
        orders(first: 50, sortKey: CREATED_AT, reverse: true) {
          nodes {
            id
            name
            createdAt
            currencyCode
            displayFinancialStatus
            displayFulfillmentStatus
            subtotalPriceSet { shopMoney { amount currencyCode } }
            totalPriceSet { shopMoney { amount currencyCode } }
            totalDiscountsSet { shopMoney { amount currencyCode } }
            totalShippingPriceSet { shopMoney { amount currencyCode } }
            totalTaxSet { shopMoney { amount currencyCode } }
            transactions(first: 10) {
              status
              kind
              gateway
              fees { amount { amount currencyCode } }
            }
            lineItems(first: 30) {
              nodes {
                id
                title
                quantity
                originalUnitPriceSet { shopMoney { amount currencyCode } }
                discountedUnitPriceSet { shopMoney { amount currencyCode } }
                variant {
                  id
                  title
                  sku
                  inventoryItem { unitCost { amount currencyCode } }
                }
              }
            }
            refunds {
              id
              createdAt
              totalRefundedSet { shopMoney { amount currencyCode } }
            }
          }
        }
      }
    }
  `;

  const response = await fetch(
    `https://${normalizedShop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query,
        variables: { id: fullGid },
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify GraphQL request failed: ${response.status} ${text}`);
  }

  const result = await response.json();
  if (result.errors?.length) {
    throw new Error(result.errors.map((e) => e.message).join("; "));
  }

  const customerNode = result.data?.customer;
  if (!customerNode) {
    throw new Error(`Shopify customer not found: ${customerId}`);
  }

  const currency = result.data?.shop?.currencyCode || "USD";
  const processedCustomer = processCustomerNode(customerNode, costConfig);

  return {
    ...processedCustomer,
    currency,
    dataType: "REAL_SHOPIFY_DATA",
  };
};

/**
 * Get order history and order-level profit metrics for a specific customer.
 */
export const getCustomerOrderHistory = async ({
  shop,
  customerId,
  accessToken = "",
}) => {
  const customerDetails = await getCustomerProfitabilityDetails({
    shop,
    customerId,
    accessToken,
  });

  return {
    customer: customerDetails.customer,
    ordersCount: customerDetails.ordersCount,
    currency: customerDetails.currency,
    orders: customerDetails.orderDetails || [],
    metrics: {
      totalRevenue: customerDetails.revenue,
      totalDiscounts: customerDetails.discounts,
      totalReturns: customerDetails.returns,
      netRevenue: customerDetails.netRevenue,
      totalCosts: customerDetails.totalCosts,
      productCost: customerDetails.productCost,
      shippingCost: customerDetails.shippingCost,
      paymentFees: customerDetails.paymentFees,
      fulfillmentCost: customerDetails.fulfillmentCost,
      trueProfit: customerDetails.profit,
      margin: customerDetails.margin,
      status: customerDetails.status,
      segment: customerDetails.segment,
      dataScope: customerDetails.dataScope,
    },
    unavailableCosts: customerDetails.unavailableCosts || [],
    dataType: customerDetails.dataType,
  };
};