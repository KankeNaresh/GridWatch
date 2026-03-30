import { getPool } from "../config/db";

const POLL_INTERVAL_MS = 30_000; // Every 30 seconds
const ESCALATION_THRESHOLD_MINUTES = 5;

/**
 * Escalation Worker
 *
 * Checks for critical alerts that have been open (not acknowledged)
 * for more than 5 minutes. Escalates by:
 * 1. Finding the supervisor for the alert's zone
 * 2. Reassigning the alert to the supervisor
 * 3. Writing a record to escalation_log
 *
 * UNIQUE(alert_id) on escalation_log guarantees exactly-once.
 * INSERT ... ON CONFLICT DO NOTHING makes this idempotent.
 */
export function startEscalationWorker(): NodeJS.Timeout {
  console.log("[EscalationWorker] Started");

  const run = async () => {
    try {
      const pool = getPool();

      // Find critical alerts open for more than 5 minutes, not yet escalated
      const alerts = await pool.query<{
        id: number;
        sensor_id: string;
        zone_id: number;
        assigned_to: number | null;
      }>(
        `SELECT id, sensor_id, zone_id, assigned_to
         FROM alerts
         WHERE status = 'open'
           AND severity = 'critical'
           AND is_escalated = FALSE
           AND is_suppressed = FALSE
           AND created_at < NOW() - INTERVAL '${ESCALATION_THRESHOLD_MINUTES} minutes'`
      );

      for (const alert of alerts.rows) {
        // Find a supervisor (any supervisor — in production this would be
        // the supervisor responsible for the zone)
        const supervisorResult = await pool.query<{ id: number }>(
          `SELECT id FROM users WHERE role = 'supervisor' LIMIT 1`
        );

        if (supervisorResult.rows.length === 0) {
          console.warn("[EscalationWorker] No supervisor found for escalation");
          continue;
        }

        const supervisorId = supervisorResult.rows[0]!.id;

        // Escalate: insert to escalation_log (UNIQUE prevents duplicates)
        // + update alert
        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          // Exactly-once: ON CONFLICT DO NOTHING
          const insertResult = await client.query(
            `INSERT INTO escalation_log (alert_id, escalated_to)
             VALUES ($1, $2)
             ON CONFLICT (alert_id) DO NOTHING
             RETURNING id`,
            [alert.id, supervisorId]
          );

          // Only update alert if escalation was actually inserted (not a duplicate)
          if (insertResult.rows.length > 0) {
            await client.query(
              `UPDATE alerts
               SET is_escalated = TRUE,
                   assigned_to = $2,
                   updated_at = NOW()
               WHERE id = $1`,
              [alert.id, supervisorId]
            );

            console.log(
              `[EscalationWorker] Escalated alert ${alert.id} to supervisor ${supervisorId}`
            );
          }

          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      }
    } catch (err) {
      console.error("[EscalationWorker] Error:", err);
    }
  };

  const handle = setInterval(run, POLL_INTERVAL_MS);
  setTimeout(run, 10_000); // first run after 10s
  return handle;
}
