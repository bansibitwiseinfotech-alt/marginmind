import {
  Form,
  useLoaderData,
  useSearchParams,
  useNavigation,
  useRevalidator,
  useRouteError,
} from "react-router";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  Page,
  Card,
  InlineGrid,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  IndexTable,
  Thumbnail,
  TextField,
  Select,
  Tabs,
  Icon,
  Banner,
  Box,
  Divider,
  EmptyState,
  Link,
} from "@shopify/polaris";
import { SearchIcon, ImageIcon, RefreshIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";

// ---------------------------------------------------------------------------
// Loader — server-side only, Shopify session verification
// ---------------------------------------------------------------------------
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const after = url.searchParams.get("after") || "";

  const backendUrl =
    process.env.BACKEND_URL || "http://localhost:5000";

  const headers = {
    "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
    "x-shopify-shop-domain": session.shop,
  };

  const apiUrl =
    `${backendUrl}/api/product-profitability` +
    `?first=50` +
    `&search=${encodeURIComponent(search)}` +
    `&after=${encodeURIComponent(after)}`;

  let data = null;
  let fetchError = null;

  try {
    const response = await fetch(apiUrl, {
      method: "GET",
      headers,
    });
    const json = await response.json();
    if (response.ok && json.success) {
      data = json.data;
    } else {
      fetchError = json?.message || "Failed to load product profitability";
    }
  } catch (networkErr) {
    fetchError = "Unable to reach MarginMind backend: " + networkErr.message;
  }

  let syncStatus = {
    syncStatus: "not_started",
    lastSyncedAt: null,
    lastSyncStartedAt: null,
    lastSyncError: "",
    productsSynced: 0,
  };

  try {
    const syncResponse = await fetch(`${backendUrl}/api/sync/status`, {
      method: "GET",
      headers: {
        ...headers,
        "x-shopify-access-token": session.accessToken || "",
      },
    });

    if (syncResponse.ok) {
      const syncData = await syncResponse.json();
      if (syncData?.success) {
        syncStatus = {
          syncStatus: syncData.syncStatus || "not_started",
          lastSyncedAt: syncData.lastSyncedAt || null,
          lastSyncStartedAt: syncData.lastSyncStartedAt || null,
          lastSyncError: syncData.lastSyncError || "",
          productsSynced: syncData.productsSynced || 0,
        };
      }
    }
  } catch {
    syncStatus = {
      syncStatus: "not_started",
      lastSyncedAt: null,
      lastSyncStartedAt: null,
      lastSyncError: "",
      productsSynced: 0,
    };
  }

  return {
    products: data?.products || [],
    summary: data?.summary || {
      totalProducts: 0,
      productsOnPage: 0,
      variantsOnPage: 0,
      profitableVariants: 0,
      lowMarginVariants: 0,
      lossMakingVariants: 0,
      variantsWithCost: 0,
      variantsWithoutCost: 0,
      averageUnitMargin: null,
    },
    pageInfo: data?.pageInfo || null,
    totalProducts: data?.totalProducts || 0,
    search,
    currentShop: session.shop,
    syncStatus,
    error: fetchError,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  if (formData.get("_action") !== "sync-products") {
    return null;
  }

  const backendUrl = process.env.BACKEND_URL || "http://localhost:5000";

  const response = await fetch(`${backendUrl}/api/sync/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
      "x-shopify-shop-domain": session.shop,
      "x-shopify-access-token": session.accessToken || "",
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Response(data?.message || "Failed to sync products", {
      status: response.status,
    });
  }

  return { ok: true, message: data?.message || "Products synced" };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatMoney(value, currency) {
  if (value === null || value === undefined || !currency) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatPercent(value) {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toFixed(2)}%`;
}

function getStatusLabel(status) {
  switch (status) {
    case "PROFITABLE":
      return "Profitable";
    case "LOW_MARGIN":
      return "Low Margin";
    case "LOSS":
      return "Loss";
    case "NO_COST":
      return "No Cost Data";
    default:
      return status || "Unknown";
  }
}

function getStatusTone(status) {
  switch (status) {
    case "PROFITABLE":
      return "success";
    case "LOW_MARGIN":
      return "warning";
    case "LOSS":
      return "critical";
    case "NO_COST":
      return "info";
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function ProductProfitability() {
  const {
    products = [],
    summary,
    pageInfo,
    totalProducts,
    search: loaderSearch,
    currentShop,
    syncStatus = {
      syncStatus: "not_started",
      lastSyncedAt: null,
      lastSyncStartedAt: null,
      lastSyncError: "",
      productsSynced: 0,
    },
    error: initialError,
  } = useLoaderData();

  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const isLoading =
    navigation.state === "loading" || revalidator.state === "loading";

  const [searchParams, setSearchParams] = useSearchParams();

  // Navigation cursor history
  const [cursorHistory, setCursorHistory] = useState([]);

  // Search input & debouncer
  const [searchInput, setSearchInput] = useState(loaderSearch || "");
  const searchTimer = useRef(null);

  // Active status tab & sorting
  const [selectedTab, setSelectedTab] = useState(0);
  const [sortBy, setSortBy] = useState("default");
  const [showBanner, setShowBanner] = useState(true);

  // Keep input in sync when loader returns
  useEffect(() => {
    setSearchInput(loaderSearch || "");
  }, [loaderSearch]);

  // Reset cursor history when search changes
  const prevSearch = useRef(loaderSearch);
  useEffect(() => {
    if (prevSearch.current !== loaderSearch) {
      setCursorHistory([]);
      prevSearch.current = loaderSearch;
    }
  }, [loaderSearch]);

  const handleSearchChange = (value) => {
    setSearchInput(value);

    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (value.trim()) {
        params.set("search", value.trim());
      } else {
        params.delete("search");
      }
      params.delete("after");
      setCursorHistory([]);
      setSearchParams(params);
    }, 400);
  };

  const handleClearSearch = () => {
    handleSearchChange("");
  };

  const handleRefresh = () => {
    revalidator.revalidate();
  };

  const handleNext = () => {
    if (!pageInfo?.hasNextPage) return;
    const currentAfter = searchParams.get("after") || "";
    setCursorHistory((prev) => [...prev, currentAfter]);

    const params = new URLSearchParams(searchParams);
    params.set("after", pageInfo.endCursor);
    setSearchParams(params);
  };

  const handlePrevious = () => {
    const params = new URLSearchParams(searchParams);
    const prevHistory = [...cursorHistory];
    const prevCursor = prevHistory.pop();

    setCursorHistory(prevHistory);

    if (prevCursor) {
      params.set("after", prevCursor);
    } else {
      params.delete("after");
    }
    setSearchParams(params);
  };

  const hasPrevious =
    cursorHistory.length > 0 || !!searchParams.get("after");

  const currentPage = cursorHistory.length + 1;

  // Flatten products into variant rows
  const allVariants = useMemo(() => {
    return products.flatMap((product) => {
      const variants = product.variants || [];
      const hasMultipleVariants = variants.length > 1;
      return variants.map((variant, vIdx) => ({
        ...variant,
        product,
        isFirstVariant: vIdx === 0,
        hasMultipleVariants,
      }));
    });
  }, [products]);

  // Status tabs configuration with live counts
  const tabCounts = useMemo(() => {
    return {
      all: allVariants.length,
      profitable: allVariants.filter((v) => v.status === "PROFITABLE").length,
      lowMargin: allVariants.filter((v) => v.status === "LOW_MARGIN").length,
      loss: allVariants.filter((v) => v.status === "LOSS").length,
      noCost: allVariants.filter((v) => v.status === "NO_COST").length,
    };
  }, [allVariants]);

  const tabs = [
    {
      id: "all",
      content: "All",
      badge: tabCounts.all > 0 ? String(tabCounts.all) : undefined,
    },
    {
      id: "PROFITABLE",
      content: "Profitable",
      badge:
        tabCounts.profitable > 0 ? String(tabCounts.profitable) : undefined,
    },
    {
      id: "LOW_MARGIN",
      content: "Low Margin",
      badge:
        tabCounts.lowMargin > 0 ? String(tabCounts.lowMargin) : undefined,
    },
    {
      id: "LOSS",
      content: "Loss Making",
      badge: tabCounts.loss > 0 ? String(tabCounts.loss) : undefined,
    },
    {
      id: "NO_COST",
      content: "No Cost Data",
      badge: tabCounts.noCost > 0 ? String(tabCounts.noCost) : undefined,
    },
  ];

  // Filter variants by tab
  const filteredVariants = useMemo(() => {
    let list = allVariants;

    if (selectedTab === 1) {
      list = list.filter((v) => v.status === "PROFITABLE");
    } else if (selectedTab === 2) {
      list = list.filter((v) => v.status === "LOW_MARGIN");
    } else if (selectedTab === 3) {
      list = list.filter((v) => v.status === "LOSS");
    } else if (selectedTab === 4) {
      list = list.filter((v) => v.status === "NO_COST");
    }

    return list;
  }, [allVariants, selectedTab]);

  // Sort variants
  const sortedVariants = useMemo(() => {
    const list = [...filteredVariants];

    switch (sortBy) {
      case "margin-asc":
        return list.sort((a, b) => {
          if (a.unitMargin === null && b.unitMargin === null) return 0;
          if (a.unitMargin === null) return 1;
          if (b.unitMargin === null) return -1;
          return a.unitMargin - b.unitMargin;
        });
      case "margin-desc":
        return list.sort((a, b) => {
          if (a.unitMargin === null && b.unitMargin === null) return 0;
          if (a.unitMargin === null) return 1;
          if (b.unitMargin === null) return -1;
          return b.unitMargin - a.unitMargin;
        });
      case "profit-desc":
        return list.sort((a, b) => {
          if (a.unitProfit === null && b.unitProfit === null) return 0;
          if (a.unitProfit === null) return 1;
          if (b.unitProfit === null) return -1;
          return b.unitProfit - a.unitProfit;
        });
      case "profit-asc":
        return list.sort((a, b) => {
          if (a.unitProfit === null && b.unitProfit === null) return 0;
          if (a.unitProfit === null) return 1;
          if (b.unitProfit === null) return -1;
          return a.unitProfit - b.unitProfit;
        });
      case "price-desc":
        return list.sort((a, b) => (b.price || 0) - (a.price || 0));
      case "price-asc":
        return list.sort((a, b) => (a.price || 0) - (b.price || 0));
      case "inventory-desc":
        return list.sort((a, b) => (b.inventory || 0) - (a.inventory || 0));
      case "inventory-asc":
        return list.sort((a, b) => (a.inventory || 0) - (b.inventory || 0));
      case "title-asc":
        return list.sort((a, b) =>
          (a.product?.title || "").localeCompare(b.product?.title || "")
        );
      default:
        return list;
    }
  }, [filteredVariants, sortBy]);

  const sortOptions = [
    { label: "Sort: Default", value: "default" },
    { label: "Margin: Lowest First ⚠️", value: "margin-asc" },
    { label: "Margin: Highest First 📈", value: "margin-desc" },
    { label: "Unit Profit: Highest First", value: "profit-desc" },
    { label: "Unit Profit: Lowest First", value: "profit-asc" },
    { label: "Price: High to Low", value: "price-desc" },
    { label: "Price: Low to High", value: "price-asc" },
    { label: "Inventory: Low to High", value: "inventory-asc" },
    { label: "Inventory: High to Low", value: "inventory-desc" },
    { label: "Product Title: A–Z", value: "title-asc" },
  ];

  const emptyStateMarkup = (
    <EmptyState
      heading={
        searchInput
          ? `No products match "${searchInput}"`
          : selectedTab !== 0
          ? `No ${tabs[selectedTab].content.toLowerCase()} products found`
          : "No products found"
      }
      action={
        searchInput || selectedTab !== 0
          ? {
              content: "Reset filters",
              onAction: () => {
                handleClearSearch();
                setSelectedTab(0);
                setSortBy("default");
              },
            }
          : undefined
      }
      image="https://cdn.shopify.com/s/files/1/0262/4071/2766/files/emptystate-files.png"
    >
      <p>
        {searchInput || selectedTab !== 0
          ? "Try adjusting your search terms or selecting a different status tab."
          : "Products and variants in this store will appear here once available."}
      </p>
    </EmptyState>
  );

  const rowMarkup = sortedVariants.map((item, index) => {
    const { product, isFirstVariant, hasMultipleVariants } = item;
    const numericProductId = product.id
      ? product.id.replace(/^.*\/Product\//, "")
      : "";
    const adminProductUrl =
      numericProductId && currentShop
        ? `https://${currentShop}/admin/products/${numericProductId}`
        : null;

    return (
      <IndexTable.Row id={item.id} key={item.id} position={index}>
        {/* Product / Variant Title */}
        <IndexTable.Cell>
          <InlineStack gap="300" blockAlign="center" wrap={false}>
            {isFirstVariant ? (
              <Thumbnail
                size="small"
                source={product.image || ImageIcon}
                alt={product.imageAlt || product.title}
              />
            ) : (
              <div style={{ width: 40, height: 40, flexShrink: 0 }} />
            )}
            <BlockStack gap="050">
              {isFirstVariant && (
                adminProductUrl ? (
                  <Link
                    url={adminProductUrl}
                    target="_blank"
                    removeUnderline
                    monochrome
                  >
                    <Text variant="bodyMd" fontWeight="bold" as="span">
                      {product.title}
                    </Text>
                  </Link>
                ) : (
                  <Text variant="bodyMd" fontWeight="bold" as="span">
                    {product.title}
                  </Text>
                )
              )}

              {/* Only show variant title when meaningful (not redundant "Default") */}
              {hasMultipleVariants &&
                item.title !== "Default Title" &&
                item.title !== "Default" && (
                  <Text variant="bodySm" tone="subdued" as="span">
                    {item.title}
                  </Text>
                )}

              {item.sku && (
                <Text variant="bodyXs" tone="subdued" as="span">
                  SKU: {item.sku}
                </Text>
              )}
            </BlockStack>
          </InlineStack>
        </IndexTable.Cell>

        {/* Vendor */}
        <IndexTable.Cell>
          <Text variant="bodyMd" as="span">
            {product.vendor || "—"}
          </Text>
        </IndexTable.Cell>

        {/* Selling Price */}
        <IndexTable.Cell>
          <Text variant="bodyMd" as="span">
            {formatMoney(item.price, item.currency)}
          </Text>
        </IndexTable.Cell>

        {/* Cost (COGS) */}
        <IndexTable.Cell>
          {item.cost !== null ? (
            <Text variant="bodyMd" as="span">
              {formatMoney(item.cost, item.currency)}
            </Text>
          ) : (
            <Text variant="bodyMd" tone="subdued" as="span">
              —
            </Text>
          )}
        </IndexTable.Cell>

        {/* Unit Profit */}
        <IndexTable.Cell>
          <Text
            variant="bodyMd"
            fontWeight="bold"
            tone={item.unitProfit === null ? "subdued" : undefined}
            as="span"
          >
            {item.unitProfit !== null
              ? item.unitProfit > 0
                ? `+${formatMoney(item.unitProfit, item.currency)}`
                : formatMoney(item.unitProfit, item.currency)
              : "—"}
          </Text>
        </IndexTable.Cell>

        {/* Margin */}
        <IndexTable.Cell>
          <Text
            variant="bodyMd"
            fontWeight="bold"
            tone={item.unitMargin === null ? "subdued" : undefined}
            as="span"
          >
            {formatPercent(item.unitMargin)}
          </Text>
        </IndexTable.Cell>

        {/* Inventory */}
        <IndexTable.Cell>
          <Text
            variant="bodyMd"
            fontWeight={item.inventory <= 0 ? "medium" : undefined}
            as="span"
          >
            {item.inventory ?? 0}
          </Text>
        </IndexTable.Cell>

        {/* Status */}
        <IndexTable.Cell>
          <Badge tone={getStatusTone(item.status)}>
            {getStatusLabel(item.status)}
          </Badge>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page
      title="Product Profitability"
      subtitle="See profit and margin for every Shopify product and variant. Values shown are unit economics (Selling Price − Cost)."
 
      fullWidth
    >
      <BlockStack gap="400">
        {initialError && (
          <Banner tone="critical" title="Notice">
            <p>{initialError}</p>
            <Box paddingTop="200">
              <Button onClick={handleRefresh}>Retry</Button>
            </Box>
          </Banner>
        )}
        <Card padding="400">
          <InlineStack align="space-between" blockAlign="center" wrap={false}>
            <BlockStack gap="050">
              <Text as="h2" variant="headingMd">
                Sync Status
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                {syncStatus.lastSyncedAt
                  ? `Last synced: ${new Date(syncStatus.lastSyncedAt).toLocaleString()}`
                  : "No sync has run yet"}
              </Text>
            </BlockStack>

            <InlineStack gap="200" blockAlign="center">
              <Badge tone={
                syncStatus.syncStatus === "success"
                  ? "success"
                  : syncStatus.syncStatus === "syncing"
                    ? "info"
                    : syncStatus.syncStatus === "failed"
                      ? "critical"
                      : "new"
              }>
                {syncStatus.syncStatus || "not_started"}
              </Badge>

              <Form method="post">
                <input type="hidden" name="_action" value="sync-products" />
                <button
                  type="submit"
                  style={{
                    border: "1px solid #dfe3e8",
                    background: "#008060",
                    color: "#fff",
                    borderRadius: "6px",
                    padding: "8px 14px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  disabled={navigation.state === "submitting"}
                >
                  {navigation.state === "submitting" ? "Syncing..." : "Manual Sync"}
                </button>
              </Form>
            </InlineStack>
          </InlineStack>

          {(syncStatus.lastSyncError || syncStatus.productsSynced) && (
            <Box marginTop="200">
              <Text as="p" variant="bodySm" tone="subdued">
                {syncStatus.lastSyncError
                  ? `Last error: ${syncStatus.lastSyncError}`
                  : `Products synced: ${syncStatus.productsSynced}`}
              </Text>
            </Box>
          )}
        </Card>

        {/* ---- Summary Metrics (Clickable Quick Filters) ---- */}
        <InlineGrid columns={{ xs: 1, sm: 2, md: 3, lg: 5 }} gap="400">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setSelectedTab(0)}
            onKeyDown={(e) => e.key === "Enter" && setSelectedTab(0)}
            style={{
              cursor: "pointer",
              borderRadius: "12px",
              outline: selectedTab === 0 ? "2px solid #202223" : "none",
              outlineOffset: "2px",
              transition: "all 0.15s ease",
            }}
          >
            <Card padding="400">
              <BlockStack gap="100">
                <Text as="h3" variant="headingXs" tone="subdued">
                  TOTAL PRODUCTS
                </Text>
                <Text as="p" variant="heading2xl" fontWeight="bold">
                  {totalProducts ?? "—"}
                </Text>
                <Text as="span" variant="bodyXs" tone="subdued">
                  Total Shopify products
                </Text>
              </BlockStack>
            </Card>
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={() => setSelectedTab(1)}
            onKeyDown={(e) => e.key === "Enter" && setSelectedTab(1)}
            style={{
              cursor: "pointer",
              borderRadius: "12px",
              outline: selectedTab === 1 ? "2px solid #008060" : "none",
              outlineOffset: "2px",
              transition: "all 0.15s ease",
            }}
          >
            <Card padding="400">
              <BlockStack gap="100">
                <Text as="h3" variant="headingXs" tone="subdued">
                  PROFITABLE VARIANTS
                </Text>
                <Text
                  as="p"
                  variant="heading2xl"
                  fontWeight="bold"
                >
                  {summary?.profitableVariants ?? "—"}
                </Text>
                <Text as="span" variant="bodyXs" tone="subdued">
                  Margin ≥ 20%
                </Text>
              </BlockStack>
            </Card>
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={() => setSelectedTab(2)}
            onKeyDown={(e) => e.key === "Enter" && setSelectedTab(2)}
            style={{
              cursor: "pointer",
              borderRadius: "12px",
              outline: selectedTab === 2 ? "2px solid #b98900" : "none",
              outlineOffset: "2px",
              transition: "all 0.15s ease",
            }}
          >
            <Card padding="400">
              <BlockStack gap="100">
                <Text as="h3" variant="headingXs" tone="subdued">
                  LOW MARGIN VARIANTS
                </Text>
                <Text
                  as="p"
                  variant="heading2xl"
                  fontWeight="bold"
                >
                  {summary?.lowMarginVariants ?? "—"}
                </Text>
                <Text as="span" variant="bodyXs" tone="subdued">
                  Margin between 0% and 20%
                </Text>
              </BlockStack>
            </Card>
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={() => setSelectedTab(3)}
            onKeyDown={(e) => e.key === "Enter" && setSelectedTab(3)}
            style={{
              cursor: "pointer",
              borderRadius: "12px",
              outline: selectedTab === 3 ? "2px solid #303030" : "none",
              outlineOffset: "2px",
              transition: "all 0.15s ease",
            }}
          >
            <Card padding="400">
              <BlockStack gap="100">
                <Text as="h3" variant="headingXs" tone="subdued">
                  LOSS MAKING VARIANTS
                </Text>
                <Text
                  as="p"
                  variant="heading2xl"
                  fontWeight="bold"
                >
                  {summary?.lossMakingVariants ?? "—"}
                </Text>
                <Text as="span" variant="bodyXs" tone="subdued">
                  Negative unit margin
                </Text>
              </BlockStack>
            </Card>
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={() => setSortBy(sortBy === "margin-asc" ? "default" : "margin-asc")}
            onKeyDown={(e) =>
              e.key === "Enter" &&
              setSortBy(sortBy === "margin-asc" ? "default" : "margin-asc")
            }
            style={{
              cursor: "pointer",
              borderRadius: "12px",
              outline: sortBy === "margin-asc" ? "2px solid #5c6ac4" : "none",
              outlineOffset: "2px",
              transition: "all 0.15s ease",
            }}
            title="Click to sort lowest margin first"
          >
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
                  {formatPercent(summary?.averageUnitMargin)}
                </Text>
                <Text as="span" variant="bodyXs" tone="subdued">
                  {summary?.variantsWithCost > 0
                    ? `${summary.variantsWithCost} variants with cost`
                    : "0 variants with cost"}
                </Text>
              </BlockStack>
            </Card>
          </div>
        </InlineGrid>

        {/* ---- Table Card with Tabs, Search & Sort ---- */}
        <Card padding="0">
          <Tabs
            tabs={tabs}
            selected={selectedTab}
            onSelect={(index) => setSelectedTab(index)}
          />

          <Divider />

          <Box padding="300">
            <InlineStack gap="300" align="space-between" blockAlign="center">
              <div style={{ flex: 1, minWidth: "260px" }}>
                <TextField
                  label="Search products"
                  labelHidden
                  placeholder="Search products by title…"
                  value={searchInput}
                  onChange={handleSearchChange}
                  prefix={<Icon source={SearchIcon} />}
                  clearButton
                  onClear={handleClearSearch}
                  autoComplete="off"
                  disabled={isLoading}
                />
              </div>
              <div style={{ width: "230px" }}>
                <Select
                  label="Sort by"
                  labelHidden
                  options={sortOptions}
                  value={sortBy}
                  onChange={setSortBy}
                />
              </div>
            </InlineStack>
          </Box>

          <IndexTable
            resourceName={{ singular: "variant", plural: "variants" }}
            itemCount={sortedVariants.length}
            headings={[
              { title: "Product / Variant" },
              { title: "Vendor" },
              { title: "Selling Price" },
              { title: "Cost (COGS)" },
              { title: "Unit Profit" },
              { title: "Margin" },
              { title: "Inventory" },
              { title: "Status" },
            ]}
            selectable={false}
            emptyState={emptyStateMarkup}
            loading={isLoading}
            pagination={{
              hasPrevious: Boolean(hasPrevious),
              onPrevious: handlePrevious,
              hasNext: Boolean(pageInfo?.hasNextPage),
              onNext: handleNext,
              label: `Page ${currentPage}${
                totalProducts > 0
                  ? ` · Showing ${products.length} of ${totalProducts} products`
                  : ""
              }`,
            }}
          >
            {rowMarkup}
          </IndexTable>
        </Card>

        {/* ---- Dismissible Information Banner ---- 
        {showBanner && (
          <Banner
            tone="info"
            title="Unit Economics — Not Final Profit"
            onDismiss={() => setShowBanner(false)}
          >
            <p>
              Values shown are <strong>unit economics</strong>: Selling Price
              minus Shopify product cost (COGS). This represents base product
              profitability. Actual order revenue, discounts, refunds,
              shipping, payment fees, and marketing spend will be reflected once
              Order Sync is enabled.
            </p>
          </Banner>
        )}*/}
      </BlockStack>
    </Page>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const revalidator = useRevalidator();

  return (
    <Page title="Product Profitability" fullWidth>
      <Card padding="500">
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            Product Profitability
          </Text>
          <Banner tone="critical" title="Something went wrong">
            <p>{error?.message || "Failed to load product profitability data."}</p>
          </Banner>
          <InlineStack gap="200">
            <Button variant="primary" onClick={() => revalidator.revalidate()}>
              Retry
            </Button>
          </InlineStack>
        </BlockStack>
      </Card>
    </Page>
  );
}