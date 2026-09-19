import { useEffect, useMemo, useState } from "react";
import {
  Banner,
  Badge,
  BlockStack,
  Button,
  Card,
  Divider,
  InlineGrid,
  InlineStack,
  Page,
  Select,
  Spinner,
  Tabs,
  Text,
  TextField,
  Thumbnail,
} from "@shopify/polaris";

const SIMULATION_TABS = [
  { id: "price", content: "Price Change" },
  { id: "discount", content: "Discount Change" },
  { id: "shipping", content: "Shipping Change" },
];

function money(value, currency) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function percent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function signedMoney(value, currency) {
  const amount = Number(value || 0);
  if (amount === 0) return "No change";
  return `${amount > 0 ? "+" : "-"}${money(Math.abs(amount), currency)} per sale`;
}

function signedPoints(value) {
  const amount = Number(value || 0);
  if (amount === 0) return "No change";
  return `${amount > 0 ? "+" : "-"}${Math.abs(amount).toFixed(2)} percentage points`;
}

function Metric({ label, value, tone }) {
  return (
    <BlockStack gap="100">
      <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
      <Text as="p" variant="headingLg" fontWeight="bold" tone={tone}>{value}</Text>
    </BlockStack>
  );
}

function DetailRow({ label, value, helpText }) {
  return (
    <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
      <BlockStack gap="050">
        <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
        {helpText && <Text as="span" variant="bodyXs" tone="subdued">{helpText}</Text>}
      </BlockStack>
      <Text as="span" fontWeight="semibold">{value}</Text>
    </InlineStack>
  );
}

function resultMessage(simulation, currency) {
  const currentProfit = Number(simulation.current.netProfit || 0);
  const simulatedProfit = Number(simulation.projected.netProfit || 0);
  const profitDifference = Number(simulation.comparison.profitChange || 0);
  const marginDifference = Number(simulation.comparison.marginChange || 0);
  const profitText = money(Math.abs(profitDifference), currency);
  const pointsText = `${Math.abs(marginDifference).toFixed(2)} percentage points`;

  if (simulatedProfit < 0 && currentProfit < 0 && profitDifference > 0) {
    return `This scenario reduces the loss by ${profitText} per sale, but the product remains unprofitable.`;
  }

  if (currentProfit >= 0 && simulatedProfit < 0) {
    return "Warning: This scenario changes the product from profitable to unprofitable.";
  }

  if (profitDifference > 0 && marginDifference > 0) {
    return `This scenario increases profit by ${profitText} per sale and improves margin by ${pointsText}.`;
  }

  if (profitDifference > 0 && marginDifference < 0) {
    return `This scenario increases profit by ${profitText} per sale, but reduces margin by ${pointsText}.`;
  }

  if (profitDifference < 0 && marginDifference > 0) {
    return `This scenario reduces profit by ${profitText} per sale, while improving margin by ${pointsText}.`;
  }

  if (profitDifference < 0) {
    return `This scenario reduces profit by ${profitText} per sale.`;
  }

  if (marginDifference !== 0) {
    return `This scenario produces no change in profit, while ${marginDifference > 0 ? "improving" : "reducing"} margin by ${pointsText}.`;
  }

  return "This scenario produces no meaningful change in profit or margin.";
}

function resultBadge(simulation) {
  const currentProfit = Number(simulation.current.netProfit || 0);
  const simulatedProfit = Number(simulation.projected.netProfit || 0);
  const difference = Number(simulation.comparison.profitChange || 0);

  if (simulatedProfit < 0) return { tone: "critical", label: "Still Unprofitable" };
  if (currentProfit >= 0 && simulatedProfit < 0) return { tone: "critical", label: "Lower Profit" };
  if (difference > 0) return { tone: "success", label: "Improved" };
  if (difference < 0) return { tone: "warning", label: "Lower Profit" };
  return { tone: undefined, label: "No Change" };
}

export default function ProfitSimulator({
  products = [],
  currency = "USD",
  shippingCost = 0,
  costConfigurationAvailable = false,
  error: initialError,
}) {
  const [type, setType] = useState("price");
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [price, setPrice] = useState("");
  const [discount, setDiscount] = useState("0");
  const [shipping, setShipping] = useState(String(shippingCost));
  const [result, setResult] = useState(null);
  const [error, setError] = useState(initialError || "");
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);
  const [scenarioChanged, setScenarioChanged] = useState(false);

  const selectedProduct = products.find((product) => product.id === productId) || null;
  const variants = selectedProduct?.variants || [];
  const selectedVariant = variants.find((variant) => variant.id === variantId) || null;

  const productOptions = useMemo(() => [
    { label: products.length ? "Select a product" : "No products are available for simulation", value: "" },
    ...products.map((product) => ({ label: product.title, value: product.id })),
  ], [products]);

  const variantOptions = useMemo(() => variants.map((variant) => ({
    label: variant.title || "Default Title",
    value: variant.id,
  })), [variants]);

  useEffect(() => {
    if (!selectedProduct) {
      setVariantId("");
      setPrice("");
      return;
    }

    const nextVariant = variants.length === 1 ? variants[0] : null;
    setVariantId(nextVariant?.id || "");
    setPrice(nextVariant ? String(nextVariant.price ?? "") : "");
    setShipping(String(shippingCost));
    setDiscount("0");
    setResult(null);
    setScenarioChanged(false);
    setTouched(false);
    setError("");
  }, [productId, shippingCost]);

  useEffect(() => {
    if (!selectedVariant) return;
    setPrice(String(selectedVariant.price ?? ""));
    setResult(null);
    setScenarioChanged(false);
    setTouched(false);
  }, [selectedVariant?.id]);

  function markScenarioChanged(setter) {
    return (value) => {
      setter(value);
      if (result) setScenarioChanged(true);
    };
  }

  const validationError = (() => {
    if (!productId || !selectedVariant) return "Select a product and variant to continue.";
    if (selectedVariant.cost === null || selectedVariant.cost === undefined) {
      return "Cost per item is missing for this variant.";
    }
    const value = type === "price" ? price : type === "discount" ? discount : shipping;
    if (value === "" || !Number.isFinite(Number(value)) || Number(value) < 0) {
      return type === "price" ? "Enter a valid price." : type === "discount" ? "Discount must be between 0% and 100%." : "Shipping cost cannot be negative.";
    }
    if (type === "discount" && Number(value) > 100) return "Discount must be between 0% and 100%.";
    return "";
  })();

  function selectProduct(value) {
    setProductId(value);
    setResult(null);
    setScenarioChanged(false);
    setError("");
  }

  function selectVariant(value) {
    setVariantId(value);
    setResult(null);
    setScenarioChanged(false);
  }

  function changeType(index) {
    setType(SIMULATION_TABS[index].id);
    setResult(null);
    setScenarioChanged(false);
    setError("");
  }

  async function runSimulation() {
    setTouched(true);
    if (validationError) return;

    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/profit-simulator/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          variantId,
          type: type.toUpperCase(),
          price: type === "price" ? Number(price) : Number(selectedVariant.price),
          discount: type === "discount" ? Number(discount) : 0,
          shipping: type === "shipping" ? Number(shipping) : Number(shippingCost),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to run the simulation.");
      setResult(data.simulation);
      setScenarioChanged(false);
    } catch (requestError) {
      setResult(null);
      setError(requestError.message || "Unable to run the simulation. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const displayedCurrency = result?.currencyCode || selectedVariant?.currency || currency;
  const resultIsConsistent = (section) => {
    if (!section || section.netSellingPrice <= 0) return section?.grossMargin === 0 && section?.netMargin === 0;
    const expectedNetMargin = Number(((section.netProfit / section.netSellingPrice) * 100).toFixed(2));
    const expectedGrossMargin = Number(((section.grossProfit / section.netSellingPrice) * 100).toFixed(2));
    return Math.abs(expectedNetMargin - section.netMargin) <= 0.01 && Math.abs(expectedGrossMargin - section.grossMargin) <= 0.01;
  };
  const hasConsistentResult = result && resultIsConsistent(result.current) && resultIsConsistent(result.projected);
  const badge = result && resultBadge(result);
  const impactTone = result?.comparison?.profitChange > 0 ? "success" : result?.comparison?.profitChange < 0 ? "critical" : undefined;
  const inputChanged = (setter) => markScenarioChanged(setter);

  return (
    <Page title="Profit Simulator" subtitle="Test price, discount, or shipping changes before applying them." fullWidth>
      <BlockStack gap="400">
        {error && <Banner tone="critical" onDismiss={() => setError("")}><p>{error}</p></Banner>}
        <InlineGrid columns={{ xs: 1, md: "minmax(0, 1fr) minmax(0, 1fr)" }} gap="400">
          <Card padding="500">
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">Simulation</Text>
                <Text as="p" tone="subdued">Change one value to see how it affects profit.</Text>
              </BlockStack>
              <Tabs tabs={SIMULATION_TABS} selected={SIMULATION_TABS.findIndex((tab) => tab.id === type)} onSelect={changeType} />
              <Select label="Select Product" options={productOptions} value={productId} onChange={selectProduct} disabled={loading || Boolean(initialError)} />
              {selectedProduct && variants.length > 1 && <Select label="Select Variant" options={variantOptions} value={variantId} onChange={selectVariant} disabled={loading} />}
              {selectedProduct?.image && <InlineStack gap="200" blockAlign="center"><Thumbnail source={selectedProduct.image} alt={selectedProduct.title} size="small" /><Text as="span" fontWeight="semibold">{selectedProduct.title}</Text></InlineStack>}
              {!selectedVariant && <Text as="p" tone="subdued">Select a product to get started.</Text>}
              {selectedVariant && (
                <BlockStack gap="300">
                  <Divider />
                  <Text as="h3" variant="headingSm">Current</Text>
                  <BlockStack gap="200">
                    <DetailRow label="Price" value={money(selectedVariant.price, displayedCurrency)} />
                    <DetailRow label="Product Cost" value={selectedVariant.cost == null ? "Not available" : money(selectedVariant.cost, displayedCurrency)} />
                    <DetailRow label="Shipping" value={money(shippingCost, displayedCurrency)} />
                  </BlockStack>
                  {selectedVariant.cost == null && <Banner tone="warning"><p>Add Cost per item in Shopify to calculate profit accurately.</p></Banner>}
                  {selectedVariant.cost != null && !costConfigurationAvailable && <Banner tone="warning"><p>Some cost settings are not configured. The simulated result may be incomplete.</p></Banner>}
                  <Divider />
                  <Text as="h3" variant="headingSm">Scenario</Text>
                  {type === "price" && <TextField label="New Price" type="number" value={price} onChange={inputChanged(setPrice)} helpText="The simulated selling price only." error={touched && validationError ? validationError : undefined} min={0} autoComplete="off" />}
                  {type === "discount" && <TextField label="Discount" type="number" suffix="%" value={discount} onChange={inputChanged(setDiscount)} helpText="Applied to the current selling price." error={touched && validationError ? validationError : undefined} min={0} max={100} autoComplete="off" />}
                  {type === "shipping" && <TextField label="New Shipping" type="number" value={shipping} onChange={inputChanged(setShipping)} helpText="The simulated merchant shipping cost." error={touched && validationError ? validationError : undefined} min={0} autoComplete="off" />}
                  <Button variant="primary" onClick={runSimulation} disabled={loading || Boolean(validationError) || selectedVariant.cost == null} loading={loading}>{loading ? "Running Simulation..." : "Run Simulation"}</Button>
                  {loading && <InlineStack gap="200" blockAlign="center"><Spinner size="small" /><Text as="span" tone="subdued">Calculating with the latest store data...</Text></InlineStack>}
                  {scenarioChanged && <Text as="p" tone="subdued">Scenario changed — run simulation to update results.</Text>}
                </BlockStack>
              )}
            </BlockStack>
          </Card>

          <Card padding="500">
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center"><Text as="h2" variant="headingMd">Results</Text>{badge && <Badge tone={badge.tone}>{badge.label}</Badge>}</InlineStack>
              {!result ? (
                <BlockStack gap="200"><Text as="p" tone="subdued">Select a product, enter a scenario, and run a simulation.</Text></BlockStack>
              ) : !hasConsistentResult ? (
                <Banner tone="critical"><p>Simulation results were inconsistent and were not displayed. Please run the simulation again.</p></Banner>
              ) : (
                <BlockStack gap="400">
                  <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                    <Card background="bg-surface-secondary" padding="400"><BlockStack gap="300"><Text as="h3" variant="headingSm">Current</Text><Metric label="Profit" value={money(result.current.netProfit, displayedCurrency)} tone={result.current.netProfit < 0 ? "critical" : undefined} /><Metric label="Margin" value={percent(result.current.netMargin)} /></BlockStack></Card>
                    <Card background="bg-surface-secondary" padding="400"><BlockStack gap="300"><Text as="h3" variant="headingSm">Simulated</Text><Metric label="Profit" value={money(result.projected.netProfit, displayedCurrency)} tone={result.projected.netProfit < 0 ? "critical" : "success"} /><Metric label="Margin" value={percent(result.projected.netMargin)} /></BlockStack></Card>
                  </InlineGrid>
                  <Text as="p" alignment="center" variant="headingMd" tone="subdued">Current setup → your scenario</Text>
                  <Divider />
                  <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                    <Card padding="400"><BlockStack gap="300"><Text as="h3" variant="headingSm">Profit Impact</Text><DetailRow label="Current Profit" value={money(result.current.netProfit, displayedCurrency)} /><DetailRow label="Simulated Profit" value={money(result.projected.netProfit, displayedCurrency)} /><Divider /><DetailRow label="Difference" value={signedMoney(result.comparison.profitChange, displayedCurrency)} helpText="Difference between current and simulated profit per sale." /></BlockStack></Card>
                    <Card padding="400"><BlockStack gap="300"><Text as="h3" variant="headingSm">Margin Impact</Text><DetailRow label="Current Margin" value={percent(result.current.netMargin)} /><DetailRow label="Simulated Margin" value={percent(result.projected.netMargin)} /><Divider /><DetailRow label="Difference" value={signedPoints(result.comparison.marginChange)} helpText="Difference between current and simulated margin." /></BlockStack></Card>
                  </InlineGrid>
                  <Banner tone={impactTone === "critical" ? "warning" : impactTone === "success" ? "success" : "info"}><p><strong>Result:</strong> {resultMessage(result, displayedCurrency)}</p></Banner>
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </InlineGrid>
      </BlockStack>
    </Page>
  );
}