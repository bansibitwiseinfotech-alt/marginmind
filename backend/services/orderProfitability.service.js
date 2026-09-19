import Store from "../models/Store.js";
import { getStoreWithActiveToken } from "../utils/storeHelper.js";
import {
  calculateOrderCost,
  normalizeCostConfig,
} from "./costManagement.service.js";

const SHOPIFY_API_VERSION = "2026-07";

/**
 * Normalize Shopify shop domain.
 */
function normalizeShop(shop) {
  if (!shop) return null;

  const value = String(shop).trim().toLowerCase();

  if (!value) return null;

  if (value.endsWith(".myshopify.com")) {
    return value;
  }

  return `${value}.myshopify.com`;
}

/**
 * Shopify GraphQL query.
 *
 * Products are NOT stored in MongoDB.
 * Order and product data comes directly from Shopify.
 */
const ORDER_QUERY = `
  query OrderProfitability(
    $first: Int!
    $after: String
    $query: String
  ) {
    orders(
      first: $first
      after: $after
      query: $query
      sortKey: CREATED_AT
      reverse: true
    ) {
      nodes {
        id
        name
        createdAt

        displayFinancialStatus
        displayFulfillmentStatus

        customer {
          id
          displayName
          email
        }

        currencyCode

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

        transactions(first: 20) {
          id
          gateway
          kind
          status
          amountSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          fees {
            amount {
              amount
              currencyCode
            }
            type
          }
        }

        shippingLines(first: 20) {
          nodes {
            id
            title
            originalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
          }
        }

        discountApplications(first: 50) {
          nodes {
            __typename
            targetType
            allocationMethod
            ... on DiscountCodeApplication {
              code
            }
            ... on AutomaticDiscountApplication {
              title
            }
            ... on ManualDiscountApplication {
              title
            }
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

        lineItems(first: 100) {
          nodes {
            title
            quantity

            variant {
              id
              title
              sku

              inventoryItem {
                id

                unitCost {
                  amount
                  currencyCode
                }
              }

              product {
                featuredImage {
                  url
                  altText
                }
              }
            }

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

          refundLineItems(first: 100) {
            nodes {
              quantity
              lineItem {
                title
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

    ordersCount {
      count
      precision
    }
  }
`;

/**
 * Call Shopify Admin GraphQL API.
 */
async function shopifyGraphQL(
  shop,
  accessToken,
  query,
  variables
) {
  const response = await fetch(
    `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
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

  let json;

  try {
    json = await response.json();
  } catch {
    throw new Error(
      "Shopify returned an invalid response"
    );
  }

  if (!response.ok) {
    throw new Error(
      json?.errors?.[0]?.message ||
        `Shopify GraphQL request failed with status ${response.status}`
    );
  }

  if (json.errors?.length) {
    throw new Error(
      json.errors
        .map((error) => error.message)
        .join(", ")
    );
  }

  if (!json.data) {
    throw new Error(
      "Shopify GraphQL response did not contain data"
    );
  }

  return json.data;
}

/**
 * Convert a Shopify money value to Number.
 */
function moneyValue(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

/**
 * Round money value to two decimals.
 */
function roundMoney(value) {
  return Number(
    Number(value || 0).toFixed(2)
  );
}

/**
 * Calculate profitability for one Shopify order.
 *
 * Current real data sources:
 *
 * Revenue:
 * Shopify order line-item discounted prices
 *
 * Product Cost:
 * Shopify InventoryItem.unitCost
 *
 * Discount:
 * Shopify totalDiscountsSet
 *
 * Shipping Charged:
 * Shopify totalShippingPriceSet
 *
 * Refund:
 * Shopify refunds
 *
 * Payment Fee:
 * Not currently available
 *
 * Fulfillment Cost:
 * Not currently available
 *
 * Merchant Shipping Cost:
 * Not currently available
 */
export function calculateOrder(order, inputCostConfig = {}) {
  const lineItems =
    order?.lineItems?.nodes || [];

  let revenue = 0;

  let productCost = 0;

  let missingCost = false;

  const items = lineItems.map((item) => {
    const quantity = Number(
      item.quantity || 0
    );

    /**
     * discountedUnitPriceSet already
     * contains the line-item discount.
     *
     * Therefore we must NOT subtract
     * totalDiscountsSet again from revenue.
     */
    const unitPrice =
      moneyValue(
        item
          ?.discountedUnitPriceSet
          ?.shopMoney
          ?.amount
      );

    const originalUnitPrice =
      moneyValue(
        item
          ?.originalUnitPriceSet
          ?.shopMoney
          ?.amount
      );

    const itemRevenue =
      unitPrice * quantity;

    /**
     * Shopify COGS.
     */
    const unitCostValue =
      item
        ?.variant
        ?.inventoryItem
        ?.unitCost
        ?.amount;

    const unitCost =
      unitCostValue !== null &&
      unitCostValue !== undefined &&
      unitCostValue !== ""
        ? Number(unitCostValue)
        : null;

    const itemCost =
      unitCost !== null &&
      Number.isFinite(unitCost)
        ? unitCost * quantity
        : null;

    const itemDiscount = Math.max(
      (originalUnitPrice - unitPrice) * quantity,
      0
    );

    revenue += itemRevenue;

    if (itemCost !== null) {
      productCost += itemCost;
    } else {
      missingCost = true;
    }

    return {
      title:
        item.title || "Unknown Product",

      quantity,

      sku:
        item?.variant?.sku || "",

      variantId:
        item?.variant?.id || null,

      variantTitle:
        item?.variant?.title || "",

      image: item?.variant?.product?.featuredImage
        ? {
            url: item.variant.product.featuredImage.url,
            altText: item.variant.product.featuredImage.altText || item.title || "",
          }
        : null,

      originalUnitPrice:
        roundMoney(
          originalUnitPrice
        ),

      unitPrice:
        roundMoney(unitPrice),

      revenue:
        roundMoney(itemRevenue),

      unitCost:
        unitCost !== null
          ? roundMoney(unitCost)
          : null,

      productCost:
        itemCost !== null
          ? roundMoney(itemCost)
          : null,

      discount: roundMoney(itemDiscount),

      itemProfit:
        itemCost !== null
          ? roundMoney(itemRevenue - itemCost)
          : null,

      itemMargin:
        itemCost !== null && itemRevenue > 0
          ? roundMoney(((itemRevenue - itemCost) / itemRevenue) * 100)
          : null,

      cogsSource:
        itemCost !== null
          ? "Shopify InventoryItem.unitCost"
          : "Cost unavailable",
    };
  });

  /**
   * Shopify order-level discount.
   *
   * This is reported separately for the UI.
   * It is NOT deducted again from revenue because
   * discounted line-item prices already include
   * applicable line-item discounts.
   */
  const discount =
    moneyValue(
      order
        ?.totalDiscountsSet
        ?.shopMoney
        ?.amount
    );

  /**
   * IMPORTANT:
   *
   * This is the shipping amount charged to the
   * customer by Shopify.
   *
   * It is NOT the merchant's actual shipping expense.
   */
  const shippingCharged =
    moneyValue(
      order
        ?.totalShippingPriceSet
        ?.shopMoney
        ?.amount
    );

  /**
   * Refunds.
   */
  const refund =
    (order?.refunds || []).reduce(
      (total, refundItem) => {
        return (
          total +
          moneyValue(
            refundItem
              ?.totalRefundedSet
              ?.shopMoney
              ?.amount
          )
        );
      },
      0
    );

  /**
   * Net merchandise revenue after refunds.
   *
   * We do not add customer-paid shipping here.
   */
  const totalRevenue =
    Math.max(
      revenue - refund,
      0
    );

  const subtotal = moneyValue(
    order?.subtotalPriceSet?.shopMoney?.amount
  );
  const orderTotal = moneyValue(
    order?.totalPriceSet?.shopMoney?.amount
  );
  const tax = moneyValue(
    order?.totalTaxSet?.shopMoney?.amount
  );

  const shippingBreakdown = (order?.shippingLines?.nodes || []).map(
    (shippingLine) => ({
      id: shippingLine.id || null,
      title: shippingLine.title || "Shipping",
      amount: roundMoney(
        moneyValue(shippingLine?.originalPriceSet?.shopMoney?.amount)
      ),
    })
  );

  const discountBreakdown = (order?.discountApplications?.nodes || []).map(
    (discountApplication) => ({
      code:
        discountApplication.code ||
        discountApplication.title ||
        null,
      type:
        discountApplication.targetType ||
        discountApplication.allocationMethod ||
        discountApplication.__typename ||
        "Discount",
      amount:
        discountApplication?.value?.amount != null
          ? roundMoney(moneyValue(discountApplication.value.amount))
          : null,
      percentage:
        discountApplication?.value?.percentage != null
          ? roundMoney(moneyValue(discountApplication.value.percentage))
          : null,
    })
  );

  const refundDetails = (order?.refunds || []).map((refundItem) => ({
    id: refundItem.id || null,
    createdAt: refundItem.createdAt || null,
    amount: roundMoney(
      moneyValue(refundItem?.totalRefundedSet?.shopMoney?.amount)
    ),
    lineItems: (refundItem?.refundLineItems?.nodes || []).map((entry) => ({
      title: entry?.lineItem?.title || "Unknown product",
      quantity: Number(entry.quantity || 0),
    })),
  }));

  const paymentTransactions = (order?.transactions || []).filter(
    (transaction) =>
      ["SUCCESS", "SUCCESSFUL"].includes(transaction.status) &&
      ["CAPTURE", "SALE", "AUTHORIZATION"].includes(transaction.kind)
  );
  const transactionFees = paymentTransactions.flatMap(
    (transaction) => transaction.fees || []
  );
  const actualPaymentFee = transactionFees.length
    ? roundMoney(
        transactionFees.reduce(
          (total, fee) => total + moneyValue(fee?.amount),
          0
        )
      )
    : null;
  const paymentGateway = paymentTransactions[0]?.gateway || null;
  const transactionAmount = paymentTransactions.length
    ? roundMoney(
        paymentTransactions.reduce(
          (total, transaction) =>
            total + moneyValue(transaction?.amountSet?.shopMoney),
          0
        )
      )
    : null;

  const costConfig = normalizeCostConfig(inputCostConfig);
  const calculatedCosts = calculateOrderCost({
    revenue: totalRevenue,
    productCost: missingCost ? 0 : productCost,
    costConfig,
  });
  const costsConfigured = costConfig.enabled === true;
  const paymentFee = actualPaymentFee !== null
    ? actualPaymentFee
    : costsConfigured
      ? roundMoney(calculatedCosts.paymentFee)
      : null;
  const shippingCost = costsConfigured
    ? roundMoney(calculatedCosts.shippingCost)
    : null;
  const fulfillmentCost = costsConfigured
    ? roundMoney(calculatedCosts.fulfillmentCost)
    : null;
  const advertisingCost = costsConfigured
    ? roundMoney(calculatedCosts.advertisingCost)
    : null;
  const taxCost = costsConfigured
    ? roundMoney(calculatedCosts.taxAmount)
    : null;

  /**
   * Current calculable profit.
   *
   * Net Revenue
   * - Product COGS
   *
   * We only calculate profit when every
   * line item has a valid Shopify COGS.
   */
  const trueProfit =
    !missingCost &&
    shippingCost !== null &&
    paymentFee !== null &&
    fulfillmentCost !== null &&
    advertisingCost !== null &&
    taxCost !== null
      ? totalRevenue -
        productCost -
        (shippingCost || 0) -
        (paymentFee || 0) -
        (advertisingCost || 0) -
        (taxCost || 0)
      : null;

  /**
   * Margin.
   */
  const margin =
    trueProfit !== null &&
    totalRevenue > 0
      ? (trueProfit / totalRevenue) *
        100
      : null;

  return {
    /**
     * Shopify order information.
     */
    id:
      order.id,

    orderNumber:
      order.name,

    createdAt:
      order.createdAt,

    financialStatus:
      order.displayFinancialStatus,

    fulfillmentStatus:
      order.displayFulfillmentStatus,

    /**
     * Customer.
     */
    customer: {
      id:
        order?.customer?.id ||
        null,

      name:
        order?.customer?.displayName ||
        "Guest",

      email:
        order?.customer?.email ||
        "",
    },

    /**
     * Currency.
     */
    currency:
      order.currencyCode ||
      order
        ?.totalPriceSet
        ?.shopMoney
        ?.currencyCode ||
      null,

    /**
     * Revenue after refunds.
     */
    revenue:
      roundMoney(totalRevenue),

    revenueBreakdown: {
      productSubtotal: roundMoney(subtotal),
      discounts: roundMoney(discount),
      netProductRevenue: roundMoney(revenue),
      customerShippingCharged: roundMoney(shippingCharged),
      tax: roundMoney(tax),
      orderTotal: roundMoney(orderTotal),
      refundAmount: roundMoney(refund),
      netRevenueAfterRefund: roundMoney(totalRevenue),
    },

    /**
     * Product COGS.
     *
     * null means one or more items
     * don't have Shopify COGS.
     */
    productCost:
      missingCost
        ? null
        : roundMoney(productCost),

    /**
     * Order discount.
     */
    discount:
      roundMoney(discount),

    /**
     * Customer-paid shipping.
     *
     * This is NOT merchant shipping cost.
     */
    shippingCharged:
      roundMoney(shippingCharged),

    shipping:
      roundMoney(shippingCharged),

    /**
     * Merchant shipping expense.
     *
     * Not available yet.
     */
    shippingCost,

    /**
     * Payment processing fee.
     *
     * Not available yet.
     */
    paymentFee,

    paymentGateway,

    transactionAmount,

    /**
     * Fulfillment expense.
     *
     * Not available yet.
     */
    fulfillmentCost,

    advertisingCost,

    taxCost,

    tax: roundMoney(tax),

    /**
     * Refund total.
     */
    refund:
      roundMoney(refund),

    /**
     * Currently calculable profit.
     */
    trueProfit:
      trueProfit !== null
        ? roundMoney(trueProfit)
        : null,

    /**
     * Profit margin.
     */
    margin:
      margin !== null
        ? roundMoney(margin)
        : null,

    costBreakdown: {
      productCost:
        missingCost ? null : roundMoney(productCost),
      discount: roundMoney(discount),
      shippingCharged: roundMoney(shippingCharged),
      shippingCost,
      paymentFee,
      fulfillmentCost,
      advertisingCost,
      tax: taxCost,
      refund: roundMoney(refund),
      totalKnownCost:
        missingCost ||
        shippingCost === null ||
        paymentFee === null ||
        fulfillmentCost === null ||
        advertisingCost === null ||
        taxCost === null
          ? null
          : roundMoney(
              productCost +
              (shippingCost || 0) +
              (paymentFee || 0) +
              (advertisingCost || 0) +
              (taxCost || 0)
            ),
      status:
        missingCost ||
        paymentFee === null ||
        fulfillmentCost === null
          ? "INCOMPLETE"
          : "COMPLETE",
    },

    /**
     * Indicates missing Shopify COGS.
     */
    missingCost,

    costsConfigured,

    costAvailability: {
      orderRevenue: "Shopify Admin GraphQL",
      productCost: missingCost
        ? "Not available"
        : "Shopify InventoryItem.unitCost",
      discounts: "Shopify Admin GraphQL",
      refunds: "Shopify Admin GraphQL",
      merchantShippingCost: "Not available",
      paymentFee: paymentFee === null
        ? "Not available"
        : "Shopify transaction fees",
      fulfillmentCost: "Not available",
      advertisingCost: "Not configured",
      taxCost: "Not configured",
    },

    discountBreakdown,

    shippingBreakdown,

    refundDetails,

    salesChannel: null,

    /**
     * Order line items.
     */
    items,
  };
}

/**
 * Get order profitability data.
 */
export async function getOrderProfitability({
  shop,
  first = 50,
  after = null,
  search = "",
}) {
  /**
   * Validate shop.
   */
  const normalizedShop =
    normalizeShop(shop);

  if (!normalizedShop) {
    throw new Error(
      "Shop is required"
    );
  }

  /**
   * Find merchant store with active session token.
   */
  const store =
    await getStoreWithActiveToken(normalizedShop);

  if (!store) {
    throw new Error(
      "Store not found"
    );
  }

  /**
   * Shopify OAuth access token.
   */
  if (!store.accessToken) {
    throw new Error(
      "Shopify access token not found"
    );
  }

  /**
   * Protect GraphQL pagination size.
   */
  const safeFirst =
    Math.min(
      Math.max(
        Number(first) || 50,
        1
      ),
      100
    );

  /**
   * Search query.
   *
   * Shopify receives the search string.
   */
  const searchQuery =
    search?.trim() || null;

  const data =
    await shopifyGraphQL(
      normalizedShop,
      store.accessToken,
      ORDER_QUERY,
      {
        first: safeFirst,

        after:
          after || null,
        query: searchQuery,
      }
    );

  /**
   */
  const shopifyOrders =
    data?.orders?.nodes || [];

  /**
   * Calculate profitability
   * for every returned order.
   */
  const orders =
    shopifyOrders.map(
      (order) => calculateOrder(order, store.costConfig)
    );

  /**
   * Return API response.
   */
  return {
    orders,

    totalOrders:
      Number(
        data
          ?.ordersCount
          ?.count || 0
      ),

    pageInfo:
      data
        ?.orders
        ?.pageInfo || {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: null,
        endCursor: null,
      },

    orderCountPrecision:
      data
        ?.ordersCount
        ?.precision ||
      "UNKNOWN",

    dataType:
      "ORDER_PROFITABILITY",
  };
}

/**
 * Get one order with its complete profitability breakdown.
 */
export async function getOrderProfitabilityDetails({
  shop,
  orderId,
}) {
  if (!orderId || typeof orderId !== "string") {
    throw new Error("Order ID is required");
  }

  const result = await getOrderProfitability({
    shop,
    first: 1,
    search: `id:${orderId.split("/").pop()}`,
  });

  const order = result.orders.find(
    (candidate) => candidate.id === orderId
  ) || result.orders[0];

  if (!order || order.id !== orderId) {
    throw new Error("Order not found");
  }

  return order;
}