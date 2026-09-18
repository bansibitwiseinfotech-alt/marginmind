/* eslint-disable react/prop-types */
import { useState, useMemo, useCallback, useEffect } from "react";
import { useRevalidator, useSubmit, useNavigation } from "react-router";
import {
  Page,
  Card,
  InlineGrid,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  IndexTable,
  TextField,
  Button,
  Box,
  Banner,
  Divider,
  Tabs,
  Pagination,
  ButtonGroup,
  Link,
  Tooltip,
} from "@shopify/polaris";

// ---------------------------------------------------------------------------
// Format Helpers
// ---------------------------------------------------------------------------
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
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getShopifyOrderAdminUrl(orderId, shop) {
  if (!orderId) return null;
  const cleanId = String(orderId).replace(/[^0-9]/g, "");
  if (!cleanId) return null;
  if (shop) {
    return `https://${shop}/admin/orders/${cleanId}`;
  }
  return `/admin/orders/${cleanId}`;
}

function CompactInfoRow({ label, value, tone, isBold = false }) {
  return (
    <InlineStack align="space-between" blockAlign="center">
      <Text variant="bodySm" tone="subdued" as="span">
        {label}
      </Text>
      <Text
        variant="bodySm"
        fontWeight={isBold ? "bold" : "regular"}
        tone={tone}
        as="span"
      >
        {value}
      </Text>
    </InlineStack>
  );
}

// ---------------------------------------------------------------------------
// CSV Export Helper
// ---------------------------------------------------------------------------
function exportOrdersToCsv(orders, shop) {
  if (!orders || orders.length === 0) return;
  const headers = [
    "Order #",
    "Date",
    "Customer",
    "Shipping Method",
    "Customer Shipping Paid",
    "Order Revenue",
    "Merchant Courier Cost",
    "Product Profit",
    "Margin %",
    "Shopify Admin URL",
  ];

  const rows = orders.map((o) => [
    `"${o.orderNumber || ""}"`,
    `"${o.createdAt ? new Date(o.createdAt).toISOString().split("T")[0] : ""}"`,
    `"${(o.customerName || "").replace(/"/g, '""')}"`,
    `"${(o.shippingMethod || "").replace(/"/g, '""')}"`,
    o.shippingCharged ?? 0,
    o.revenue ?? 0,
    o.merchantCost ?? "",
    o.profit ?? "",
    o.margin ?? "",
    `"${getShopifyOrderAdminUrl(o.id, shop) || ""}"`,
  ]);

  const csvContent =
    "data:text/csv;charset=utf-8," +
    [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute(
    "download",
    `MarginMind_Shipping_Analysis_${new Date().toISOString().split("T")[0]}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ---------------------------------------------------------------------------
// Method Detail Sub-View
// ---------------------------------------------------------------------------
function ShippingCostDetailView({ method, courierCostInput, shop, onBack, onRetry, loading }) {
  const [detailSearch, setDetailSearch] = useState("");
  const [detailPage, setDetailPage] = useState(1);
  const itemsPerPage = 10;

  if (!method) {
    return (
      <Page
        title="Shipping Method Details"
        backAction={{ content: "Shipping Cost Analysis", onAction: onBack }}
        fullWidth
      >
        <Card padding="400">
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              Shipping method not found
            </Text>
            <Button onClick={onBack}>Back to Analysis</Button>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  const freeCount = method.freeShippingOrders ?? 0;
  const paidCount = method.paidShippingOrders ?? 0;
  const courierCostNum = Number(courierCostInput) || 0;
  const estCourierExpense = courierCostNum > 0 ? courierCostNum * method.orders : null;
  const netShippingProfit = estCourierExpense !== null ? method.shippingCharged - estCourierExpense : null;

  const orders = method.sampleOrders || [];
  const filteredOrders = useMemo(() => {
    if (!detailSearch.trim()) return orders;
    const q = detailSearch.toLowerCase().trim();
    return orders.filter(
      (o) =>
        (o.orderNumber || "").toLowerCase().includes(q) ||
        (o.customerName || "").toLowerCase().includes(q)
    );
  }, [orders, detailSearch]);

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage) || 1;
  const paginatedOrders = useMemo(() => {
    const start = (detailPage - 1) * itemsPerPage;
    return filteredOrders.slice(start, start + itemsPerPage);
  }, [filteredOrders, detailPage, itemsPerPage]);

  return (
    <Page
      title={method.shippingMethod}
      subtitle={`${method.orders} total orders · GMV: ${formatMoney(method.revenue)} · Real Shopify Data`}
      backAction={{ content: "Shipping Cost Analysis", onAction: onBack }}
      primaryAction={{
        content: "Refresh Data",
        loading: loading,
        onAction: onRetry,
      }}
      secondaryActions={[
        {
          content: "Export Orders CSV",
          onAction: () => exportOrdersToCsv(orders, shop),
        },
      ]}
      fullWidth
    >
      <BlockStack gap="400">
        {/* Executive KPI Row */}
        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="300">
          <Card padding="400">
            <BlockStack gap="100">
              <InlineStack align="space-between">
                <Text variant="headingXs" tone="subdued" as="span">
                  ORDER REVENUE
                </Text>
                <Badge tone="info">{method.orders} orders</Badge>
              </InlineStack>
              <Text variant="heading2xl" fontWeight="bold" as="p">
                {formatMoney(method.revenue)}
              </Text>
              <Text variant="bodyXs" tone="subdued" as="span">
                Gross merchandise volume
              </Text>
            </BlockStack>
          </Card>

          <Card padding="400">
            <BlockStack gap="100">
              <InlineStack align="space-between">
                <Text variant="headingXs" tone="subdued" as="span">
                  CUSTOMER SHIPPING PAID
                </Text>
                <Badge tone={paidCount > 0 ? "success" : "attention"}>
                  {paidCount > 0 ? `${paidCount} paid` : "All Free"}
                </Badge>
              </InlineStack>
              <Text variant="heading2xl" fontWeight="bold" as="p">
                {formatMoney(method.shippingCharged)}
              </Text>
              <Text variant="bodyXs" tone="subdued" as="span">
                Collected directly at checkout
              </Text>
            </BlockStack>
          </Card>

          <Card padding="400">
            <BlockStack gap="100">
              <InlineStack align="space-between">
                <Text variant="headingXs" tone="subdued" as="span">
                  ORDER PROFITABILITY
                </Text>
                {method.margin !== null && (
                  <Badge tone={method.margin < 0 ? "critical" : "success"}>
                    {method.margin}% margin
                  </Badge>
                )}
              </InlineStack>
              <Text
                variant="heading2xl"
                fontWeight="bold"
                tone={method.profit !== null ? (method.profit < 0 ? "critical" : "success") : undefined}
                as="p"
              >
                {method.profit !== null ? formatMoney(method.profit) : "—"}
              </Text>
              <Text variant="bodyXs" tone="subdued" as="span">
                From {method.ordersWithProfit ?? 0} orders with COGS
              </Text>
            </BlockStack>
          </Card>

          <Card padding="400">
            <BlockStack gap="100">
              <InlineStack align="space-between">
                <Text variant="headingXs" tone="subdued" as="span">
                  NET SHIPPING RECOVERY
                </Text>
                <Badge tone={netShippingProfit !== null && netShippingProfit < 0 ? "critical" : "info"}>
                  {courierCostNum > 0 ? `$${courierCostNum.toFixed(2)}/order` : "No Courier Rate"}
                </Badge>
              </InlineStack>
              <Text
                variant="heading2xl"
                fontWeight="bold"
                tone={netShippingProfit !== null ? (netShippingProfit < 0 ? "critical" : "success") : undefined}
                as="p"
              >
                {netShippingProfit !== null
                  ? netShippingProfit >= 0
                    ? `+${formatMoney(netShippingProfit)}`
                    : formatMoney(netShippingProfit)
                  : "—"}
              </Text>
              <Text variant="bodyXs" tone="subdued" as="span">
                Customer paid minus courier freight
              </Text>
            </BlockStack>
          </Card>
        </InlineGrid>

        {/* Breakdown Overview */}
        <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
          <Card padding="400">
            <BlockStack gap="200">
              <Text as="h2" variant="headingSm" fontWeight="bold">
                Rate Breakdown & Economics
              </Text>
              <Divider />
              <CompactInfoRow label="Shipping Rate Name" value={method.shippingMethod} isBold />
              <CompactInfoRow label="Total Orders Processed" value={String(method.orders)} />
              <CompactInfoRow
                label="Free Shipping Orders"
                value={`${freeCount} (${((freeCount / method.orders) * 100).toFixed(1)}%)`}
              />
              <CompactInfoRow
                label="Paid Shipping Orders"
                value={`${paidCount} (${((paidCount / method.orders) * 100).toFixed(1)}%)`}
              />
              <CompactInfoRow
                label="Total Shipping Collected"
                value={formatMoney(method.shippingCharged)}
                isBold
              />
              <CompactInfoRow
                label="Estimated Carrier Courier Expense"
                value={estCourierExpense !== null ? formatMoney(estCourierExpense) : "Not Configured"}
              />
            </BlockStack>
          </Card>

          <Card padding="400">
            <BlockStack gap="200">
              <Text as="h2" variant="headingSm" fontWeight="bold">
                Profit Protection Insights
              </Text>
              <Divider />
              <BlockStack gap="150">
                <Text as="p" variant="bodySm">
                  <strong>Free Shipping Ratio:</strong> {freeCount} of {method.orders} orders (
                  {((freeCount / method.orders) * 100).toFixed(1)}%) were fulfilled with Free Shipping.
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {paidCount > 0
                    ? ` You captured ${formatMoney(method.shippingCharged)} across ${paidCount} paid orders to offset carrier bills.`
                    : " Carrier delivery costs are entirely absorbed by your store for this rate. Ensure your product profit margins support free delivery."}
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </InlineGrid>

        {/* Real Orders Table */}
        {orders.length > 0 && (
          <Card padding="0">
            <Box padding="400" borderBlockEndWidth="025" borderColor="border">
              <InlineStack align="space-between" blockAlign="center" gap="300">
                <Box minWidth="260px">
                  <TextField
                    placeholder="Search by order # or customer..."
                    value={detailSearch}
                    onChange={(val) => {
                      setDetailSearch(val);
                      setDetailPage(1);
                    }}
                    clearButton
                    onClearButtonClick={() => {
                      setDetailSearch("");
                      setDetailPage(1);
                    }}
                    autoComplete="off"
                  />
                </Box>
                <Text as="span" variant="bodySm" tone="subdued">
                  Showing {paginatedOrders.length} of {filteredOrders.length} orders
                </Text>
              </InlineStack>
            </Box>

            <IndexTable
              resourceName={{ singular: "order", plural: "orders" }}
              itemCount={paginatedOrders.length}
              headings={[
                { title: "Order #" },
                { title: "Date" },
                { title: "Customer" },
                { title: "Revenue" },
                { title: "Customer Paid" },
                { title: "Product Profit" },
                { title: "Margin" },
              ]}
              selectable={false}
            >
              {paginatedOrders.map((order, idx) => {
                const adminUrl = getShopifyOrderAdminUrl(order.id, shop);
                return (
                  <IndexTable.Row id={String(order.id || idx)} key={String(order.id || idx)} position={idx}>
                    <IndexTable.Cell>
                      {adminUrl ? (
                        <Link url={adminUrl} target="_blank" removeUnderline monochrome>
                          <Text as="span" fontWeight="bold" tone="info">
                            {order.orderNumber} ↗
                          </Text>
                        </Link>
                      ) : (
                        <Text as="span" fontWeight="bold">
                          {order.orderNumber}
                        </Text>
                      )}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {formatDate(order.createdAt)}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span">{order.customerName}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" fontWeight="medium">
                        {formatMoney(order.revenue, order.currency)}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge tone={order.shippingCharged > 0 ? "success" : "info"}>
                        {order.shippingCharged > 0
                          ? `Paid ${formatMoney(order.shippingCharged, order.currency)}`
                          : "Free Shipping"}
                      </Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text
                        as="span"
                        fontWeight="bold"
                        tone={order.profit !== null ? (order.profit < 0 ? "critical" : "success") : "subdued"}
                      >
                        {order.profit !== null
                          ? order.profit >= 0
                            ? `+${formatMoney(order.profit, order.currency)}`
                            : formatMoney(order.profit, order.currency)
                          : "—"}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text
                        as="span"
                        fontWeight="bold"
                        tone={order.margin !== null ? (order.margin < 0 ? "critical" : "success") : "subdued"}
                      >
                        {order.margin !== null ? `${order.margin}%` : "—"}
                      </Text>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                );
              })}
            </IndexTable>

            {totalPages > 1 && (
              <Box padding="300" borderBlockStartWidth="025" borderColor="border">
                <InlineStack align="center">
                  <Pagination
                    hasPrevious={detailPage > 1}
                    onPrevious={() => setDetailPage((p) => Math.max(p - 1, 1))}
                    hasNext={detailPage < totalPages}
                    onNext={() => setDetailPage((p) => Math.min(p + 1, totalPages))}
                    label={`Page ${detailPage} of ${totalPages}`}
                  />
                </InlineStack>
              </Box>
            )}
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------
export default function ShippingCost({ initialData, initialError, actionData, shop }) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState(initialError);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [selectedTab, setSelectedTab] = useState(0);
  const [orderFilter, setOrderFilter] = useState("all"); // "all" | "free" | "paid" | "profitable" | "loss"
  const [currentPage, setCurrentPage] = useState(1);
  const ordersPerPage = 10;

  const revalidator = useRevalidator();
  const submit = useSubmit();
  const navigation = useNavigation();

  const isRefreshing =
    revalidator.state === "loading" ||
    navigation.state === "submitting" ||
    navigation.state === "loading";

  // Courier Cost Configuration
  const [courierRate, setCourierRate] = useState(
    initialData?.configuredCourierCost !== null && initialData?.configuredCourierCost !== undefined
      ? String(initialData.configuredCourierCost)
      : ""
  );
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setData(initialData);
    if (initialData?.configuredCourierCost !== null && initialData?.configuredCourierCost !== undefined) {
      setCourierRate(String(initialData.configuredCourierCost));
    }
  }, [initialData]);

  useEffect(() => {
    setError(initialError);
  }, [initialError]);

  useEffect(() => {
    if (actionData?.success) {
      setSaveSuccess(true);
      setError(null);
      revalidator.revalidate();
    } else if (actionData?.message && !actionData.success) {
      setError(actionData.message);
    }
  }, [actionData, revalidator]);

  const reloadData = useCallback(() => {
    setError(null);
    setSaveSuccess(false);
    revalidator.revalidate();
  }, [revalidator]);

  const handleSaveCourierCost = () => {
    setError(null);
    setSaveSuccess(false);
    const val = Number(courierRate) || 0;
    submit(
      { _action: "save-courier-cost", shippingCost: String(val) },
      { method: "POST" }
    );
  };

  const handleQuickRate = (val) => {
    setCourierRate(String(val));
  };

  const shippingMethods = useMemo(() => {
    return data?.shippingMethods || [];
  }, [data]);

  const allOrders = useMemo(() => {
    return data?.orders || [];
  }, [data]);

  const filteredMethods = useMemo(() => {
    if (!searchQuery.trim()) {
      return shippingMethods;
    }
    const q = searchQuery.toLowerCase().trim();
    return shippingMethods.filter((m) =>
      (m.shippingMethod || "").toLowerCase().includes(q)
    );
  }, [shippingMethods, searchQuery]);

  const filteredOrders = useMemo(() => {
    let list = allOrders;

    // Apply Segment Filter
    if (orderFilter === "free") {
      list = list.filter((o) => o.isFreeShipping);
    } else if (orderFilter === "paid") {
      list = list.filter((o) => o.shippingCharged > 0);
    } else if (orderFilter === "profitable") {
      list = list.filter((o) => o.profit !== null && o.profit > 0);
    } else if (orderFilter === "loss") {
      list = list.filter((o) => o.profit !== null && o.profit < 0);
    }

    // Apply Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (o) =>
          (o.orderNumber || "").toLowerCase().includes(q) ||
          (o.customerName || "").toLowerCase().includes(q) ||
          (o.shippingMethod || "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [allOrders, orderFilter, searchQuery]);

  // Pagination for Live Orders
  const totalPages = Math.ceil(filteredOrders.length / ordersPerPage) || 1;
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * ordersPerPage;
    return filteredOrders.slice(start, start + ordersPerPage);
  }, [filteredOrders, currentPage, ordersPerPage]);

  const totalShippingCharged = useMemo(() => {
    if (data?.totalShippingCharged !== undefined) {
      return data.totalShippingCharged;
    }
    return shippingMethods.reduce((acc, m) => acc + (Number(m.shippingCharged) || 0), 0);
  }, [data, shippingMethods]);

  const totalRevenue = useMemo(() => {
    if (data?.totalRevenue !== undefined) {
      return data.totalRevenue;
    }
    return shippingMethods.reduce((acc, m) => acc + (Number(m.revenue) || 0), 0);
  }, [data, shippingMethods]);

  const totalOrders = useMemo(() => {
    if (data?.totalOrders !== undefined) {
      return data.totalOrders;
    }
    return allOrders.length || shippingMethods.reduce((acc, m) => acc + (Number(m.orders) || 0), 0);
  }, [data, allOrders, shippingMethods]);

  const overallMargin = useMemo(() => {
    return data?.overallMargin !== undefined ? data.overallMargin : null;
  }, [data]);

  const freeOrdersCount = useMemo(() => {
    return allOrders.filter((o) => o.isFreeShipping).length;
  }, [allOrders]);

  const paidOrdersCount = useMemo(() => {
    return allOrders.filter((o) => o.shippingCharged > 0).length;
  }, [allOrders]);

  const freeShippingPct = totalOrders > 0 ? (freeOrdersCount / totalOrders) * 100 : 0;

  const courierCostNum = Number(courierRate) || 0;
  const totalCourierExpense = courierCostNum > 0 ? courierCostNum * totalOrders : null;
  const netShippingBalance =
    totalCourierExpense !== null ? totalShippingCharged - totalCourierExpense : null;

  const tabs = [
    { id: "methods", content: `Shipping Rates & Methods (${shippingMethods.length})` },
    { id: "orders", content: `Live Shopify Orders Log (${allOrders.length})` },
  ];

  if (selectedMethod) {
    return (
      <ShippingCostDetailView
        method={selectedMethod}
        courierCostInput={courierRate}
        shop={shop}
        onBack={() => setSelectedMethod(null)}
        onRetry={reloadData}
        loading={isRefreshing}
      />
    );
  }

  return (
    <Page
      title="Shipping Cost & Profitability"
      subtitle="Comprehensive audit: Customer-paid shipping revenue, courier freight expenses, free shipping absorption, and true order margins"
      primaryAction={{
        content: "Refresh Real Data",
        loading: isRefreshing,
        onAction: reloadData,
      }}
      secondaryActions={[
        {
          content: "Export Orders CSV",
          onAction: () => exportOrdersToCsv(allOrders, shop),
        },
      ]}
      fullWidth
    >
      <BlockStack gap="400">
        {error && (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            <p>{error}</p>
          </Banner>
        )}

        {saveSuccess && (
          <Banner tone="success" onDismiss={() => setSaveSuccess(false)}>
            <p>Courier rate saved successfully to store cost configuration!</p>
          </Banner>
        )}

        {/* 5 Executive Summary KPI Cards */}
        <InlineGrid columns={{ xs: 1, sm: 2, md: 3, lg: 5 }} gap="300">
          <Card padding="400">
            <BlockStack gap="100">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h3" variant="headingXs" tone="subdued">
                  SHIPPING COLLECTED
                </Text>
                <Badge tone="success">Gross Revenue</Badge>
              </InlineStack>
              <Text as="p" variant="heading2xl" fontWeight="bold">
                {formatMoney(totalShippingCharged)}
              </Text>
              <Text as="span" variant="bodyXs" tone="subdued">
                {paidOrdersCount} paid · {freeOrdersCount} free orders
              </Text>
            </BlockStack>
          </Card>

          <Card padding="400">
            <BlockStack gap="100">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h3" variant="headingXs" tone="subdued">
                  ORDERS ANALYZED
                </Text>
                <Badge tone="info">100% Live</Badge>
              </InlineStack>
              <Text as="p" variant="heading2xl" fontWeight="bold">
                {totalOrders}
              </Text>
              <Text as="span" variant="bodyXs" tone="subdued">
                Direct from Shopify Admin
              </Text>
            </BlockStack>
          </Card>

          <Card padding="400">
            <BlockStack gap="100">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h3" variant="headingXs" tone="subdued">
                  TOTAL STORE GMV
                </Text>
                <Badge>Revenue</Badge>
              </InlineStack>
              <Text as="p" variant="heading2xl" fontWeight="bold">
                {formatMoney(totalRevenue)}
              </Text>
              <Text as="span" variant="bodyXs" tone="subdued">
                Gross sales across orders
              </Text>
            </BlockStack>
          </Card>

          <Card padding="400">
            <BlockStack gap="100">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h3" variant="headingXs" tone="subdued">
                  NET FREIGHT P&L
                </Text>
                <Badge
                  tone={
                    netShippingBalance !== null
                      ? netShippingBalance < 0
                        ? "critical"
                        : "success"
                      : "attention"
                  }
                >
                  {courierCostNum > 0 ? `$${courierCostNum.toFixed(2)}/order` : "Gross Only"}
                </Badge>
              </InlineStack>
              <Text
                as="p"
                variant="heading2xl"
                fontWeight="bold"
                tone={
                  netShippingBalance !== null
                    ? netShippingBalance < 0
                      ? "critical"
                      : "success"
                    : undefined
                }
              >
                {netShippingBalance !== null
                  ? netShippingBalance >= 0
                    ? `+${formatMoney(netShippingBalance)}`
                    : formatMoney(netShippingBalance)
                  : formatMoney(totalShippingCharged)}
              </Text>
              <Text as="span" variant="bodyXs" tone="subdued">
                {netShippingBalance !== null
                  ? `Collected minus courier bill`
                  : `Set courier cost below`}
              </Text>
            </BlockStack>
          </Card>

          <Card padding="400">
            <BlockStack gap="100">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h3" variant="headingXs" tone="subdued">
                  REAL NET MARGIN
                </Text>
                <Badge
                  tone={
                    overallMargin !== null
                      ? overallMargin < 0
                        ? "critical"
                        : "success"
                      : undefined
                  }
                >
                  {overallMargin !== null ? `${overallMargin}%` : "—"}
                </Badge>
              </InlineStack>
              <Text
                as="p"
                variant="heading2xl"
                fontWeight="bold"
                tone={
                  overallMargin !== null
                    ? overallMargin < 0
                      ? "critical"
                      : "success"
                    : undefined
                }
              >
                {overallMargin !== null ? `${overallMargin}%` : "—"}
              </Text>
              <Text as="span" variant="bodyXs" tone="subdued">
                From {data?.ordersWithProfitCount ?? 0} orders with COGS
              </Text>
            </BlockStack>
          </Card>
        </InlineGrid>

        {/* Interactive Carrier Courier Rate Card */}
        <Card padding="400">
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="050">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h3" variant="headingSm" fontWeight="bold">
                    Merchant Courier Cost (Carrier Rate)
                  </Text>
                  <Badge tone={courierCostNum > 0 ? "success" : "attention"}>
                    {courierCostNum > 0 ? `Active: $${courierCostNum.toFixed(2)}/order` : "Not Configured"}
                  </Badge>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  Shopify records customer checkout payments, but not your postal/courier invoices (FedEx, USPS, DHL, Delhivery, etc.). Enter your average carrier cost per shipment to audit net shipping recovery and true order profitability.
                </Text>
              </BlockStack>
            </InlineStack>

            <Divider />

            <InlineGrid columns={{ xs: 1, md: "2fr 1fr" }} gap="400">
              {/* Left Column: Input & Presets */}
              <BlockStack gap="250">
                <InlineStack gap="300" blockAlign="end" wrap>
                  <Box minWidth="220px">
                    <TextField
                      label="Average Courier Cost Per Order ($)"
                      type="number"
                      placeholder="e.g. 5.00"
                      value={courierRate}
                      onChange={setCourierRate}
                      autoComplete="off"
                      helpText="Applies to all store order profitability models"
                    />
                  </Box>
                  <Button variant="primary" loading={isRefreshing} onClick={handleSaveCourierCost}>
                    Save Courier Rate
                  </Button>
                </InlineStack>

                <InlineStack gap="150" blockAlign="center">
                  <Text as="span" variant="bodyXs" tone="subdued">
                    Quick presets:
                  </Text>
                  <ButtonGroup variant="segmented">
                    {[3, 5, 8, 10, 15, 20].map((presetVal) => {
                      const isActive = courierCostNum === presetVal;
                      return (
                        <Button
                          key={presetVal}
                          size="micro"
                          variant={isActive ? "primary" : "secondary"}
                          onClick={() => handleQuickRate(presetVal)}
                        >
                          ${presetVal}
                        </Button>
                      );
                    })}
                  </ButtonGroup>
                </InlineStack>
              </BlockStack>

              {/* Right Column: Dynamic Impact Calculator */}
              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="100">
                  <Text as="h4" variant="headingXs" fontWeight="bold">
                    Freight Recovery Simulation
                  </Text>
                  <Divider />
                  <CompactInfoRow
                    label={`Est. Carrier Bill (${totalOrders} orders)`}
                    value={totalCourierExpense !== null ? formatMoney(totalCourierExpense) : "Set rate"}
                    isBold
                  />
                  <CompactInfoRow
                    label="Customer Shipping Collected"
                    value={formatMoney(totalShippingCharged)}
                  />
                  <Divider />
                  <CompactInfoRow
                    label="Net Freight Balance"
                    value={
                      netShippingBalance !== null
                        ? netShippingBalance >= 0
                          ? `+${formatMoney(netShippingBalance)}`
                          : formatMoney(netShippingBalance)
                        : "—"
                    }
                    tone={
                      netShippingBalance !== null
                        ? netShippingBalance < 0
                          ? "critical"
                          : "success"
                        : undefined
                    }
                    isBold
                  />
                  {netShippingBalance !== null && (
                    <Text as="span" variant="bodyXs" tone={netShippingBalance < 0 ? "critical" : "success"}>
                      {netShippingBalance < 0
                        ? `⚠️ Store absorbs $${(Math.abs(netShippingBalance) / (totalOrders || 1)).toFixed(2)}/order in carrier freight fees.`
                        : `✅ Store earns $${(netShippingBalance / (totalOrders || 1)).toFixed(2)}/order net shipping profit.`}
                    </Text>
                  )}
                </BlockStack>
              </Box>
            </InlineGrid>
          </BlockStack>
        </Card>

        {/* Tabs for Methods vs Orders */}
        <Card padding="0">
          <Tabs tabs={tabs} selected={selectedTab} onSelect={(idx) => {
            setSelectedTab(idx);
            setCurrentPage(1);
          }}>
            {/* Filter & Search Header */}
            <Box padding="300" borderBlockEndWidth="025" borderColor="border">
              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
                  <Box minWidth="280px">
                    <TextField
                      placeholder={
                        selectedTab === 0
                          ? "Search shipping methods..."
                          : "Search order #, customer, or shipping method..."
                      }
                      value={searchQuery}
                      onChange={(val) => {
                        setSearchQuery(val);
                        setCurrentPage(1);
                      }}
                      clearButton
                      onClearButtonClick={() => {
                        setSearchQuery("");
                        setCurrentPage(1);
                      }}
                      autoComplete="off"
                    />
                  </Box>

                  {/* Filter segmented buttons on Orders Tab */}
                  {selectedTab === 1 && (
                    <ButtonGroup variant="segmented">
                      <Button
                        size="slim"
                        pressed={orderFilter === "all"}
                        onClick={() => {
                          setOrderFilter("all");
                          setCurrentPage(1);
                        }}
                      >
                        All ({allOrders.length})
                      </Button>
                      <Button
                        size="slim"
                        pressed={orderFilter === "free"}
                        onClick={() => {
                          setOrderFilter("free");
                          setCurrentPage(1);
                        }}
                      >
                        Free Shipping ({freeOrdersCount})
                      </Button>
                      <Button
                        size="slim"
                        pressed={orderFilter === "paid"}
                        onClick={() => {
                          setOrderFilter("paid");
                          setCurrentPage(1);
                        }}
                      >
                        Paid Shipping ({paidOrdersCount})
                      </Button>
                      <Button
                        size="slim"
                        pressed={orderFilter === "profitable"}
                        onClick={() => {
                          setOrderFilter("profitable");
                          setCurrentPage(1);
                        }}
                      >
                        Profitable
                      </Button>
                      <Button
                        size="slim"
                        pressed={orderFilter === "loss"}
                        onClick={() => {
                          setOrderFilter("loss");
                          setCurrentPage(1);
                        }}
                      >
                        Loss Making
                      </Button>
                    </ButtonGroup>
                  )}

                  <Text as="span" variant="bodySm" tone="subdued">
                    {selectedTab === 0
                      ? `Showing ${filteredMethods.length} of ${shippingMethods.length} methods`
                      : `Showing ${paginatedOrders.length} of ${filteredOrders.length} orders`}
                  </Text>
                </InlineStack>
              </BlockStack>
            </Box>

            {/* TAB 0: Shipping Methods Table */}
            {selectedTab === 0 && (
              <IndexTable
                resourceName={{ singular: "shipping method", plural: "shipping methods" }}
                itemCount={filteredMethods.length}
                headings={[
                  { title: "Shipping Method" },
                  { title: "Total Orders" },
                  { title: "Free vs Paid Split" },
                  { title: "Order Revenue (GMV)" },
                  { title: "Customer Shipping Paid" },
                  { title: "Est. Courier Cost" },
                  { title: "Net Freight Recovery" },
                  { title: "Order Margin" },
                  { title: "Action" },
                ]}
                selectable={false}
                emptyState={
                  <Box padding="400">
                    <Text as="p" tone="subdued">
                      No shipping methods found.
                    </Text>
                  </Box>
                }
              >
                {filteredMethods.map((method, index) => {
                  const hasCharged = method.shippingCharged > 0;
                  const freeCount = method.freeShippingOrders ?? 0;
                  const paidCount = method.paidShippingOrders ?? 0;
                  const estCourierMethodExpense =
                    courierCostNum > 0 ? courierCostNum * method.orders : null;
                  const methodNetFreight =
                    estCourierMethodExpense !== null
                      ? method.shippingCharged - estCourierMethodExpense
                      : null;

                  return (
                    <IndexTable.Row id={method.shippingMethod} key={method.shippingMethod} position={index}>
                      <IndexTable.Cell>
                        <BlockStack gap="050">
                          <Text as="span" fontWeight="bold">
                            {method.shippingMethod}
                          </Text>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {method.orders} {method.orders === 1 ? "order" : "orders"} (
                            {((method.orders / (totalOrders || 1)) * 100).toFixed(1)}% of store)
                          </Text>
                        </BlockStack>
                      </IndexTable.Cell>

                      <IndexTable.Cell>
                        <Text as="span" fontWeight="medium">
                          {method.orders}
                        </Text>
                      </IndexTable.Cell>

                      <IndexTable.Cell>
                        <InlineStack gap="100">
                          {paidCount > 0 && <Badge tone="success">{paidCount} Paid</Badge>}
                          <Badge tone="info">{freeCount} Free</Badge>
                        </InlineStack>
                      </IndexTable.Cell>

                      <IndexTable.Cell>
                        <Text as="span" fontWeight="medium">
                          {formatMoney(method.revenue)}
                        </Text>
                      </IndexTable.Cell>

                      <IndexTable.Cell>
                        <Text
                          as="span"
                          fontWeight={hasCharged ? "bold" : "regular"}
                          tone={hasCharged ? "success" : "subdued"}
                        >
                          {hasCharged ? formatMoney(method.shippingCharged) : "Free ($0.00)"}
                        </Text>
                      </IndexTable.Cell>

                      <IndexTable.Cell>
                        <Text as="span" tone="subdued">
                          {estCourierMethodExpense !== null ? formatMoney(estCourierMethodExpense) : "—"}
                        </Text>
                      </IndexTable.Cell>

                      <IndexTable.Cell>
                        <Text
                          as="span"
                          fontWeight={methodNetFreight !== null ? "bold" : "regular"}
                          tone={
                            methodNetFreight !== null
                              ? methodNetFreight < 0
                                ? "critical"
                                : "success"
                              : "subdued"
                          }
                        >
                          {methodNetFreight !== null
                            ? methodNetFreight >= 0
                              ? `+${formatMoney(methodNetFreight)}`
                              : formatMoney(methodNetFreight)
                            : "—"}
                        </Text>
                      </IndexTable.Cell>

                      <IndexTable.Cell>
                        <Text
                          as="span"
                          fontWeight={method.margin !== null ? "bold" : "regular"}
                          tone={
                            method.margin !== null
                              ? method.margin < 0
                                ? "critical"
                                : "success"
                              : "subdued"
                          }
                        >
                          {method.margin !== null ? `${method.margin}%` : "—"}
                        </Text>
                      </IndexTable.Cell>

                      <IndexTable.Cell>
                        <Button size="slim" onClick={() => setSelectedMethod(method)}>
                          Inspect Rate
                        </Button>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  );
                })}
              </IndexTable>
            )}

            {/* TAB 1: Live Shopify Orders Log */}
            {selectedTab === 1 && (
              <>
                <IndexTable
                  resourceName={{ singular: "order", plural: "orders" }}
                  itemCount={paginatedOrders.length}
                  headings={[
                    { title: "Order #" },
                    { title: "Date" },
                    { title: "Customer" },
                    { title: "Shipping Method" },
                    { title: "Customer Paid" },
                    { title: "Order Revenue" },
                    { title: "Courier Cost" },
                    { title: "Product Profit" },
                    { title: "Margin" },
                  ]}
                  selectable={false}
                  emptyState={
                    <Box padding="400">
                      <Text as="p" tone="subdued">
                        No orders found matching the filter or search query.
                      </Text>
                    </Box>
                  }
                >
                  {paginatedOrders.map((order, index) => {
                    const adminUrl = getShopifyOrderAdminUrl(order.id, shop);
                    const orderCourierCost =
                      order.merchantCost !== null && order.merchantCost !== undefined
                        ? order.merchantCost
                        : courierCostNum > 0
                        ? courierCostNum
                        : null;

                    return (
                      <IndexTable.Row
                        id={String(order.id || index)}
                        key={String(order.id || index)}
                        position={index}
                      >
                        <IndexTable.Cell>
                          {adminUrl ? (
                            <Tooltip content="Open in Shopify Admin">
                              <Link url={adminUrl} target="_blank" removeUnderline monochrome>
                                <Text as="span" fontWeight="bold" tone="info">
                                  {order.orderNumber} ↗
                                </Text>
                              </Link>
                            </Tooltip>
                          ) : (
                            <Text as="span" fontWeight="bold">
                              {order.orderNumber}
                            </Text>
                          )}
                        </IndexTable.Cell>

                        <IndexTable.Cell>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {formatDate(order.createdAt)}
                          </Text>
                        </IndexTable.Cell>

                        <IndexTable.Cell>
                          <Text as="span">{order.customerName}</Text>
                        </IndexTable.Cell>

                        <IndexTable.Cell>
                          <Badge size="small">{order.shippingMethod || "Standard"}</Badge>
                        </IndexTable.Cell>

                        <IndexTable.Cell>
                          <Badge tone={order.shippingCharged > 0 ? "success" : "info"}>
                            {order.shippingCharged > 0
                              ? `Paid ${formatMoney(order.shippingCharged, order.currency)}`
                              : "Free ($0.00)"}
                          </Badge>
                        </IndexTable.Cell>

                        <IndexTable.Cell>
                          <Text as="span" fontWeight="medium">
                            {formatMoney(order.revenue, order.currency)}
                          </Text>
                        </IndexTable.Cell>

                        <IndexTable.Cell>
                          <Text as="span" tone="subdued">
                            {orderCourierCost !== null
                              ? formatMoney(orderCourierCost, order.currency)
                              : "—"}
                          </Text>
                        </IndexTable.Cell>

                        <IndexTable.Cell>
                          <Text
                            as="span"
                            fontWeight="bold"
                            tone={
                              order.profit !== null
                                ? order.profit < 0
                                  ? "critical"
                                  : "success"
                                : "subdued"
                            }
                          >
                            {order.profit !== null
                              ? order.profit >= 0
                                ? `+${formatMoney(order.profit, order.currency)}`
                                : formatMoney(order.profit, order.currency)
                              : "—"}
                          </Text>
                        </IndexTable.Cell>

                        <IndexTable.Cell>
                          <Text
                            as="span"
                            fontWeight="bold"
                            tone={
                              order.margin !== null
                                ? order.margin < 0
                                  ? "critical"
                                  : "success"
                                : "subdued"
                            }
                          >
                            {order.margin !== null ? `${order.margin}%` : "—"}
                          </Text>
                        </IndexTable.Cell>
                      </IndexTable.Row>
                    );
                  })}
                </IndexTable>

                {totalPages > 1 && (
                  <Box padding="300" borderBlockStartWidth="025" borderColor="border">
                    <InlineStack align="center">
                      <Pagination
                        hasPrevious={currentPage > 1}
                        onPrevious={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                        hasNext={currentPage < totalPages}
                        onNext={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                        label={`Page ${currentPage} of ${totalPages} (${filteredOrders.length} total orders)`}
                      />
                    </InlineStack>
                  </Box>
                )}
              </>
            )}
          </Tabs>
        </Card>
      </BlockStack>
    </Page>
  );
}
