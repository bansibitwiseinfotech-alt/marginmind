import express from "express";
import { validateInternalRequest } from "../middleware/authMiddleware.js";
import { simulateProfit } from "../controllers/profitSimulatorController.js";

const router = express.Router();

router.use(validateInternalRequest);
router.post("/simulate", simulateProfit);

export default router;