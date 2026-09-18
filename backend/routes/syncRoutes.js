import express from "express";
import { validateInternalRequest } from "../middleware/authMiddleware.js";
import {
  syncProducts,
  syncVariants,
  syncOrders,
  syncDiscounts,
  syncCustomers,
  syncReturns,
  syncRefunds,
  syncOrderCosts,
  syncAll,
  getSyncStatus,
} from "../controllers/syncController.js";

const router = express.Router();

router.get("/status", validateInternalRequest, getSyncStatus);
router.post("/products", validateInternalRequest, syncProducts);
router.post("/variants", validateInternalRequest, syncVariants);
router.post("/orders", validateInternalRequest, syncOrders);
router.post("/discounts", validateInternalRequest, syncDiscounts);
router.post("/customers", validateInternalRequest, syncCustomers);
router.post("/returns", validateInternalRequest, syncReturns);
router.post("/refunds", validateInternalRequest, syncRefunds);
router.post("/order-costs", validateInternalRequest, syncOrderCosts);
router.post("/all", validateInternalRequest, syncAll);

export default router;
