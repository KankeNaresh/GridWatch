import { bulkInsertReadings, getSensorZoneMap } from "../dataAccess/readingDA";
import { IngestReading } from "../types";
import { ApiError } from "../utils/errors";

const MAX_BATCH_SIZE = 1000;

/**
 * Validates and persists a batch of readings.
 * Returns the count of successfully inserted readings.
 *
 * Design: Write durably first (sync), detect anomalies later (async worker).
 * The endpoint returns as soon as INSERT completes — anomaly detection
 * is decoupled via the `processed = FALSE` flag on readings.
 */
export async function ingestReadings(
  readings: IngestReading[]
): Promise<{ inserted: number; skipped: number }> {
  if (!Array.isArray(readings) || readings.length === 0) {
    throw ApiError.badRequest("EMPTY_BATCH", "Readings array is required and must not be empty");
  }

  if (readings.length > MAX_BATCH_SIZE) {
    throw ApiError.badRequest(
      "BATCH_TOO_LARGE",
      `Maximum batch size is ${MAX_BATCH_SIZE}, got ${readings.length}`
    );
  }

  // Collect unique sensor IDs and fetch their zone mappings
  const uniqueSensorIds = [...new Set(readings.map((r) => r.sensor_id))];
  const sensorZoneMap = await getSensorZoneMap(uniqueSensorIds);

  const skipped = readings.filter((r) => !sensorZoneMap.has(r.sensor_id)).length;

  const ids = await bulkInsertReadings(readings, sensorZoneMap);

  return { inserted: ids.length, skipped };
}
