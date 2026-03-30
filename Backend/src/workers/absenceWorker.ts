import { getPool } from "../config/db";
import { getZoneOperator, insertAlert, insertAnomaly, updateSensorStatus } from "../dataAccess/anomalyDA";
import { isSensorSuppressed } from "../dataAccess/suppressionDA";
import { sseManager } from "../realtime/sseManager";

const POLL_INTERVAL_MS = 30_000; // Every 30 seconds
const ABSENCE_THRESHOLD_MINUTES = 2;

/**
 * Absence Detection Worker — Rule C
 *
 * Runs independently of ingestion. Every 30s, checks for sensors
 * whose last_seen is older than 2 minutes. These are flagged as
 * "silent" and an absence anomaly is created.
 *
 * Only creates one absence anomaly per silence period — once a
 * sensor is marked 'silent', it won't re-fire until it comes back
 * and goes silent again.
 */
export function startAbsenceWorker(): NodeJS.Timeout {
  console.log("[AbsenceWorker] Started");

  const run = async () => {
    try {
      const pool = getPool();

      // Find sensors that haven't reported in >2 minutes
      // and are NOT already marked as 'silent'
      const result = await pool.query<{
        id: string;
        zone_id: number;
        status: string;
      }>(
        `SELECT id, zone_id, status FROM sensors
         WHERE last_seen < NOW() - INTERVAL '${ABSENCE_THRESHOLD_MINUTES} minutes'
           AND last_seen IS NOT NULL
           AND status != 'silent'`
      );

      for (const sensor of result.rows) {
        const suppressed = await isSensorSuppressed(sensor.id);

        // Create absence anomaly
        const anomalyId = await insertAnomaly(
          sensor.id,
          null, // no reading triggered this
          sensor.zone_id,
          "absence",
          suppressed
        );

        // Create alert if not suppressed
        if (!suppressed) {
          const operator = await getZoneOperator(sensor.zone_id);
          const alertId = await insertAlert(
            anomalyId,
            sensor.id,
            sensor.zone_id,
            "critical", // absence is always critical
            operator
          );

          sseManager.broadcast(sensor.zone_id, {
            event: "alert_created",
            alert_id: alertId,
            sensor_id: sensor.id,
            zone_id: sensor.zone_id,
            severity: "critical",
            type: "absence",
          });
        }

        // Mark sensor as silent
        const oldStatus = await updateSensorStatus(sensor.id, "silent");
        if (oldStatus !== null) {
          sseManager.broadcast(sensor.zone_id, {
            event: "sensor_state_change",
            sensor_id: sensor.id,
            zone_id: sensor.zone_id,
            old_status: oldStatus as any,
            new_status: "silent",
            timestamp: new Date().toISOString(),
          });
        }
      }

      if (result.rows.length > 0) {
        console.log(
          `[AbsenceWorker] Detected ${result.rows.length} silent sensors`
        );
      }
    } catch (err) {
      console.error("[AbsenceWorker] Error:", err);
    }
  };

  const handle = setInterval(run, POLL_INTERVAL_MS);
  // First run after a short delay to let server start
  setTimeout(run, 5_000);
  return handle;
}
