import { getPool } from "../config/db";

/**
 * Checks if a sensor is currently under active suppression.
 */
export async function isSensorSuppressed(sensorId: string): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM suppression
     WHERE sensor_id = $1 AND start_time <= NOW() AND end_time >= NOW()`,
    [sensorId]
  );
  return parseInt(result.rows[0]!.count, 10) > 0;
}

/**
 * Checks suppression status for multiple sensors in one query.
 * Returns a Set of sensor_ids that are currently suppressed.
 */
export async function getSuppressedSensorIds(
  sensorIds: string[]
): Promise<Set<string>> {
  if (sensorIds.length === 0) return new Set();

  const pool = getPool();
  const result = await pool.query<{ sensor_id: string }>(
    `SELECT DISTINCT sensor_id FROM suppression
     WHERE sensor_id = ANY($1::text[])
       AND start_time <= NOW()
       AND end_time >= NOW()`,
    [sensorIds]
  );
  return new Set(result.rows.map((r: { sensor_id: string }) => r.sensor_id));
}
