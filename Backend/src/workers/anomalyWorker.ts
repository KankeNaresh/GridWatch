import { getSuppressedSensorIds } from "../dataAccess/suppressionDA";
import { sseManager } from "../realtime/sseManager";
import { AnomalyType, SensorRule, SensorStatus } from "../types";

import {
  fetchUnprocessedReadings,
  markReadingsProcessed,
  getSensorRules,
  getRecentReadings,
  insertAnomaly,
  insertAlert,
  updateSensorStatus,
  getZoneOperator,
} from "../dataAccess/anomalyDA";

const BATCH_SIZE = 200;
const POLL_INTERVAL_MS = 2_000;

/**
 * Anomaly Detection Worker — Rules A & B
 *
 * Polls readings with processed=FALSE, evaluates threshold
 * and rate-of-change rules, creates anomalies and alerts,
 * then marks readings as processed.
 *
 * Pattern from Cynterview Worker: Poll → Process → Mark Done.
 * Uses FOR UPDATE SKIP LOCKED for safe concurrent processing.
 */
export function startAnomalyWorker(): NodeJS.Timeout {
  console.log("[AnomalyWorker] Started");

  const run = async () => {
    try {
      const readings = await fetchUnprocessedReadings(BATCH_SIZE);
      if (readings.length === 0) return;

      // Fetch rules and suppression status for this batch
      const sensorIds = [...new Set(readings.map((r) => r.sensor_id))];
      const [rulesMap, suppressedSet] = await Promise.all([
        getSensorRules(sensorIds),
        getSuppressedSensorIds(sensorIds),
      ]);

      const processedIds: number[] = [];

      for (const reading of readings) {
        const rule = rulesMap.get(reading.sensor_id);
        const isSuppressed = suppressedSet.has(reading.sensor_id);

        const anomalies = await detectAnomalies(reading, rule, isSuppressed);

        // Determine worst severity for sensor status update
        let worstSeverity: "warning" | "critical" | null = null;
        for (const a of anomalies) {
          if (a.severity === "critical") worstSeverity = "critical";
          else if (a.severity === "warning" && worstSeverity !== "critical")
            worstSeverity = "warning";
        }

        // Update sensor status based on anomalies
        if (worstSeverity) {
          const newStatus: SensorStatus = worstSeverity;
          const oldStatus = await updateSensorStatus(
            reading.sensor_id,
            newStatus
          );
          if (oldStatus !== null) {
            sseManager.broadcast(reading.zone_id, {
              event: "sensor_state_change",
              sensor_id: reading.sensor_id,
              zone_id: reading.zone_id,
              old_status: oldStatus,
              new_status: newStatus,
              timestamp: new Date().toISOString(),
            });
          }
        } else {
          // No anomalies — sensor is healthy
          const oldStatus = await updateSensorStatus(
            reading.sensor_id,
            "healthy"
          );
          if (oldStatus !== null) {
            sseManager.broadcast(reading.zone_id, {
              event: "sensor_state_change",
              sensor_id: reading.sensor_id,
              zone_id: reading.zone_id,
              old_status: oldStatus,
              new_status: "healthy",
              timestamp: new Date().toISOString(),
            });
          }
        }

        processedIds.push(reading.id);
      }

      await markReadingsProcessed(processedIds);

      if (readings.length > 0) {
        console.log(
          `[AnomalyWorker] Processed ${readings.length} readings`
        );
      }
    } catch (err) {
      console.error("[AnomalyWorker] Error:", err);
    }
  };

  const handle = setInterval(run, POLL_INTERVAL_MS);
  // First run immediately
  run();
  return handle;
}

/**
 * Evaluate Rule A (threshold) and Rule B (rate-of-change) for a single reading.
 * Returns list of created anomaly+alert info.
 */
async function detectAnomalies(
  reading: {
    id: number;
    sensor_id: string;
    zone_id: number;
    voltage: number | null;
    current: number | null;
    temperature: number | null;
    timestamp: Date;
  },
  rule: SensorRule | undefined,
  isSuppressed: boolean
): Promise<{ anomalyId: number; type: AnomalyType; severity: string }[]> {
  if (!rule) return [];

  const results: { anomalyId: number; type: AnomalyType; severity: string }[] =
    [];
  const severity = rule.severity;

  // --- Rule A: Threshold Breach ---
  const thresholdBreached =
    (reading.voltage !== null &&
      rule.min_voltage !== null &&
      reading.voltage < rule.min_voltage) ||
    (reading.voltage !== null &&
      rule.max_voltage !== null &&
      reading.voltage > rule.max_voltage) ||
    (reading.temperature !== null &&
      rule.min_temperature !== null &&
      reading.temperature < rule.min_temperature) ||
    (reading.temperature !== null &&
      rule.max_temperature !== null &&
      reading.temperature > rule.max_temperature);

  if (thresholdBreached) {
    const anomalyId = await insertAnomaly(
      reading.sensor_id,
      reading.id,
      reading.zone_id,
      "threshold",
      isSuppressed
    );

    if (!isSuppressed) {
      const operator = await getZoneOperator(reading.zone_id);
      const alertId = await insertAlert(
        anomalyId,
        reading.sensor_id,
        reading.zone_id,
        severity,
        operator
      );
      sseManager.broadcast(reading.zone_id, {
        event: "alert_created",
        alert_id: alertId,
        sensor_id: reading.sensor_id,
        zone_id: reading.zone_id,
        severity,
        type: "threshold",
      });
    }

    results.push({ anomalyId, type: "threshold", severity });
  }

  // --- Rule B: Rate-of-Change Spike ---
  if (rule.rate_change_threshold !== null) {
    const recentReadings = await getRecentReadings(
      reading.sensor_id,
      reading.id,
      3
    );

    if (recentReadings.length >= 1) {
      const rateBreached = checkRateOfChange(
        reading,
        recentReadings,
        rule.rate_change_threshold
      );

      if (rateBreached) {
        const anomalyId = await insertAnomaly(
          reading.sensor_id,
          reading.id,
          reading.zone_id,
          "rate_change",
          isSuppressed
        );

        if (!isSuppressed) {
          const operator = await getZoneOperator(reading.zone_id);
          const alertId = await insertAlert(
            anomalyId,
            reading.sensor_id,
            reading.zone_id,
            severity,
            operator
          );
          sseManager.broadcast(reading.zone_id, {
            event: "alert_created",
            alert_id: alertId,
            sensor_id: reading.sensor_id,
            zone_id: reading.zone_id,
            severity,
            type: "rate_change",
          });
        }

        results.push({ anomalyId, type: "rate_change", severity });
      }
    }
  }

  return results;
}

/**
 * Check if voltage or temperature changed by more than X%
 * compared to the average of previous readings.
 */
function checkRateOfChange(
  current: { voltage: number | null; temperature: number | null },
  previous: { voltage: number | null; temperature: number | null }[],
  thresholdPercent: number
): boolean {
  // Check voltage rate-of-change
  if (current.voltage !== null) {
    const prevVoltages = previous
      .map((r) => r.voltage)
      .filter((v): v is number => v !== null);
    if (prevVoltages.length > 0) {
      const avg = prevVoltages.reduce((a, b) => a + b, 0) / prevVoltages.length;
      if (avg !== 0) {
        const changePercent = Math.abs((current.voltage - avg) / avg) * 100;
        if (changePercent > thresholdPercent) return true;
      }
    }
  }

  // Check temperature rate-of-change
  if (current.temperature !== null) {
    const prevTemps = previous
      .map((r) => r.temperature)
      .filter((v): v is number => v !== null);
    if (prevTemps.length > 0) {
      const avg = prevTemps.reduce((a, b) => a + b, 0) / prevTemps.length;
      if (avg !== 0) {
        const changePercent =
          Math.abs((current.temperature - avg) / avg) * 100;
        if (changePercent > thresholdPercent) return true;
      }
    }
  }

  return false;
}
