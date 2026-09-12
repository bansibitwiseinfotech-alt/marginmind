import express from "express";

import {
    getProductProfitabilityController,
} from "../controllers/productProfitabilityController.js";

import {
    validateInternalRequest,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.get(
    "/",
    validateInternalRequest,
    getProductProfitabilityController
);

export default router;