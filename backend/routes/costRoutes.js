import express from "express";
import { validateInternalRequest } from "../middleware/authMiddleware.js";
import {
  getCostConfig,
  saveCostConfig,
  calculateCostPreview,
} from "../controllers/costController.js";

const router = express.Router();

router.get("/config", validateInternalRequest, getCostConfig);
router.post("/config", validateInternalRequest, saveCostConfig);
router.post("/preview", validateInternalRequest, calculateCostPreview);

export default router;
