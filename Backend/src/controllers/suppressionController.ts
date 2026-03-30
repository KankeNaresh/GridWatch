import { NextFunction, Request, Response } from "express";
import { getPool } from "../config/db";
import { getSensorById } from "../dataAccess/sensorDA";
import { getAuth } from "../middleware/authMiddleware";
import { ApiError } from "../utils/errors";

/**
 * POST /suppression
 * Create a suppression window for a sensor.
 * Anomalies during the window are still recorded but don't produce alerts.
 */
export async function createSuppressionController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const auth = getAuth(req);
    const { sensor_id, start_time, end_time } = req.body;

    if (!sensor_id || !start_time || !end_time) {
      throw ApiError.badRequest(
        "MISSING_FIELDS",
        "sensor_id, start_time, and end_time are required"
      );
    }

    // Validate sensor exists and user has zone access
    const sensor = await getSensorById(sensor_id);
    if (!sensor) {
      throw ApiError.notFound("Sensor not found");
    }

    if (auth.role === "operator" && !auth.zone_ids.includes(sensor.zone_id)) {
      throw ApiError.forbidden("Sensor belongs to a zone you don't have access to");
    }

    const startDate = new Date(start_time);
    const endDate = new Date(end_time);

    if (endDate <= startDate) {
      throw ApiError.badRequest(
        "INVALID_WINDOW",
        "end_time must be after start_time"
      );
    }

    const pool = getPool();

    // Create suppression
    const result = await pool.query(
      `INSERT INTO suppression (sensor_id, zone_id, start_time, end_time, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [sensor_id, sensor.zone_id, startDate, endDate, auth.user_id]
    );

    // If suppression starts now and there are open alerts for this sensor,
    // mark them as suppressed (design decision: documented in README)
    if (startDate <= new Date()) {
      await pool.query(
        `UPDATE alerts
         SET is_suppressed = TRUE, updated_at = NOW()
         WHERE sensor_id = $1 AND status = 'open' AND is_suppressed = FALSE`,
        [sensor_id]
      );
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /suppression
 * List active suppressions — zone-scoped.
 */
export async function getSuppressionController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const auth = getAuth(req);
    const pool = getPool();

    let result;
    if (auth.role === "supervisor") {
      result = await pool.query(
        `SELECT * FROM suppression ORDER BY created_at DESC`
      );
    } else {
      result = await pool.query(
        `SELECT * FROM suppression
         WHERE zone_id = ANY($1::int[])
         ORDER BY created_at DESC`,
        [auth.zone_ids]
      );
    }

    res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
}
