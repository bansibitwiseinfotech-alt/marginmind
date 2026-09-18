import express from "express";
import {
    getShippingCostAnalysisController,
} from "../controllers/shippingCost.controller.js";
import {
    validateInternalRequest,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", validateInternalRequest, getShippingCostAnalysisController);

export default router;
