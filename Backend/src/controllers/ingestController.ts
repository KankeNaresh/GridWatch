import { NextFunction, Request, Response } from "express";
import { ingestReadings } from "../services/ingestService";

/**
 * POST /ingest
 * Accepts up to 1000 readings. Responds in <200ms.
 * Durable write (INSERT) happens synchronously.
 * Anomaly detection runs asynchronously via worker.
 */
export async function ingestController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { readings } = req.body;
    const result = await ingestReadings(readings);

    res.status(201).json({
      message: "Readings ingested",
      inserted: result.inserted,
      skipped: result.skipped,
    });
  } catch (err) {
    next(err);
  }
}
