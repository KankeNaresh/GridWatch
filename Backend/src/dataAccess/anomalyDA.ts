import { getPool } from "../config/db";
import { AlertSeverity, AnomalyType, SensorRule, SensorStatus } from "../types";

/**
 * Fetch unprocessed readings in a batch, using FOR UPDATE SKIP LOCKED
 * to support multiple worker instances without conflicts.
 */
export async function fetchUnprocessedReadings(
  batchSize: number
): Promise<
  {
    id: number;
    sensor_id: string;
    zone_id: number;
    voltage: number | null;
    current: number | null;
    temperature: number | null;
    timestamp: Date;
  }[]
> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, sensor_id, zone_id, voltage, current, temperature, timestamp
     FROM readings
     WHERE processed = FALSE
     ORDER BY id
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [batchSize]
  );
  return result.rows;
}

/**
 * Mark readings as processed.
 */
export async function markReadingsProcessed(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const pool = getPool();
  await pool.query(
    `UPDATE readings SET processed = TRUE WHERE id = ANY($1::bigint[])`,
    [ids]
  );
}

/**
 * Fetch sensor rules for a set of sensor IDs.
 */
export async function getSensorRules(
  sensorIds: string[]
): Promise<Map<string, SensorRule>> {
  if (sensorIds.length === 0) return new Map();

  const pool = getPool();
  const result = await pool.query<SensorRule>(
    `SELECT * FROM sensor_rules WHERE sensor_id = ANY($1::text[])`,
    [sensorIds]
  );

  const map = new Map<string, SensorRule>();
  for (const row of result.rows) {
    map.set(row.sensor_id, row);
  }
  return map;
}

/**
 * Fetch the last N readings for a sensor (for rate-of-change calculation).
 * Excludes the current reading.
 */
export async function getRecentReadings(
  sensorId: string,
  excludeReadingId: number,
  count: number
): Promise<{ voltage: number | null; temperature: number | null }[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT voltage, temperature
     FROM readings
     WHERE sensor_id = $1 AND id != $2
     ORDER BY timestamp DESC
     LIMIT $3`,
    [sensorId, excludeReadingId, count]
  );
  return result.rows;
}

/**
 * Insert an anomaly record.
 */
export async function insertAnomaly(
  sensorId: string,
  readingId: number | null,
  zoneId: number,
  type: AnomalyType,
  isSuppressed: boolean
): Promise<number> {
  const pool = getPool();
  const result = await pool.query<{ id: number }>(
    `INSERT INTO anomalies (sensor_id, reading_id, zone_id, type, is_suppressed)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [sensorId, readingId, zoneId, type, isSuppressed]
  );
  return result.rows[0]!.id;
}

/**
 * Insert an alert for a non-suppressed anomaly.
 */
export async function insertAlert(
  anomalyId: number,
  sensorId: string,
  zoneId: number,
  severity: AlertSeverity,
  assignedTo: number | null
): Promise<number> {
  const pool = getPool();
  const result = await pool.query<{ id: number }>(
    `INSERT INTO alerts (anomaly_id, sensor_id, zone_id, severity, assigned_to)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [anomalyId, sensorId, zoneId, severity, assignedTo]
  );
  return result.rows[0]!.id;
}

/**
 * Update sensor status and return old status (for SSE events).
 */
export async function updateSensorStatus(
  sensorId: string,
  newStatus: SensorStatus
): Promise<SensorStatus | null> {
  const pool = getPool();

  // Get current status first
  const current = await pool.query<{ status: SensorStatus }>(
    `SELECT status FROM sensors WHERE id = $1`,
    [sensorId]
  );
  if (current.rows.length === 0) return null;
  const oldStatus = current.rows[0]!.status;

  if (oldStatus === newStatus) return null; // no change

  await pool.query(
    `UPDATE sensors SET status = $1, updated_at = NOW() WHERE id = $2`,
    [newStatus, sensorId]
  );

  return oldStatus;
}

/**
 * Find the operator assigned to a sensor's zone (for alert assignment).
 */
export async function getZoneOperator(zoneId: number): Promise<number | null> {
  const pool = getPool();
  const result = await pool.query<{ user_id: number }>(
    `SELECT uz.user_id FROM user_zones uz
     JOIN users u ON u.id = uz.user_id
     WHERE uz.zone_id = $1 AND u.role = 'operator'
     LIMIT 1`,
    [zoneId]
  );
  return result.rows.length > 0 ? result.rows[0]!.user_id : null;
}
