import { NextFunction, Request, Response } from "express";
import { getReadingHistory } from "../dataAccess/historyDA";
import { getSensorById } from "../dataAccess/sensorDA";
import { getAuth } from "../middleware/authMiddleware";
import { ApiError } from "../utils/errors";

/**
 * GET /sensors/:id/history?from=...&to=...&page=1&page_size=100
 * Returns paginated readings with anomaly flags for a sensor
 * within a time window. Must return in <300ms on 30 days of data.
 */
export async function historyController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const auth = getAuth(req);
    const sensorId = req.params.id as string;

    const to = (req.query.to as string | undefined) || new Date().toISOString();
    const from =
      (req.query.from as string | undefined) ||
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Zone isolation
    const sensor = await getSensorById(sensorId);
    if (!sensor) {
      throw ApiError.notFound("Sensor not found");
    }

    if (
      auth.role === "operator" &&
      !auth.zone_ids.includes(sensor.zone_id)
    ) {
      throw ApiError.forbidden("Sensor belongs to a zone you don't have access to");
    }

    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const pageSize = Math.min(
      req.query.page_size ? parseInt(req.query.page_size as string, 10) : 100,
      500
    );

    const { rows, total } = await getReadingHistory({
      sensorId,
      from,
      to,
      page,
      pageSize,
    });

    res.json({
      data: rows,
      page,
      page_size: pageSize,
      total,
    });
  } catch (err) {
    next(err);
  }
}
