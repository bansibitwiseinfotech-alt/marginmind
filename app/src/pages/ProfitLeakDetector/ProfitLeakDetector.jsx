/* eslint-disable react/prop-types */
import { useState, useEffect, useCallback, useMemo } from "react";
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
  Select,
  Pagination,
  Modal,
  Spinner,
  EmptyState,
  Tooltip,
  ProgressBar,
  Thumbnail,
  Link,
} from "@shopify/polaris";
import { RefreshIcon, SearchIcon, ExportIcon, ImageIcon } from "@shopify/polaris-icons";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatMoney(value, currency = "USD") {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(value) {
  if (!value) return "—";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function severityTone(severity) {
  switch (severity) {
    case "CRITICAL": return "critical";
    case "WARNING": return "warning";
    case "INFO": return "info";
    default: return undefined;
  }
}

function statusTone(status) {
  switch (status) {
    case "OPEN": return "warning";
    case "RESOLVED": return "success";
    case "IGNORED": return undefined;
    default: return undefined;
  }
}

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------
function exportLeaksToCsv(leaks, currency) {
  if (!leaks || leaks.length === 0) return;
  const headers = [
    "Leak Type", "Title", "Affected Area", "Resource Name",
    "Estimated Loss", "Currency", "Severity", "Status",
    "Impact Type", "Confidence", "Detection Rule", "Detected At",
  ];
  const rows = leaks.map((l) => [
    `"${l.leakType || ""}"`,
    `"${(l.title || "").replace(/"/g, '""')}"`,
    `"${(l.affectedArea || "").replace(/"/g, '""')}"`,
    `"${(l.resourceName || "").replace(/"/g, '""')}"`,
    l.profitImpact ?? "",
    l.impactCurrency || currency,
    l.severity || "",
    l.status || "",
    l.impactType || "",
    l.confidence || "",
    `"${(l.detectionRule || "").replace(/"/g, '""')}"`,
    l.detectedAt ? new Date(l.detectedAt).toISOString() : "",
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `profit-leaks-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Summary Card
// ---------------------------------------------------------------------------
function SummaryCard({ title, value, tone, subtitle, delta }) {
  return (
    <Card padding="400">
      <BlockStack gap="100">
        <Text variant="bodyMd" tone="subdued" as="p">{title}</Text>
        <Text variant="headingXl" fontWeight="bold" tone={tone} as="p">
          {value}
        </Text>
        {delta !== undefined && (
          <Text variant="bodySm" tone={delta > 0 ? "critical" : "success"} as="p">
            {delta > 0 ? `▲ ${delta} critical` : "✓ All resolved"}
          </Text>
        )}
        {subtitle && (
          <Text variant="bodySm" tone="subdued" as="p">{subtitle}</Text>
        )}
      </BlockStack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Data Status Banner
// ---------------------------------------------------------------------------
function DataStatusBanner({ dataStatus }) {
  if (!dataStatus) return null;

  const { syncStatus, lastSyncedAt, productsSynced, costConfiguration } = dataStatus;

  const syncTone =
    syncStatus === "completed" ? "success" :
    syncStatus === "running" ? "info" :
    syncStatus === "failed" ? "critical" : undefined;

  const missingCostConfig = !costConfiguration?.enabled;

  return (
    <Card padding="300">
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingSm" fontWeight="bold">Store Data Status</Text>
          <InlineStack gap="150">
            <Badge tone={syncTone}>{syncStatus || "idle"}</Badge>
            {missingCostConfig && (
              <Badge tone="attention">Cost Config Missing</Badge>
            )}
          </InlineStack>
        </InlineStack>
        <Divider />
        <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
          <BlockStack gap="050">
            <Text variant="headingXs" tone="subdued" as="span">LAST SYNCED</Text>
            <Text variant="bodyMd" fontWeight="semibold" as="p">
              {formatRelativeTime(lastSyncedAt)}
            </Text>
            {lastSyncedAt && (
              <Text variant="bodySm" tone="subdued" as="p">{formatDate(lastSyncedAt)}</Text>
            )}
          </BlockStack>
          <BlockStack gap="050">
            <Text variant="headingXs" tone="subdued" as="span">PRODUCTS SYNCED</Text>
            <Text variant="bodyMd" fontWeight="semibold" as="p">
              {productsSynced?.toLocaleString() || "0"}
            </Text>
          </BlockStack>
          <BlockStack gap="050">
            <Text variant="headingXs" tone="subdued" as="span">COST CONFIGURATION</Text>
            <Text variant="bodyMd" fontWeight="semibold" as="p">
              {costConfiguration?.enabled ? "Configured" : "Not Configured"}
            </Text>
            {costConfiguration?.enabled && (
              <Text variant="bodySm" tone="subdued" as="p">
                Shipping: {formatMoney(costConfiguration.configuredShippingCost)}
              </Text>
            )}
          </BlockStack>
        </InlineGrid>
        {missingCostConfig && (
          <Banner tone="warning" title="Cost configuration not set up">
            <p>
              Set up your cost configuration in the Shipping Cost Analysis page to get more
              accurate profit leak detection.
            </p>
          </Banner>
        )}
      </BlockStack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Leak Type Breakdown
// ---------------------------------------------------------------------------
function LeakTypeBreakdown({ byType, totalLeaks }) {
  if (!byType || Object.keys(byType).length === 0) return null;

  const LEAK_TYPE_COLORS = {
    PRODUCT: "#6d7175",
    ORDER: "#2c6ecb",
    CUSTOMER: "#8456f4",
    DISCOUNT: "#e77c23",
    SHIPPING: "#1a9180",
    REFUND: "#d72c0d",
    PAYMENT_FEE: "#c4800a",
    DATA_QUALITY: "#8c9196",
  };

  return (
    <Card padding="300">
      <BlockStack gap="200">
        <Text as="h2" variant="headingSm" fontWeight="bold">Leaks by Category</Text>
        <Divider />
        <BlockStack gap="150">
          {Object.entries(byType)
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => {
              const pct = totalLeaks > 0 ? Math.round((count / totalLeaks) * 100) : 0;
              return (
                <BlockStack key={type} gap="050">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="bodySm" as="span">{type}</Text>
                    <Text variant="bodySm" fontWeight="semibold" as="span">
                      {count} ({pct}%)
                    </Text>
                  </InlineStack>
                  <ProgressBar
                    progress={pct}
                    size="small"
                    tone={LEAK_TYPE_COLORS[type] ? undefined : undefined}
                  />
                </BlockStack>
              );
            })}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Leak Detail Modal
// ---------------------------------------------------------------------------
function LeakDetailModal({ leakId, open, onClose, onStatusUpdate, currency }) {
  const [leak, setLeak] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState("");
  const [updateSuccess, setUpdateSuccess] = useState("");

  useEffect(() => {
    if (open && leakId) {
      fetchLeak(leakId);
    } else {
      setLeak(null);
      setError("");
      setUpdateError("");
      setUpdateSuccess("");
    }
  }, [open, leakId]);

  async function fetchLeak(id) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/profit-leaks/${id}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load leak details");
      }
      setLeak(json.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusUpdate(newStatus) {
    if (!leak?._id) return;
    setUpdating(true);
    setUpdateError("");
    setUpdateSuccess("");
    try {
      const res = await fetch(`/api/profit-leaks/${leak._id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to update status");
      }
      setUpdateSuccess(`Status updated to ${newStatus}`);
      setLeak((prev) => ({ ...prev, status: newStatus }));
      onStatusUpdate();
    } catch (err) {
      setUpdateError(err.message);
    } finally {
      setUpdating(false);
    }
  }

  function CompactRow({ label, value, tone: rowTone, isBold }) {
    return (
      <InlineStack align="space-between" blockAlign="center">
        <Text variant="bodySm" tone="subdued" as="span">{label}</Text>
        <Text
          variant="bodySm"
          fontWeight={isBold ? "bold" : "regular"}
          tone={rowTone}
          as="span"
        >
          {value || "—"}
        </Text>
      </InlineStack>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={leak ? leak.title : "Profit Leak Details"}
      primaryAction={{ content: "Close", onAction: onClose }}
      large
    >
      <Modal.Section>
        {loading ? (
          <Box padding="600">
            <InlineStack align="center" blockAlign="center">
              <Spinner size="large" accessibilityLabel="Loading leak details" />
            </InlineStack>
          </Box>
        ) : error ? (
          <Banner tone="critical" title="Error loading details">
            <p>{error}</p>
          </Banner>
        ) : !leak ? null : (
          <BlockStack gap="400">
            {updateError && (
              <Banner tone="critical" title="Update failed" onDismiss={() => setUpdateError("")}>
                <p>{updateError}</p>
              </Banner>
            )}
            {updateSuccess && (
              <Banner tone="success" title="Status updated" onDismiss={() => setUpdateSuccess("")}>
                <p>{updateSuccess}</p>
              </Banner>
            )}

            {/* Header badges */}
            <InlineStack gap="200" blockAlign="center">
              <Badge tone={severityTone(leak.severity)}>{leak.severity}</Badge>
              <Badge tone={statusTone(leak.status)}>{leak.status}</Badge>
              <Badge>{leak.leakType}</Badge>
              {leak.impactType && <Badge tone="info">{leak.impactType}</Badge>}
              {leak.confidence && (
                <Badge tone={leak.confidence === "HIGH" ? "success" : "warning"}>
                  {leak.confidence} Confidence
                </Badge>
              )}
            </InlineStack>

            {/* Key Metrics */}
            <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="050">
                  <Text variant="headingXs" tone="subdued" as="span">ESTIMATED LOSS</Text>
                  <Text variant="headingLg" fontWeight="bold" tone="critical" as="p">
                    {formatMoney(leak.profitImpact, leak.impactCurrency || currency)}
                  </Text>
                </BlockStack>
              </Box>
              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="050">
                  <Text variant="headingXs" tone="subdued" as="span">AFFECTED AREA</Text>
                  <Text variant="headingMd" fontWeight="bold" as="p">
                    {leak.affectedArea || "—"}
                  </Text>
                </BlockStack>
              </Box>
              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="050">
                  <Text variant="headingXs" tone="subdued" as="span">DETECTED AT</Text>
                  <Text variant="bodyMd" fontWeight="bold" as="p">
                    {formatDate(leak.detectedAt)}
                  </Text>
                </BlockStack>
              </Box>
            </InlineGrid>

            {/* Details grid */}
            <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
              {/* Left: Core Info */}
              <Card padding="300">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingSm" fontWeight="bold">Leak Information</Text>
                  <Divider />
                  <CompactRow label="Leak Type" value={leak.leakType} />
                  <CompactRow label="Detection Rule" value={leak.detectionRule} />
                  <CompactRow label="Impact Type" value={leak.impactType} />
                  <CompactRow label="Resource Type" value={leak.resourceType} />
                  <CompactRow label="Resource Name" value={leak.resourceName} isBold />
                  <CompactRow label="Resource ID" value={leak.resourceId} />
                  {leak.resolvedAt && (
                    <CompactRow label="Resolved At" value={formatDate(leak.resolvedAt)} />
                  )}
                </BlockStack>
              </Card>

              {/* Right: Description & Recommendation */}
              <Card padding="300">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingSm" fontWeight="bold">Description & Cause</Text>
                  <Divider />
                  <Text variant="bodyMd" as="p">
                    {leak.description || "No description available."}
                  </Text>

                  {leak.metadata?.recommendation && (
                    <>
                      <Text as="h3" variant="headingSm" fontWeight="bold">
                        💡 Recommendation
                      </Text>
                      <Divider />
                      <Text variant="bodyMd" tone="success" as="p">
                        {leak.metadata.recommendation}
                      </Text>
                    </>
                  )}

                  {leak.metadata?.cause && (
                    <>
                      <Text as="h3" variant="headingSm" fontWeight="bold">Root Cause</Text>
                      <Divider />
                      <Text variant="bodyMd" as="p">{leak.metadata.cause}</Text>
                    </>
                  )}
                </BlockStack>
              </Card>
            </InlineGrid>

            {/* Evidence / Financial Impact */}
            {leak.evidence && Object.keys(leak.evidence).length > 0 && (
              <Card padding="300">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingSm" fontWeight="bold">
                    Evidence &amp; Financial Impact
                  </Text>
                  <Divider />
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #e1e3e5", color: "#6d7175" }}>
                          <th style={{ textAlign: "left", padding: "6px 8px" }}>Field</th>
                          <th style={{ textAlign: "right", padding: "6px 8px" }}>Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(leak.evidence).map(([key, val]) => (
                          <tr key={key} style={{ borderBottom: "1px solid #f1f2f3" }}>
                            <td
                              style={{
                                padding: "8px",
                                fontWeight: 500,
                                color: "#6d7175",
                                textTransform: "capitalize",
                              }}
                            >
                              {key.replace(/_/g, " ")}
                            </td>
                            <td style={{ textAlign: "right", padding: "8px" }}>
                              {typeof val === "number"
                                ? String(val).includes(".")
                                  ? formatMoney(val, leak.impactCurrency || currency)
                                  : val.toLocaleString()
                                : String(val)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </BlockStack>
              </Card>
            )}

            {/* Affected Records */}
            {leak.metadata?.affectedRecords && leak.metadata.affectedRecords.length > 0 && (
              <Card padding="300">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingSm" fontWeight="bold">Affected Records</Text>
                  <Divider />
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #e1e3e5", color: "#6d7175" }}>
                          {Object.keys(leak.metadata.affectedRecords[0] || {}).map((col) => (
                            <th
                              key={col}
                              style={{ textAlign: "left", padding: "6px 8px", textTransform: "capitalize" }}
                            >
                              {col.replace(/_/g, " ")}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {leak.metadata.affectedRecords.slice(0, 10).map((rec, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #f1f2f3" }}>
                            {Object.values(rec).map((v, j) => (
                              <td key={j} style={{ padding: "8px", fontSize: "12px" }}>
                                {String(v)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {leak.metadata.affectedRecords.length > 10 && (
                      <Text variant="bodySm" tone="subdued" as="p">
                        … and {leak.metadata.affectedRecords.length - 10} more records
                      </Text>
                    )}
                  </div>
                </BlockStack>
              </Card>
            )}

            {/* Status Update */}
            <Card padding="300">
              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingSm" fontWeight="bold">Update Status</Text>
                  <Text variant="bodySm" tone="subdued" as="span">
                    Current: <strong>{leak.status}</strong>
                  </Text>
                </InlineStack>
                <Divider />
                <InlineStack gap="200">
                  {["OPEN", "RESOLVED", "IGNORED"].map((s) => (
                    <Button
                      key={s}
                      variant={leak.status === s ? "primary" : "secondary"}
                      tone={s === "RESOLVED" ? "success" : s === "OPEN" ? "critical" : undefined}
                      disabled={leak.status === s || updating}
                      loading={updating && leak.status !== s}
                      onClick={() => handleStatusUpdate(s)}
                    >
                      Mark {s}
                    </Button>
                  ))}
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        )}
      </Modal.Section>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Product Review Full Page View
// Shown for PRODUCT and DATA_QUALITY leaks — fetches live Shopify data.
// Follows the exact full-page pattern of OrderProfitabilityDetailView.
// ---------------------------------------------------------------------------
function ProductReviewPage({ leakId, currency, shop, onBack, onStatusUpdate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState("");
  const [updateSuccess, setUpdateSuccess] = useState("");

  const fetchReviewData = useCallback(async (id) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/profit-leaks/${id}/product-review`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load product review data");
      }
      setData(json.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (leakId) fetchReviewData(leakId);
  }, [leakId, fetchReviewData]);

  async function handleStatusUpdate(newStatus) {
    if (!data?.leak?._id) return;
    setUpdating(true);
    setUpdateError("");
    setUpdateSuccess("");
    try {
      const res = await fetch(`/api/profit-leaks/${data.leak._id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to update status");
      }
      setUpdateSuccess(`Status successfully marked as ${newStatus}`);
      setData((prev) => ({ ...prev, leak: { ...prev.leak, status: newStatus } }));
      if (onStatusUpdate) onStatusUpdate();
    } catch (err) {
      setUpdateError(err.message);
    } finally {
      setUpdating(false);
    }
  }

  const { leak, product, storeCosts, currency: dataCurrency, focusedVariantId } = data || {};
  const effectiveCurrency = dataCurrency || currency || "USD";

  const focusedVariant = product?.variants?.find((v) => v.id === focusedVariantId);
  const displayVariant =
    focusedVariant ||
    product?.variants?.find((v) => v.cost !== null) ||
    product?.variants?.[0];

  function flagReason(detectionRule) {
    switch (detectionRule) {
      case "PRODUCT_NEGATIVE_MARGIN":
        return "This product is selling below its cost price — every unit sold creates a direct loss.";
      case "PRODUCT_LOW_MARGIN":
        return "This product's margin is critically low (under 10%), leaving no buffer to cover shipping, payment fees, or marketing spend.";
      case "PRODUCT_MISSING_COGS":
        return "No cost per item is configured for this product in Shopify. Without a cost, profit and margin cannot be verified — losses may be going undetected.";
      default:
        return leak?.description || "This product was flagged during the profit leak scan.";
    }
  }

  function getRecommendation(detectionRule, variant) {
    if (leak?.metadata?.recommendation) return leak.metadata.recommendation;
    switch (detectionRule) {
      case "PRODUCT_NEGATIVE_MARGIN":
        return `Review the selling price and consider raising it above the product cost (${
          variant ? formatMoney(variant.cost, effectiveCurrency) : "your COGS"
        }) in Shopify Admin to turn a profit on every unit sold.`;
      case "PRODUCT_LOW_MARGIN":
        return "Consider increasing the selling price in Shopify Admin or negotiating a lower supplier cost to bring gross margin above 20% to safely cover shipping and operational fees.";
      case "PRODUCT_MISSING_COGS":
        return "Add a cost per item to this product in Shopify Admin under Inventory → Cost per item. This enables accurate profit tracking across all MarginMind reports.";
      default:
        return "Review the product pricing and cost configuration in Shopify Admin to ensure positive margins.";
    }
  }

  function DetailRow({ label, value, tone, source, isTotal }) {
    return (
      <InlineStack align="space-between" blockAlign="center">
        <Text
          variant={isTotal ? "bodyMd" : "bodySm"}
          tone={isTotal ? undefined : "subdued"}
          fontWeight={isTotal ? "bold" : "regular"}
          as="span"
        >
          {label}
        </Text>
        <InlineStack gap="150" blockAlign="center">
          <Text
            variant={isTotal ? "bodyMd" : "bodySm"}
            fontWeight={isTotal ? "bold" : "semibold"}
            tone={tone}
            as="span"
          >
            {value ?? "—"}
          </Text>
          {source && <Badge size="small">{source}</Badge>}
        </InlineStack>
      </InlineStack>
    );
  }

  const variantPrice = displayVariant?.price ?? 0;
  const paymentFees = storeCosts
    ? Number(
        (
          variantPrice * ((storeCosts.paymentFeeRate || 0) / 100) +
          (storeCosts.paymentFeeFlat || 0)
        ).toFixed(2)
      )
    : null;
  const advertisingCost = storeCosts
    ? Number(
        (
          variantPrice * ((storeCosts.advertisingCostRate || 0) / 100) +
          (storeCosts.advertisingCostFlat || 0)
        ).toFixed(2)
      )
    : null;
  const totalAppliedCosts =
    storeCosts && displayVariant?.cost !== null
      ? Number(
          (
            (displayVariant?.cost || 0) +
            (storeCosts.shippingCost || 0) +
            (storeCosts.fulfillmentCost || 0) +
            (paymentFees || 0) +
            (advertisingCost || 0)
          ).toFixed(2)
        )
      : null;
  const netProfit =
    totalAppliedCosts !== null ? Number((variantPrice - totalAppliedCosts).toFixed(2)) : null;
  const netMargin =
    netProfit !== null && variantPrice > 0
      ? Number(((netProfit / variantPrice) * 100).toFixed(2))
      : null;

  const productAdminUrl =
    product?.adminUrl ||
    (shop && product?.numericId ? `https://${shop}/admin/products/${product.numericId}` : null);

  const pageTitle = product?.title
    ? `Product Price Review: ${product.title}`
    : leak?.resourceName
    ? `Product Price Review: ${leak.resourceName}`
    : "Product Price Review";

  if (loading) {
    return (
      <Page title="Loading Product Review…" backAction={{ content: "Back to Leaks", onAction: onBack }} fullWidth>
        <Card padding="500">
          <Box padding="800">
            <InlineStack align="center" blockAlign="center">
              <Spinner size="large" accessibilityLabel="Loading product review" />
            </InlineStack>
          </Box>
        </Card>
      </Page>
    );
  }

  if (error) {
    return (
      <Page title="Product Price Review" backAction={{ content: "Back to Leaks", onAction: onBack }} fullWidth>
        <Card padding="500">
          <BlockStack gap="300">
            <Banner tone="critical" title="Unable to load product review details">
              <p>{error}</p>
            </Banner>
            <InlineStack gap="200">
              <Button onClick={onBack}>← Back to Profit Leaks</Button>
              <Button variant="primary" onClick={() => fetchReviewData(leakId)}>
                Retry
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  if (!data) return null;

  return (
    <Page
      title={product?.title ? `Review: ${product.title}` : "Product Price Review"}
      subtitle={`${leak?.leakType || "Product Leak"} · Detected ${formatDate(leak?.detectedAt)}`}
      fullWidth
      backAction={{ content: "Back to Leaks", onAction: onBack }}
      primaryAction={
        productAdminUrl
          ? {
              content: "Open Product in Shopify Admin ↗",
              onAction: () => window.open(productAdminUrl, "_blank", "noopener,noreferrer"),
            }
          : undefined
      }
      secondaryActions={[
        {
          content: "Refresh Product",
          icon: RefreshIcon,
          onAction: () => fetchReviewData(leakId),
          loading: loading,
        },
      ]}
    >
      <BlockStack gap="400">
        {updateError && (
          <Banner tone="critical" title="Status update failed" onDismiss={() => setUpdateError("")}>
            <p>{updateError}</p>
          </Banner>
        )}
        {updateSuccess && (
          <Banner tone="success" title="Success" onDismiss={() => setUpdateSuccess("")}>
            <p>{updateSuccess}</p>
          </Banner>
        )}

        {/* ── Product Header & Summary Card ── */}
        <Card padding="400">
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center" wrap>
              <InlineStack gap="300" blockAlign="center">
                <Thumbnail
                  source={product?.image || ImageIcon}
                  alt={product?.imageAlt || product?.title || "Product image"}
                  size="large"
                />
                <BlockStack gap="050">
                  <Text as="h1" variant="headingLg" fontWeight="bold">
                    {product?.title || leak?.resourceName || "Unknown Product"}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {leak?.leakType} · Detected {formatDate(leak?.detectedAt)}
                  </Text>
                </BlockStack>
              </InlineStack>
              <InlineStack gap="150" wrap>
                <Badge tone={severityTone(leak?.severity)}>{leak?.severity}</Badge>
                <Badge tone={statusTone(leak?.status)}>{leak?.status}</Badge>
                {product?.status && (
                  <Badge
                    tone={
                      product.status === "ACTIVE"
                        ? "success"
                        : product.status === "DRAFT"
                        ? "warning"
                        : undefined
                    }
                  >
                    {product.status}
                  </Badge>
                )}
                {leak?.confidence && (
                  <Badge tone={leak.confidence === "HIGH" ? "success" : "warning"}>
                    {leak.confidence} Confidence
                  </Badge>
                )}
              </InlineStack>
            </InlineStack>

            <Divider />

            {/* ── 4 Key Highlight Metrics ── */}
            <InlineGrid columns={{ xs: 2, sm: 2, md: 4 }} gap="200">
              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="050">
                  <Text variant="headingXs" tone="subdued" as="span">
                    SELLING PRICE
                  </Text>
                  <Text variant="headingLg" fontWeight="bold" as="p">
                    {formatMoney(displayVariant?.price, effectiveCurrency)}
                  </Text>
                </BlockStack>
              </Box>

              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="050">
                  <Text variant="headingXs" tone="subdued" as="span">
                    PRODUCT COST (COGS)
                  </Text>
                  <Text
                    variant="headingLg"
                    fontWeight="bold"
                    tone={displayVariant?.cost === null ? "critical" : undefined}
                    as="p"
                  >
                    {displayVariant?.cost !== null
                      ? formatMoney(displayVariant?.cost, effectiveCurrency)
                      : "Not set"}
                  </Text>
                </BlockStack>
              </Box>

              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="050">
                  <Text variant="headingXs" tone="subdued" as="span">
                    UNIT PROFIT
                  </Text>
                  <Text
                    variant="headingLg"
                    fontWeight="bold"
                    tone={
                      displayVariant?.unitProfit !== null && displayVariant?.unitProfit < 0
                        ? "critical"
                        : displayVariant?.unitProfit !== null
                        ? "success"
                        : undefined
                    }
                    as="p"
                  >
                    {displayVariant?.unitProfit !== null
                      ? formatMoney(displayVariant?.unitProfit, effectiveCurrency)
                      : "—"}
                  </Text>
                </BlockStack>
              </Box>

              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="050">
                  <Text variant="headingXs" tone="subdued" as="span">
                    GROSS MARGIN
                  </Text>
                  <Text
                    variant="headingLg"
                    fontWeight="bold"
                    tone={
                      displayVariant?.unitMargin !== null && displayVariant?.unitMargin < 0
                        ? "critical"
                        : displayVariant?.unitMargin !== null && displayVariant?.unitMargin < 10
                        ? "warning"
                        : displayVariant?.unitMargin !== null
                        ? "success"
                        : undefined
                    }
                    as="p"
                  >
                    {displayVariant?.unitMargin !== null ? `${displayVariant.unitMargin}%` : "—"}
                  </Text>
                </BlockStack>
              </Box>
            </InlineGrid>
          </BlockStack>
        </Card>

        {/* ── Flag Reason Banner ── */}
        <Banner
          tone={
            leak?.severity === "CRITICAL"
              ? "critical"
              : leak?.severity === "WARNING"
              ? "warning"
              : "info"
          }
          title="Why this product was flagged"
        >
          <p>{flagReason(leak?.detectionRule)}</p>
        </Banner>

        {/* ── Side-by-side: Applicable Costs & Net Profitability ── */}
        <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
          {/* Applicable Costs */}
          <Card padding="400">
            <BlockStack gap="250">
              <Text as="h2" variant="headingMd">
                Applicable Costs (per unit)
              </Text>
              <Divider />
              <DetailRow
                label="Product Cost (COGS)"
                value={
                  displayVariant?.cost !== null
                    ? formatMoney(displayVariant?.cost, effectiveCurrency)
                    : "Not configured in Shopify"
                }
                tone={displayVariant?.cost === null ? "critical" : undefined}
                source="Shopify"
              />
              <DetailRow
                label="Shipping Cost"
                value={
                  storeCosts?.shippingCost > 0
                    ? formatMoney(storeCosts.shippingCost, effectiveCurrency)
                    : "$0.00"
                }
                source="Store Profile"
              />
              <DetailRow
                label="Fulfillment Cost"
                value={
                  storeCosts?.fulfillmentCost > 0
                    ? formatMoney(storeCosts.fulfillmentCost, effectiveCurrency)
                    : "$0.00"
                }
                source="Store Profile"
              />
              <DetailRow
                label={`Payment Fees (${storeCosts?.paymentFeeRate || 0}%${
                  storeCosts?.paymentFeeFlat > 0
                    ? ` + ${formatMoney(storeCosts.paymentFeeFlat, effectiveCurrency)}`
                    : ""
                })`}
                value={paymentFees !== null ? formatMoney(paymentFees, effectiveCurrency) : "$0.00"}
                source="Calculated"
              />
              <DetailRow
                label={`Advertising (${storeCosts?.advertisingCostRate || 0}%)`}
                value={advertisingCost !== null ? formatMoney(advertisingCost, effectiveCurrency) : "$0.00"}
                source="Store Profile"
              />
              <Divider />
              <DetailRow
                label="Total Applicable Costs"
                value={
                  totalAppliedCosts !== null
                    ? formatMoney(totalAppliedCosts, effectiveCurrency)
                    : "—"
                }
                tone={totalAppliedCosts !== null ? "critical" : undefined}
                isTotal
              />
            </BlockStack>
          </Card>

          {/* Net Profitability */}
          <Card padding="400">
            <BlockStack gap="250">
              <Text as="h2" variant="headingMd">
                Net Profitability &amp; Recommendation
              </Text>
              <Divider />
              {netProfit !== null ? (
                <InlineGrid columns={2} gap="200">
                  <Box
                    padding="300"
                    background={netProfit < 0 ? "bg-fill-critical-secondary" : "bg-fill-success-secondary"}
                    borderRadius="200"
                  >
                    <BlockStack gap="100">
                      <Text variant="headingXs" tone="subdued" as="span">
                        NET PROFIT / UNIT
                      </Text>
                      <Text
                        variant="headingLg"
                        fontWeight="bold"
                        tone={netProfit < 0 ? "critical" : "success"}
                        as="p"
                      >
                        {formatMoney(netProfit, effectiveCurrency)}
                      </Text>
                    </BlockStack>
                  </Box>
                  <Box
                    padding="300"
                    background={
                      netMargin < 0
                        ? "bg-fill-critical-secondary"
                        : netMargin < 10
                        ? "bg-fill-warning-secondary"
                        : "bg-fill-success-secondary"
                    }
                    borderRadius="200"
                  >
                    <BlockStack gap="100">
                      <Text variant="headingXs" tone="subdued" as="span">
                        NET MARGIN
                      </Text>
                      <Text
                        variant="headingLg"
                        fontWeight="bold"
                        tone={netMargin < 0 ? "critical" : netMargin < 10 ? "warning" : "success"}
                        as="p"
                      >
                        {netMargin}%
                      </Text>
                    </BlockStack>
                  </Box>
                </InlineGrid>
              ) : (
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <Text variant="bodySm" tone="subdued" as="p">
                    Net profit calculation requires product cost (COGS) to be configured in Shopify Admin.
                  </Text>
                </Box>
              )}
              <Divider />
              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm" fontWeight="bold">
                    💡 Merchant Recommendation
                  </Text>
                  <Text variant="bodyMd" as="p">
                    {getRecommendation(leak?.detectionRule, displayVariant)}
                  </Text>
                </BlockStack>
              </Box>
            </BlockStack>
          </Card>
        </InlineGrid>

        {/* ── Product Variants Table ── */}
        {product?.variants && product.variants.length > 0 && (
          <Card padding="400">
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Product Variants ({product.variants.length})
                </Text>
                <Text variant="bodySm" tone="subdued" as="span">
                  Real-time Shopify pricing &amp; COGS
                </Text>
              </InlineStack>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "800px" }}>
                  <thead>
                    <tr>
                      {["Variant", "SKU", "Selling Price", "Cost per item", "Unit Profit", "Margin", "Inventory"].map((h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: "left",
                            padding: "10px 8px",
                            borderBottom: "1px solid #e1e3e5",
                            color: "#6d7175",
                            fontSize: "13px",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {product.variants.map((v) => {
                      const isFocused = v.id === focusedVariantId;
                      return (
                        <tr
                          key={v.id}
                          style={{
                            borderBottom: "1px solid #e1e3e5",
                            backgroundColor: isFocused ? "#fffbe6" : "transparent",
                          }}
                        >
                          <td style={{ padding: "12px 8px" }}>
                            <InlineStack gap="150" blockAlign="center">
                              <Text as="span" fontWeight={isFocused ? "bold" : "regular"}>
                                {v.title}
                              </Text>
                              {isFocused && <Badge tone="warning">Flagged</Badge>}
                            </InlineStack>
                          </td>
                          <td style={{ padding: "12px 8px" }}>
                            <Text as="span" variant="bodySm" tone="subdued">
                              {v.sku || "—"}
                            </Text>
                          </td>
                          <td style={{ padding: "12px 8px" }}>
                            <Text as="span" fontWeight="semibold">
                              {formatMoney(v.price, effectiveCurrency)}
                            </Text>
                          </td>
                          <td style={{ padding: "12px 8px" }}>
                            <Text
                              as="span"
                              fontWeight="semibold"
                              tone={v.cost === null ? "critical" : undefined}
                            >
                              {v.cost !== null ? formatMoney(v.cost, effectiveCurrency) : "Not set"}
                            </Text>
                          </td>
                          <td style={{ padding: "12px 8px" }}>
                            <Text
                              as="span"
                              fontWeight="bold"
                              tone={
                                v.unitProfit === null
                                  ? "subdued"
                                  : v.unitProfit < 0
                                  ? "critical"
                                  : "success"
                              }
                            >
                              {v.unitProfit !== null ? formatMoney(v.unitProfit, effectiveCurrency) : "—"}
                            </Text>
                          </td>
                          <td style={{ padding: "12px 8px" }}>
                            <Text
                              as="span"
                              fontWeight="bold"
                              tone={
                                v.unitMargin === null
                                  ? "subdued"
                                  : v.unitMargin < 0
                                  ? "critical"
                                  : v.unitMargin < 10
                                  ? "warning"
                                  : "success"
                              }
                            >
                              {v.unitMargin !== null ? `${v.unitMargin}%` : "—"}
                            </Text>
                          </td>
                          <td style={{ padding: "12px 8px" }}>
                            <Text as="span" variant="bodySm" tone="subdued">
                              {v.inventoryQuantity?.toLocaleString() ?? "—"}
                            </Text>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </BlockStack>
          </Card>
        )}

        {/* ── Status Actions ── */}
        <Card padding="400">
          <BlockStack gap="250">
            <InlineStack align="space-between" blockAlign="center" wrap>
              <Text as="h2" variant="headingMd">
                Manual Price Review Actions
              </Text>
              <InlineStack gap="150" blockAlign="center">
                <Text variant="bodySm" tone="subdued" as="span">Current Status:</Text>
                <Badge tone={statusTone(leak?.status)}>{leak?.status}</Badge>
              </InlineStack>
            </InlineStack>
            <Divider />
            <Text variant="bodySm" tone="subdued" as="p">
              Review workflow: Click &quot;Open Product in Shopify Admin ↗&quot; above to adjust prices or cost per item in Shopify. Once verified or updated, mark this issue as resolved. MarginMind will not change prices automatically.
            </Text>
            <InlineStack gap="200" wrap>
              <Button
                variant={leak?.status === "RESOLVED" ? "primary" : "secondary"}
                tone="success"
                disabled={leak?.status === "RESOLVED" || updating}
                loading={updating && leak?.status !== "RESOLVED"}
                onClick={() => handleStatusUpdate("RESOLVED")}
              >
                ✓ Mark as Reviewed &amp; Resolved
              </Button>
              <Button
                variant={leak?.status === "IGNORED" ? "primary" : "secondary"}
                disabled={leak?.status === "IGNORED" || updating}
                loading={updating && leak?.status !== "IGNORED"}
                onClick={() => handleStatusUpdate("IGNORED")}
              >
                Skip / Ignore for Now
              </Button>
              {leak?.status !== "OPEN" && (
                <Button
                  variant="secondary"
                  tone="critical"
                  disabled={updating}
                  loading={updating && leak?.status === "OPEN"}
                  onClick={() => handleStatusUpdate("OPEN")}
                >
                  Reopen Issue
                </Button>
              )}
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------
export default function ProfitLeakDetector({
  shop,
  initialSummary = null,
  initialError = null,
}) {
  // Summary + data status
  const [summary, setSummary] = useState(initialSummary);
  const [summaryLoading, setSummaryLoading] = useState(!initialSummary);
  const [dataStatus, setDataStatus] = useState(null);

  // Leaks list
  const [leaks, setLeaks] = useState([]);
  const [leaksLoading, setLeaksLoading] = useState(true);
  const [leaksError, setLeaksError] = useState(initialError || "");
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });

  // Filters
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [severityFilter, setSeverityFilter] = useState("");
  const [leakTypeFilter, setLeakTypeFilter] = useState("");
  const [sortBy, setSortBy] = useState("detectedAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [currentPage, setCurrentPage] = useState(1);

  // Detection
  const [detecting, setDetecting] = useState(false);
  const [detectBanner, setDetectBanner] = useState(null);

  // Leak detail modal (non-product leaks)
  const [selectedLeakId, setSelectedLeakId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Product review full-page (PRODUCT + DATA_QUALITY leaks)
  const [reviewLeakId, setReviewLeakId] = useState(null);

  const currency = summary?.impactCurrency || "USD";

  // ---------------------------------------------------------------------------
  // Fetch summary
  // ---------------------------------------------------------------------------
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch("/api/profit-leaks/summary");
      const json = await res.json();
      if (res.ok && json.success) setSummary(json.data);
    } catch (err) {
      console.error("[MarginMind] Summary fetch error:", err);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Fetch data status
  // ---------------------------------------------------------------------------
  const fetchDataStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/profit-leaks/data-status");
      const json = await res.json();
      if (res.ok && json.success) setDataStatus(json.data);
    } catch (err) {
      console.error("[MarginMind] Data status fetch error:", err);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Fetch leaks list
  // ---------------------------------------------------------------------------
  const fetchLeaks = useCallback(
    async (
      page = 1,
      search = "",
      status = "OPEN",
      severity = "",
      leakType = "",
      sort = "detectedAt",
      order = "desc"
    ) => {
      setLeaksLoading(true);
      setLeaksError("");
      try {
        const params = new URLSearchParams({ page, limit: 20, sortBy: sort, sortOrder: order });
        if (search.trim()) params.append("search", search.trim());
        if (status && status !== "ALL") params.append("status", status);
        if (severity) params.append("severity", severity);
        if (leakType) params.append("leakType", leakType);

        const res = await fetch(`/api/profit-leaks?${params.toString()}`);
        const json = await res.json();

        if (!res.ok || !json.success) {
          throw new Error(json.message || "Failed to fetch profit leaks");
        }

        setLeaks(json.data || []);
        setPagination(
          json.pagination || { page: 1, totalPages: 1, total: json.data?.length || 0 }
        );
      } catch (err) {
        console.error("[MarginMind] Leaks fetch error:", err);
        setLeaksError(err.message || "Failed to load profit leaks");
      } finally {
        setLeaksLoading(false);
      }
    },
    []
  );

  // Initial load
  useEffect(() => {
    if (!initialSummary) fetchSummary();
    fetchDataStatus();
    fetchLeaks(1, "", statusFilter, severityFilter, leakTypeFilter, sortBy, sortOrder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilters(page = 1, sort = sortBy, order = sortOrder) {
    setCurrentPage(page);
    fetchLeaks(page, searchQuery, statusFilter, severityFilter, leakTypeFilter, sort, order);
  }

  function handleSearch() {
    setSearchQuery(searchInput);
    setCurrentPage(1);
    fetchLeaks(1, searchInput, statusFilter, severityFilter, leakTypeFilter, sortBy, sortOrder);
  }

  function handleClearSearch() {
    setSearchInput("");
    setSearchQuery("");
    setCurrentPage(1);
    fetchLeaks(1, "", statusFilter, severityFilter, leakTypeFilter, sortBy, sortOrder);
  }

  function handleRefresh() {
    fetchSummary();
    fetchDataStatus();
    fetchLeaks(currentPage, searchQuery, statusFilter, severityFilter, leakTypeFilter, sortBy, sortOrder);
  }

  function handleStatusFilterChange(val) {
    setStatusFilter(val);
    setCurrentPage(1);
    fetchLeaks(1, searchQuery, val, severityFilter, leakTypeFilter, sortBy, sortOrder);
  }

  function handleSeverityFilterChange(val) {
    setSeverityFilter(val);
    setCurrentPage(1);
    fetchLeaks(1, searchQuery, statusFilter, val, leakTypeFilter, sortBy, sortOrder);
  }

  function handleLeakTypeFilterChange(val) {
    setLeakTypeFilter(val);
    setCurrentPage(1);
    fetchLeaks(1, searchQuery, statusFilter, severityFilter, val, sortBy, sortOrder);
  }

  function handleSortChange(field) {
    const newOrder = sortBy === field && sortOrder === "desc" ? "asc" : "desc";
    setSortBy(field);
    setSortOrder(newOrder);
    setCurrentPage(1);
    fetchLeaks(1, searchQuery, statusFilter, severityFilter, leakTypeFilter, field, newOrder);
  }

  // ---------------------------------------------------------------------------
  // Detection
  // ---------------------------------------------------------------------------
  async function handleDetect() {
    setDetecting(true);
    setDetectBanner(null);
    try {
      const res = await fetch("/api/profit-leaks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _action: "detect" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Detection failed");
      }
      const s = json.summary;
      const msg = s
        ? `Detection complete. Found ${s.newLeaksFound ?? "?"} new leaks. Total open: ${s.totalOpenLeaks ?? "?"}.`
        : "Detection completed successfully.";
      setDetectBanner({ tone: "success", title: "Detection Complete", message: msg });
      fetchSummary();
      fetchLeaks(1, searchQuery, statusFilter, severityFilter, leakTypeFilter, sortBy, sortOrder);
      setCurrentPage(1);
    } catch (err) {
      setDetectBanner({ tone: "critical", title: "Detection Failed", message: err.message });
    } finally {
      setDetecting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Routing — PRODUCT/DATA_QUALITY → full page, rest → LeakDetailModal
  // ---------------------------------------------------------------------------
  function openLeakModal(leak) {
    const isProductLeak = ["PRODUCT", "DATA_QUALITY"].includes(leak.leakType);
    if (isProductLeak) {
      setReviewLeakId(leak._id);
    } else {
      setSelectedLeakId(leak._id);
      setModalOpen(true);
    }
  }

  function closeModal() {
    setModalOpen(false);
    setSelectedLeakId(null);
  }

  function closeReviewPage() {
    setReviewLeakId(null);
  }

  function onStatusUpdated() {
    fetchLeaks(currentPage, searchQuery, statusFilter, severityFilter, leakTypeFilter, sortBy, sortOrder);
    fetchSummary();
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------
  function handleExport() {
    exportLeaksToCsv(leaks, currency);
  }

  // ---------------------------------------------------------------------------
  // Sort helper for headings
  // ---------------------------------------------------------------------------
  function sortIcon(field) {
    if (sortBy !== field) return "";
    return sortOrder === "desc" ? " ↓" : " ↑";
  }

  // ---------------------------------------------------------------------------
  // Table rows
  // ---------------------------------------------------------------------------
  const resourceName = { singular: "profit leak", plural: "profit leaks" };

  const rowMarkup = useMemo(
    () =>
      leaks.map((leak, index) => (
        <IndexTable.Row id={leak._id} key={leak._id} position={index}>
          <IndexTable.Cell>
            <Text variant="bodyMd" fontWeight="semibold" as="span">
              {leak.leakType}
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Tooltip content={leak.description || "—"} dismissOnMouseOut>
              <Text as="span" variant="bodySm">
                {leak.title}
              </Text>
            </Tooltip>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text as="span" variant="bodySm">
              {leak.resourceName || leak.affectedArea || "—"}
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text as="span" variant="bodySm" fontWeight="bold" tone="critical">
              {formatMoney(leak.profitImpact, leak.impactCurrency || currency)}
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Badge tone={severityTone(leak.severity)}>{leak.severity}</Badge>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Badge tone={statusTone(leak.status)}>{leak.status}</Badge>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text as="span" variant="bodySm" tone="subdued">
              {formatDate(leak.detectedAt)}
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            {["PRODUCT", "DATA_QUALITY"].includes(leak.leakType) ? (
              <Button variant="plain" tone="success" onClick={() => openLeakModal(leak)}>
                Review Product
              </Button>
            ) : (
              <Button variant="plain" onClick={() => openLeakModal(leak)}>
                View Details
              </Button>
            )}
          </IndexTable.Cell>
        </IndexTable.Row>
      )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leaks, currency]
  );

  // ── Render full-page review after all hooks have executed ──
  if (reviewLeakId) {
    return (
      <ProductReviewPage
        leakId={reviewLeakId}
        currency={currency}
        shop={shop}
        onBack={closeReviewPage}
        onStatusUpdate={() => {
          onStatusUpdated();
        }}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <Page
      title="Profit Leak Detector"
      subtitle="Identify and monitor profit losses across your store."
      fullWidth
      primaryAction={{
        content: "Detect Profit Leaks",
        onAction: handleDetect,
        loading: detecting,
        tone: "critical",
      }}
      secondaryActions={[
        {
          content: "Refresh",
          icon: RefreshIcon,
          onAction: handleRefresh,
          loading: summaryLoading || leaksLoading,
        },
        {
          content: "Export CSV",
          icon: ExportIcon,
          onAction: handleExport,
          disabled: leaks.length === 0 || leaksLoading,
        },
      ]}
    >
      <BlockStack gap="400">

        {/* Detection Banner */}
        {detectBanner && (
          <Banner
            tone={detectBanner.tone}
            title={detectBanner.title}
            onDismiss={() => setDetectBanner(null)}
          >
            <p>{detectBanner.message}</p>
          </Banner>
        )}

        {/* Global error */}
        {leaksError && !leaksLoading && (
          <Banner
            tone="critical"
            title="Error loading profit leaks"
            onDismiss={() => setLeaksError("")}
          >
            <p>{leaksError}</p>
          </Banner>
        )}

        {/* Summary Cards */}
        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="300">
          <SummaryCard
            title="Total Open Leaks"
            value={summaryLoading ? "…" : summary?.totalLeaks ?? "—"}
            tone="warning"
            subtitle="Active profit issues"
          />
          <SummaryCard
            title="Total Estimated Loss"
            value={
              summaryLoading
                ? "…"
                : summary
                ? formatMoney(summary.totalEstimatedImpact, summary.impactCurrency)
                : "—"
            }
            tone="critical"
            subtitle="Across all open leaks"
          />
          <SummaryCard
            title="High Severity Leaks"
            value={summaryLoading ? "…" : summary?.criticalLeaks ?? "—"}
            tone="critical"
            subtitle="Critical priority issues"
          />
          <SummaryCard
            title="Warning Leaks"
            value={summaryLoading ? "…" : summary?.warningLeaks ?? "—"}
            tone="warning"
            subtitle="Medium-priority issues"
          />
        </InlineGrid>

        {/* Data Status + Leak Breakdown (side by side) */}
        {(dataStatus || (summary?.byType && Object.keys(summary.byType).length > 0)) && (
          <InlineGrid
            columns={{
              xs: 1,
              md: summary?.byType && Object.keys(summary.byType).length > 0 ? 2 : 1,
            }}
            gap="300"
          >
            {dataStatus && <DataStatusBanner dataStatus={dataStatus} />}
            {summary?.byType && Object.keys(summary.byType).length > 0 && (
              <LeakTypeBreakdown byType={summary.byType} totalLeaks={summary.totalLeaks} />
            )}
          </InlineGrid>
        )}

        {/* Filters & Search */}
        <Card padding="300">
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center" wrap={false}>
              <BlockStack gap="050">
                <Text as="h2" variant="headingSm" fontWeight="bold">
                  Profit Leak Records
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {leaksLoading
                    ? "Loading…"
                    : `${pagination.total ?? leaks.length} record${
                        (pagination.total ?? leaks.length) === 1 ? "" : "s"
                      } found`}
                </Text>
              </BlockStack>

              {/* Sort control */}
              <div style={{ minWidth: "200px" }}>
                <Select
                  label="Sort by"
                  labelInline
                  value={`${sortBy}:${sortOrder}`}
                  onChange={(val) => {
                    const [field, order] = val.split(":");
                    setSortBy(field);
                    setSortOrder(order);
                    setCurrentPage(1);
                    fetchLeaks(1, searchQuery, statusFilter, severityFilter, leakTypeFilter, field, order);
                  }}
                  options={[
                    { label: "Newest First", value: "detectedAt:desc" },
                    { label: "Oldest First", value: "detectedAt:asc" },
                    { label: "Highest Loss", value: "profitImpact:desc" },
                    { label: "Lowest Loss", value: "profitImpact:asc" },
                  ]}
                />
              </div>
            </InlineStack>

            <InlineStack gap="200" wrap>
              {/* Search */}
              <div style={{ flexGrow: 1, minWidth: "200px" }}>
                <TextField
                  label="Search"
                  labelHidden
                  placeholder="Search by title, area, or resource…"
                  value={searchInput}
                  onChange={setSearchInput}
                  onClearButtonClick={handleClearSearch}
                  clearButton
                  prefix={<SearchIcon />}
                  autoComplete="off"
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  connectedRight={
                    <Button onClick={handleSearch} disabled={leaksLoading}>
                      Search
                    </Button>
                  }
                />
              </div>

              {/* Status Filter */}
              <div style={{ minWidth: "150px" }}>
                <Select
                  label="Status"
                  labelInline
                  value={statusFilter}
                  onChange={handleStatusFilterChange}
                  options={[
                    { label: "All Statuses", value: "ALL" },
                    { label: "Open", value: "OPEN" },
                    { label: "Resolved", value: "RESOLVED" },
                    { label: "Ignored", value: "IGNORED" },
                  ]}
                />
              </div>

              {/* Severity Filter */}
              <div style={{ minWidth: "160px" }}>
                <Select
                  label="Severity"
                  labelInline
                  value={severityFilter}
                  onChange={handleSeverityFilterChange}
                  options={[
                    { label: "All Severities", value: "" },
                    { label: "Critical", value: "CRITICAL" },
                    { label: "Warning", value: "WARNING" },
                    { label: "Info", value: "INFO" },
                  ]}
                />
              </div>

              {/* Leak Type Filter */}
              <div style={{ minWidth: "170px" }}>
                <Select
                  label="Type"
                  labelInline
                  value={leakTypeFilter}
                  onChange={handleLeakTypeFilterChange}
                  options={[
                    { label: "All Types", value: "" },
                    { label: "Product", value: "PRODUCT" },
                    { label: "Order", value: "ORDER" },
                    { label: "Customer", value: "CUSTOMER" },
                    { label: "Discount", value: "DISCOUNT" },
                    { label: "Shipping", value: "SHIPPING" },
                    { label: "Refund", value: "REFUND" },
                    { label: "Payment Fee", value: "PAYMENT_FEE" },
                    { label: "Data Quality", value: "DATA_QUALITY" },
                  ]}
                />
              </div>
            </InlineStack>
          </BlockStack>
        </Card>

        {/* Leak Table */}
        <Card padding="0">
          {leaksLoading ? (
            <Box padding="800">
              <InlineStack align="center" blockAlign="center">
                <Spinner size="large" accessibilityLabel="Loading profit leaks" />
              </InlineStack>
            </Box>
          ) : leaks.length === 0 ? (
            <EmptyState
              heading="No profit leaks found"
              action={{
                content: "Detect Profit Leaks",
                onAction: handleDetect,
                loading: detecting,
              }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>
                {statusFilter === "OPEN"
                  ? "There are no open profit leaks. Run a detection scan to check your store."
                  : "No profit leaks match your current filters."}
              </p>
            </EmptyState>
          ) : (
            <IndexTable
              resourceName={resourceName}
              itemCount={leaks.length}
              headings={[
                {
                  title: (
                    <span style={{ cursor: "pointer" }} onClick={() => handleSortChange("leakType")}>
                      Leak Type{sortIcon("leakType")}
                    </span>
                  ),
                },
                { title: "Description" },
                { title: "Affected Product / Order" },
                {
                  title: (
                    <span
                      style={{ cursor: "pointer" }}
                      onClick={() => handleSortChange("profitImpact")}
                    >
                      Estimated Loss{sortIcon("profitImpact")}
                    </span>
                  ),
                },
                { title: "Severity" },
                { title: "Status" },
                {
                  title: (
                    <span
                      style={{ cursor: "pointer" }}
                      onClick={() => handleSortChange("detectedAt")}
                    >
                      Detected At{sortIcon("detectedAt")}
                    </span>
                  ),
                },
                { title: "Actions" },
              ]}
              selectable={false}
            >
              {rowMarkup}
            </IndexTable>
          )}
        </Card>

        {/* Pagination */}
        {!leaksLoading && pagination.totalPages > 1 && (
          <Box padding="300">
            <InlineStack align="center">
              <Pagination
                hasPrevious={currentPage > 1}
                onPrevious={() => {
                  const prev = Math.max(1, currentPage - 1);
                  setCurrentPage(prev);
                  applyFilters(prev);
                }}
                hasNext={currentPage < pagination.totalPages}
                onNext={() => {
                  const next = Math.min(pagination.totalPages, currentPage + 1);
                  setCurrentPage(next);
                  applyFilters(next);
                }}
                label={`Page ${currentPage} of ${pagination.totalPages} (${pagination.total} total)`}
              />
            </InlineStack>
          </Box>
        )}
      </BlockStack>

      {/* General Leak Detail Modal (non-product leaks) */}
      <LeakDetailModal
        leakId={selectedLeakId}
        open={modalOpen}
        onClose={closeModal}
        onStatusUpdate={onStatusUpdated}
        currency={currency}
      />
    </Page>
  );
}