import { NextFunction, Request, Response } from "express";
import { getSensorDetail, getSensorsByZones } from "../dataAccess/sensorDA";
import { getAuth } from "../middleware/authMiddleware";
import { sseManager } from "../realtime/sseManager";
import { ApiError } from "../utils/errors";

/**
 * GET /sensors
 * Returns all sensors in the operator's assigned zones.
 */
export async function getSensorsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const auth = getAuth(req);
    const zoneIds = auth.role === "supervisor" ? null : auth.zone_ids;
    const sensors = await getSensorsByZones(zoneIds);
    res.json({ data: sensors });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /sensors/:id
 * Returns sensor detail with recent readings, anomalies, suppression status.
 */
export async function getSensorDetailController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const auth = getAuth(req);
    const sensorId = req.params.id as string;

    const detail = await getSensorDetail(sensorId);
    if (!detail) {
      throw ApiError.notFound("Sensor not found");
    }

    // Zone isolation check
    if (
      auth.role === "operator" &&
      !auth.zone_ids.includes(detail.sensor.zone_id)
    ) {
      throw ApiError.forbidden("Sensor belongs to a zone you don't have access to");
    }

    res.json(detail);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /events
 * SSE endpoint — operator subscribes to real-time zone events.
 * Connection stays open. Server pushes sensor_state_change
 * and alert_created events.
 */
export async function sseController(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  const auth = getAuth(req);

  sseManager.addClient(
    auth.user_id,
    auth.role,
    auth.zone_ids,
    res
  );

  // Connection will stay open — Express won't call next()
}
