/**
 * backend/services/profitLeakService.js
 *
 * Core service layer wrapping ProfitLeak database queries and engine executions.
 */

import ProfitLeak from "../models/ProfitLeak.js";
import { runProfitLeakEngine } from "./profitLeakEngine.js";

export { runProfitLeakEngine };

/**
 * Fetch filtered, paginated profit leaks for a verified store.
 */
export async function getStoreProfitLeaks({
    shop,
    leakType,
    severity,
    status = "OPEN",
    search,
    page = 1,
    limit = 50,
    startDate,
    endDate,
    sortBy = "detectedAt",
    sortOrder = "desc",
}) {
    const filter = { shop };

    if (leakType) {
        filter.leakType = leakType.toUpperCase();
    }

    if (severity) {
        filter.severity = severity.toUpperCase();
    }

    if (status && status !== "ALL") {
        filter.status = status.toUpperCase();
    }

    if (startDate || endDate) {
        filter.detectedAt = {};
        if (startDate) filter.detectedAt.$gte = new Date(startDate);
        if (endDate) filter.detectedAt.$lte = new Date(endDate);
    }

    if (search && search.trim()) {
        const regex = new RegExp(search.trim(), "i");
        filter.$or = [
            { title: regex },
            { affectedArea: regex },
            { resourceName: regex },
            { description: regex },
        ];
    }

    const currentPage = Math.max(Number(page) || 1, 1);
    const pageLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const skip = (currentPage - 1) * pageLimit;
    const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    const [leaks, total] = await Promise.all([
        ProfitLeak.find(filter).sort(sort).skip(skip).limit(pageLimit).lean(),
        ProfitLeak.countDocuments(filter),
    ]);

    return {
        leaks,
        pagination: {
            page: currentPage,
            limit: pageLimit,
            total,
            totalPages: Math.ceil(total / pageLimit),
        },
    };
}

/**
 * Get detailed audit breakdown for a single leak.
 */
export async function getSingleProfitLeak(shop, leakId) {
    return ProfitLeak.findOne({ _id: leakId, shop }).lean();
}

/**
 * Update leak status (OPEN, RESOLVED, IGNORED).
 */
export async function updateProfitLeakStatus(shop, leakId, status) {
    const validStatuses = ["OPEN", "RESOLVED", "IGNORED"];
    const normalized = String(status).toUpperCase();

    if (!validStatuses.includes(normalized)) {
        throw new Error(`Invalid status: ${status}. Must be OPEN, RESOLVED, or IGNORED.`);
     }

    const update = { status: normalized };
    if (normalized === "RESOLVED") {
        update.resolvedAt = new Date();
    } else {
        update.resolvedAt = null;
    }

    return ProfitLeak.findOneAndUpdate(
        { _id: leakId, shop },
        { $set: update },
        { new: true }
    ).lean();
}

/**
 * Get aggregate store summary metrics.
 */
export async function getProfitLeakStoreSummary(shop) {
    const [leaks, totalResolved] = await Promise.all([
        ProfitLeak.find({ shop, status: "OPEN" }).lean(),
        ProfitLeak.countDocuments({ shop, status: "RESOLVED" }),
    ]);

    let criticalCount = 0;
    let warningCount = 0;
    let infoCount = 0;
    let totalImpact = 0;
    let currency = "USD";

    for (const leak of leaks) {
        if (leak.severity === "CRITICAL") criticalCount++;
        else if (leak.severity === "WARNING") warningCount++;
        else infoCount++;

        totalImpact += (leak.profitImpact || 0);
        if (leak.impactCurrency) currency = leak.impactCurrency;
    }

    // Leak counts by category
    const byType = {};
    for (const leak of leaks) {
        byType[leak.leakType] = (byType[leak.leakType] || 0) + 1;
    }

    return {
        totalLeaks: leaks.length,
        totalResolved,
        criticalLeaks: criticalCount,
        warningLeaks: warningCount,
        informationalFindings: infoCount,
        totalEstimatedImpact: Math.round(totalImpact * 100) / 100,
        impactCurrency: currency,
        byType,
    };
}