import express from "express";

import {
  getCustomerProfitabilityController,
  getCustomerProfitabilityDetailsController,
  getCustomerOrdersController,
} from "../controllers/customerProfitabilityController.js";

import {
  validateInternalRequest,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.get(
  "/:customerId/orders",
  validateInternalRequest,
  getCustomerOrdersController
);

router.get(
  "/:customerId",
  validateInternalRequest,
  getCustomerProfitabilityDetailsController
);

router.get(
  "/",
  validateInternalRequest,
  getCustomerProfitabilityController
);

export default router;