import express from "express";
import {
    getDiscountImpactController,
} from "../controllers/discountImpact.controller.js";
import {
    validateInternalRequest,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// GET: Calculate discount impact for authenticated store
router.get("/", validateInternalRequest, getDiscountImpactController);

// POST: Backward-compatible endpoint for custom order payloads or queries
router.post("/", validateInternalRequest, getDiscountImpactController);

export default router;