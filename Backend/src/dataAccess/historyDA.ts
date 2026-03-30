import { getPool } from "../config/db";

/**
 * Fetch historical readings for a sensor within a time window.
 * Includes anomaly flags and associated alert info per reading.
 *
 * Uses a LEFT JOIN + JSON aggregation to return readings with
 * their anomalies in a single query — avoids N+1.
 *
 * Performance: idx_readings_sensor_time covers the WHERE + ORDER BY.
 * idx_anomalies_reading covers the LEFT JOIN on reading_id.
 */
export async function getReadingHistory(params: {
  sensorId: string;
  from: string;
  to: string;
  page: number;
  pageSize: number;
}): Promise<{ rows: any[]; total: number }> {
  const pool = getPool();
  const { sensorId, from, to, page, pageSize } = params;
  const offset = (page - 1) * pageSize;

  // Count total matching readings
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM readings
     WHERE sensor_id = $1
       AND timestamp >= $2::timestamptz
       AND timestamp <= $3::timestamptz`,
    [sensorId, from, to]
  );
  const total = parseInt(countResult.rows[0]!.count, 10);

  // Fetch readings with anomaly+alert data joined in
  const result = await pool.query(
    `SELECT
       r.id AS reading_id,
       r.sensor_id,
       r.timestamp,
       r.voltage,
       r.current,
       r.temperature,
       r.status_code,
       COALESCE(
         json_agg(
           json_build_object(
             'anomaly_id', an.id,
             'type', an.type,
             'alert_id', al.id,
             'alert_status', al.status
           )
         ) FILTER (WHERE an.id IS NOT NULL),
         '[]'::json
       ) AS anomalies
     FROM readings r
     LEFT JOIN anomalies an ON an.reading_id = r.id
     LEFT JOIN alerts al ON al.anomaly_id = an.id
     WHERE r.sensor_id = $1
       AND r.timestamp >= $2::timestamptz
       AND r.timestamp <= $3::timestamptz
     GROUP BY r.id, r.sensor_id, r.timestamp, r.voltage, r.current,
              r.temperature, r.status_code
     ORDER BY r.timestamp DESC
     LIMIT $4 OFFSET $5`,
    [sensorId, from, to, pageSize, offset]
  );

  return { rows: result.rows, total };
}
