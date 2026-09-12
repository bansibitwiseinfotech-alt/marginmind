import Store from "../models/Store.js";

const SHOPIFY_API_VERSION = "2026-07";

/*
 * Normalize Shopify shop domain.
 */
function normalizeShop(shop) {
    if (!shop) return null;

    const value = shop.trim().toLowerCase();

    if (value.endsWith(".myshopify.com")) {
        return value;
    }

    return `${value}.myshopify.com`;
}

/*
 * Product query.
 *
 * Gets real product and variant data directly       
 * from Shopify.
 *
 * IMPORTANT:
 * Products are NOT stored in MongoDB.
 */
const PRODUCT_QUERY = `
  query ProductProfitability(
    $first: Int!
    $after: String
    $query: String
  ) {
    shop {
      currencyCode
    }

    products(
      first: $first
      after: $after
      query: $query
      sortKey: TITLE
    ) {
      nodes {
        id
        title
        handle
        vendor
        status
        totalInventory

        featuredImage {
          url
          altText
        }

        variants(first: 100) {
          nodes {
            id
            title
            sku
            price
            inventoryQuantity

            inventoryItem {
              id

              unitCost {
                amount
                currencyCode
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

    productsCount(query: $query) {
      count
      precision
    }
  }
`;

/*
 * Shopify GraphQL request.
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

    const json = await response.json();

    /*
     * HTTP-level error.
     */
    if (!response.ok) {
        throw new Error(
            json?.errors?.[0]?.message ||
            "Shopify GraphQL request failed"
        );
    }

    /*
     * GraphQL-level error.
     */
    if (json.errors?.length) {
        throw new Error(
            json.errors
                .map((error) => error.message)
                .join(", ")
        );
    }

    return json.data;
}

/*
 * Main Product Profitability service.
 */
export async function getProductProfitability({
    shop,
    first = 50,
    after = null,
    search = "",
}) {
    const normalizedShop = normalizeShop(shop);

    if (!normalizedShop) {
        throw new Error("Shop is required");
    }

    /*
     * Find the store in MongoDB.
     *
     * MongoDB is used only for the store/access token.
     * Shopify remains the source of truth for products.
     */
    const store = await Store.findOne({
        shop: normalizedShop,
    });

    if (!store) {
        throw new Error("Store not found");
    }

    if (!store.accessToken) {
        throw new Error(
            "Shopify access token not found"
        );
    }

    /*
     * 50 products per page.
     *
     * Shopify allows a maximum of 100 here.
     */
    const safeFirst = Math.min(
        Math.max(Number(first) || 50, 1),
        100
    );

    /*
     * Clean search value.
     */
    const searchQuery =
        search?.trim() || null;

    /*
     * Get products + real total product count
     * from Shopify in one GraphQL request.
     */
    const data = await shopifyGraphQL(
        normalizedShop,
        store.accessToken,
        PRODUCT_QUERY,
        {
            first: safeFirst,
            after: after || null,
            query: searchQuery,
        }
    );
        
    console.log(
      "[MarginMind] COGS CHECK",
      JSON.stringify(
        data.products.nodes.slice(0, 3).map((product) => ({
          product: product.title,
          variants: product.variants.nodes.map((variant) => ({
            variant: variant.title,
            price: variant.price,
            inventoryItemId: variant.inventoryItem?.id || null,
            unitCost: variant.inventoryItem?.unitCost || null,
          })),
        })),
        null,
        2
      )
    );

    /*
     * Store currency from Shopify or store model fallback.
     */
    const shopCurrency =
        data.shop?.currencyCode ||
        store.currency ||
        "USD";

    /*
     * Convert Shopify products into
     * frontend-safe data.
     */
    const products =
        data.products.nodes.map(
            (product) => {
                const variants =
                    product.variants.nodes.map(
                        (variant) => {
                            const price = Number(
                                variant.price || 0
                            );

                            /*
                             * Shopify COGS.
                             */
                            const cost =
                                variant.inventoryItem
                                    ?.unitCost?.amount != null
                                    ? Number(
                                        variant.inventoryItem
                                            .unitCost.amount
                                    )
                                    : null;

                            const inventory =
                                Number(
                                    variant.inventoryQuantity || 0
                                );

                            /*
                             * Unit economics: Selling Price - Product Cost
                             */
                            const unitProfit =
                                cost !== null
                                    ? Number((price - cost).toFixed(2))
                                    : null;

                            const unitMargin =
                                cost !== null && price > 0
                                    ? Number((((price - cost) / price) * 100).toFixed(2))
                                    : null;

                            /*
                             * Profitability status.
                             */
                            let status = "NO_COST";
                            if (cost === null) {
                                status = "NO_COST";
                            } else if (unitMargin !== null) {
                                if (unitMargin < 0) {
                                    status = "LOSS";
                                } else if (unitMargin < 20) {
                                    status = "LOW_MARGIN";
                                } else {
                                    status = "PROFITABLE";
                                }
                            }

                            return {
                                id: variant.id,
                                title: variant.title,
                                sku: variant.sku || "",
                                price,
                                cost,
                                unitProfit,
                                unitMargin,
                                inventory,
                                currency:
                                    variant.inventoryItem?.unitCost?.currencyCode ||
                                    shopCurrency,
                                status,
                            };
                        }
                    );

                return {
                    id: product.id,
                    title: product.title,
                    handle: product.handle,
                    vendor: product.vendor || "",
                    status: product.status,
                    totalInventory:
                        Number(product.totalInventory) || 0,
                    image: product.featuredImage?.url || null,
                    imageAlt:
                        product.featuredImage?.altText ||
                        product.title,
                    variants,
                };
            }
        );

    /*
     * Flatten variants for calculations.
     */
    const allVariants =
        products.flatMap(
            (product) => product.variants
        );

    /*
     * Variants where Shopify has a product cost and selling price > 0.
     */
    const variantsWithCost =
        allVariants.filter(
            (variant) =>
                variant.cost !== null && variant.price > 0
        );

    /*
     * Profitable: margin >= 20%
     */
    const profitable =
        variantsWithCost.filter(
            (variant) => variant.unitMargin >= 20
        );

    /*
     * Low margin: 0% to <20%
     */
    const lowMargin =
        variantsWithCost.filter(
            (variant) =>
                variant.unitMargin >= 0 &&
                variant.unitMargin < 20
        );

    /*
     * Loss: margin < 0%
     */
    const lossMaking =
        variantsWithCost.filter(
            (variant) => variant.unitMargin < 0
        );

    /*
     * Average margin for the currently loaded page.
     */
    const averageMargin =
        variantsWithCost.length > 0
            ? Number(
                (
                    variantsWithCost.reduce(
                        (total, variant) =>
                            total + variant.unitMargin,
                        0
                    ) / variantsWithCost.length
                ).toFixed(2)
            )
            : null;

    /*
     * REAL SHOPIFY PRODUCT COUNT.
     */
    const totalProducts =
        Number(data.productsCount?.count || 0);

    const productCountPrecision =
        data.productsCount?.precision || "UNKNOWN";

    return {
        products,
        totalProducts,
        summary: {
            totalProducts,
            productsOnPage: products.length,
            variantsOnPage: allVariants.length,
            profitableVariants: profitable.length,
            lowMarginVariants: lowMargin.length,
            lossMakingVariants: lossMaking.length,
            variantsWithCost: variantsWithCost.length,
            variantsWithoutCost:
                allVariants.length - variantsWithCost.length,
            averageUnitMargin: averageMargin,
        },

        /*
         * Shopify cursor pagination.
         */
        pageInfo:
            data.products.pageInfo,

        /*
         * Tells frontend what the
         * product count represents.
         */
        productCountPrecision,

        /*
         * Current data type.
         *
         * Actual revenue/profit will be
         * calculated after Order Sync.
         */
        dataType:
            "UNIT_ECONOMICS",
    };
}