import express from "express";

import {
  getOrderProfitabilityController,
  getOrderProfitabilityDetailsController,
} from "../controllers/orderProfitabilityController.js";

import {
  validateInternalRequest,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.get(
  "/:orderId/details",
  validateInternalRequest,
  getOrderProfitabilityDetailsController
);

router.get(
  "/",
  validateInternalRequest,
  getOrderProfitabilityController
);

export default router;