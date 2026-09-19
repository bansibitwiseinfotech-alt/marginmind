/* eslint-disable react/prop-types */
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  InlineGrid,
  Text,
  Badge,
  TextField,
  Button,
  Box,
  Banner,
  Divider,
  Pagination,
  Modal,
  Spinner,
  EmptyState,
  SkeletonPage,
  SkeletonBodyText,
  SkeletonDisplayText,
  Select,
  Tooltip,
  IndexTable,
  Tabs,
  Link,
} from "@shopify/polaris";
import { RefreshIcon, SearchIcon } from "@shopify/polaris-icons";
        
// ---------------------------------------------------------------------------
// Formatting Helpers
// ---------------------------------------------------------------------------
function formatPercentage(value) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    !Number.isFinite(Number(value))
  ) {
    return "—";
  }
  return `${Number(value).toFixed(2)}%`;
}

function formatMoney(value, currency = "USD") {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    !Number.isFinite(Number(value))
  ) {
    return "—";
  }
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(Number(value));
  } catch {
    return `$${Number(value).toFixed(2)}`;
  }
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
}

function formatRelativeTime(value) {
  if (!value) return "—";
  try {
    const diff = Date.now() - new Date(value).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return "—";
  }
}

function getShopifyAdminUrl(shop, resourceType, resourceId) {
  if (!shop || !resourceId) return null;
  const cleanShop = shop.replace(/^https?:\/\//, "").split("/")[0];
  const numericId = String(resourceId).split("/").pop().replace(/\D/g, "");

  const type = String(resourceType || "").toUpperCase();
  if (type.includes("ORDER")) {
    return numericId
      ? `https://${cleanShop}/admin/orders/${numericId}`
      : `https://${cleanShop}/admin/orders`;
  }
  if (type.includes("DISCOUNT")) {
    return numericId
      ? `https://${cleanShop}/admin/discounts/${numericId}`
      : `https://${cleanShop}/admin/discounts`;
  }
  return numericId
    ? `https://${cleanShop}/admin/products/${numericId}`
    : `https://${cleanShop}/admin/products`;
}

function getContextualGuidance(primaryDriver) {
  const driver = String(primaryDriver || "").toLowerCase();
  if (driver.includes("cost") || driver.includes("cogs")) {
    return "Review product cost per item in Shopify Inventory settings and evaluate whether supplier price increases require an updated selling price.";
  }
  if (driver.includes("discount") || driver.includes("markdown")) {
    return "Review active discount codes or promotions applied to this resource. Consider setting minimum spend thresholds or capping percentage markdowns.";
  }
  if (driver.includes("shipping")) {
    return "Shipping charged to the customer is lower than your fulfillment expense. Consider adjusting shipping rates or setting free shipping thresholds.";
  }
  if (driver.includes("refund") || driver.includes("return")) {
    return "Customer returns or partial refunds reduced net order margin. Review return reasons and product quality reports.";
  }
  return "Analyze the product pricing buffer and ensure unit costs and overhead factors are accurately maintained.";
}

function getThresholdSourceLabel(source, threshold) {
  const formatted =
    threshold != null ? `${Number(threshold).toFixed(2)}%` : "";
  const src = String(source || "").toUpperCase();
  if (src === "PRODUCT") return `Product Override (${formatted})`;
  if (src === "CATEGORY") return `Category Override (${formatted})`;
  return `Global Threshold (${formatted})`;
}

// ---------------------------------------------------------------------------
// Reusable MarginMind Metric Card
// ---------------------------------------------------------------------------
function SummaryCard({ title, value, tone, subtitle, active, onClick }) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => onClick && e.key === "Enter" && onClick()}
      style={{
        cursor: onClick ? "pointer" : "default",
        borderRadius: "12px",
        outline: active ? "2px solid #202223" : "none",
        outlineOffset: "2px",
        transition: "all 0.15s ease",
        height: "100%",
      }}
    >
      <Card padding="400">
        <BlockStack gap="100">
          <Text as="h3" variant="headingXs" tone="subdued">
            {title}
          </Text>
          <Text as="p" variant="heading2xl" fontWeight="bold" tone={tone}>
            {value}
          </Text>
          {subtitle && (
            <Text as="span" variant="bodyXs" tone="subdued">
              {subtitle}
            </Text>
          )}
        </BlockStack>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component: Profit Alerts
// ---------------------------------------------------------------------------
export default function ProfitAlerts({ shop, initialData, initialError }) {
  // -------------------------------------------------------------------------
  // Filters, Tabs, Status, Search
  // -------------------------------------------------------------------------
  // selectedTab: 0: ALL, 1: CRITICAL, 2: WARNING, 3: PRODUCT, 4: ORDER, 5: DISCOUNT
  const [selectedTab, setSelectedTab] = useState(0);
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [severityFilter, setSeverityFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState("lastDetectedAt:desc");

  // -------------------------------------------------------------------------
  // Alerts Data & Summaries
  // -------------------------------------------------------------------------
  const [alerts, setAlerts] = useState(initialData?.items || []);
  const [pagination, setPagination] = useState(
    initialData?.pagination || { page: 1, limit: 25, total: 0, totalPages: 1 }
  );
  const [summary, setSummary] = useState(
    initialData?.summary || {
      totalAlerts: 0,
      activeAlerts: 0,
      criticalAlerts: 0,
      warningAlerts: 0,
      resolvedAlerts: 0,
      acknowledgedAlerts: 0,
      unreadAlerts: 0,
      healthyCount: 0,
      totalMonitored: 0,
      productAlerts: 0,
      orderAlerts: 0,
      discountAlerts: 0,
      affectedProductsCount: 0,
      affectedOrdersCount: 0,
      affectedDiscountsCount: 0,
      globalMarginThreshold: null,
      productThresholdsCount: 0,
      categoryThresholdsCount: 0,
      enabled: true,
      lastDetectedAt: null,
    }
  );

  const [loading, setLoading] = useState(!initialData && !initialError);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(initialError || null);
  const [bannerNotice, setBannerNotice] = useState(null);
  const [isDetecting, setIsDetecting] = useState(false);

  // -------------------------------------------------------------------------
  // Detail Modal State
  // -------------------------------------------------------------------------
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [modalAlert, setModalAlert] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);

  // -------------------------------------------------------------------------
  // Threshold Settings Modal State
  // -------------------------------------------------------------------------
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState(null);
  const [globalThresholdInput, setGlobalThresholdInput] = useState("");
  const [criticalThresholdInput, setCriticalThresholdInput] = useState("");
  const [productThresholds, setProductThresholds] = useState([]);
  const [categoryThresholds, setCategoryThresholds] = useState([]);
  const [configEnabled, setConfigEnabled] = useState(true);
  const [availableProducts, setAvailableProducts] = useState([]);
  const [availableCategories, setAvailableCategories] = useState([]);
  const [selectedProductToAdd, setSelectedProductToAdd] = useState("");
  const [productThresholdToAdd, setProductThresholdToAdd] = useState("");
  const [selectedCategoryToAdd, setSelectedCategoryToAdd] = useState("");
  const [categoryThresholdToAdd, setCategoryThresholdToAdd] = useState("");

  // Search Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Map tabs to filter params
  const activeTabType = useMemo(() => {
    switch (selectedTab) {
      case 1:
        return "CRITICAL";
      case 2:
        return "WARNING";
      case 3:
        return "PRODUCT";
      case 4:
        return "ORDER";
      case 5:
        return "DISCOUNT";
      default:
        return "ALL";
    }
  }, [selectedTab]);

  // -------------------------------------------------------------------------
  // Data Fetching: Alert Feed
  // -------------------------------------------------------------------------
  const fetchAlerts = useCallback(
    async (
      page = 1,
      tabType = activeTabType,
      status = statusFilter,
      search = debouncedSearch,
      extraSev = severityFilter,
      extraCat = categoryFilter
    ) => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", "25");

        if (status && status !== "ALL") {
          params.set("status", status);
        }

        // Apply Tab Filter
        if (tabType === "CRITICAL") {
          params.set("severity", "CRITICAL");
        } else if (tabType === "WARNING") {
          params.set("severity", "WARNING");
        } else if (tabType === "PRODUCT") {
          params.set("resourceType", "PRODUCT");
        } else if (tabType === "ORDER") {
          params.set("resourceType", "ORDER");
        } else if (tabType === "DISCOUNT") {
          params.set("resourceType", "DISCOUNT");
        } else {
          if (extraSev) params.set("severity", extraSev);
          if (extraCat) params.set("resourceType", extraCat);
        }

        if (search) {
          params.set("search", search);
        }

        const response = await fetch(`/api/profit-alerts?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: Failed to load profit alerts`);
        }

        const data = await response.json();
        if (!data.success) {
          throw new Error(data.message || "Failed to load profit alerts");
        }

        setAlerts(data.items || []);
        if (data.pagination) setPagination(data.pagination);
        if (data.summary) setSummary(data.summary);
      } catch (err) {
        console.error("[MarginMind] fetchAlerts error:", err);
        setError("Unable to load profit alerts. Please refresh the page.");
      } finally {
        setLoading(false);
      }
    },
    [activeTabType, statusFilter, debouncedSearch, severityFilter, categoryFilter]
  );

  // Trigger re-fetch on filter changes
  useEffect(() => {
    fetchAlerts(1, activeTabType, statusFilter, debouncedSearch, severityFilter, categoryFilter);
  }, [fetchAlerts, activeTabType, statusFilter, debouncedSearch, severityFilter, categoryFilter]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAlerts(
      pagination.page,
      activeTabType,
      statusFilter,
      debouncedSearch,
      severityFilter,
      categoryFilter
    );
    setRefreshing(false);
  }, [
    fetchAlerts,
    pagination.page,
    activeTabType,
    statusFilter,
    debouncedSearch,
    severityFilter,
    categoryFilter,
  ]);

  // -------------------------------------------------------------------------
  // Run Detection Action
  // -------------------------------------------------------------------------
  const handleRunDetection = useCallback(async () => {
    setIsDetecting(true);
    setBannerNotice(null);
    try {
      const response = await fetch("/api/profit-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Alert detection failed.");
      }

      setBannerNotice({
        status: "success",
        title: "Detection Complete",
        message: `Evaluated ${data.totalEvaluated ?? 0} store resources. Created ${data.created ?? 0} new alert(s), updated ${data.updated ?? 0}, and resolved ${data.resolved ?? 0}.`,
      });

      await fetchAlerts(1, activeTabType, statusFilter, debouncedSearch, severityFilter, categoryFilter);
    } catch (err) {
      console.error("[MarginMind] Detection error:", err);
      setBannerNotice({
        status: "critical",
        title: "Detection Failed",
        message: err.message || "Unable to run margin detection across store data.",
      });
    } finally {
      setIsDetecting(false);
    }
  }, [fetchAlerts, activeTabType, statusFilter, debouncedSearch, severityFilter, categoryFilter]);

  // -------------------------------------------------------------------------
  // Alert Details Modal & Actions
  // -------------------------------------------------------------------------
  const handleOpenDetailModal = useCallback(async (alert) => {
    setModalAlert(alert);
    setDetailModalOpen(true);
    setModalLoading(true);

    try {
      const response = await fetch(`/api/profit-alerts/${alert._id}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.alert) {
          setModalAlert(data.alert);
        }
      }
    } catch (err) {
      console.warn("[MarginMind] Could not fetch fresh alert details:", err);
    } finally {
      setModalLoading(false);
    }
  }, []);

  const handleCloseDetailModal = useCallback(() => {
    setDetailModalOpen(false);
    setModalAlert(null);
  }, []);

  const handleAcknowledgeAlert = useCallback(async () => {
    if (!modalAlert) return;
    setActionInProgress(true);
    try {
      const response = await fetch(`/api/profit-alerts/${modalAlert._id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "acknowledge" }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to acknowledge alert.");
      }

      const updatedAlert = data.alert || {
        ...modalAlert,
        status: "ACKNOWLEDGED",
        acknowledgedAt: new Date(),
      };

      // 1. Update modal alert
      setModalAlert(updatedAlert);

      // 2. Update summary counts immediately from backend response
      if (data.summary) {
        setSummary(data.summary);
      }

      // 3. Update alert in list immediately
      setAlerts((prev) =>
        prev.map((a) => (a._id === modalAlert._id ? updatedAlert : a))
      );

      setBannerNotice({
        status: "success",
        title: "Alert Acknowledged",
        message: `Alert for "${modalAlert.resourceName}" has been acknowledged.`,
      });
    } catch (err) {
      console.error("[MarginMind] Acknowledge error:", err);
      setBannerNotice({
        status: "critical",
        title: "Action Failed",
        message: err.message || "Failed to acknowledge alert.",
      });
    } finally {
      setActionInProgress(false);
    }
  }, [modalAlert]);

  const handleResolveAlert = useCallback(async () => {
    if (!modalAlert) return;
    setActionInProgress(true);
    try {
      const response = await fetch(`/api/profit-alerts/${modalAlert._id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "resolve", resolutionSource: "MERCHANT" }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to resolve alert.");
      }

      const updatedAlert = data.alert || {
        ...modalAlert,
        status: "RESOLVED",
        resolvedAt: new Date(),
        resolutionSource: "MERCHANT",
      };

      // 1. Update modal alert
      setModalAlert(updatedAlert);

      // 2. Update summary counts immediately from backend response
      if (data.summary) {
        setSummary(data.summary);
      } else {
        setSummary((prev) => ({
          ...prev,
          activeAlerts: Math.max(0, (prev?.activeAlerts || 1) - 1),
          criticalAlerts:
            modalAlert.severity === "CRITICAL"
              ? Math.max(0, (prev?.criticalAlerts || 1) - 1)
              : prev?.criticalAlerts,
          warningAlerts:
            modalAlert.severity === "WARNING"
              ? Math.max(0, (prev?.warningAlerts || 1) - 1)
              : prev?.warningAlerts,
          resolvedAlerts: (prev?.resolvedAlerts || 0) + 1,
          healthyCount: (prev?.healthyCount || 0) + 1,
        }));
      }

      // 3. Update alert list
      if (statusFilter === "ACTIVE") {
        // Remove from active list immediately without waiting for reload
        setAlerts((prev) => prev.filter((a) => a._id !== modalAlert._id));
        setPagination((prev) => ({
          ...prev,
          total: Math.max(0, (prev?.total || 1) - 1),
        }));
      } else {
        // If on ALL or RESOLVED view, update status in place
        setAlerts((prev) =>
          prev.map((a) => (a._id === modalAlert._id ? updatedAlert : a))
        );
      }

      setBannerNotice({
        status: "success",
        title: "Alert Resolved",
        message: `Alert for "${modalAlert.resourceName}" has been successfully resolved and archived.`,
      });
    } catch (err) {
      console.error("[MarginMind] Resolve error:", err);
      setBannerNotice({
        status: "critical",
        title: "Action Failed",
        message: err.message || "Failed to resolve alert.",
      });
    } finally {
      setActionInProgress(false);
    }
  }, [modalAlert, statusFilter]);

  // -------------------------------------------------------------------------
  // Threshold Configuration Modal & Handlers
  // -------------------------------------------------------------------------
  const handleOpenConfig = useCallback(async () => {
    setConfigModalOpen(true);
    setConfigLoading(true);
    setConfigError(null);

    try {
      const response = await fetch("/api/profit-alerts/config");
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load alert configuration.");
      }

      const cfg = data.config || {};
      setGlobalThresholdInput(
        cfg.globalMarginThreshold !== null &&
          cfg.globalMarginThreshold !== undefined
          ? String(cfg.globalMarginThreshold)
          : ""
      );
      setCriticalThresholdInput(
        cfg.criticalMarginThreshold !== null &&
          cfg.criticalMarginThreshold !== undefined
          ? String(cfg.criticalMarginThreshold)
          : ""
      );
      setProductThresholds(cfg.productThresholds || []);
      setCategoryThresholds(cfg.categoryThresholds || []);
      setConfigEnabled(cfg.enabled !== false);
      setAvailableProducts(data.availableProducts || []);
      setAvailableCategories(data.availableCategories || []);

      if (data.availableProducts && data.availableProducts.length > 0) {
        setSelectedProductToAdd(data.availableProducts[0].id);
      }
      if (data.availableCategories && data.availableCategories.length > 0) {
        setSelectedCategoryToAdd(data.availableCategories[0]);
      }
    } catch (err) {
      console.error("[MarginMind] handleOpenConfig error:", err);
      setConfigError("Unable to load alert configuration.");
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const handleCloseConfig = useCallback(() => {
    setConfigModalOpen(false);
    setConfigError(null);
  }, []);

  const handleAddProductOverride = useCallback(() => {
    if (!selectedProductToAdd || !productThresholdToAdd) return;
    const threshNum = Number(productThresholdToAdd);
    if (!Number.isFinite(threshNum) || threshNum < 0 || threshNum > 100) {
      setConfigError("Product threshold must be a number between 0% and 100%.");
      return;
    }

    setProductThresholds((prev) => {
      const filtered = prev.filter((p) => p.productId !== selectedProductToAdd);
      return [
        ...filtered,
        { productId: selectedProductToAdd, threshold: threshNum },
      ];
    });
    setProductThresholdToAdd("");
    setConfigError(null);
  }, [selectedProductToAdd, productThresholdToAdd]);

  const handleRemoveProductOverride = useCallback((productId) => {
    setProductThresholds((prev) =>
      prev.filter((p) => p.productId !== productId)
    );
  }, []);

  const handleAddCategoryOverride = useCallback(() => {
    const catName = selectedCategoryToAdd.trim();
    if (!catName || !categoryThresholdToAdd) return;
    const threshNum = Number(categoryThresholdToAdd);
    if (!Number.isFinite(threshNum) || threshNum < 0 || threshNum > 100) {
      setConfigError(
        "Category threshold must be a number between 0% and 100%."
      );
      return;
    }

    setCategoryThresholds((prev) => {
      const filtered = prev.filter(
        (c) => c.category.toLowerCase() !== catName.toLowerCase()
      );
      return [...filtered, { category: catName, threshold: threshNum }];
    });
    setCategoryThresholdToAdd("");
    setConfigError(null);
  }, [selectedCategoryToAdd, categoryThresholdToAdd]);

  const handleRemoveCategoryOverride = useCallback((category) => {
    setCategoryThresholds((prev) =>
      prev.filter((c) => c.category !== category)
    );
  }, []);

  const handleSaveConfig = useCallback(async () => {
    setConfigSaving(true);
    setConfigError(null);

    let globalVal = null;
    if (
      globalThresholdInput !== "" &&
      globalThresholdInput !== null &&
      globalThresholdInput !== undefined
    ) {
      const num = Number(globalThresholdInput);
      if (!Number.isFinite(num) || num < 0 || num > 100) {
        setConfigError("Target margin threshold must be a valid percentage between 0 and 100.");
        setConfigSaving(false);
        return;
      }
      globalVal = num;
    }

    let critVal = null;
    if (
      criticalThresholdInput !== "" &&
      criticalThresholdInput !== null &&
      criticalThresholdInput !== undefined
    ) {
      const num = Number(criticalThresholdInput);
      if (!Number.isFinite(num) || num < 0 || num > 100) {
        setConfigError("Critical alert threshold must be a valid percentage between 0 and 100.");
        setConfigSaving(false);
        return;
      }
      critVal = num;
    }

    try {
      const payload = {
        globalMarginThreshold: globalVal,
        criticalMarginThreshold: critVal,
        productThresholds,
        categoryThresholds,
        enabled: configEnabled,
      };

      const response = await fetch("/api/profit-alerts/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to save threshold configuration.");
      }

      setConfigModalOpen(false);
      setBannerNotice({
        status: "success",
        title: "Threshold Rules Updated",
        message: "Your margin monitoring thresholds have been saved successfully.",
      });

      await fetchAlerts(1, activeTabType, statusFilter, debouncedSearch, severityFilter, categoryFilter);
    } catch (err) {
      console.error("[MarginMind] handleSaveConfig error:", err);
      setConfigError(err.message || "Unable to save threshold rules.");
    } finally {
      setConfigSaving(false);
    }
  }, [
    globalThresholdInput,
    criticalThresholdInput,
    productThresholds,
    categoryThresholds,
    configEnabled,
    fetchAlerts,
    activeTabType,
    statusFilter,
    debouncedSearch,
    severityFilter,
    categoryFilter,
  ]);

  // Product title lookup map for override display
  const productTitleMap = useMemo(() => {
    const map = new Map();
    for (const p of availableProducts) {
      map.set(p.id, p.title);
    }
    return map;
  }, [availableProducts]);

  // Modal computed values
  const modalShopifyUrl = useMemo(() => {
    if (!modalAlert) return null;
    return getShopifyAdminUrl(
      shop,
      modalAlert.resourceType || modalAlert.alertType,
      modalAlert.resourceId ||
        modalAlert.evidence?.productId ||
        modalAlert.evidence?.orderId
    );
  }, [shop, modalAlert]);

  const modalDifference = useMemo(() => {
    if (!modalAlert) return "—";
    if (
      modalAlert.marginDifference != null &&
      Number.isFinite(Number(modalAlert.marginDifference))
    ) {
      const val = Number(modalAlert.marginDifference);
      return `${val > 0 ? "+" : ""}${val.toFixed(2)} pts`;
    }
    if (modalAlert.currentMargin != null && modalAlert.threshold != null) {
      const diff =
        Number(modalAlert.currentMargin) - Number(modalAlert.threshold);
      return `${diff > 0 ? "+" : ""}${diff.toFixed(2)} pts`;
    }
    return "—";
  }, [modalAlert]);

  const modalDirectButtonLabel = useMemo(() => {
    const rType = String(
      modalAlert?.resourceType || modalAlert?.alertType || ""
    ).toUpperCase();
    if (rType.includes("ORDER")) return "Open Order in Shopify";
    if (rType.includes("DISCOUNT")) return "Open Discount in Shopify";
    return "Open Product in Shopify";
  }, [modalAlert]);

  // Status Filter options
  const statusOptions = [
    { label: "Active Alerts (Unresolved)", value: "ACTIVE" },
    { label: "Resolved Alerts", value: "RESOLVED" },
    { label: "Acknowledged Only", value: "ACKNOWLEDGED" },
    { label: "All Alerts (History)", value: "ALL" },
  ];

  // Sort Options
  const sortOptions = [
    { label: "Newest First", value: "lastDetectedAt:desc" },
    { label: "Oldest First", value: "lastDetectedAt:asc" },
    { label: "Lowest Margin First", value: "currentMargin:asc" },
    { label: "Highest Margin First", value: "currentMargin:desc" },
  ];

  // Status Tabs with Live Count Badges
  const tabs = [
    {
      id: "all",
      content: "All Alerts",
      badge:
        statusFilter === "ACTIVE"
          ? summary?.activeAlerts > 0
            ? String(summary.activeAlerts)
            : undefined
          : statusFilter === "RESOLVED"
          ? summary?.resolvedAlerts > 0
            ? String(summary.resolvedAlerts)
            : undefined
          : summary?.totalAlerts > 0
          ? String(summary.totalAlerts)
          : undefined,
    },
    {
      id: "critical",
      content: "Critical",
      badge:
        summary?.criticalAlerts > 0 ? String(summary.criticalAlerts) : undefined,
    },
    {
      id: "warning",
      content: "Warning",
      badge:
        summary?.warningAlerts > 0 ? String(summary.warningAlerts) : undefined,
    },
    {
      id: "product",
      content: "Product Alerts",
      badge:
        summary?.productAlerts > 0 ? String(summary.productAlerts) : undefined,
    },
    {
      id: "order",
      content: "Order Alerts",
      badge:
        summary?.orderAlerts > 0 ? String(summary.orderAlerts) : undefined,
    },
    {
      id: "discount",
      content: "Discount Alerts",
      badge:
        summary?.discountAlerts > 0 ? String(summary.discountAlerts) : undefined,
    },
  ];

  // IndexTable Resource Name
  const resourceName = {
    singular: "profit alert",
    plural: "profit alerts",
  };

  // -------------------------------------------------------------------------
  // Render Loading Skeleton
  // -------------------------------------------------------------------------
  if (loading && alerts.length === 0 && !error) {
    return (
      <SkeletonPage title="Profit Alerts" fullWidth>
        <BlockStack gap="400">
          <SkeletonDisplayText size="small" />
          <InlineGrid columns={{ xs: 1, sm: 2, md: 5 }} gap="300">
            <Card padding="400"><SkeletonBodyText lines={3} /></Card>
            <Card padding="400"><SkeletonBodyText lines={3} /></Card>
            <Card padding="400"><SkeletonBodyText lines={3} /></Card>
            <Card padding="400"><SkeletonBodyText lines={3} /></Card>
            <Card padding="400"><SkeletonBodyText lines={3} /></Card>
          </InlineGrid>
          <Card padding="400"><SkeletonBodyText lines={2} /></Card>
          <Card padding="0"><SkeletonBodyText lines={8} /></Card>
        </BlockStack>
      </SkeletonPage>
    );
  }

  // -------------------------------------------------------------------------
  // MAIN PAGE RENDER
  // -------------------------------------------------------------------------
  return (
    <Page
      fullWidth
      title="Profit Alerts"
      subtitle="Monitor margin changes and catch profit problems before they impact your business."
      primaryAction={{
        content: isDetecting ? "Scanning Store..." : "Run Detection",
        onAction: handleRunDetection,
        loading: isDetecting,
      }}
      secondaryActions={[
        {
          content: "Manage Thresholds",
          onAction: handleOpenConfig,
        },
        {
          content: "Refresh",
          icon: RefreshIcon,
          onAction: handleRefresh,
          loading: refreshing,
        },
      ]}
    >
      <BlockStack gap="400">
        {/* Banner Feedback */}
        {bannerNotice && (
          <Banner
            title={bannerNotice.title}
            tone={bannerNotice.status === "critical" ? "critical" : "success"}
            onDismiss={() => setBannerNotice(null)}
          >
            <p>{bannerNotice.message}</p>
          </Banner>
        )}

        {error && (
          <Banner title="Unable to load profit alerts" tone="critical">
            <p>{error}</p>
          </Banner>
        )}

        {/* ================================================================= */}
        {/* TOP SUMMARY METRICS (5 Cards per Section 2 Requirements)           */}
        {/* ================================================================= */}
        <InlineGrid columns={{ xs: 1, sm: 2, md: 5 }} gap="300">
          {/* Card 1 — Total Alerts */}
          <SummaryCard
            title="TOTAL ALERTS"
            value={summary?.totalAlerts ?? 0}
            tone="subdued"
            subtitle="All recorded alerts"
            active={statusFilter === "ALL" && selectedTab === 0}
            onClick={() => {
              setStatusFilter("ALL");
              setSelectedTab(0);
            }}
          />

          {/* Card 2 — Active Alerts */}
          <SummaryCard
            title="ACTIVE ALERTS"
            value={summary?.activeAlerts ?? 0}
            tone={summary?.activeAlerts > 0 ? "caution" : "success"}
            subtitle="Alerts requiring attention"
            active={statusFilter === "ACTIVE" && selectedTab === 0}
            onClick={() => {
              setStatusFilter("ACTIVE");
              setSelectedTab(0);
            }}
          />

          {/* Card 3 — Critical Alerts */}
          <SummaryCard
            title="CRITICAL ALERTS"
            value={summary?.criticalAlerts ?? 0}
            tone="critical"
            subtitle="Immediate attention required"
            active={selectedTab === 1}
            onClick={() => {
              setStatusFilter("ACTIVE");
              setSelectedTab(1);
            }}
          />

          {/* Card 4 — Warning Alerts */}
          <SummaryCard
            title="WARNING ALERTS"
            value={summary?.warningAlerts ?? 0}
            tone="caution"
            subtitle="Margins below configured target"
            active={selectedTab === 2}
            onClick={() => {
              setStatusFilter("ACTIVE");
              setSelectedTab(2);
            }}     
          />

          {/* Card 5 — Resolved Alerts */}
          <SummaryCard
            title="RESOLVED ALERTS"
            value={summary?.resolvedAlerts ?? 0}
            tone="success"
            subtitle="Alerts resolved by system or merchant according to defined rules"
            active={statusFilter === "RESOLVED"}
            onClick={() => {
              setStatusFilter("RESOLVED");
              setSelectedTab(0);
            }}
          />
        </InlineGrid>

        {/* ================================================================= */}
        {/* MONITORING STATUS & RULES STRIP                                   */}
        {/* ================================================================= */}
        <Card padding="300">
          <InlineStack align="space-between" blockAlign="center" wrap>
            <InlineStack gap="300" blockAlign="center" wrap>
              <Badge tone={summary?.enabled !== false ? "success" : "attention"}>
                {summary?.enabled !== false ? "Monitoring Active" : "Monitoring Paused"}
              </Badge>

              <Text variant="bodyMd" as="span">
                Global Margin Target:{" "}
                <Text as="span" fontWeight="bold">
                  {summary?.globalMarginThreshold != null
                    ? `${Number(summary.globalMarginThreshold).toFixed(2)}%`
                    : "Not Configured"}
                </Text>
              </Text>

              <Text variant="bodySm" tone="subdued" as="span">
                Priority: <strong>Product &gt; Category &gt; Global</strong>
              </Text>

              {summary?.lastDetectedAt && (
                <Tooltip content={formatDate(summary.lastDetectedAt)}>
                  <Text variant="bodySm" tone="subdued" as="span">
                    · Evaluated {formatRelativeTime(summary.lastDetectedAt)}
                  </Text>
                </Tooltip>
              )}
            </InlineStack>

            <InlineStack gap="200" blockAlign="center">
              <Button size="slim" variant="secondary" onClick={handleOpenConfig}>
                Configure Rules
              </Button>
            </InlineStack>
          </InlineStack>
        </Card>

        {/* ================================================================= */}
        {/* MAIN ALERTS SECTION: TABS + TOOLBAR + INDEXTABLE                  */}
        {/* ================================================================= */}
        <Card padding="0">
          {/* Status Tabs */}
          <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab} />

          {/* Search & Filters Toolbar */}
          <Box padding="300" borderBlockEndWidth="025" borderColor="border">
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center" wrap>
                {/* Search Bar */}
                <div style={{ flex: 1, minWidth: "260px" }}>
                  <TextField
                    placeholder="Search by product, order #, discount code, or reason…"
                    value={searchQuery}
                    onChange={setSearchQuery}
                    clearButton
                    onClearButtonClick={() => setSearchQuery("")}
                    prefix={<SearchIcon />}
                    autoComplete="off"
                  />
                </div>

                {/* Dropdowns */}
                <InlineStack gap="200" blockAlign="center" wrap>
                  <div style={{ minWidth: "190px" }}>
                    <Select
                      label="Status"
                      labelInline
                      options={statusOptions}
                      value={statusFilter}
                      onChange={setStatusFilter}
                    />
                  </div>

                  {selectedTab === 0 && (
                    <>
                      <div style={{ minWidth: "150px" }}>
                        <Select
                          label="Severity"
                          labelInline
                          options={[
                            { label: "All", value: "" },
                            { label: "Critical", value: "CRITICAL" },
                            { label: "Warning", value: "WARNING" },
                          ]}
                          value={severityFilter}
                          onChange={setSeverityFilter}
                        />
                      </div>

                      <div style={{ minWidth: "150px" }}>
                        <Select
                          label="Category"
                          labelInline
                          options={[
                            { label: "All", value: "" },
                            { label: "Products", value: "PRODUCT" },
                            { label: "Orders", value: "ORDER" },
                            { label: "Discounts", value: "DISCOUNT" },
                          ]}
                          value={categoryFilter}
                          onChange={setCategoryFilter}
                        />
                      </div>
                    </>
                  )}

                  <div style={{ minWidth: "170px" }}>
                    <Select
                      label="Sort"
                      labelInline
                      options={sortOptions}
                      value={sortBy}
                      onChange={setSortBy}
                    />
                  </div>
                </InlineStack>
              </InlineStack>

              <InlineStack align="space-between" blockAlign="center">
                <Text variant="bodySm" tone="subdued">
                  Showing {alerts.length} of {pagination.total ?? alerts.length} {statusFilter === "RESOLVED" ? "resolved" : "active"} alert(s)
                </Text>

                {(searchQuery || selectedTab !== 0 || statusFilter !== "ACTIVE" || severityFilter || categoryFilter) && (
                  <Button
                    variant="plain"
                    size="slim"
                    onClick={() => {
                      setSelectedTab(0);
                      setStatusFilter("ACTIVE");
                      setSeverityFilter("");
                      setCategoryFilter("");
                      setSearchQuery("");
                    }}
                  >
                    Reset all filters
                  </Button>
                )}
              </InlineStack>
            </BlockStack>
          </Box>

          {/* Table Feed */}
          {loading ? (
            <Box padding="800">
              <InlineStack align="center" blockAlign="center">
                <Spinner size="large" accessibilityLabel="Loading profit alerts" />
              </InlineStack>
            </Box>
          ) : alerts.length === 0 ? (
            /* EMPTY STATES */
            statusFilter === "RESOLVED" ? (
              <Box padding="600">
                <EmptyState heading="No resolved alerts yet">
                  <p>
                    Alerts resolved by you or automatically resolved when margins recover
                    will appear in this history view.
                  </p>
                  <Box paddingTop="300">
                    <Button onClick={() => setStatusFilter("ACTIVE")}>
                      View Active Alerts
                    </Button>
                  </Box>
                </EmptyState>
              </Box>
            ) : searchQuery || selectedTab !== 0 || statusFilter !== "ACTIVE" || severityFilter || categoryFilter ? (
              <Box padding="600">
                <EmptyState heading="No matching alerts found">
                  <p>
                    No profit alerts match your current search and filter settings.
                  </p>
                  <Box paddingTop="300">
                    <Button
                      onClick={() => {
                        setSelectedTab(0);
                        setStatusFilter("ACTIVE");
                        setSeverityFilter("");
                        setCategoryFilter("");
                        setSearchQuery("");
                      }}
                    >
                      Clear Filters
                    </Button>
                  </Box>
                </EmptyState>
              </Box>
            ) : summary?.globalMarginThreshold == null ? (
              <Box padding="600">
                <EmptyState
                  heading="Set up profit margin monitoring"
                  action={{
                    content: "Configure Rules",
                    onAction: handleOpenConfig,
                  }}
                >
                  <p>
                    Configure minimum profit margins to begin tracking underperforming
                    products, low-profit orders, and margin-eroding discounts.
                  </p>
                </EmptyState>
              </Box>
            ) : (
              <Box padding="600">
                <EmptyState heading="All margins operating within target">
                  <p>
                    Your monitored store products, orders, and discounts are currently meeting
                    configured profit margin thresholds.
                  </p>
                  <Box paddingTop="300">
                    <Button onClick={handleRunDetection} loading={isDetecting}>
                      Run Store Scan
                    </Button>
                  </Box>
                </EmptyState>
              </Box>
            )
          ) : (
            <IndexTable
              resourceName={resourceName}
              itemCount={alerts.length}
              selectable={false}
              headings={[
                { title: "Alert Type" },
                { title: "Product / Order" },
                { title: "Severity" },
                { title: "Current Margin" },
                { title: "Target Margin" },
                { title: "Margin Gap" },
                { title: "Main Reason" },
                { title: "Status" },
                { title: statusFilter === "RESOLVED" ? "Resolved Date" : "Created Date" },
                { title: "Actions", alignment: "end" },
              ]}
            >
              {alerts.map((alert, index) => {
                const isCritical = alert.severity === "CRITICAL";
                const isResolved = alert.status === "RESOLVED";
                const resName =
                  alert.resourceName ||
                  alert.evidence?.productTitle ||
                  alert.evidence?.orderName ||
                  alert.evidence?.discountCode ||
                  "Item";
                const resType = String(
                  alert.resourceType || alert.alertType || "PRODUCT"
                )
                  .toUpperCase()
                  .replace("_MARGIN", "");
                const isNegMargin = Number(alert.currentMargin) < 0;

                const shopifyUrl = getShopifyAdminUrl(
                  shop,
                  alert.resourceType,
                  alert.resourceId
                );

                return (
                  <IndexTable.Row id={alert._id} key={alert._id} position={index}>
                    {/* Alert Type */}
                    <IndexTable.Cell>
                      <Badge tone="neutral">{resType}</Badge>
                    </IndexTable.Cell>

                    {/* Product / Order */}
                    <IndexTable.Cell>
                      <BlockStack gap="050">
                        {shopifyUrl ? (
                          <Link url={shopifyUrl} external monochrome>
                            <Text variant="bodyMd" fontWeight="bold" as="span">
                              {resName}
                            </Text>
                          </Link>
                        ) : (
                          <Text variant="bodyMd" fontWeight="bold" as="span">
                            {resName}
                          </Text>
                        )}
                        {alert.evidence?.productTitle && alert.evidence?.variantTitle && (
                          <Text variant="bodyXs" tone="subdued" as="span">
                            Variant: {alert.evidence.variantTitle}
                          </Text>
                        )}
                        {alert.evidence?.orderNumber && (
                          <Text variant="bodyXs" tone="subdued" as="span">
                            Order: #{alert.evidence.orderNumber}
                          </Text>
                        )}
                      </BlockStack>
                    </IndexTable.Cell>

                    {/* Severity */}
                    <IndexTable.Cell>
                      <Badge tone={isCritical ? "critical" : "warning"}>
                        {alert.severity || "WARNING"}
                      </Badge>
                    </IndexTable.Cell>

                    {/* Current Margin */}
                    <IndexTable.Cell>
                      <Text
                        variant="bodyMd"
                        fontWeight="bold"
                        tone={isNegMargin || isCritical ? "critical" : "caution"}
                        as="span"
                      >
                        {formatPercentage(alert.currentMargin)}
                      </Text>
                    </IndexTable.Cell>

                    {/* Target Margin */}
                    <IndexTable.Cell>
                      <Text variant="bodyMd" fontWeight="semibold" as="span">
                        {formatPercentage(alert.threshold)}
                      </Text>
                    </IndexTable.Cell>

                    {/* Margin Gap */}
                    <IndexTable.Cell>
                      {alert.marginDifference != null ? (
                        <Text
                          variant="bodyMd"
                          fontWeight="medium"
                          tone={Number(alert.marginDifference) < 0 ? "critical" : "subdued"}
                          as="span"
                        >
                          {Number(alert.marginDifference) > 0 ? "+" : ""}
                          {Number(alert.marginDifference).toFixed(2)} pts
                        </Text>
                      ) : (
                        "—"
                      )}
                    </IndexTable.Cell>

                    {/* Main Reason */}
                    <IndexTable.Cell>
                      <BlockStack gap="050" style={{ maxWidth: "260px" }}>
                        <Text variant="bodySm" fontWeight="medium" as="span" truncate>
                          {alert.primaryDriver || alert.reasonCode?.replace(/_/g, " ") || "Low Margin"}
                        </Text>
                        <Text variant="bodyXs" tone="subdued" as="span" truncate>
                          {alert.reasonDetails || alert.reason || "Margin below limit"}
                        </Text>
                      </BlockStack>
                    </IndexTable.Cell>

                    {/* Status */}
                    <IndexTable.Cell>
                      <Badge
                        tone={
                          isResolved
                            ? "success"
                            : alert.status === "ACKNOWLEDGED"
                            ? "info"
                            : "attention"
                        }
                      >
                        {alert.status || "ACTIVE"}
                      </Badge>
                    </IndexTable.Cell>

                    {/* Created Date / Resolved Date */}
                    <IndexTable.Cell>
                      {isResolved && alert.resolvedAt ? (
                        <Tooltip
                          content={`Resolved: ${formatDate(alert.resolvedAt)} (${
                            alert.resolutionSource === "AUTOMATIC"
                              ? "Auto: Margin Recovered"
                              : "Merchant"
                          })`}
                        >
                          <BlockStack gap="050">
                            <Text variant="bodySm" tone="success" as="span" fontWeight="medium">
                              {formatRelativeTime(alert.resolvedAt)}
                            </Text>
                            <Text variant="bodyXs" tone="subdued" as="span">
                              {alert.resolutionSource === "AUTOMATIC"
                                ? "Auto Recovered"
                                : "By Merchant"}
                            </Text>
                          </BlockStack>
                        </Tooltip>
                      ) : (
                        <Tooltip content={formatDate(alert.createdAt || alert.firstDetectedAt)}>
                          <Text variant="bodySm" tone="subdued" as="span">
                            {formatRelativeTime(alert.createdAt || alert.firstDetectedAt)}
                          </Text>
                        </Tooltip>
                      )}
                    </IndexTable.Cell>

                    {/* Actions */}
                    <IndexTable.Cell>
                      <Button
                        size="slim"
                        variant="plain"
                        onClick={() => handleOpenDetailModal(alert)}
                      >
                        View Details
                      </Button>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                );
              })}
            </IndexTable>
          )}

          {/* Server-Side Pagination Bar */}
          {pagination.totalPages > 1 && (
            <Box padding="300" borderBlockStartWidth="025" borderColor="border">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="bodySm" tone="subdued">
                  Page {pagination.page} of {pagination.totalPages}
                </Text>
                <Pagination
                  hasPrevious={pagination.page > 1}
                  onPrevious={() =>
                    fetchAlerts(
                      pagination.page - 1,
                      activeTabType,
                      statusFilter,
                      debouncedSearch,
                      severityFilter,
                      categoryFilter
                    )
                  }
                  hasNext={pagination.page < pagination.totalPages}
                  onNext={() =>
                    fetchAlerts(
                      pagination.page + 1,
                      activeTabType,
                      statusFilter,
                      debouncedSearch,
                      severityFilter,
                      categoryFilter
                    )
                  }
                />
              </InlineStack>
            </Box>
          )}
        </Card>
      </BlockStack>

      {/* =================================================================== */}
      {/* ALERT DETAILS MODAL                                                 */}
      {/* =================================================================== */}
      {modalAlert && (
        <Modal
          open={detailModalOpen}
          onClose={handleCloseDetailModal}
          title="Profit Alert Details"
          primaryAction={
            modalShopifyUrl
              ? {
                  content: modalDirectButtonLabel,
                  url: modalShopifyUrl,
                  external: true,
                }
              : undefined
          }
          secondaryActions={[
            ...(modalAlert.status === "ACTIVE"
              ? [
                  {
                    content: actionInProgress ? "Updating..." : "Acknowledge Alert",
                    onAction: handleAcknowledgeAlert,
                    loading: actionInProgress,
                  },
                ]
              : []),
            ...(modalAlert.status !== "RESOLVED"
              ? [
                  {
                    content: actionInProgress ? "Resolving..." : "Resolve Alert",
                    onAction: handleResolveAlert,
                    loading: actionInProgress,
                  },
                ]
              : []),
            {
              content: "Close",
              onAction: handleCloseDetailModal,
            },
          ]}
        >
          <Modal.Section>
            {modalLoading ? (
              <Box padding="600">
                <InlineStack align="center">
                  <Spinner size="large" />
                </InlineStack>
              </Box>
            ) : (
              <BlockStack gap="400">
                {/* Header Information */}
                <BlockStack gap="150">
                  <InlineStack gap="200" blockAlign="center" wrap>
                    <Badge
                      tone={
                        modalAlert.severity === "CRITICAL"
                          ? "critical"
                          : "warning"
                      }
                    >
                      {modalAlert.severity || "WARNING"}
                    </Badge>
                    <Badge tone="neutral">
                      {String(
                        modalAlert.resourceType || modalAlert.alertType || "PRODUCT"
                      )
                        .toUpperCase()
                        .replace("_MARGIN", "")}
                    </Badge>
                    <Badge
                      tone={
                        modalAlert.status === "RESOLVED"
                          ? "success"
                          : modalAlert.status === "ACKNOWLEDGED"
                          ? "info"
                          : "attention"
                      }
                    >
                      {modalAlert.status || "ACTIVE"}
                    </Badge>
                  </InlineStack>

                  <BlockStack gap="050">
                    <Text variant="headingLg" as="h3" fontWeight="bold">
                      {modalAlert.resourceName ||
                        modalAlert.evidence?.productTitle ||
                        modalAlert.evidence?.orderName ||
                        "Resource"}
                    </Text>
                    {(modalAlert.resourceId ||
                      modalAlert.evidence?.productId ||
                      modalAlert.evidence?.orderId) && (
                      <Text variant="bodyXs" tone="subdued" as="span">
                        Shopify Resource ID:{" "}
                        <code style={{ fontSize: "11px", background: "#f1f2f3", padding: "2px 6px", borderRadius: "4px" }}>
                          {modalAlert.resourceId ||
                            modalAlert.evidence?.productId ||
                            modalAlert.evidence?.orderId}
                        </code>
                      </Text>
                    )}
                  </BlockStack>
                </BlockStack>

                <Divider />

                {/* 4 Metric Cards: Current Margin, Target Margin, Critical Threshold, Margin Gap */}
                <InlineGrid columns={{ xs: 2, md: 4 }} gap="300">
                  <div
                    style={{
                      background: "#f9fafb",
                      border: "1px solid #e1e3e5",
                      borderRadius: "8px",
                      padding: "14px",
                    }}
                  >
                    <BlockStack gap="050">
                      <Text variant="bodyXs" tone="subdued" fontWeight="bold">
                        CURRENT MARGIN
                      </Text>
                      <Text
                        variant="headingLg"
                        as="p"
                        fontWeight="bold"
                        tone={
                          modalAlert.severity === "CRITICAL"
                            ? "critical"
                            : "caution"
                        }
                      >
                        {formatPercentage(modalAlert.currentMargin)}
                      </Text>
                    </BlockStack>
                  </div>

                  <div
                    style={{
                      background: "#f9fafb",
                      border: "1px solid #e1e3e5",
                      borderRadius: "8px",
                      padding: "14px",
                    }}
                  >
                    <BlockStack gap="050">
                      <Text variant="bodyXs" tone="subdued" fontWeight="bold">
                        TARGET MARGIN
                      </Text>
                      <Text variant="headingLg" as="p" fontWeight="bold">
                        {formatPercentage(modalAlert.threshold)}
                      </Text>
                    </BlockStack>
                  </div>

                  <div
                    style={{
                      background: "#f9fafb",
                      border: "1px solid #e1e3e5",
                      borderRadius: "8px",
                      padding: "14px",
                    }}
                  >
                    <BlockStack gap="050">
                      <Text variant="bodyXs" tone="subdued" fontWeight="bold">
                        CRITICAL THRESHOLD
                      </Text>
                      <Text variant="headingLg" as="p" fontWeight="bold" tone="critical">
                        {formatPercentage(
                          modalAlert.criticalThreshold ??
                            (summary?.criticalMarginThreshold ??
                              Math.max(0, Number(modalAlert.threshold || 20) - 10))
                        )}
                      </Text>
                    </BlockStack>
                  </div>

                  <div
                    style={{
                      background: "#f9fafb",
                      border: "1px solid #e1e3e5",
                      borderRadius: "8px",
                      padding: "14px",
                    }}
                  >
                    <BlockStack gap="050">
                      <Text variant="bodyXs" tone="subdued" fontWeight="bold">
                        MARGIN GAP
                      </Text>
                      <Text
                        variant="headingLg"
                        as="p"
                        fontWeight="bold"
                        tone="critical"
                      >
                        {modalDifference}
                      </Text>
                    </BlockStack>
                  </div>
                </InlineGrid>

                <Divider />

                {/* Alert Reason & Explanation */}
                <BlockStack gap="150">
                  <InlineStack align="space-between" blockAlign="center" wrap>
                    <Text variant="headingSm" as="h4" fontWeight="bold">
                      Reason for Trigger
                    </Text>
                    {modalAlert.primaryDriver && (
                      <Badge tone={modalAlert.severity === "CRITICAL" ? "critical" : "attention"}>
                        {modalAlert.primaryDriver}
                      </Badge>
                    )}
                  </InlineStack>
                  <Text variant="bodyMd" fontWeight="medium">
                    {modalAlert.reason ||
                      "Calculated profit margin fell below configured limit."}
                  </Text>
                  {modalAlert.reasonDetails && (
                    <div
                      style={{
                        background: "#f9fafb",
                        border: "1px solid #e1e3e5",
                        borderRadius: "6px",
                        padding: "10px 12px",
                      }}
                    >
                      <Text variant="bodySm" tone="subdued">
                        <strong>Data Breakdown: </strong>
                        {modalAlert.reasonDetails}
                      </Text>
                    </div>
                  )}
                </BlockStack>

                {/* Order Information Section (if alert relates to an order) */}
                {(modalAlert.resourceType === "ORDER" ||
                  modalAlert.alertType === "ORDER_MARGIN" ||
                  modalAlert.evidence?.orderNumber) && (
                  <div
                    style={{
                      background: "#f9fafb",
                      border: "1px solid #e1e3e5",
                      borderRadius: "8px",
                      padding: "14px",
                    }}
                  >
                    <BlockStack gap="200">
                      <Text variant="headingSm" as="h4" fontWeight="bold">
                        Order Information
                      </Text>
                      <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="200">
                        <BlockStack gap="050">
                          <Text variant="bodyXs" tone="subdued">
                            Order Number
                          </Text>
                          <Text variant="bodySm" fontWeight="semibold">
                            {modalAlert.evidence?.orderNumber ||
                              modalAlert.evidence?.orderName ||
                              modalAlert.resourceName ||
                              "—"}
                          </Text>
                        </BlockStack>

                        <BlockStack gap="050">
                          <Text variant="bodyXs" tone="subdued">
                            Order Date
                          </Text>
                          <Text variant="bodySm">
                            {formatDate(
                              modalAlert.evidence?.orderCreatedAt || modalAlert.createdAt
                            )}
                          </Text>
                        </BlockStack>

                        <BlockStack gap="050">
                          <Text variant="bodyXs" tone="subdued">
                            Payment Status
                          </Text>
                          <div>
                            <Badge
                              tone={
                                modalAlert.evidence?.financialStatus === "PAID"
                                  ? "success"
                                  : modalAlert.evidence?.financialStatus === "PARTIALLY_PAID"
                                  ? "attention"
                                  : "neutral"
                              }
                            >
                              {modalAlert.evidence?.financialStatus?.replace(/_/g, " ") ||
                                "Unknown"}
                            </Badge>
                          </div>
                        </BlockStack>

                        <BlockStack gap="050">
                          <Text variant="bodyXs" tone="subdued">
                            Fulfillment Status
                          </Text>
                          <div>
                            <Badge
                              tone={
                                modalAlert.evidence?.fulfillmentStatus === "FULFILLED"
                                  ? "success"
                                  : "neutral"
                              }
                            >
                              {modalAlert.evidence?.fulfillmentStatus?.replace(/_/g, " ") ||
                                "Unfulfilled"}
                            </Badge>
                          </div>
                        </BlockStack>
                      </InlineGrid>

                      {modalAlert.evidence?.customer && (
                        <InlineStack gap="200" blockAlign="center" wrap>
                          <Text variant="bodyXs" tone="subdued">
                            Customer:
                          </Text>
                          <Text variant="bodySm" fontWeight="medium">
                            {modalAlert.evidence.customer}
                          </Text>
                          {modalAlert.evidence?.paymentGateway && (
                            <Text variant="bodyXs" tone="subdued">
                              • Payment Gateway: {modalAlert.evidence.paymentGateway}
                            </Text>
                          )}
                        </InlineStack>
                      )}
                    </BlockStack>
                  </div>
                )}

                {/* Financial Drivers & Breakdown */}
                {modalAlert.evidence && (
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h4" fontWeight="bold">
                      Financial Breakdown & Drivers
                    </Text>

                    <div
                      style={{
                        background: "#ffffff",
                        border: "1px solid #e1e3e5",
                        borderRadius: "8px",
                        padding: "14px",
                      }}
                    >
                      <BlockStack gap="150">
                        {modalAlert.evidence.sellingPrice != null && (
                          <InlineStack align="space-between">
                            <Text variant="bodyMd" tone="subdued">
                              Revenue / Selling Amount:
                            </Text>
                            <Text variant="bodyMd" fontWeight="semibold">
                              {formatMoney(modalAlert.evidence.sellingPrice, modalAlert.evidence?.currency)}
                            </Text>
                          </InlineStack>
                        )}

                        {modalAlert.evidence.productCost != null && (
                          <InlineStack align="space-between">
                            <Text variant="bodyMd" tone="subdued">
                              Product Cost (COGS):
                            </Text>
                            <Text variant="bodyMd" fontWeight="semibold">
                              {formatMoney(modalAlert.evidence.productCost, modalAlert.evidence?.currency)}
                            </Text>
                          </InlineStack>
                        )}

                        {modalAlert.evidence.discountAmount != null &&
                          Number(modalAlert.evidence.discountAmount) > 0 && (
                            <InlineStack align="space-between">
                              <Text variant="bodyMd" tone="subdued">
                                Discounts Applied:
                              </Text>
                              <Text variant="bodyMd" fontWeight="semibold">
                                {formatMoney(modalAlert.evidence.discountAmount, modalAlert.evidence?.currency)}
                              </Text>
                            </InlineStack>
                          )}

                        {/* Shipping Charged to Customer (Shopify) */}
                        {modalAlert.evidence.shippingCharged != null && (
                          <InlineStack align="space-between">
                            <BlockStack gap="025">
                              <Text variant="bodyMd" tone="subdued">
                                Shipping Charged to Customer:
                              </Text>
                              <Text variant="bodyXs" tone="subdued">
                                Shipping fee collected via Shopify
                              </Text>
                            </BlockStack>
                            <Text variant="bodyMd" fontWeight="semibold">
                              {formatMoney(modalAlert.evidence.shippingCharged, modalAlert.evidence?.currency)}
                            </Text>
                          </InlineStack>
                        )}

                        {/* Actual Shipping / Fulfillment Expense (Merchant Cost) */}
                        {(modalAlert.evidence.actualShippingExpense != null || modalAlert.evidence.shippingCost != null) && (
                          <InlineStack align="space-between">
                            <BlockStack gap="025">
                              <Text variant="bodyMd" tone="subdued">
                                Actual Shipping Expense:
                              </Text>
                              <Text variant="bodyXs" tone="subdued">
                                Merchant cost configured in Cost Settings
                              </Text>
                            </BlockStack>
                            <Text variant="bodyMd" fontWeight="semibold">
                              {formatMoney(
                                modalAlert.evidence.actualShippingExpense ?? modalAlert.evidence.shippingCost,
                                modalAlert.evidence?.currency
                              )}
                            </Text>
                          </InlineStack>
                        )}

                        {modalAlert.evidence.paymentFee != null &&
                          Number(modalAlert.evidence.paymentFee) > 0 && (
                            <InlineStack align="space-between">
                              <Text variant="bodyMd" tone="subdued">
                                Payment Processing Fee:
                              </Text>
                              <Text variant="bodyMd" fontWeight="semibold">
                                {formatMoney(modalAlert.evidence.paymentFee, modalAlert.evidence?.currency)}
                              </Text>
                            </InlineStack>
                          )}

                        {modalAlert.evidence.refundAmount != null &&
                          Number(modalAlert.evidence.refundAmount) > 0 && (
                            <InlineStack align="space-between">
                              <Text variant="bodyMd" tone="subdued">
                                Refunds / Returns:
                              </Text>
                              <Text variant="bodyMd" fontWeight="semibold">
                                {formatMoney(modalAlert.evidence.refundAmount, modalAlert.evidence?.currency)}
                              </Text>
                            </InlineStack>
                          )}

                        {modalAlert.evidence.taxes != null &&
                          Number(modalAlert.evidence.taxes) > 0 && (
                            <InlineStack align="space-between">
                              <Text variant="bodyMd" tone="subdued">
                                Taxes / Duties:
                              </Text>
                              <Text variant="bodyMd" fontWeight="semibold">
                                {formatMoney(modalAlert.evidence.taxes, modalAlert.evidence?.currency)}
                              </Text>
                            </InlineStack>
                          )}

                        {modalAlert.evidence.otherCosts != null &&
                          Number(modalAlert.evidence.otherCosts) > 0 && (
                            <InlineStack align="space-between">
                              <Text variant="bodyMd" tone="subdued">
                                Other Applicable Costs:
                              </Text>
                              <Text variant="bodyMd" fontWeight="semibold">
                                {formatMoney(modalAlert.evidence.otherCosts, modalAlert.evidence?.currency)}
                              </Text>
                            </InlineStack>
                          )}

                        {modalAlert.evidence.trueProfit != null && (
                          <>
                            <Divider />
                            <InlineStack align="space-between">
                              <Text variant="bodyMd" fontWeight="bold">
                                True Profit:
                              </Text>
                              <Text
                                variant="bodyMd"
                                fontWeight="bold"
                                tone={
                                  Number(modalAlert.evidence.trueProfit) < 0
                                    ? "critical"
                                    : "success"
                                }
                              >
                                {formatMoney(modalAlert.evidence.trueProfit, modalAlert.evidence?.currency)}
                              </Text>
                            </InlineStack>
                          </>
                        )}
                      </BlockStack>
                    </div>
                  </BlockStack>
                )}

                <Divider />

                {/* Threshold Applied */}
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h4" fontWeight="bold">
                    Threshold Rule Applied
                  </Text>
                  <Text variant="bodyMd">
                    {getThresholdSourceLabel(
                      modalAlert.thresholdSource ||
                        modalAlert.evidence?.thresholdSource,
                      modalAlert.threshold
                    )}
                  </Text>
                </BlockStack>

                <Divider />

                {/* Recommended Merchant Action */}
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h4" fontWeight="bold">
                    Recommended Merchant Action
                  </Text>
                  <div
                    style={{
                      background: "#f9fafb",
                      border: "1px solid #e1e3e5",
                      borderRadius: "8px",
                      padding: "12px",
                    }}
                  >
                    <Text variant="bodyMd">
                      {modalAlert.recommendedAction || getContextualGuidance(modalAlert.primaryDriver)}
                    </Text>
                  </div>
                </BlockStack>

                <Divider />

                {/* Alert History & Resolution */}
                <BlockStack gap="150">
                  <Text variant="headingSm" as="h4" fontWeight="bold">
                    Alert Lifecycle & Resolution History
                  </Text>
                  <InlineGrid columns={2} gap="250">
                    <div
                      style={{
                        background: "#f9fafb",
                        border: "1px solid #e1e3e5",
                        borderRadius: "6px",
                        padding: "10px",
                      }}
                    >
                      <BlockStack gap="050">
                        <Text variant="bodyXs" tone="subdued">
                          First Detected
                        </Text>
                        <Text variant="bodySm">
                          {formatDate(
                            modalAlert.firstDetectedAt || modalAlert.createdAt
                          )}
                        </Text>
                      </BlockStack>
                    </div>

                    <div
                      style={{
                        background: "#f9fafb",
                        border: "1px solid #e1e3e5",
                        borderRadius: "6px",
                        padding: "10px",
                      }}
                    >
                      <BlockStack gap="050">
                        <Text variant="bodyXs" tone="subdued">
                          Last Evaluated
                        </Text>
                        <Text variant="bodySm">
                          {formatDate(
                            modalAlert.lastDetectedAt || modalAlert.updatedAt
                          )}
                        </Text>
                      </BlockStack>
                    </div>

                    <div
                      style={{
                        background: "#f9fafb",
                        border: "1px solid #e1e3e5",
                        borderRadius: "6px",
                        padding: "10px",
                      }}
                    >
                      <BlockStack gap="050">
                        <Text variant="bodyXs" tone="subdued">
                          Acknowledged
                        </Text>
                        <Text variant="bodySm">
                          {modalAlert.acknowledgedAt
                            ? formatDate(modalAlert.acknowledgedAt)
                            : "Not yet acknowledged"}
                        </Text>
                      </BlockStack>
                    </div>

                    <div
                      style={{
                        background:
                          modalAlert.status === "RESOLVED"
                            ? "#f1f8f5"
                            : "#f9fafb",
                        border:
                          modalAlert.status === "RESOLVED"
                            ? "1px solid #b7e1cd"
                            : "1px solid #e1e3e5",
                        borderRadius: "6px",
                        padding: "10px",
                      }}
                    >
                      <BlockStack gap="050">
                        <Text
                          variant="bodyXs"
                          tone={
                            modalAlert.status === "RESOLVED"
                              ? "success"
                              : "subdued"
                          }
                        >
                          Resolved Status
                        </Text>
                        <Text
                          variant="bodySm"
                          fontWeight={
                            modalAlert.status === "RESOLVED"
                              ? "bold"
                              : "regular"
                          }
                        >
                          {modalAlert.resolvedAt
                            ? `${formatDate(modalAlert.resolvedAt)} (${
                                modalAlert.resolutionSource === "AUTOMATIC"
                                  ? "Auto: Margin Recovered"
                                  : "By Merchant"
                              })`
                            : "Active (Unresolved)"}
                        </Text>
                      </BlockStack>
                    </div>
                  </InlineGrid>
                </BlockStack>
              </BlockStack>
            )}
          </Modal.Section>
        </Modal>
      )}

      {/* =================================================================== */}
      {/* THRESHOLD SETTINGS MODAL                                            */}
      {/* =================================================================== */}
      <Modal
        open={configModalOpen}
        onClose={handleCloseConfig}
        title="Profit Margin Monitoring Thresholds"
        primaryAction={{
          content: configSaving ? "Saving..." : "Save Changes",
          onAction: handleSaveConfig,
          loading: configSaving,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: handleCloseConfig,
          },
        ]}
      >
        <Modal.Section>
          {configLoading ? (
            <Box padding="600">
              <InlineStack align="center">
                <Spinner size="large" />
              </InlineStack>
            </Box>
          ) : (
            <BlockStack gap="400">
              <Text variant="bodyMd" tone="subdued">
                Configure minimum profit margin thresholds. When calculated margins
                fall below these limits, alerts will be created automatically.
              </Text>

              {configError && (
                <Banner tone="critical" onDismiss={() => setConfigError(null)}>
                  <p>{configError}</p>
                </Banner>
              )}

              {/* Precedence Banner */}
              <Banner tone="info">
                <p>
                  <strong>Precedence Order:</strong> Product Rule overrides Category Rule.
                  Category Rule overrides Global Rule.
                </p>
              </Banner>

              {/* GLOBAL RULES */}
              <Card>
                <BlockStack gap="250">
                  <Text variant="headingSm" as="h4" fontWeight="bold">
                    GLOBAL MARGIN THRESHOLDS
                  </Text>
                  <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
                    <TextField
                      label="Target Minimum Margin (%)"
                      type="number"
                      value={globalThresholdInput}
                      onChange={setGlobalThresholdInput}
                      suffix="%"
                      placeholder="e.g. 20.00"
                      helpText="Alerts trigger as Warning when profit margins fall below this configured target."
                      autoComplete="off"
                    />
                    <TextField
                      label="Critical Alert Threshold (%)"
                      type="number"
                      value={criticalThresholdInput}
                      onChange={setCriticalThresholdInput}
                      suffix="%"
                      placeholder="e.g. 10.00"
                      helpText="Alerts escalate to Critical severity when margin falls below this lower limit (defaults to 10% below target)."
                      autoComplete="off"
                    />
                  </InlineGrid>
                </BlockStack>
              </Card>

              {/* PRODUCT OVERRIDES */}
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingSm" as="h4" fontWeight="bold">
                      PRODUCT-SPECIFIC OVERRIDES
                    </Text>
                    <Badge tone="neutral">
                      {String(productThresholds.length)} Configured
                    </Badge>
                  </InlineStack>
                  <Text variant="bodySm" tone="subdued">
                    Override the global threshold for specific high-volume or sensitive products.
                  </Text>

                  {productThresholds.length > 0 && (
                    <BlockStack gap="150">
                      {productThresholds.map((pt) => {
                        const title =
                          productTitleMap.get(pt.productId) || pt.productId;
                        return (
                          <div
                            key={pt.productId}
                            style={{
                              background: "#f9fafb",
                              border: "1px solid #e1e3e5",
                              borderRadius: "6px",
                              padding: "10px 14px",
                            }}
                          >
                            <InlineStack align="space-between" blockAlign="center">
                              <Text variant="bodySm" fontWeight="medium">
                                {title}
                              </Text>
                              <InlineStack gap="200" blockAlign="center">
                                <Badge tone="info">
                                  {formatPercentage(pt.threshold)}
                                </Badge>
                                <Button
                                  variant="plain"
                                  tone="critical"
                                  size="micro"
                                  onClick={() =>
                                    handleRemoveProductOverride(pt.productId)
                                  }
                                >
                                  Remove
                                </Button>
                              </InlineStack>
                            </InlineStack>
                          </div>
                        );
                      })}
                    </BlockStack>
                  )}

                  {/* Add Product Override Form */}
                  <InlineGrid columns={{ xs: 1, md: "2fr 1fr auto" }} gap="200">
                    <select
                      style={{
                        padding: "8px",
                        borderRadius: "6px",
                        border: "1px solid #c9cccf",
                        fontSize: "14px",
                        width: "100%",
                      }}
                      value={selectedProductToAdd}
                      onChange={(e) => setSelectedProductToAdd(e.target.value)}
                    >
                      {availableProducts.map((prod) => (
                        <option key={prod.id} value={prod.id}>
                          {prod.title}
                        </option>
                      ))}
                    </select>
                    <TextField
                      label="Threshold"
                      labelHidden
                      type="number"
                      value={productThresholdToAdd}
                      onChange={setProductThresholdToAdd}
                      suffix="%"
                      placeholder="e.g. 15.00"
                      autoComplete="off"
                    />
                    <Button onClick={handleAddProductOverride}>Add Rule</Button>
                  </InlineGrid>
                </BlockStack>
              </Card>

              {/* CATEGORY OVERRIDES */}
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingSm" as="h4" fontWeight="bold">
                      CATEGORY-SPECIFIC OVERRIDES
                    </Text>
                    <Badge tone="neutral">
                      {String(categoryThresholds.length)} Configured
                    </Badge>
                  </InlineStack>
                  <Text variant="bodySm" tone="subdued">
                    Set target margin limits by product type / category.
                  </Text>

                  {categoryThresholds.length > 0 && (
                    <BlockStack gap="150">
                      {categoryThresholds.map((ct) => (
                        <div
                          key={ct.category}
                          style={{
                            background: "#f9fafb",
                            border: "1px solid #e1e3e5",
                            borderRadius: "6px",
                            padding: "10px 14px",
                          }}
                        >
                          <InlineStack align="space-between" blockAlign="center">
                            <Text variant="bodySm" fontWeight="medium">
                              {ct.category}
                            </Text>
                            <InlineStack gap="200" blockAlign="center">
                              <Badge tone="info">
                                {formatPercentage(ct.threshold)}
                              </Badge>
                              <Button
                                variant="plain"
                                tone="critical"
                                size="micro"
                                onClick={() =>
                                  handleRemoveCategoryOverride(ct.category)
                                }
                              >
                                Remove
                              </Button>
                            </InlineStack>
                          </InlineStack>
                        </div>
                      ))}
                    </BlockStack>
                  )}

                  {/* Add Category Override Form */}
                  <InlineGrid columns={{ xs: 1, md: "2fr 1fr auto" }} gap="200">
                    <select
                      style={{
                        padding: "8px",
                        borderRadius: "6px",
                        border: "1px solid #c9cccf",
                        fontSize: "14px",
                        width: "100%",
                      }}
                      value={selectedCategoryToAdd}
                      onChange={(e) => setSelectedCategoryToAdd(e.target.value)}
                    >
                      {availableCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    <TextField
                      label="Threshold"
                      labelHidden
                      type="number"
                      value={categoryThresholdToAdd}
                      onChange={setCategoryThresholdToAdd}
                      suffix="%"
                      placeholder="e.g. 18.00"
                      autoComplete="off"
                    />
                    <Button onClick={handleAddCategoryOverride}>Add Rule</Button>
                  </InlineGrid>
                </BlockStack>
              </Card>
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
