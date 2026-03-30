import { getPool } from "../config/db";
import { Alert, AlertStatus } from "../types";

/**
 * Fetch alerts with zone scoping + optional filters.
 */
export async function getAlerts(params: {
  zoneIds: number[] | null; // null = supervisor (all zones)
  status?: AlertStatus;
  sensorId?: string;
  page: number;
  pageSize: number;
}): Promise<{ alerts: Alert[]; total: number }> {
  const pool = getPool();

  const conditions: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  // Zone scoping
  if (params.zoneIds !== null) {
    conditions.push(`a.zone_id = ANY($${paramIdx}::int[])`);
    values.push(params.zoneIds);
    paramIdx++;
  }

  if (params.status) {
    conditions.push(`a.status = $${paramIdx}`);
    values.push(params.status);
    paramIdx++;
  }

  if (params.sensorId) {
    conditions.push(`a.sensor_id = $${paramIdx}`);
    values.push(params.sensorId);
    paramIdx++;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Count query
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM alerts a ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0]!.count, 10);

  // Data query with pagination
  const offset = (params.page - 1) * params.pageSize;
  const dataResult = await pool.query<Alert>(
    `SELECT a.* FROM alerts a ${whereClause}
     ORDER BY a.created_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...values, params.pageSize, offset]
  );

  return { alerts: dataResult.rows, total };
}

/**
 * Fetch a single alert by ID with zone check.
 */
export async function getAlertById(alertId: number): Promise<Alert | null> {
  const pool = getPool();
  const result = await pool.query<Alert>(
    `SELECT * FROM alerts WHERE id = $1`,
    [alertId]
  );
  return result.rows[0] || null;
}

/**
 * Update alert status. Returns updated alert.
 */
export async function updateAlertStatus(
  alertId: number,
  newStatus: AlertStatus
): Promise<Alert> {
  const pool = getPool();
  const result = await pool.query<Alert>(
    `UPDATE alerts SET status = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [alertId, newStatus]
  );
  return result.rows[0]!;
}

/**
 * Insert audit log entry for alert status transition.
 * Append-only — never updated or deleted.
 */
export async function insertAlertLog(
  alertId: number,
  fromStatus: string | null,
  toStatus: string,
  changedBy: number
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO alert_logs (alert_id, from_status, to_status, changed_by)
     VALUES ($1, $2, $3, $4)`,
    [alertId, fromStatus, toStatus, changedBy]
  );
}
