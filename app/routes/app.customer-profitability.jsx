import {
  useLoaderData,
  useSearchParams,
  useRevalidator,
  useNavigate,
  useRouteError,
  isRouteErrorResponse,
} from "react-router";
import { useState, useMemo } from "react";
import {
  Page,
  Card,
  InlineGrid,
  InlineStack,
  BlockStack,
  Text,
  TextField,
  Select,
  Button,
  IndexTable,
  Badge,
  Divider,
  Banner,
  EmptySearchResult,
} from "@shopify/polaris";
import { authenticate, sessionStorage } from "../shopify.server";

const BACKEND_URL =
  process.env.BACKEND_URL || "http://localhost:5000";

// ==========================================
// LOADER — FETCH CUSTOMER PROFITABILITY
// ==========================================

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const customerId =
    url.searchParams.get("customerId") || url.searchParams.get("detail");
  let accessToken = session.accessToken || "";

  if (!accessToken && sessionStorage) {
    try {
      const offlineSession = await sessionStorage.loadSession(
        `offline_${session.shop}`
      );
      accessToken = offlineSession?.accessToken || "";
    } catch (error) {
      console.warn(
        "[MarginMind] Could not load offline customer session:",
        error.message
      );
    }
  }

  const headers = {
    "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
    "x-shopify-shop-domain": session.shop,
    "x-shopify-access-token": accessToken,
    "Content-Type": "application/json",
  };

  let listData = { success: false, data: null };
  let loaderError = null;

  try {
    const listRes = await fetch(
      `${BACKEND_URL}/api/customer-profitability?first=50`,
      { method: "GET", headers }
    );
    listData = await listRes.json();
    if (!listRes.ok || !listData.success) {
      loaderError = listData?.message || "Failed to load customers";
    }
  } catch (fetchErr) {
    console.error("[MarginMind] Customer profitability list fetch error:", fetchErr);
    loaderError = `Failed to connect to backend: ${fetchErr.message}`;
  }

  const customers = (listData?.data?.customers || []).map((item, index) => {
    const customer = item.customer || {};
    return {
      id: customer.id || `customer-${index}`,
      name: customer.name || "Guest Customer",
      email: customer.email || "—",
      createdAt: customer.createdAt || null,
      ordersCount: item.ordersCount ?? 0,
      revenue: item.revenue ?? 0,
      discounts: item.discounts ?? 0,
      returns: item.returns ?? 0,
      shippingCharged: item.shippingCharged ?? 0,
      shippingCost: item.shippingCost ?? 0,
      shippingCostSource: item.shippingCostSource || null,
      paymentFees: item.paymentFees ?? 0,
      paymentFeeSource: item.paymentFeeSource || null,
      fulfillmentCost: item.fulfillmentCost ?? 0,
      fulfillmentCostSource: item.fulfillmentCostSource || null,
      tax: item.tax ?? 0,
      productCost: item.productCost ?? null,
      profit: item.profit ?? null,
      margin: item.margin ?? null,
      status: item.status || "NO_COST",
      segment: item.segment || "NO_COST",
      statusLabel: item.statusLabel || "No cost data",
      dataScope: item.dataScope || "",
      netRevenue: item.netRevenue ?? 0,
      totalCosts: item.totalCosts ?? null,
      unavailableCosts: item.unavailableCosts || [],
      costDataComplete: Boolean(item.costDataComplete),
      orderDetails: item.orderDetails || [],
    };
  });

  let selectedCustomer = null;
  let detailError = null;

  if (customerId) {
    try {
      const detailRes = await fetch(
        `${BACKEND_URL}/api/customer-profitability/${encodeURIComponent(customerId)}`,
        { method: "GET", headers }
      );
      const detailData = await detailRes.json();
      if (detailRes.ok && detailData.success) {
        selectedCustomer = detailData.data;
      } else {
        detailError = detailData?.message || "Unable to load customer details";
      }
    } catch (e) {
      detailError = e.message || "Failed to connect to MarginMind backend";
    }
  }

  return {
    customers,
    currency: selectedCustomer?.currency || listData?.data?.currency || "USD",
    currentShop: session.shop,
    summary: {
      totalCustomers: listData?.data?.totalCustomers ?? customers.length,
      profitableCustomers: listData?.data?.summary?.profitableCustomers ?? 0,
      lowMarginCustomers: listData?.data?.summary?.lowMarginCustomers ?? 0,
      lossCustomers: listData?.data?.summary?.lossCustomers ?? 0,
      noCostCustomers: listData?.data?.summary?.noCostCustomers ?? 0,
    },
    selectedCustomer,
    detailError,
    loaderError,
  };
};

// ==========================================
// HELPERS
// ==========================================

const formatMoney = (value, currency = "USD") => {
  if (value === null || value === undefined) {
    return "—";
  }

  const number = Number(value);
  if (Number.isNaN(number)) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
};

const formatMargin = (value) => {
  if (value === null || value === undefined) {
    return "—";
  }

  const number = Number(value);
  if (Number.isNaN(number)) {
    return "—";
  }
  return `${number.toFixed(2)}%`;
};

const formatDate = (dateString) => {
  if (!dateString) return "—";
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
};

function statusTone(status) {
  if (status === "PROFITABLE" || status === "HIGH_PROFIT") return "success";
  if (status === "LOSS") return "critical";
  if (status === "LOW_MARGIN" || status === "LOW_PROFIT" || status === "PARTIAL_DATA")
    return "warning";
  return "info";
}

function statusLabel(status) {
  if (status === "PARTIAL_DATA") return "Partial data";
  if (status === "NO_COST") return "No cost data";
  if (status === "LOW_MARGIN" || status === "LOW_PROFIT") return "Low margin";
  if (status === "PROFITABLE" || status === "HIGH_PROFIT") return "Profitable";
  if (status === "LOSS") return "Loss making";
  return status || "Unknown";
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

function DetailRow({ label, value, source, tone }) {
  return (
    <BlockStack gap="050">
      <Text as="span" variant="bodySm" tone="subdued">
        {label}
      </Text>
      <Text as="span" fontWeight="semibold" tone={tone}>
        {value}
      </Text>
      {source && (
        <Text as="span" variant="bodyXs" tone="subdued">
          Source: {source}
        </Text>
      )}
    </BlockStack>
  );
}

// ==========================================
// FULL PAGE CUSTOMER DETAIL VIEW (Order Page Style)
// ==========================================

function CustomerProfitabilityDetailView({
  customer,
  shop,
  currency,
  error,
  loading,
  onBack,
  onRetry,
}) {
  if (error || !customer) {
    const notFound = error === "not-found";

    return (
      <Page title="Customer Profit Details" fullWidth>
        <Card padding="500">
          <BlockStack gap="300">
            <Text as="h2" variant="headingLg">
              {notFound ? "Customer not found." : "Unable to load customer details."}
            </Text>
            <Text as="p" tone="subdued">
              {notFound
                ? "This Shopify customer could not be found for the current store."
                : "The latest customer data could not be loaded from Shopify."}
            </Text>
            <InlineStack gap="200">
              <Button onClick={onBack}>← Back to Customers</Button>
              {!notFound && (
                <Button variant="primary" onClick={onRetry} loading={loading}>
                  Retry
                </Button>
              )}
            </InlineStack>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  const customerId = customer.customer?.id || customer.id || "";
  const numericCustomerId = customerId ? String(customerId).split("/").pop() : "";
  const customerName = customer.customer?.name || customer.name || "Customer";
  const customerEmail = customer.customer?.email || customer.email || "No email available";
  const customerCreatedAt = customer.customer?.createdAt || customer.createdAt;
  const status = customer.status || "NO_COST";
  const ordersList = customer.orderDetails || [];

  const shopifyCustomerUrl =
    shop && numericCustomerId
      ? `https://${shop}/admin/customers/${numericCustomerId}`
      : null;

  return (
    <Page
      title="Customer Profit Details"
      subtitle={`${customerName} · ${customerEmail}`}
      fullWidth
    >
      <BlockStack gap="400">
        {/* Navigation actions */}
        <InlineStack align="space-between" blockAlign="center" wrap>
          <Button onClick={onBack}>← Back to Customers</Button>
          <InlineStack gap="200">
            {shopifyCustomerUrl && (
              <Button
                onClick={() =>
                  window.open(shopifyCustomerUrl, "_blank", "noopener,noreferrer")
                }
              >
                Open in Shopify Admin ↗
              </Button>
            )}
            <Button onClick={onRetry} loading={loading}>
              Refresh Profit
            </Button>
          </InlineStack>
        </InlineStack>

        {/* Hero Card with Status and Top KPI Metrics */}
        <Card padding="400">
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center" wrap>
              <BlockStack gap="050">
                <Text as="h2" variant="headingLg" fontWeight="bold">
                  {customerName}
                </Text>
                <Text as="p" tone="subdued">
                  {customerEmail}
                </Text>
              </BlockStack>
              <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
            </InlineStack>
            <Divider />
            <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="200">
              <DetailMetric
                label="TOTAL REVENUE"
                value={formatMoney(customer.revenue, currency)}
              />
              <DetailMetric
                label="TOTAL COSTS"
                value={
                  customer.totalCosts !== null
                    ? formatMoney(customer.totalCosts, currency)
                    : "—"
                }
              />
              <DetailMetric
                label="TRUE PROFIT"
                value={
                  customer.profit !== null
                    ? formatMoney(customer.profit, currency)
                    : "—"
                }
              />
              <DetailMetric
                label="PROFIT MARGIN"
                value={formatMargin(customer.margin)}
              />
            </InlineGrid>
          </BlockStack>
        </Card>

        {/* Customer Information Card */}
        <Card padding="400">
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              Customer Information
            </Text>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="200">
              <DetailRow label="Customer Name" value={customerName} />
              <DetailRow label="Customer Email" value={customerEmail} />
              <DetailRow
                label="Total Orders"
                value={String(customer.ordersCount ?? ordersList.length)}
              />
              <DetailRow
                label="Customer Since"
                value={formatDate(customerCreatedAt)}
              />
            </InlineGrid>
          </BlockStack>
        </Card>

        {/* Side-by-Side Breakdown Cards */}
        <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
          <Card padding="400">
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Revenue Breakdown
              </Text>
              <DetailRow
                label="Gross Revenue"
                value={formatMoney(customer.revenue, currency)}
                source="Shopify line item subtotal"
              />
              <DetailRow
                label="Discounts Applied"
                value={formatMoney(customer.discounts, currency)}
                source="Shopify order discounts"
              />
              <DetailRow
                label="Returns & Refunds"
                value={formatMoney(customer.returns, currency)}
                source="Shopify total refunds"
              />
              <DetailRow
                label="Shipping Charged to Customer"
                value={formatMoney(customer.shippingCharged, currency)}
                source="Shopify shipping price"
              />
              <Divider />
              <DetailRow
                label="Net Revenue"
                value={formatMoney(customer.netRevenue, currency)}
                source="Gross Revenue − Discounts − Refunds"
              />
            </BlockStack>
          </Card>

          <Card padding="400">
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Complete Cost Breakdown
              </Text>
              <DetailRow
                label="Product Cost (COGS)"
                value={
                  customer.productCost !== null
                    ? formatMoney(customer.productCost, currency)
                    : "—"
                }
                source="Shopify InventoryItem.unitCost"
              />
              <DetailRow
                label="Merchant Shipping Cost"
                value={formatMoney(customer.shippingCost || 0, currency)}
                source={customer.shippingCostSource || "Store Settings"}
              />
              <DetailRow
                label="Payment Processing Fee"
                value={formatMoney(customer.paymentFees || 0, currency)}
                source={customer.paymentFeeSource || "Shopify Payment Gateway"}
              />
              <DetailRow
                label="Fulfillment Cost"
                value={formatMoney(customer.fulfillmentCost || 0, currency)}
                source={customer.fulfillmentCostSource || "Store Settings"}
              />
              <Divider />
              <DetailRow
                label="Total Costs"
                value={
                  customer.totalCosts !== null
                    ? formatMoney(customer.totalCosts, currency)
                    : "—"
                }
                source="Product + Shipping + Payment + Fulfillment"
              />
              <DetailRow
                label="True Profit"
                value={
                  customer.profit !== null
                    ? formatMoney(customer.profit, currency)
                    : "—"
                }
                source="Net Revenue − Total Costs"
              />
            </BlockStack>
          </Card>
        </InlineGrid>

        {/* Orders History Card & Table */}
        <Card padding="400">
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Orders History ({ordersList.length} orders)
              </Text>
              {loading && (
                <Text as="span" variant="bodyXs" tone="subdued">
                  Updating orders...
                </Text>
              )}
            </InlineStack>

            {ordersList.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    minWidth: "900px",
                  }}
                >
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e1e3e5", background: "#f9fafb" }}>
                      {[
                        "Order",
                        "Date",
                        "Revenue",
                        "Discounts",
                        "Returns / Refunds",
                        "Shipping Cost",
                        "Product Cost",
                        "Payment Fee",
                        "Fulfillment Cost",
                        "True Profit",
                        "Margin",
                        "Status",
                        "Action",
                      ].map((h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: "left",
                            padding: "10px 8px",
                            fontWeight: 600,
                            color: "#303030",
                          }}
                        >
                          <Text as="span" variant="bodySm" fontWeight="bold">
                            {h}
                          </Text>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ordersList.map((order, index) => {
                      const orderNumericId = String(order.id || "").split("/").pop();
                      const orderUrl = shop && orderNumericId
                        ? `https://${shop}/admin/orders/${orderNumericId}`
                        : null;

                      return (
                        <tr
                          key={order.id || index}
                          style={{
                            borderBottom: "1px solid #e1e3e5",
                            backgroundColor: index % 2 === 0 ? "#ffffff" : "#fbfbfb",
                          }}
                        >
                          <td style={{ padding: "10px 8px" }}>
                            <Text as="span" fontWeight="semibold">
                              {order.orderNumber || "—"}
                            </Text>
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            <Text as="span" variant="bodySm" tone="subdued">
                              {formatDate(order.date)}
                            </Text>
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            {formatMoney(order.revenue, currency)}
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            {formatMoney(order.discounts, currency)}
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            {formatMoney(order.returns, currency)}
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            {formatMoney(order.shippingCost || 0, currency)}
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            {order.productCost !== null
                              ? formatMoney(order.productCost, currency)
                              : "—"}
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            {formatMoney(order.paymentFee || 0, currency)}
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            {formatMoney(order.fulfillmentCost || 0, currency)}
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            <Text
                              as="span"
                              fontWeight="semibold"
                              tone={order.trueProfit === null ? "subdued" : undefined}
                            >
                              {order.trueProfit !== null
                                ? formatMoney(order.trueProfit, currency)
                                : "—"}
                            </Text>
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            <Text
                              as="span"
                              tone={order.margin === null ? "subdued" : undefined}
                            >
                              {formatMargin(order.margin)}
                            </Text>
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            <Badge tone={statusTone(order.status)}>
                              {statusLabel(order.status)}
                            </Badge>
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            {orderUrl ? (
                              <Button
                                variant="plain"
                                onClick={() =>
                                  window.open(orderUrl, "_blank", "noopener,noreferrer")
                                }
                              >
                                Open Order ↗
                              </Button>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptySearchResult
                title="No orders recorded for this customer"
                description="This customer profile currently has no associated orders in Shopify."
              />
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

// ==========================================
// MAIN CUSTOMER PROFITABILITY COMPONENT
// ==========================================

export default function CustomerProfitability() {
  const {
    customers = [],
    summary = {},
    currency = "USD",
    currentShop = "",
    selectedCustomer = null,
    detailError = null,
    loaderError = null,
  } = useLoaderData() || {};

  const [searchParams, setSearchParams] = useSearchParams();
  const revalidator = useRevalidator();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("revenue");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  const detailId =
    searchParams.get("detail") || searchParams.get("customerId");

  function handleViewDetails(customer) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("detail", customer.id);
    setSearchParams(nextParams);
  }

  function handleCloseDetails() {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("detail");
    nextParams.delete("customerId");
    setSearchParams(nextParams);
  }

  // Filter & search customers — Hook called unconditionally on every render
  const visibleCustomers = useMemo(() => {
    return customers
      .filter((customer) => {
        const searchValue = search.trim().toLowerCase();
        const matchesStatus =
          statusFilter === "ALL" ||
          customer.status === statusFilter ||
          customer.segment === statusFilter;

        if (!searchValue) {
          return matchesStatus;
        }

        const nameMatch = (customer.name || "").toLowerCase().includes(searchValue);
        const emailMatch = (customer.email || "").toLowerCase().includes(searchValue);
        const idMatch = String(customer.id || "").toLowerCase().includes(searchValue);
        const orderMatch = (customer.orderDetails || []).some(
          (o) =>
            (o.orderNumber && o.orderNumber.toLowerCase().includes(searchValue)) ||
            (o.id && String(o.id).includes(searchValue))
        );

        return (nameMatch || emailMatch || idMatch || orderMatch) && matchesStatus;
      })
      .sort((left, right) => {
        if (sortBy === "name") return (left.name || "").localeCompare(right.name || "");
        if (sortBy === "name_desc") return (right.name || "").localeCompare(left.name || "");
        if (sortBy === "margin") {
          return (right.margin ?? -Infinity) - (left.margin ?? -Infinity);
        }
        if (sortBy === "margin_asc") {
          return (left.margin ?? Infinity) - (right.margin ?? Infinity);
        }
        if (sortBy === "profit") {
          return (right.profit ?? -Infinity) - (left.profit ?? -Infinity);
        }
        if (sortBy === "profit_asc") {
          return (left.profit ?? Infinity) - (right.profit ?? Infinity);
        }
        if (sortBy === "orders") {
          return (right.ordersCount ?? 0) - (left.ordersCount ?? 0);
        }
        if (sortBy === "revenue_asc") {
          return (left.revenue ?? 0) - (right.revenue ?? 0);
        }
        return (right.revenue ?? 0) - (left.revenue ?? 0);
      });
  }, [customers, search, statusFilter, sortBy]);

  const totalPages = Math.ceil(visibleCustomers.length / pageSize) || 1;
  const paginatedCustomers = visibleCustomers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // If viewing details: open full page view (like the order page!)
  if (detailId) {
    const currentCustomer =
      selectedCustomer ||
      customers.find(
        (c) =>
          c.id === detailId ||
          String(c.id).endsWith(String(detailId).split("/").pop())
      );

    return (
      <CustomerProfitabilityDetailView
        customer={currentCustomer}
        shop={currentShop}
        currency={currency}
        error={detailError}
        loading={revalidator.state === "loading"}
        onBack={handleCloseDetails}
        onRetry={() => revalidator.revalidate()}
      />
    );
  }

  // Summary Metrics — matched directly with real data
  const totalCustomers = summary.totalCustomers ?? customers.length;
  const profitableCustomers =
    summary.profitableCustomers ??
    customers.filter((c) => c.status === "PROFITABLE").length;
  const lowMarginCustomers =
    summary.lowMarginCustomers ??
    customers.filter((c) => c.status === "LOW_MARGIN").length;
  const lossCustomers =
    summary.lossCustomers ??
    customers.filter((c) => c.status === "LOSS").length;
  const noCostCustomers =
    summary.noCostCustomers ??
    customers.filter((c) => c.status === "NO_COST").length;

  return (
    <Page
      title="Customer Profitability"
      subtitle="Real Shopify revenue, costs, true profit and margins per customer."
      fullWidth
    >
      <BlockStack gap="400">
        {loaderError && (
          <Banner tone="warning" title="Notice">
            <p>{loaderError}</p>
          </Banner>
        )}

        {/* 5 Summary KPI Cards */}
        <InlineGrid columns={{ xs: 1, sm: 2, md: 3, lg: 5 }} gap="400">
          <Card padding="400">
            <BlockStack gap="100">
              <Text as="h3" variant="headingXs" tone="subdued">
                TOTAL CUSTOMERS
              </Text>
              <Text as="p" variant="heading2xl" fontWeight="bold">
                {totalCustomers}
              </Text>
              <Text as="span" variant="bodyXs" tone="subdued">
                Total store customers
              </Text>
            </BlockStack>
          </Card>

          <Card padding="400">
            <BlockStack gap="100">
              <Text as="h3" variant="headingXs" tone="subdued">
                PROFITABLE
              </Text>
              <Text
                as="p"
                variant="heading2xl"
                fontWeight="bold"
              >
                {profitableCustomers}
              </Text>
              <Text as="span" variant="bodyXs" tone="subdued">
                Margin ≥ 20%
              </Text>
            </BlockStack>
          </Card>

          <Card padding="400">
            <BlockStack gap="100">
              <Text as="h3" variant="headingXs" tone="subdued">
                LOW MARGIN
              </Text>
              <Text
                as="p"
                variant="heading2xl"
                fontWeight="bold"
              >
                {lowMarginCustomers}
              </Text>
              <Text as="span" variant="bodyXs" tone="subdued">
                Margin 0% to 20%
              </Text>
            </BlockStack>
          </Card>

          <Card padding="400">
            <BlockStack gap="100">
              <Text as="h3" variant="headingXs" tone="subdued">
                LOSS MAKING
              </Text>
              <Text
                as="p"
                variant="heading2xl"
                fontWeight="bold"
              >
                {lossCustomers}
              </Text>
              <Text as="span" variant="bodyXs" tone="subdued">
                Negative margin (&lt; 0%)
              </Text>
            </BlockStack>
          </Card>

          <Card padding="400">
            <BlockStack gap="100">
              <Text as="h3" variant="headingXs" tone="subdued">
                NO COST DATA
              </Text>
              <Text as="p" variant="heading2xl" fontWeight="bold" tone="subdued">
                {noCostCustomers}
              </Text>
              <Text as="span" variant="bodyXs" tone="subdued">
                Missing required cost data
              </Text>
            </BlockStack>
          </Card>
        </InlineGrid>

        {/* Filter and Search Bar */}
        <Card padding="0">
          <BlockStack gap="300" padding="400">
            <InlineStack gap="300" wrap blockAlign="end">
              <div style={{ minWidth: "240px", flex: "1 1 260px" }}>
                <TextField
                  label="Search customers"
                  value={search}
                  onChange={(val) => {
                    setSearch(val);
                    setCurrentPage(1);
                  }}
                  placeholder="Search by customer name, email, or order #"
                  clearButton
                  onClearButtonClick={() => {
                    setSearch("");
                    setCurrentPage(1);
                  }}
                  autoComplete="off"
                />
              </div>
              <Select
                label="Filter by status"
                options={[
                  { label: "All statuses", value: "ALL" },
                  { label: "Profitable (≥ 20%)", value: "PROFITABLE" },
                  { label: "Low margin (0%–20%)", value: "LOW_MARGIN" },
                  { label: "Loss making (< 0%)", value: "LOSS" },
                  { label: "No cost data", value: "NO_COST" },
                ]}
                value={statusFilter}
                onChange={(val) => {
                  setStatusFilter(val);
                  setCurrentPage(1);
                }}
              />
              <Select
                label="Sort by"
                options={[
                  { label: "Revenue (High to Low)", value: "revenue" },
                  { label: "Revenue (Low to High)", value: "revenue_asc" },
                  { label: "True Profit (High to Low)", value: "profit" },
                  { label: "True Profit (Low to High)", value: "profit_asc" },
                  { label: "Profit Margin (High to Low)", value: "margin" },
                  { label: "Profit Margin (Low to High)", value: "margin_asc" },
                  { label: "Orders (Most to Least)", value: "orders" },
                  { label: "Customer Name (A–Z)", value: "name" },
                  { label: "Customer Name (Z–A)", value: "name_desc" },
                ]}
                value={sortBy}
                onChange={(val) => {
                  setSortBy(val);
                  setCurrentPage(1);
                }}
              />
            </InlineStack>

            {(search.trim() || statusFilter !== "ALL") && (
              <InlineStack align="space-between" blockAlign="center">
                <Text as="span" variant="bodySm" tone="subdued">
                  Showing {visibleCustomers.length} of {customers.length} customers
                </Text>
                <Button
                  variant="plain"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("ALL");
                    setCurrentPage(1);
                  }}
                >
                  Clear filters
                </Button>
              </InlineStack>
            )}
          </BlockStack>

          {/* Customer Table with all 13 required columns */}
          <IndexTable
            resourceName={{ singular: "customer", plural: "customers" }}
            itemCount={visibleCustomers.length}
            headings={[
              { title: "Customer" },
              { title: "Orders" },
              { title: "Revenue" },
              { title: "Discounts" },
              { title: "Returns / Refunds" },
              { title: "Shipping Cost" },
              { title: "Product Cost" },
              { title: "Payment Fee" },
              { title: "Fulfillment Cost" },
              { title: "True Profit" },
              { title: "Profit Margin" },
              { title: "Status" },
              { title: "Action" },
            ]}
            selectable={false}
            pagination={
              visibleCustomers.length > pageSize
                ? {
                    hasPrevious: currentPage > 1,
                    onPrevious: () => setCurrentPage((p) => Math.max(1, p - 1)),
                    hasNext: currentPage < totalPages,
                    onNext: () => setCurrentPage((p) => Math.min(totalPages, p + 1)),
                    label: `Page ${currentPage} of ${totalPages} · Showing ${paginatedCustomers.length} of ${visibleCustomers.length} customers`,
                  }
                : undefined
            }
            emptyState={
              <EmptySearchResult
                title="No customers found"
                description={
                  search || statusFilter !== "ALL"
                    ? "Try adjusting your search terms or status filter."
                    : "No Shopify customer profitability data found."
                }
                withIllustration
              />
            }
          >
            {paginatedCustomers.map((customer, index) => (
              <IndexTable.Row
                id={customer.id}
                key={customer.id}
                position={index}
              >
                {/* 1. Customer Name & Email */}
                <IndexTable.Cell>
                  <BlockStack gap="050">
                    <Text as="span" fontWeight="semibold">
                      {customer.name}
                    </Text>
                    <Text as="span" variant="bodySm" tone="subdued">
                      {customer.email}
                    </Text>
                  </BlockStack>
                </IndexTable.Cell>

                {/* 2. Total Orders */}
                <IndexTable.Cell>{customer.ordersCount}</IndexTable.Cell>

                {/* 3. Revenue */}
                <IndexTable.Cell>
                  {formatMoney(customer.revenue, currency)}
                </IndexTable.Cell>

                {/* 4. Discounts */}
                <IndexTable.Cell>
                  {formatMoney(customer.discounts, currency)}
                </IndexTable.Cell>

                {/* 5. Returns / Refunds */}
                <IndexTable.Cell>
                  {formatMoney(customer.returns, currency)}
                </IndexTable.Cell>

                {/* 6. Shipping Cost */}
                <IndexTable.Cell>
                  {formatMoney(customer.shippingCost || 0, currency)}
                </IndexTable.Cell>

                {/* 7. Product Cost */}
                <IndexTable.Cell>
                  {customer.productCost !== null
                    ? formatMoney(customer.productCost, currency)
                    : "—"}
                </IndexTable.Cell>

                {/* 8. Payment Fee */}
                <IndexTable.Cell>
                  {formatMoney(customer.paymentFees || 0, currency)}
                </IndexTable.Cell>

                {/* 9. Fulfillment Cost */}
                <IndexTable.Cell>
                  {formatMoney(customer.fulfillmentCost || 0, currency)}
                </IndexTable.Cell>

                {/* 10. True Profit */}
                <IndexTable.Cell>
                  <Text
                    as="span"
                    fontWeight="semibold"
                    tone={customer.profit === null ? "subdued" : undefined}
                  >
                    {customer.profit !== null
                      ? formatMoney(customer.profit, currency)
                      : "—"}
                  </Text>
                </IndexTable.Cell>

                {/* 11. Profit Margin (%) */}
                <IndexTable.Cell>
                  <Text
                    as="span"
                    tone={customer.margin === null ? "subdued" : undefined}
                  >
                    {formatMargin(customer.margin)}
                  </Text>
                </IndexTable.Cell>

                {/* 12. Profitability Status */}
                <IndexTable.Cell>
                  <BlockStack gap="050" inlineAlign="start">
                    <div style={{ display: "inline-flex", width: "fit-content" }}>
                      <Badge tone={statusTone(customer.status)}>
                        {statusLabel(customer.status)}
                      </Badge>
                    </div>
                    {customer.dataScope && customer.status === "NO_COST" && (
                      <Text as="span" variant="bodyXs" tone="subdued">
                        {customer.dataScope}
                      </Text>
                    )}
                  </BlockStack>
                </IndexTable.Cell>

                {/* 13. View Details Action */}
                <IndexTable.Cell>
                  <Button onClick={() => handleViewDetails(customer)}>
                    View Details
                  </Button>
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        </Card>
      </BlockStack>
    </Page>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  if (typeof window !== "undefined") {
    console.error("[MarginMind] Customer Profitability Route Error:", error);
  }

  const errorMessage = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}: ${error.data || "Unknown route error"}`
    : error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "We encountered an issue loading customer profitability.";

  return (
    <Page title="Customer Profitability" fullWidth>
      <Card padding="500">
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            Customer Profitability Error
          </Text>
          <Text as="p" tone="subdued">
            {errorMessage}
          </Text>
          <InlineStack gap="200">
            <Button
              variant="primary"
              onClick={() => {
                navigate("/app/customer-profitability");
              }}
            >
              Back to Customers List
            </Button>
          </InlineStack>
        </BlockStack>
      </Card>
    </Page>
  );
}