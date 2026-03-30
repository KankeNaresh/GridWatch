import { Router } from "express";
import { historyController } from "../controllers/historyController";
import { ingestController } from "../controllers/ingestController";
import { authMiddleware } from "../middleware/authMiddleware";

// Controllers
import {
  getAlertsController,
  transitionAlertController,
} from "../controllers/alertController";
import {
  getSensorsController,
  getSensorDetailController,
  sseController,
} from "../controllers/sensorController";
import {
  createSuppressionController,
  getSuppressionController,
} from "../controllers/suppressionController";

const router = Router();

// ─── Ingest (no auth — simulates sensor data push) ───
router.post("/ingest", ingestController);

// ─── All routes below require authentication ───
router.use(authMiddleware);

// ─── Sensors ───
router.get("/sensors", getSensorsController);
router.get("/sensors/:id", getSensorDetailController);
router.get("/sensors/:id/history", historyController);

// ─── Alerts ───
router.get("/alerts", getAlertsController);
router.patch("/alerts/:id", transitionAlertController);

// ─── Suppression ───
router.get("/suppression", getSuppressionController);
router.post("/suppression", createSuppressionController);

// ─── SSE (real-time events) ───
router.get("/events", sseController);

export default router;
