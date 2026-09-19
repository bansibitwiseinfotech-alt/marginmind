/* eslint-disable react/prop-types */
import { useState, useMemo, useEffect, useCallback } from "react";
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
  Divider,
} from "@shopify/polaris";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatMoney(value, currency) {
  if (value === null || value === undefined || !currency) {
    return "—";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
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
// Dedicated Full-Page Detail View (Tight, Compact & Perfect Polaris Layout)
// ---------------------------------------------------------------------------
function DiscountImpactDetailView({ discount, onBack, onRetry, loading, currency }) {
  if (!discount) {
    return (
      <Page
        title="Discount Impact Details"
        backAction={{ content: "Discounts", onAction: onBack }}
        fullWidth
      >
        <Card padding="400">
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              Discount not found
            </Text>
            <Button onClick={onBack}>Back to Discounts</Button>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  const status =
    discount.profitAfterDiscount !== null
      ? discount.profitAfterDiscount < 0
        ? "LOSS"
        : discount.profitAfterDiscount === 0
        ? "BREAK-EVEN"
        : "PROFITABLE"
      : "NO COST DATA";

  const statusTone =
    status === "PROFITABLE"
      ? "success"
      : status === "LOSS"
      ? "warning"
      : status === "BREAK-EVEN"
      ? "info"
      : undefined;

  const profitTone = undefined;
  const marginTone = undefined;

  return (
    <Page
      title={discount.discountCode}
      subtitle={`Type: ${discount.discountType || "Discount"} · ${discount.orders} affected ${discount.orders === 1 ? "order" : "orders"}`}
      backAction={{ content: "Discounts", onAction: onBack }}
      primaryAction={{
        content: "Refresh Impact",
        loading: loading,
        onAction: onRetry,
      }}
      fullWidth
    >
      <BlockStack gap="300">
        {/* 4 Compact Metric Cards (Clean Black & Standard Typography) */}
        <Card padding="300">
          <InlineGrid columns={{ xs: 2, sm: 4 }} gap="300">
            <Box padding="200" background="bg-surface-secondary" borderRadius="200">
              <BlockStack gap="050">
                <Text variant="headingXs" tone="subdued" as="span">
                  REVENUE
                </Text>
                <Text variant="headingLg" fontWeight="bold" as="p">
                  {formatMoney(discount.revenue, currency)}
                </Text>
              </BlockStack>
            </Box>

            <Box padding="200" background="bg-surface-secondary" borderRadius="200">
              <BlockStack gap="050">
                <Text variant="headingXs" tone="subdued" as="span">
                  DISCOUNT AMOUNT
                </Text>
                <Text variant="headingLg" fontWeight="bold" as="p">
                  {formatMoney(discount.discountAmount, currency)}
                </Text>
              </BlockStack>
            </Box>

            <Box padding="200" background="bg-surface-secondary" borderRadius="200">
              <BlockStack gap="050">
                <Text variant="headingXs" tone="subdued" as="span">
                  TRUE PROFIT
                </Text>
                <Text variant="headingLg" fontWeight="bold" tone={profitTone} as="p">
                  {discount.profitAfterDiscount !== null
                    ? (discount.profitAfterDiscount >= 0
                        ? `+${formatMoney(discount.profitAfterDiscount, currency)}`
                        : formatMoney(discount.profitAfterDiscount, currency))
                    : "—"}
                </Text>
              </BlockStack>
            </Box>

            <Box padding="200" background="bg-surface-secondary" borderRadius="200">
              <BlockStack gap="050">
                <Text variant="headingXs" tone="subdued" as="span">
                  PROFIT MARGIN
                </Text>
                <Text variant="headingLg" fontWeight="bold" tone={marginTone} as="p">
                  {discount.marginAfterDiscount !== null
                    ? `${discount.marginAfterDiscount}%`
                    : "—"}
                </Text>
              </BlockStack>
            </Box>
          </InlineGrid>
        </Card>

        {/* 2-Column Side-by-Side Section */}
        <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
          {/* Left Card: Discount Information */}
          <Card padding="300">
            <BlockStack gap="150">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingSm" fontWeight="bold">
                  Discount Details
                </Text>
                <Badge tone={statusTone}>{status}</Badge>
              </InlineStack>
              <Divider />
              <CompactInfoRow label="Discount Code / Title" value={discount.discountCode} isBold />
              <CompactInfoRow label="Discount Type" value={discount.discountType || "Code"} />
              <CompactInfoRow label="Affected Orders" value={String(discount.orders)} />
              <CompactInfoRow label="Gross Discount Given" value={formatMoney(discount.discountAmount, currency)} isBold />
              <CompactInfoRow
                label="Profit Impact"
                value={discount.profitImpact !== null ? `${discount.profitImpact >= 0 ? "+" : ""}${formatMoney(discount.profitImpact, currency)}` : "—"}
                isBold
              />
              <CompactInfoRow
                label="Margin Impact"
                value={discount.marginImpact !== null ? `${discount.marginImpact >= 0 ? "+" : ""}${discount.marginImpact}%` : "—"}
              />
            </BlockStack>
          </Card>

          {/* Right Card: Before vs After Comparison */}
          <Card padding="300">
            <BlockStack gap="150">
              <Text as="h2" variant="headingSm" fontWeight="bold">
                Before vs. After Comparison
              </Text>
              <Divider />
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e1e3e5", color: "#6d7175" }}>
                      <th style={{ textAlign: "left", padding: "6px 4px" }}>Metric</th>
                      <th style={{ textAlign: "right", padding: "6px 4px" }}>Before</th>
                      <th style={{ textAlign: "right", padding: "6px 4px" }}>After</th>
                      <th style={{ textAlign: "right", padding: "6px 4px" }}>Impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: "1px solid #f1f2f3" }}>
                      <td style={{ padding: "8px 4px", fontWeight: 600 }}>Revenue</td>
                      <td style={{ textAlign: "right", padding: "8px 4px" }}>{formatMoney(discount.revenueBeforeDiscount, currency)}</td>
                      <td style={{ textAlign: "right", padding: "8px 4px" }}>{formatMoney(discount.revenue, currency)}</td>
                      <td style={{ textAlign: "right", padding: "8px 4px", fontWeight: 600 }}>−{formatMoney(discount.discountAmount, currency)}</td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid #f1f2f3" }}>
                      <td style={{ padding: "8px 4px", fontWeight: 600 }}>COGS</td>
                      <td style={{ textAlign: "right", padding: "8px 4px" }}>{discount.productCost !== null ? formatMoney(discount.productCost, currency) : "—"}</td>
                      <td style={{ textAlign: "right", padding: "8px 4px" }}>{discount.productCost !== null ? formatMoney(discount.productCost, currency) : "—"}</td>
                      <td style={{ textAlign: "right", padding: "8px 4px" }}>No change</td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid #f1f2f3" }}>
                      <td style={{ padding: "8px 4px", fontWeight: 600 }}>Profit</td>
                      <td style={{ textAlign: "right", padding: "8px 4px" }}>{discount.profitBeforeDiscount !== null ? formatMoney(discount.profitBeforeDiscount, currency) : "—"}</td>
                      <td style={{ textAlign: "right", padding: "8px 4px", fontWeight: "bold" }}>
                        {discount.profitAfterDiscount !== null ? formatMoney(discount.profitAfterDiscount, currency) : "—"}
                      </td>
                      <td style={{ textAlign: "right", padding: "8px 4px", fontWeight: "bold" }}>
                        {discount.profitImpact !== null ? `${discount.profitImpact >= 0 ? "+" : ""}${formatMoney(discount.profitImpact, currency)}` : "—"}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: "8px 4px", fontWeight: 600 }}>Margin</td>
                      <td style={{ textAlign: "right", padding: "8px 4px" }}>{discount.marginBeforeDiscount !== null ? `${discount.marginBeforeDiscount}%` : "—"}</td>
                      <td style={{ textAlign: "right", padding: "8px 4px", fontWeight: "bold" }}>{discount.marginAfterDiscount !== null ? `${discount.marginAfterDiscount}%` : "—"}</td>
                      <td style={{ textAlign: "right", padding: "8px 4px", fontWeight: "bold" }}>
                        {discount.marginImpact !== null ? `${discount.marginImpact >= 0 ? "+" : ""}${discount.marginImpact}%` : "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </BlockStack>
          </Card>
        </InlineGrid>

        {/* Affected Orders Table */}
        <Card padding="0">
          <Box padding="300">
            <Text as="h2" variant="headingSm" fontWeight="bold">
              Affected Orders ({discount.affectedOrders?.length || 0})
            </Text>
          </Box>
          <Divider />
          <IndexTable
            resourceName={{ singular: "order", plural: "orders" }}
            itemCount={discount.affectedOrders?.length || 0}
            headings={[
              { title: "Order" },
              { title: "Customer" },
              { title: "Date" },
              { title: "Net Revenue" },
              { title: "Discount" },
              { title: "True Profit" },
              { title: "Margin" },
            ]}
            selectable={false}
          >
            {(discount.affectedOrders || []).map((ord, idx) => (
              <IndexTable.Row id={ord.id} key={ord.id} position={idx}>
                <IndexTable.Cell>
                  <Text as="span" fontWeight="semibold">
                    {ord.orderNumber}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span">{ord.customer}</Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" tone="subdued">
                    {formatDate(ord.createdAt)}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span">{formatMoney(ord.revenue, currency)}</Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" fontWeight="bold">
                    {formatMoney(ord.discount, currency)}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text
                    as="span"
                    fontWeight="bold"
                    tone={ord.profit === null ? "subdued" : undefined}
                  >
                    {ord.profit !== null ? formatMoney(ord.profit, currency) : "—"}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span">
                    {ord.margin !== null ? `${ord.margin}%` : "—"}
                  </Text>
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        </Card>
      </BlockStack>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component (Tight, Clean & Matching Order Profitability Spacing)
// ---------------------------------------------------------------------------
export default function DiscountImpact({ initialData = null, initialError = null }) {
  const [discounts, setDiscounts] = useState(initialData?.discounts || []);
  const [currency, setCurrency] = useState(initialData?.currency || null);
  const [profitImpactAvailable, setProfitImpactAvailable] = useState(
    initialData?.profitImpactAvailable !== false
  );
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState(initialError || "");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedDiscount, setSelectedDiscount] = useState(null);

  const fetchDiscountData = useCallback(async (searchQuery = "") => {
    try {
      setLoading(true);
      setError("");

      const query = searchQuery.trim() ? `&search=${encodeURIComponent(searchQuery.trim())}` : "";
      const response = await fetch(`/api/discount-impact?first=50${query}`);
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to load discount data");
      }

      setDiscounts(result.data?.discounts || []);
      setCurrency(result.data?.currency || null);
      setProfitImpactAvailable(result.data?.profitImpactAvailable !== false);
    } catch (err) {
      console.error("[MarginMind] Discount impact fetch error:", err);
      setError(err.message || "Failed to load discount data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialData) {
      fetchDiscountData("");
    }
  }, [initialData, fetchDiscountData]);

  function handleSearch() {
    setSearch(searchInput);
    fetchDiscountData(searchInput);
  }

  function handleClearSearch() {
    setSearchInput("");
    setSearch("");
    fetchDiscountData("");
  }

  function handleRefresh() {
    fetchDiscountData(search);
  }

  const filteredDiscounts = useMemo(() => {
    if (!search.trim()) return discounts;
    const q = search.toLowerCase().trim();
    return discounts.filter((d) =>
      String(d.discountCode || "").toLowerCase().includes(q)
    );
  }, [discounts, search]);

  const totalDiscountCodes = filteredDiscounts.length;
  const totalOrdersWithDiscounts = filteredDiscounts.reduce(
    (acc, d) => acc + Number(d.orders || 0),
    0
  );
  const totalDiscountAmount = filteredDiscounts.reduce(
    (acc, d) => acc + Number(d.discountAmount || 0),
    0
  );
  const totalRevenue = filteredDiscounts.reduce(
    (acc, d) => acc + Number(d.revenue || 0),
    0
  );
  const totalProfitImpact = profitImpactAvailable && filteredDiscounts.every(
    (discount) => discount.costDataStatus !== "INCOMPLETE"
  )
    ? filteredDiscounts.reduce((acc, d) => acc + Number(d.profitImpact), 0)
    : null;

  if (selectedDiscount) {
    return (
      <DiscountImpactDetailView
        discount={selectedDiscount}
        onBack={() => setSelectedDiscount(null)}
        onRetry={handleRefresh}
        loading={loading}
        currency={currency}
      />
    );
  }

  return (
    <Page
      title="Discount Impact Analysis"
      subtitle="See discount performance, revenue, true profit, and margin impact across your store."
      fullWidth
    >
      <BlockStack gap="300">
        {/* Error message */}
        {error && (
          <Card padding="300">
            <Text as="p">
              {error}
            </Text>
          </Card>
        )}

        {/* Search Toolbar Card (Compact & Tight) */}
        <Card padding="300">
          <InlineStack align="space-between" blockAlign="center" wrap={false}>
            <BlockStack gap="050">
              <Text as="h2" variant="headingSm" fontWeight="bold">
                Shopify Discount Data
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Search and review live discount impact and profitability from your store.
              </Text>
            </BlockStack>

            <InlineStack gap="150" blockAlign="center" wrap={false}>
              <div style={{ minWidth: "240px" }}>
                <TextField
                  label="Search by discount code"
                  labelHidden
                  placeholder="Search discount code..."
                  value={searchInput}
                  onChange={setSearchInput}
                  autoComplete="off"
                />
              </div>
              <Button variant="primary" onClick={handleSearch}>
                Search
              </Button>
              {search && (
                <Button onClick={handleClearSearch}>Clear</Button>
              )}
              <Button onClick={handleRefresh} loading={loading}>
                Refresh
              </Button>
            </InlineStack>
          </InlineStack>
        </Card>

        {/* 5 Summary KPI Cards (Compact & Tight) */}
        <InlineGrid columns={{ xs: 1, sm: 2, md: 3, lg: 5 }} gap="300">
          <Card padding="300">
            <BlockStack gap="050">
              <Text as="h3" variant="headingXs" tone="subdued">
                TOTAL DISCOUNTS
              </Text>
              <Text as="p" variant="headingXl" fontWeight="bold">
                {totalDiscountCodes || "—"}
              </Text>
              <Text as="span" variant="bodyXs" tone="subdued">
                Unique active discounts
              </Text>
            </BlockStack>
          </Card>

          <Card padding="300">
            <BlockStack gap="050">
              <Text as="h3" variant="headingXs" tone="subdued">
                TOTAL ORDERS
              </Text>
              <Text as="p" variant="headingXl" fontWeight="bold">
                {totalOrdersWithDiscounts}
              </Text>
              <Text as="span" variant="bodyXs" tone="subdued">
                Orders utilizing discounts
              </Text>
            </BlockStack>
          </Card>

          <Card padding="300">
            <BlockStack gap="050">
              <Text as="h3" variant="headingXs" tone="subdued">
                TOTAL DISCOUNT AMOUNT
              </Text>
              <Text as="p" variant="headingXl" fontWeight="bold">
                {formatMoney(totalDiscountAmount, currency)}
              </Text>
              <Text as="span" variant="bodyXs" tone="subdued">
                Gross discounts given
              </Text>
            </BlockStack>
          </Card>

          <Card padding="300">
            <BlockStack gap="050">
              <Text as="h3" variant="headingXs" tone="subdued">
                NET REVENUE
              </Text>
              <Text as="p" variant="headingXl" fontWeight="bold">
                {formatMoney(totalRevenue, currency)}
              </Text>
              <Text as="span" variant="bodyXs" tone="subdued">
                After discounts & refunds
              </Text>
            </BlockStack>
          </Card>

          <Card padding="300">
            <BlockStack gap="050">
              <Text as="h3" variant="headingXs" tone="subdued">
                PROFIT IMPACT
              </Text>
              <Text
                as="p"
                variant="headingXl"
                fontWeight="bold"
              >
                {totalProfitImpact === null
                  ? "Not available"
                  : totalProfitImpact >= 0
                    ? `+${formatMoney(totalProfitImpact, currency)}`
                    : formatMoney(totalProfitImpact, currency)}
              </Text>
              <Text as="span" variant="bodyXs" tone="subdued">
                Bottom-line profitability shift
              </Text>
            </BlockStack>
          </Card>
        </InlineGrid>

        {/* Main Discount Table */}
        <Card padding="0">
          <IndexTable
            resourceName={{ singular: "discount", plural: "discounts" }}
            itemCount={filteredDiscounts.length}
            headings={[
              { title: "Discount" },
              { title: "Type" },
              { title: "Orders" },
              { title: "Revenue" },
              { title: "Product Cost" },
              { title: "Discount Amount" },
              { title: "Profit Before" },
              { title: "True Profit" },
              { title: "Margin" },
              { title: "Action" },
            ]}
            selectable={false}
            emptyState={
              <Box padding="300">
                <Text as="p" tone="subdued">
                  No discounts found.
                </Text>
              </Box>
            }
          >
            {filteredDiscounts.map((discount, index) => {
              const profitTone = undefined;
              const marginTone = undefined;

              return (
                <IndexTable.Row id={discount.discountCode} key={discount.discountCode} position={index}>
                  <IndexTable.Cell>
                    <BlockStack gap="050">
                      <Text as="span" fontWeight="semibold">
                        {discount.discountCode}
                      </Text>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {discount.orders} {discount.orders === 1 ? "order" : "orders"}
                      </Text>
                    </BlockStack>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <Text as="span" variant="bodySm">
                      {discount.discountType || "Code"}
                    </Text>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <Text as="span">{discount.orders}</Text>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <Text as="span">{formatMoney(discount.revenue, currency)}</Text>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <Text as="span">
                      {discount.productCost !== null ? formatMoney(discount.productCost, currency) : "—"}
                    </Text>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <Text as="span" fontWeight="bold">
                      {formatMoney(discount.discountAmount, currency)}
                    </Text>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <Text as="span">
                      {discount.profitBeforeDiscount !== null ? formatMoney(discount.profitBeforeDiscount, currency) : "—"}
                    </Text>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <Text as="span" fontWeight="bold" tone={profitTone}>
                      {discount.profitAfterDiscount !== null
                        ? (discount.profitAfterDiscount > 0 ? `+${formatMoney(discount.profitAfterDiscount, currency)}` : formatMoney(discount.profitAfterDiscount, currency))
                        : "—"}
                    </Text>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <Text as="span" fontWeight="bold" tone={marginTone}>
                      {discount.marginAfterDiscount !== null ? `${discount.marginAfterDiscount}%` : "—"}
                    </Text>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <Button size="slim" onClick={() => setSelectedDiscount(discount)}>
                      View Details
                    </Button>
                  </IndexTable.Cell>
                </IndexTable.Row>
              );
            })}
          </IndexTable>
        </Card>
      </BlockStack>
    </Page>
  );
}