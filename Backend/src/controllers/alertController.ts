import { NextFunction, Request, Response } from "express";
import { getAuth } from "../middleware/authMiddleware";
import { listAlerts, transitionAlert } from "../services/alertService";
import { AlertStatus } from "../types";

/**
 * GET /alerts
 * Zone-scoped, paginated, filterable by status and sensor_id.
 */
export async function getAlertsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const auth = getAuth(req);

    const result = await listAlerts(auth, {
      status: req.query.status as AlertStatus | undefined,
      sensor_id: req.query.sensor_id as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      page_size: req.query.page_size
        ? parseInt(req.query.page_size as string, 10)
        : undefined,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /alerts/:id
 * Transition alert status: open → acknowledged → resolved
 */
export async function transitionAlertController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const auth = getAuth(req);
    const alertId = parseInt(req.params.id as string, 10);

    if (isNaN(alertId)) {
      res.status(400).json({ code: "INVALID_ID", message: "Alert ID must be a number" });
      return;
    }

    const { status } = req.body;

    if (!status) {
      res.status(400).json({ code: "MISSING_STATUS", message: "status is required" });
      return;
    }

    const updated = await transitionAlert(auth, alertId, status);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}
