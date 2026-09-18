/**
 * backend/services/profitLeakEngine.js
 *
 * Master orchestrator for the MarginMind Profit Leak Detector.
 * Executes all detection modules, enforces deduplication, isolates tenants,
 * and maintains execution status.
 */

import Store from "../models/Store.js";
import ProfitLeak from "../models/ProfitLeak.js";
import { getStoreWithActiveToken } from "../utils/storeHelper.js";
import { roundMoney } from "../utils/profitCalculation.js";

import { detectProductProfitLeaks } from "./productProfitLeakService.js";
import { detectOrderProfitLeaks } from "./orderProfitLeakService.js";
import { detectCustomerProfitLeaks } from "./customerProfitLeakService.js";
import { detectDiscountProfitLeaks } from "./discountProfitLeakService.js";
import { detectShippingProfitLeaks } from "./shippingProfitLeakService.js";
import { detectRefundProfitLeaks } from "./refundProfitLeakService.js";

/**
 * Runs the full Profit Leak Detection Engine for a verified store.
 *
 * @param {string} shop - Verified myshopify domain
 * @returns {Promise<object>} Execution summary and detected leaks
 */
export async function runProfitLeakEngine(shop) {
    const startTime = new Date();

    const store = await getStoreWithActiveToken(shop);
    if (!store) {
        throw new Error(`[ProfitLeakEngine] Store not found or inactive: ${shop}`);      
    }

    const storeCurrency = store.currency || "USD";
    const storeCostConfig = store.costConfig || null;

    const moduleStatus = {};
    const incompleteDataWarnings = [];
    const detectedLeaks = [];

    // Helper to safely execute a detection module without crashing the entire engine
    async function executeModule(name, fn) {
        try {
            const results = await fn();
            moduleStatus[name] = { success: true, count: results.length };
            detectedLeaks.push(...results);
        } catch (err) {
            console.error(`[ProfitLeakEngine] Module ${name} error for ${shop}:`, err.message);
            moduleStatus[name] = { success: false, error: err.message };
            incompleteDataWarnings.push(`Module ${name} encountered an error: ${err.message}`);
        }
    }

    // 1. Run detection modules in parallel
    await Promise.all([
        executeModule("ProductProfitLeaks", () => detectProductProfitLeaks(shop, storeCurrency)),
        executeModule("OrderProfitLeaks", () => detectOrderProfitLeaks(shop, storeCostConfig, storeCurrency)),
        executeModule("CustomerProfitLeaks", () => detectCustomerProfitLeaks(shop, storeCurrency)),
        executeModule("DiscountProfitLeaks", () => detectDiscountProfitLeaks(shop, storeCurrency)),
        executeModule("ShippingProfitLeaks", () => detectShippingProfitLeaks(shop, storeCurrency)),
        executeModule("RefundProfitLeaks", () => detectRefundProfitLeaks(shop, storeCurrency)),
    ]);

    // 2. Atomic Upsert / Deduplication in MongoDB
    let newLeaksCount = 0;
    let updatedLeaksCount = 0;

    for (const leak of detectedLeaks) {
        const existing = await ProfitLeak.findOne({
            shop,
            deduplicationKey: leak.deduplicationKey,
        });

        if (!existing) {
            await ProfitLeak.create(leak);
            newLeaksCount++;
        } else if (existing.status === "OPEN") {
            // Update financial metrics on open leaks to reflect latest numbers
            existing.profitImpact = leak.profitImpact;
            existing.severity = leak.severity;
            existing.evidence = leak.evidence;
            existing.metadata = leak.metadata;
            existing.detectedAt = new Date();
            await existing.save();
            updatedLeaksCount++;
        }
    }

    // 3. Compile store-level summary
    const allOpenLeaks = await ProfitLeak.find({ shop, status: "OPEN" }).lean();

    let criticalCount = 0;
    let warningCount = 0;
    let infoCount = 0;
    let totalImpact = 0;

    for (const item of allOpenLeaks) {
        if (item.severity === "CRITICAL") criticalCount++;
        else if (item.severity === "WARNING") warningCount++;
        else infoCount++;

        totalImpact += (item.profitImpact || 0);
    }

    const dataFreshness = store.lastSyncedAt
        ? `Last store sync: ${new Date(store.lastSyncedAt).toISOString()}`
        : "Live Shopify Admin query";

    return {
        success: true,
        shop,
        summary: {
            totalLeaks: allOpenLeaks.length,
            criticalLeaks: criticalCount,
            warningLeaks: warningCount,
            informationalFindings: infoCount,
            totalEstimatedImpact: roundMoney(totalImpact),
            impactCurrency: storeCurrency,
            lastRunTime: startTime.toISOString(),
            dataFreshness,
            incompleteDataWarnings,
            newLeaksDetected: newLeaksCount,
            existingLeaksUpdated: updatedLeaksCount,
            moduleStatus,
        },
    };
}
