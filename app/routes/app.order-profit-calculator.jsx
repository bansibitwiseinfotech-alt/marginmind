import {
  useRevalidator,
  useLoaderData,
  useSearchParams,
  useRouteError,
} from "react-router";
import {
  Page,
  Card,
  InlineGrid,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  IndexTable,
  Button,
  Box,
  Divider,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";

const BACKEND_URL =
  process.env.BACKEND_URL || "http://localhost:5000";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const url = new URL(request.url);

  const search =
    url.searchParams.get("search") || "";

  const first =
    url.searchParams.get("first") || "50";

  const detailId =
    url.searchParams.get("detail") || "";

  const backendParams = new URLSearchParams();

  backendParams.set("first", first);

  if (search.trim()) {
    backendParams.set("search", search.trim());
  }

  if (detailId) {
    let detailResponse;
    let detailResult;

    try {
      detailResponse = await fetch(
        `${BACKEND_URL}/api/order-profitability/${encodeURIComponent(detailId)}/details`,
        {
          headers: {
            "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
            "x-shopify-shop-domain": session.shop,
            "Content-Type": "application/json",
          },
        }
      );
      detailResult = await detailResponse.json();
    } catch {
      return {
        orders: [],
        totalOrders: 0,
        pageInfo: null,
        search,
        currentShop: session.shop,
        selectedOrder: null,
        detailError: "load-failed",
      };
    }

    if (!detailResponse.ok || !detailResult.success) {
      return {
        orders: [],
        totalOrders: 0,
        pageInfo: null,
        search,
        currentShop: session.shop,
        selectedOrder: null,
        detailError:
          detailResponse.status === 404 ? "not-found" : "load-failed",
      };
    }

    return {
      orders: [],
      totalOrders: 0,
      pageInfo: null,
      search,
      currentShop: session.shop,
      selectedOrder: detailResult.data.order,
      detailError: null,
    };
  }

  const response = await fetch(
    `${BACKEND_URL}/api/order-profitability?${backendParams.toString()}`,
    {
      method: "GET",
      headers: {
        "x-internal-secret":
          process.env.INTERNAL_API_SECRET || "",

        "x-shopify-shop-domain":
          session.shop,

        "Content-Type":
          "application/json",
      },
    }
  );

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(
      result.message ||
        "Failed to load order profitability"
    );
  }

  return {
    orders: result.data?.orders || [],
    totalOrders:
      Number(result.data?.totalOrders || 0),
    pageInfo:
      result.data?.pageInfo || null,
    search,
    currentShop: session.shop,
    selectedOrder: null,
    detailError: null,
  };
};

function formatMoney(value, currency = "USD") {
  if (value === null || value === undefined) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleDateString(
    "en-US",
    {
      year: "numeric",
      month: "short",
      day: "numeric",
    }
  );
}

function formatStatus(value) {
  if (!value) {
    return "—";
  }

  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) =>
      char.toUpperCase()
    );
}

export default function OrderProfitCalculator() {
  const {
    orders,
    totalOrders,
    pageInfo,
    search,
    currentShop,
    selectedOrder: loadedSelectedOrder,
    detailError,
  } = useLoaderData();

  const [searchParams, setSearchParams] =
    useSearchParams();
  const revalidator = useRevalidator();
  const [cursorHistory, setCursorHistory] = useStateValue([]);

  const [searchInput, setSearchInput] =
    useStateValue(search);

  const selectedOrder = loadedSelectedOrder;

  function handleSearch() {
    const nextParams = new URLSearchParams(
      searchParams
    );

    if (searchInput.trim()) {
      nextParams.set(
        "search",
        searchInput.trim()
      );
    } else {
      nextParams.delete("search");
    }

    nextParams.set("first", "50");
    nextParams.delete("after");

    setCursorHistory([]);
    setSearchParams(nextParams);
  }

  function handleClearSearch() {
    const nextParams = new URLSearchParams();

    nextParams.set("first", "50");

    setCursorHistory([]);
    setSearchParams(nextParams);
    setSearchInput("");
  }

  function handleNext() {
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) return;

    const currentAfter = searchParams.get("after") || "";
    setCursorHistory((history) => [...history, currentAfter]);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("first", "50");
    nextParams.set("after", pageInfo.endCursor);
    setSearchParams(nextParams);
  }

  function handlePrevious() {
    if (!cursorHistory.length && !searchParams.get("after")) return;

    const nextHistory = [...cursorHistory];
    const previousCursor = nextHistory.pop();
    setCursorHistory(nextHistory);

    const nextParams = new URLSearchParams(searchParams);
    if (previousCursor) {
      nextParams.set("after", previousCursor);
    } else {
      nextParams.delete("after");
    }
    nextParams.set("first", "50");
    setSearchParams(nextParams);
  }

  function handleRefresh() {
    revalidator.revalidate();
  }

  function handleViewDetails(order) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("detail", order.id);
    setSearchParams(nextParams);
  }

  function handleCloseDetails() {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("detail");
    setSearchParams(nextParams);
  }

  const ordersWithMargin = orders.filter(
    (order) => order.margin !== null && order.margin !== undefined
  );
  const profitableOrders = ordersWithMargin.filter(
    (order) => order.margin >= 20
  ).length;
  const lowMarginOrders = ordersWithMargin.filter(
    (order) => order.margin >= 0 && order.margin < 20
  ).length;
  const lossMakingOrders = ordersWithMargin.filter(
    (order) => order.margin < 0
  ).length;
  const averageMargin = ordersWithMargin.length
    ? ordersWithMargin.reduce(
        (total, order) => total + Number(order.margin),
        0
      ) / ordersWithMargin.length
    : null;
  const currentPage = cursorHistory.length + 1;
  const hasPrevious =
    cursorHistory.length > 0 || Boolean(searchParams.get("after"));

  if (searchParams.get("detail")) {
    return (
      <OrderProfitabilityDetailView
        order={selectedOrder}
        shop={currentShop}
        error={detailError}
        loading={revalidator.state === "loading"}
        onBack={handleCloseDetails}
        onRetry={() => revalidator.revalidate()}
      />
    );
  }

  return (
    <Page
      title="Order Profitability"
      subtitle="See revenue, costs, true profit and margin for every Shopify order."
    
      fullWidth
    >
      <BlockStack gap="400">
        <Card padding="400">
          <InlineStack align="space-between" blockAlign="end" wrap={false}>
            <BlockStack gap="050">
              <Text as="h2" variant="headingMd">
                Shopify Order Data
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Search and review live order profitability from your store.
              </Text>
            </BlockStack>

            <InlineStack gap="200" blockAlign="end" wrap={false}>
              <div style={{ minWidth: "260px" }}>
                <s-text-field
                  label="Search by order number"
                  placeholder="#1001"
                  value={searchInput}
                  onInput={(event) =>
                    setSearchInput(event.currentTarget.value)
                  }
                />
              </div>
              <s-button variant="primary" onClick={handleSearch}>
                Search
              </s-button>
              {search && (
                <s-button onClick={handleClearSearch}>Clear</s-button>
              )}
            </InlineStack>
          </InlineStack>
        </Card>

      <InlineGrid columns={{ xs: 1, sm: 2, md: 3, lg: 5 }} gap="400">
        <Card padding="400">
          <BlockStack gap="100">
            <Text as="h3" variant="headingXs" tone="subdued">
              TOTAL ORDERS
            </Text>
            <Text as="p" variant="heading2xl" fontWeight="bold">
              {totalOrders || "—"}
            </Text>
            <Text as="span" variant="bodyXs" tone="subdued">
              Total Shopify orders
            </Text>
          </BlockStack>
        </Card>

        <Card padding="400">
          <BlockStack gap="100">
            <Text as="h3" variant="headingXs" tone="subdued">
              PROFITABLE ORDERS
            </Text>
            <Text as="p" variant="heading2xl" fontWeight="bold">
              {profitableOrders}
            </Text>
            <Text as="span" variant="bodyXs" tone="subdued">
              Margin ≥ 20% on loaded orders
            </Text>
          </BlockStack>
        </Card>

        <Card padding="400">
          <BlockStack gap="100">
            <Text as="h3" variant="headingXs" tone="subdued">
              LOW MARGIN ORDERS
            </Text>
            <Text as="p" variant="heading2xl" fontWeight="bold">
              {lowMarginOrders}
            </Text>
            <Text as="span" variant="bodyXs" tone="subdued">
              Margin between 0% and 20%
            </Text>
          </BlockStack>
        </Card>

        <Card padding="400">
          <BlockStack gap="100">
            <Text as="h3" variant="headingXs" tone="subdued">
              LOSS MAKING ORDERS
            </Text>
            <Text as="p" variant="heading2xl" fontWeight="bold">
              {lossMakingOrders}
            </Text>
            <Text as="span" variant="bodyXs" tone="subdued">
              Negative margin on loaded orders
            </Text>
          </BlockStack>
        </Card>

        <Card padding="400">
          <BlockStack gap="100">
            <Text as="h3" variant="headingXs" tone="subdued">
              AVERAGE MARGIN
            </Text>
            <Text
              as="p"
              variant="heading2xl"
              fontWeight="bold"
            >
              {averageMargin === null
                ? "—"
                : `${averageMargin.toFixed(2)}%`}
            </Text>
            <Text as="span" variant="bodyXs" tone="subdued">
              {ordersWithMargin.length} orders with margin
            </Text>
          </BlockStack>
        </Card>
      </InlineGrid>

      {/* ORDER TABLE */}

      <Card padding="0">
        <IndexTable
          resourceName={{ singular: "order", plural: "orders" }}
          itemCount={orders.length}
          headings={[
            { title: "Order" },
            { title: "Customer" },
            { title: "Revenue" },
            { title: "Product Cost" },
            { title: "Discount" },
            { title: "Shipping" },
            { title: "Payment Fee" },
            { title: "Fulfillment Cost" },
            { title: "True Profit" },
            { title: "Margin" },
            { title: "Action" },
          ]}
          selectable={false}
          pagination={{
            hasPrevious: Boolean(hasPrevious),
            onPrevious: handlePrevious,
            hasNext: Boolean(pageInfo?.hasNextPage),
            onNext: handleNext,
            label: `Page ${currentPage}${
              totalOrders > 0
                ? ` · Showing ${orders.length} of ${totalOrders} orders`
                : ""
            }`,
          }}
          emptyState={
            <Box padding="400">
              <Text as="p" tone="subdued">No orders found.</Text>
            </Box>
          }
        >
          {orders.map((order, index) => (
            <IndexTable.Row id={order.id} key={order.id} position={index}>
              <IndexTable.Cell>
                <BlockStack gap="050">
                  <Text as="span" fontWeight="semibold">{order.orderNumber}</Text>
                  <Text as="span" variant="bodySm" tone="subdued">{formatDate(order.createdAt)}</Text>
                </BlockStack>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <BlockStack gap="050">
                  <Text as="span" fontWeight="semibold">{order.customer?.name || "Guest"}</Text>
                  <Text as="span" variant="bodySm" tone="subdued">{order.customer?.email || "—"}</Text>
                </BlockStack>
              </IndexTable.Cell>
              <IndexTable.Cell>{formatMoney(order.revenue, order.currency)}</IndexTable.Cell>
              <IndexTable.Cell>{formatMoney(order.productCost, order.currency)}</IndexTable.Cell>
              <IndexTable.Cell>{formatMoney(order.discount, order.currency)}</IndexTable.Cell>
              <IndexTable.Cell>{formatMoney(order.shippingCharged, order.currency)}</IndexTable.Cell>
              <IndexTable.Cell>{formatMoney(order.paymentFee, order.currency)}</IndexTable.Cell>
              <IndexTable.Cell>{formatMoney(order.fulfillmentCost, order.currency)}</IndexTable.Cell>
              <IndexTable.Cell>
                <Text
                  as="span"
                  fontWeight="bold"
                  tone={
                    order.trueProfit === null || order.trueProfit === undefined
                      ? "subdued"
                      : undefined
                  }
                >
                  {formatMoney(order.trueProfit, order.currency)}
                </Text>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Text
                  as="span"
                  fontWeight="bold"
                  tone={
                    order.margin === null || order.margin === undefined
                      ? "subdued"
                      : undefined
                  }
                >
                  {order.margin === null || order.margin === undefined ? "—" : `${order.margin}%`}
                </Text>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Button size="slim" onClick={() => handleViewDetails(order)}>
                  View Details
                </Button>
              </IndexTable.Cell>
            </IndexTable.Row>
          ))}
        </IndexTable>
      </Card>

      <div style={{ display: "none" }}>
      <s-section
        heading={`Orders (${totalOrders})`}
      >

        {orders.length === 0 ? (
          <s-banner tone="info">
            No orders found.
          </s-banner>
        ) : (

          <div
            style={{
              overflowX: "auto",
              width: "100%",
            }}
          >

            <table
              style={{
                width: "100%",
                borderCollapse:
                  "collapse",
                tableLayout: "fixed",
                fontSize: "12px",
              }}
            >

              <thead>
                <tr>

                  {[
                    "Order",
                    "Customer",
                    "Revenue",
                    "Product Cost",
                    "Discount",
                    "Shipping",
                    "Payment Fee",
                    "Fulfillment Cost",
                    "True Profit",
                    "Margin",
                    "Action",
                  ].map((heading) => (

                    <th
                      key={heading}
                      style={{
                        textAlign:
                          "left",
                        padding: "8px 5px",
                        borderBottom:
                          "1px solid #e1e3e5",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {heading}
                    </th>

                  ))}

                </tr>
              </thead>

              <tbody>

                {orders.map((order) => (

                  <tr key={order.id}>

                    <td
                      style={{
                        padding: "10px 5px",
                        borderBottom:
                          "1px solid #e1e3e5",
                        overflowWrap: "anywhere",
                      }}
                    >
                      <strong>
                        {order.orderNumber}
                      </strong>

                      <div
                        style={{
                          marginTop: "4px",
                          fontSize: "12px",
                          color: "#6d7175",
                        }}
                      >
                        {formatDate(
                          order.createdAt
                        )}
                      </div>
                    </td>

                    <td
                      style={{
                        padding: "10px 5px",
                        borderBottom:
                          "1px solid #e1e3e5",
                        overflowWrap: "anywhere",
                      }}
                    >
                      <strong>
                        {order.customer?.name ||
                          "Guest"}
                      </strong>

                      {order.customer?.email && (
                        <div
                          style={{
                            fontSize: "12px",
                            color: "#6d7175",
                          }}
                        >
                          {order.customer.email}
                        </div>
                      )}
                    </td>

                    <td
                      style={{
                        padding: "10px 5px",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {formatMoney(
                        order.revenue,
                        order.currency
                      )}
                    </td>

                    <td
                      style={{
                        padding: "10px 5px",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {formatMoney(
                        order.productCost,
                        order.currency
                      )}
                    </td>

                    <td
                      style={{
                        padding: "10px 5px",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {formatMoney(
                        order.discount,
                        order.currency
                      )}
                    </td>

                    <td
                      style={{
                        padding: "10px 5px",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {formatMoney(
                        order.shippingCharged,
                        order.currency
                      )}
                    </td>

                    <td
                      style={{
                        padding: "10px 5px",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {formatMoney(
                        order.paymentFee,
                        order.currency
                      )}
                    </td>

                    <td
                      style={{
                        padding: "10px 5px",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {formatMoney(
                        order.fulfillmentCost,
                        order.currency
                      )}
                    </td>

                    <td
                      style={{
                        padding: "10px 5px",
                        overflowWrap: "anywhere",
                      }}
                    >
                      <strong>
                        {formatMoney(
                          order.trueProfit,
                          order.currency
                        )}
                      </strong>
                    </td>

                    <td
                      style={{
                        padding: "10px 5px",
                        whiteSpace:
                          "nowrap",
                      }}
                    >
                      {order.margin !== null &&
                      order.margin !==
                        undefined
                        ? `${order.margin}%`
                        : "—"}
                    </td>

                    <td
                      style={{
                        padding:
                          "14px 12px",
                      }}
                    >
                      <s-button
                        onClick={() =>
                          handleViewDetails(order)
                        }
                      >
                        View Details
                      </s-button>
                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "16px",
                padding: "12px",
                borderTop: "1px solid #e1e3e5",
              }}
            >
              <s-button
                onClick={handlePrevious}
                disabled={!hasPrevious}
              >
                Previous
              </s-button>

              <span style={{ color: "#6d7175", fontSize: "13px" }}>
                {`Page ${currentPage} · Showing ${orders.length} of ${totalOrders} orders`}
              </span>

              <s-button
                onClick={handleNext}
                disabled={!pageInfo?.hasNextPage}
              >
                Next
              </s-button>
            </div>

          </div>

        )}

      </s-section>
      </div>

      {/* DETAILS */}

      {selectedOrder && (

        <s-section heading="Order Details">

          <s-stack gap="base">

            <s-stack
              direction="inline"
              justifyContent="space-between"
            >

              <div>

                <s-heading>
                  {selectedOrder.orderNumber}
                </s-heading>

                <s-paragraph>
                  {formatDate(
                    selectedOrder.createdAt
                  )}
                </s-paragraph>

              </div>

              <s-button
                onClick={() =>
                  handleCloseDetails()
                }
              >
                Close
              </s-button>

            </s-stack>

            <s-divider />

            {/* SUMMARY */}

            <s-section heading="Order Summary">

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "16px",
                }}
              >

                <s-box
                  padding="base"
                  border="base"
                  borderRadius="base"
                >
                  <s-paragraph>
                    <strong>
                      Order
                    </strong>
                  </s-paragraph>

                  <s-heading>
                    {selectedOrder.orderNumber}
                  </s-heading>
                </s-box>

                <s-box
                  padding="base"
                  border="base"
                  borderRadius="base"
                >
                  <s-paragraph>
                    <strong>
                      Customer
                    </strong>
                  </s-paragraph>

                  <s-paragraph>
                    {selectedOrder.customer
                      ?.name ||
                      "Guest"}
                  </s-paragraph>
                </s-box>

                <s-box
                  padding="base"
                  border="base"
                  borderRadius="base"
                >
                  <s-paragraph>
                    <strong>
                      Financial Status
                    </strong>
                  </s-paragraph>

                  <s-paragraph>
                    {formatStatus(
                      selectedOrder.financialStatus
                    )}
                  </s-paragraph>
                </s-box>

                <s-box
                  padding="base"
                  border="base"
                  borderRadius="base"
                >
                  <s-paragraph>
                    <strong>
                      Fulfillment
                    </strong>
                  </s-paragraph>

                  <s-paragraph>
                    {formatStatus(
                      selectedOrder.fulfillmentStatus
                    )}
                  </s-paragraph>
                </s-box>

              </div>

            </s-section>

            {/* PRODUCTS */}

            <s-section heading="Products">

              <s-stack gap="small">

                {selectedOrder.items?.map(
                  (item, index) => (

                    <s-box
                      key={`${item.title}-${index}`}
                      padding="base"
                      border="base"
                      borderRadius="base"
                    >

                      <s-stack
                        direction="inline"
                        justifyContent="space-between"
                      >

                        <div>

                          <strong>
                            {item.title}
                          </strong>

                          {item.sku && (
                            <s-paragraph>
                              SKU: {item.sku}
                            </s-paragraph>
                          )}

                          <s-paragraph>
                            Quantity:{" "}
                            {item.quantity}
                          </s-paragraph>

                        </div>

                        <div>

                          <s-paragraph>
                            Unit Price:{" "}
                            {formatMoney(
                              item.unitPrice,
                              selectedOrder.currency
                            )}
                          </s-paragraph>

                          <s-paragraph>
                            Product Cost:{" "}
                            {formatMoney(
                              item.productCost,
                              selectedOrder.currency
                            )}
                          </s-paragraph>

                          <s-paragraph>
                            Item Revenue:{" "}
                            {formatMoney(
                              item.revenue,
                              selectedOrder.currency
                            )}
                          </s-paragraph>

                        </div>

                      </s-stack>

                    </s-box>

                  )
                )}

              </s-stack>

            </s-section>

            {/* COST BREAKDOWN */}

            <s-section heading="Cost Breakdown">

              <s-stack gap="small">

                <s-paragraph>
                  Product Cost:{" "}
                  {formatMoney(
                    selectedOrder.productCost,
                    selectedOrder.currency
                  )}
                </s-paragraph>

                <s-paragraph>
                  Discounts:{" "}
                  {formatMoney(
                    selectedOrder.discount,
                    selectedOrder.currency
                  )}
                </s-paragraph>

                <s-paragraph>
                  Shipping Charged:{" "}
                  {formatMoney(
                    selectedOrder.shippingCharged,
                    selectedOrder.currency
                  )}
                </s-paragraph>

                <s-paragraph>
                  Shipping Cost:{" "}
                  {formatMoney(
                    selectedOrder.shippingCost,
                    selectedOrder.currency
                  )}
                </s-paragraph>

                <s-paragraph>
                  Payment Fee:{" "}
                  {formatMoney(
                    selectedOrder.paymentFee,
                    selectedOrder.currency
                  )}
                </s-paragraph>

                <s-paragraph>
                  Fulfillment Cost:{" "}
                  {formatMoney(
                    selectedOrder.fulfillmentCost,
                    selectedOrder.currency
                  )}
                </s-paragraph>

                {selectedOrder.refund >
                  0 && (
                  <s-paragraph>
                    Refund:{" "}
                    {formatMoney(
                      selectedOrder.refund,
                      selectedOrder.currency
                    )}
                  </s-paragraph>
                )}

              </s-stack>

            </s-section>

            {/* PROFIT */}

            <s-section heading="Profit">

              <s-box
                padding="large"
                border="base"
                borderRadius="base"
              >

                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    gap: "24px",
                    flexWrap:
                      "wrap",
                  }}
                >

                  <div>

                    <s-paragraph>
                      <strong>
                        True Profit
                      </strong>
                    </s-paragraph>

                    <div
                      style={{
                        fontSize:
                          "28px",
                        fontWeight: 700,
                        marginTop:
                          "8px",
                      }}
                    >
                      {formatMoney(
                        selectedOrder.trueProfit,
                        selectedOrder.currency
                      )}
                    </div>

                  </div>

                  <div>

                    <s-paragraph>
                      <strong>
                        Margin
                      </strong>
                    </s-paragraph>

                    <div
                      style={{
                        fontSize:
                          "24px",
                        fontWeight: 700,
                        marginTop:
                          "8px",
                      }}
                    >
                      {selectedOrder.margin !==
                        null &&
                      selectedOrder.margin !==
                        undefined
                        ? `${selectedOrder.margin}%`
                        : "—"}
                    </div>

                  </div>

                </div>

              </s-box>

            </s-section>

            {/* WARNING */}

            {(!selectedOrder.costsConfigured ||
              selectedOrder.missingCost) && (

              <s-banner tone="warning">

                Some profitability costs are
                not available from the current
                data sources. MarginMind does not
                estimate missing payment or
                fulfillment fees.

              </s-banner>

            )}

          </s-stack>

        </s-section>

      )}

      </BlockStack>
    </Page>
  );
}

/*
 * Small local state helper.
 * Keeps this route independent from
 * additional state-management packages.
 */
function useStateValue(initialValue) {
  const [value, setValue] =
    useReactState(initialValue);

  return [value, setValue];
}

function DetailMetric({ label, value, tone }) {
  return (
    <Card padding="400">
      <BlockStack gap="100">
        <Text as="h3" variant="headingXs" tone="subdued">
          {label}
        </Text>
        <Text as="p" variant="headingLg" fontWeight="bold" tone={tone}>
          {value}
        </Text>
      </BlockStack>
    </Card>
  );
}

function DetailRow({ label, value, source }) {
  return (
    <BlockStack gap="050">
      <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
      <Text as="span" fontWeight="semibold">{value}</Text>
      {source && (
        <Text as="span" variant="bodyXs" tone="subdued">{source}</Text>
      )}
    </BlockStack>
  );
}

function OrderProfitabilityDetailView({
  order,
  shop,
  error,
  loading,
  onBack,
  onRetry,
}) {
  if (error || !order) {
    const notFound = error === "not-found";

    return (
      <Page title="Order Profit Details" fullWidth>
        <Card padding="500">
          <BlockStack gap="300">
            <Text as="h2" variant="headingLg">
              {notFound ? "Order not found." : "Unable to load order details."}
            </Text>
            <Text as="p" tone="subdued">
              {notFound
                ? "This Shopify order could not be found for the current store."
                : "The latest order data could not be loaded from Shopify."}
            </Text>
            <InlineStack gap="200">
              <Button onClick={onBack}>Back to Orders</Button>
              {!notFound && <Button primary onClick={onRetry} loading={loading}>Retry</Button>}
            </InlineStack>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  const breakdown = order.costBreakdown || {};
  const revenue = order.revenueBreakdown || {};
  const availability = order.costAvailability || {};
  const margin = order.margin;
  const status =
    order.trueProfit === null || order.trueProfit === undefined
      ? "INCOMPLETE"
      : order.trueProfit < 0
        ? "LOSS"
        : order.trueProfit === 0
          ? "BREAK-EVEN"
          : "PROFITABLE";
  const statusTone = status === "PROFITABLE" ? "success" : status === "LOSS" ? "critical" : "warning";
  const numericOrderId = order.id?.split("/").pop();
  const shopifyOrderUrl = shop && numericOrderId
    ? `https://${shop}/admin/orders/${numericOrderId}`
    : null;
  const merchantShippingSource = availability.merchantShippingCost || "Not available";

  return (
    <Page
      title="Order Profit Details"
      subtitle={`${order.orderNumber} · ${formatDate(order.createdAt)}`}
      fullWidth
    >
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center" wrap>
          <Button onClick={onBack}>← Back to Orders</Button>
          <InlineStack gap="200">
            {shopifyOrderUrl && (
              <Button onClick={() => window.open(shopifyOrderUrl, "_blank", "noopener,noreferrer")}>
                Open in Shopify
              </Button>
            )}
            <Button onClick={onRetry} loading={loading}>Refresh Profit</Button>
          </InlineStack>
        </InlineStack>

        <Card padding="400">
          <BlockStack gap="200">
            <InlineStack align="space-between" blockAlign="center" wrap>
              <BlockStack gap="050">
                <Text as="h2" variant="headingLg">{order.orderNumber}</Text>
                <Text as="p" tone="subdued">{formatDate(order.createdAt)}</Text>
              </BlockStack>
              <Badge tone={statusTone}>{status}</Badge>
            </InlineStack>
            <Divider />
            <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="200">
              <DetailMetric label="REVENUE" value={formatMoney(order.revenue, order.currency)} />
              <DetailMetric label="TOTAL COSTS" value={formatMoney(breakdown.totalKnownCost, order.currency)} />
              <DetailMetric
                label="TRUE PROFIT"
                value={formatMoney(order.trueProfit, order.currency)}
              />
              <DetailMetric
                label="PROFIT MARGIN"
                value={margin === null || margin === undefined ? "—" : `${margin}%`}
              />
            </InlineGrid>
          </BlockStack>
        </Card>

        <Card padding="400">
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Order Information</Text>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="200">
              <DetailRow label="Order Number" value={order.orderNumber || "—"} />
              <DetailRow label="Order Date" value={formatDate(order.createdAt)} />
              <DetailRow label="Customer" value={order.customer?.name || "Guest"} />
              <DetailRow label="Customer Email" value={order.customer?.email || "—"} />
              <DetailRow label="Financial Status" value={formatStatus(order.financialStatus)} />
              <DetailRow label="Fulfillment Status" value={formatStatus(order.fulfillmentStatus)} />
              <DetailRow label="Sales Channel" value={order.salesChannel || "—"} />
              <DetailRow label="Currency" value={order.currency || "—"} />
            </InlineGrid>
          </BlockStack>
        </Card>

        <Card padding="400">
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Products / Line Items</Text>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "900px" }}>
                <thead>
                  <tr>
                    {["Product", "Qty", "Selling Price", "Discount", "Net Price", "COGS", "Revenue", "Item Profit", "Margin"].map((heading) => (
                      <th key={heading} style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e1e3e5" }}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(order.items || []).map((item, index) => (
                    <tr key={`${item.variantId || item.title}-${index}`}>
                      <td style={{ padding: "12px 8px", borderBottom: "1px solid #e1e3e5" }}>
                        <InlineStack gap="200" blockAlign="center" wrap={false}>
                          {item.image?.url ? <img src={item.image.url} alt={item.image.altText || item.title} width="40" height="40" style={{ objectFit: "cover", borderRadius: "4px" }} /> : null}
                          <BlockStack gap="050">
                            <Text as="span" fontWeight="semibold">{item.title}</Text>
                            <Text as="span" variant="bodySm" tone="subdued">{item.variantTitle || item.sku || "—"}</Text>
                            {item.sku && <Text as="span" variant="bodySm" tone="subdued">SKU: {item.sku}</Text>}
                          </BlockStack>
                        </InlineStack>
                      </td>
                      <td style={{ padding: "12px 8px" }}>{item.quantity}</td>
                      <td style={{ padding: "12px 8px" }}>{formatMoney(item.originalUnitPrice, order.currency)}</td>
                      <td style={{ padding: "12px 8px" }}>{formatMoney(item.discount, order.currency)}</td>
                      <td style={{ padding: "12px 8px" }}>{formatMoney(item.unitPrice, order.currency)}</td>
                      <td style={{ padding: "12px 8px" }}>{formatMoney(item.productCost, order.currency)}</td>
                      <td style={{ padding: "12px 8px" }}>{formatMoney(item.revenue, order.currency)}</td>
                      <td style={{ padding: "12px 8px" }}>{formatMoney(item.itemProfit, order.currency)}</td>
                      <td style={{ padding: "12px 8px" }}>{item.itemMargin === null || item.itemMargin === undefined ? "—" : `${item.itemMargin}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </BlockStack>
        </Card>

        <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
          <Card padding="400">
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Revenue Breakdown</Text>
              <DetailRow label="Product Subtotal" value={formatMoney(revenue.productSubtotal, order.currency)} />
              <DetailRow label="Discounts" value={formatMoney(revenue.discounts, order.currency)} />
              <DetailRow label="Net Product Revenue" value={formatMoney(revenue.netProductRevenue, order.currency)} />
              <DetailRow label="Customer Shipping Charged" value={formatMoney(revenue.customerShippingCharged, order.currency)} />
              <DetailRow label="Tax" value={formatMoney(revenue.tax, order.currency)} />
              <DetailRow label="Order Total" value={formatMoney(revenue.orderTotal, order.currency)} />
              <DetailRow label="Refund Amount" value={formatMoney(revenue.refundAmount, order.currency)} />
              <DetailRow label="Net Revenue After Refund" value={formatMoney(revenue.netRevenueAfterRefund, order.currency)} />
            </BlockStack>
          </Card>

          <Card padding="400">
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Complete Cost Breakdown</Text>
              <DetailRow label="Product Cost" value={formatMoney(order.productCost, order.currency)} source={availability.productCost} />
              <DetailRow label="Merchant Shipping Cost" value={formatMoney(order.shippingCost, order.currency)} source={merchantShippingSource} />
              <DetailRow label="Payment Fee" value={formatMoney(order.paymentFee, order.currency)} source={availability.paymentFee} />
              <DetailRow label="Fulfillment Cost" value={formatMoney(order.fulfillmentCost, order.currency)} source={availability.fulfillmentCost} />
              <DetailRow label="Marketing Cost" value={formatMoney(order.advertisingCost, order.currency)} source={availability.advertisingCost} />
              <DetailRow label="Tax / Other Applicable Costs" value={formatMoney(order.taxCost, order.currency)} source={availability.taxCost} />
              <Divider />
              <DetailRow label="Total Costs" value={formatMoney(breakdown.totalKnownCost, order.currency)} />
              <DetailRow label="True Profit" value={formatMoney(order.trueProfit, order.currency)} />
            </BlockStack>
          </Card>
        </InlineGrid>

        <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
          <Card padding="400">
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">COGS, Discounts & Shipping</Text>
              <Text as="h3" variant="headingSm">COGS Source</Text>
              {(order.items || []).map((item, index) => (
                <DetailRow key={`cogs-${index}`} label={`${item.title} × ${item.quantity}`} value={formatMoney(item.productCost, order.currency)} source={item.cogsSource} />
              ))}
              <Divider />
              <Text as="h3" variant="headingSm">Discount Breakdown</Text>
              {(order.discountBreakdown || []).length ? order.discountBreakdown.map((discount, index) => (
                <DetailRow key={`discount-${index}`} label={discount.code || "Discount"} value={discount.amount === null ? (discount.percentage === null ? "—" : `${discount.percentage}%`) : formatMoney(discount.amount, order.currency)} source={discount.type} />
              )) : <Text as="p" tone="subdued">No discount applications available.</Text>}
              <DetailRow label="Total Discount" value={formatMoney(order.discount, order.currency)} />
              <Divider />
              <Text as="h3" variant="headingSm">Shipping</Text>
              <DetailRow label="Customer Shipping Charged" value={formatMoney(order.shippingCharged, order.currency)} source="Shopify shipping line" />
              <DetailRow label="Merchant Shipping Cost" value={formatMoney(order.shippingCost, order.currency)} source={merchantShippingSource} />
              {(order.shippingBreakdown || []).map((shipping, index) => <DetailRow key={`shipping-${index}`} label={shipping.title} value={formatMoney(shipping.amount, order.currency)} />)}
            </BlockStack>
          </Card>

          <Card padding="400">
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Payment, Fulfillment & Tax</Text>
              <DetailRow label="Payment Gateway" value="—" source="Not available" />
              <DetailRow label="Transaction Amount" value={formatMoney(order.revenue, order.currency)} source="Shopify order revenue" />
              <DetailRow label="Payment Fee" value={formatMoney(order.paymentFee, order.currency)} source={availability.paymentFee} />
              <DetailRow label="Fulfillment Status" value={formatStatus(order.fulfillmentStatus)} />
              <DetailRow label="Fulfillment Service" value="—" source="Not available" />
              <DetailRow label="Fulfillment Cost" value={formatMoney(order.fulfillmentCost, order.currency)} source={availability.fulfillmentCost} />
              <Divider />
              <DetailRow label="Product Tax" value={formatMoney(revenue.tax, order.currency)} source="Shopify total tax" />
              <DetailRow label="Shipping Tax" value="—" source="Not available" />
              <DetailRow label="Total Shopify Tax" value={formatMoney(order.tax, order.currency)} source="Shopify total tax" />
            </BlockStack>
          </Card>
        </InlineGrid>

        <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
          <Card padding="400">
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Refunds & Returns</Text>
              <DetailRow label="Refund Status" value={order.refund > 0 ? "Refunded" : "No refund recorded"} />
              <DetailRow label="Refund Amount" value={formatMoney(order.refund, order.currency)} source="Shopify refunds" />
              {(order.refundDetails || []).map((refund, index) => (
                <Box key={`refund-${index}`} padding="300" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="100">
                    <Text as="span" fontWeight="semibold">{formatDate(refund.createdAt)} · {formatMoney(refund.amount, order.currency)}</Text>
                    {refund.lineItems.map((item, itemIndex) => <Text key={itemIndex} as="span" variant="bodySm">{item.title} × {item.quantity}</Text>)}
                  </BlockStack>
                </Box>
              ))}
              <DetailRow label="Net Revenue After Refund" value={formatMoney(revenue.netRevenueAfterRefund, order.currency)} />
            </BlockStack>
          </Card>

          <Card padding="400">
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Cost Data Availability</Text>
              {Object.entries(availability).map(([key, value]) => (
                <DetailRow key={key} label={key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase())} value={value === "Not available" || value === "Not configured" ? "—" : "Available"} source={value} />
              ))}
              <Divider />
              <DetailRow label="Advertising Cost" value={formatMoney(order.advertisingCost, order.currency)} source={availability.advertisingCost || "Not configured"} />
            </BlockStack>
          </Card>
        </InlineGrid>

        <Card padding="400">
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Profit Analysis</Text>
            <Badge tone={statusTone}>{status === "LOSS" ? "LOSS-MAKING ORDER" : status === "PROFITABLE" ? "PROFITABLE ORDER" : "INCOMPLETE PROFIT DATA"}</Badge>
            <Text as="p">
              {status === "LOSS"
                ? "This order generated a loss after the available product, shipping, payment, fulfillment, marketing and configured tax costs were included."
                : status === "PROFITABLE"
                  ? "This order generated positive profit after the currently available costs were included."
                  : "Profit cannot be completed because one or more required cost inputs are unavailable."}
            </Text>
          </BlockStack>
        </Card>

        <Card padding="400">
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Profit Calculation</Text>
            <Text as="p">Net Revenue: {formatMoney(order.revenue, order.currency)}</Text>
            <Text as="p">− Product Cost: {formatMoney(order.productCost, order.currency)}</Text>
            <Text as="p">− Merchant Shipping Cost: {formatMoney(order.shippingCost, order.currency)}</Text>
            <Text as="p">− Payment Fee: {formatMoney(order.paymentFee, order.currency)}</Text>
            <Text as="p">− Fulfillment Cost: {formatMoney(order.fulfillmentCost, order.currency)}</Text>
            <Text as="p">− Marketing / Tax Costs: {formatMoney((order.advertisingCost || 0) + (order.taxCost || 0), order.currency)}</Text>
            <Divider />
            <Text as="p" fontWeight="bold">True Profit: {formatMoney(order.trueProfit, order.currency)}</Text>
            <Text as="p" tone="subdued">Profit Margin = True Profit / Net Revenue</Text>
          </BlockStack>
        </Card>

        <Card padding="400">
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Order Timeline</Text>
            <DetailRow label="Order Created" value={formatDate(order.createdAt)} source="Shopify" />
            {(order.refundDetails || []).map((refund, index) => <DetailRow key={`timeline-${index}`} label="Refund" value={formatDate(refund.createdAt)} source="Shopify" />)}
            <DetailRow label="Payment Received" value="—" source="Date not available" />
            <DetailRow label="Fulfillment" value={formatStatus(order.fulfillmentStatus)} source="Event date not available" />
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const revalidator = useRevalidator();

  return (
    <Page title="Order Profitability" fullWidth>
      <Card padding="500">
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            Order Profitability
          </Text>
          <Text as="p" tone="critical">
            {error?.message || "Failed to load order profitability data."}
          </Text>
          <Box paddingTop="200">
            <Button variant="primary" onClick={() => revalidator.revalidate()}>
              Retry
            </Button>
          </Box>
        </BlockStack>
      </Card>
    </Page>
  );
}