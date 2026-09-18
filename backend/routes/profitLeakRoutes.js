/**
 * backend/routes/profitLeakRoutes.js
 *
 * Express router for Profit Leak Detector endpoints.
 * Protected by validateInternalRequest middleware.
 */

import express from "express";
import { validateInternalRequest } from "../middleware/authMiddleware.js";
import {
    getProfitLeaks,
    getProfitLeakDetails,
    triggerDetection,
    getProfitLeakSummary,
    updateLeakStatus,
    getDataStatus,
    getProductReviewData,
} from "../controllers/profitLeakController.js";

const router = express.Router();

// Apply internal authentication across all profit leak endpoints
router.use(validateInternalRequest);

// 1. Get summary statistics
router.get("/summary", getProfitLeakSummary);

// 2. Check store data status and freshness
router.get("/data-status", getDataStatus);

// 3. Trigger detection run
router.post("/detect", triggerDetection);

// 4. Get list of leaks with search, filters, pagination
router.get("/", getProfitLeaks);

// 5. Product price review — must come before /:id to avoid route collision
router.get("/:id/product-review", getProductReviewData);

// 6. Get deep details for a single leak
router.get("/:id", getProfitLeakDetails);

// 7. Update leak status (OPEN, RESOLVED, IGNORED)
router.patch("/:id/status", updateLeakStatus);

export default router;