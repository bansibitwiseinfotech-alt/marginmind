import express from "express";
import { validateInternalRequest } from "../middleware/authMiddleware.js";
import {
  listAlerts,
  getSummary,
  getAlertDetails,
  runDetection,
  getConfig,
  updateConfig,
  acknowledge,
  resolve,
} from "../controllers/profitAlertController.js";

const router = express.Router();

// Apply internal authentication across alert endpoints
router.use(validateInternalRequest);

// GET alert summary counts
router.get("/summary", getSummary);

// GET alert configuration / thresholds
router.get("/config", getConfig);
router.get("/thresholds", getConfig);

// UPDATE alert configuration / thresholds
router.put("/config", updateConfig);
router.put("/thresholds", updateConfig);

// Run alert detection
router.post("/", runDetection);
router.post("/detect", runDetection);

// GET all alerts
router.get("/", listAlerts);

// Get one alert
router.get("/:id", getAlertDetails);
         
// Acknowledge alert
router.post("/:id/acknowledge", acknowledge);
router.patch("/:id/acknowledge", acknowledge);

// Resolve alert
router.post("/:id/resolve", resolve);
router.patch("/:id/resolve", resolve);

export default router;