import { getPool } from "../config/db";
import { Sensor } from "../types";

/**
 * Fetch all sensors for zones — zone-scoped.
 */
export async function getSensorsByZones(
  zoneIds: number[] | null
): Promise<Sensor[]> {
  const pool = getPool();

  if (zoneIds === null) {
    // Supervisor — all sensors
    const result = await pool.query<Sensor>(
      `SELECT * FROM sensors ORDER BY id`
    );
    return result.rows;
  }

  const result = await pool.query<Sensor>(
    `SELECT * FROM sensors WHERE zone_id = ANY($1::int[]) ORDER BY id`,
    [zoneIds]
  );
  return result.rows;
}

/**
 * Fetch a single sensor by ID with zone check.
 */
export async function getSensorById(sensorId: string): Promise<Sensor | null> {
  const pool = getPool();
  const result = await pool.query<Sensor>(
    `SELECT * FROM sensors WHERE id = $1`,
    [sensorId]
  );
  return result.rows[0] || null;
}

/**
 * Fetch sensor detail — recent readings, active anomalies, suppression status.
 */
export async function getSensorDetail(sensorId: string): Promise<{
  sensor: Sensor;
  recent_readings: any[];
  active_anomalies: any[];
  active_suppression: any | null;
} | null> {
  const pool = getPool();

  const sensorResult = await pool.query<Sensor>(
    `SELECT * FROM sensors WHERE id = $1`,
    [sensorId]
  );

  if (sensorResult.rows.length === 0) return null;

  const sensor = sensorResult.rows[0]!;

  // Parallel queries for detail view
  const [readingsResult, anomaliesResult, suppressionResult] =
    await Promise.all([
      pool.query(
        `SELECT id, timestamp, voltage, current, temperature, status_code
         FROM readings
         WHERE sensor_id = $1
         ORDER BY timestamp DESC
         LIMIT 20`,
        [sensorId]
      ),
      pool.query(
        `SELECT a.id, a.type, a.is_suppressed, a.created_at,
                al.id AS alert_id, al.severity, al.status AS alert_status
         FROM anomalies a
         LEFT JOIN alerts al ON al.anomaly_id = a.id
         WHERE a.sensor_id = $1
         ORDER BY a.created_at DESC
         LIMIT 20`,
        [sensorId]
      ),
      pool.query(
        `SELECT * FROM suppression
         WHERE sensor_id = $1
           AND start_time <= NOW()
           AND end_time >= NOW()
         LIMIT 1`,
        [sensorId]
      ),
    ]);

  return {
    sensor,
    recent_readings: readingsResult.rows,
    active_anomalies: anomaliesResult.rows,
    active_suppression: suppressionResult.rows[0] || null,
  };
}
