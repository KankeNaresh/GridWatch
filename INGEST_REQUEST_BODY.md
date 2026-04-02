# Ingest Request Body — Readings → Warning / Critical Mapping

Generated: 2026-03-30

This document describes the POST /api/ingest request body (the `readings` array), the fields that map to detection rules, how `warning` vs `critical` severities are assigned, and sample payloads.

Endpoint
- POST /api/ingest
- Controller: [Backend/src/controllers/ingestController.ts](Backend/src/controllers/ingestController.ts)
- Max batch: up to 1000 readings per request (service enforces limits). Response: `{ message, inserted, skipped }`.

Request body schema

```json
{
  "readings": [
    {
      "sensor_id": "SENSOR-0001",     // string, required
      "timestamp": "2026-03-30T10:05:00Z", // ISO-8601 string, required
      "voltage": 12.3,                  // number | null
      "current": 0.45,                  // number | null
      "temperature": 22.5,              // number | null
      "status_code": 0                  // optional numeric status code
    }
    // ... up to 1000 items
  ]
}
```

Notes
- `sensor_id` must match an existing sensor registered in `sensors` table; unknown sensors are skipped.
- `timestamp` should be precise (UTC preferred) — it is used for history and rate-of-change calculations.
- Numeric fields may be `null` if the sensor doesn't report them.

How readings convert to anomalies and alerts (overview)

1. Ingest writes rows into `readings` (column `processed = FALSE`) — see [Backend/src/dataAccess/readingDA.ts](Backend/src/dataAccess/readingDA.ts).
2. The **Anomaly Worker** (`anomalyWorker.ts`) batches unprocessed readings and fetches per-sensor `sensor_rules` via `getSensorRules(sensorIds)`. Important rule fields:
   - `min_voltage`, `max_voltage`
   - `min_temperature`, `max_temperature`
   - `rate_change_threshold` (percentage threshold used for rate-of-change rule)
   - `severity` (default severity for alerts created from this sensor's rule — usually `warning` or `critical`)
3. Rule A (Threshold): if any reported numeric value breaches min/max thresholds (voltage or temperature), the worker records an `anomalies` row with `type = 'threshold'`. If the sensor is not currently suppressed, the worker calls `insertAlert(...)` with the rule `severity` and broadcasts `alert_created` via SSE.
4. Rule B (Rate-of-Change): if the current reading deviates by more than `rate_change_threshold` percent vs the average of recent readings, the worker records an `anomalies` row with `type = 'rate_change'`. If not suppressed, it also creates an alert using the same `severity`.
5. The worker computes the worst severity among anomalies for a reading to update the sensor's `status` (e.g., `warning` or `critical`), broadcasts `sensor_state_change` via SSE, and marks readings processed.

Severity mapping (how `warning` vs `critical` is determined)

- Per-sensor default `severity`: each sensor's `sensor_rules.severity` supplies the severity to use when an anomaly from that sensor triggers an alert (common values: `warning`, `critical`). The worker uses this value when calling `insertAlert(...)`.
- Example strategies (how rules are commonly set):
  - Set `severity = 'warning'` for small threshold breaches or low-priority sensors.
  - Set `severity = 'critical'` for high-impact sensors or large threshold breaches.
- The worker itself does not dynamically map numeric magnitude to different severities apart from the `severity` field on the rule. If you want magnitude-based severity (e.g., minor breach = warning, >2x breach = critical), adjust detection logic in `anomalyWorker.ts` or set multiple rules per sensor.

Suppression interaction

- If a sensor has an active suppression window (`suppression` table), the worker will still record anomalies but mark them `is_suppressed = TRUE` and will not create `alerts` (nor broadcast `alert_created`) while the window is active. This prevents noisy alerts during maintenance but preserves the anomaly audit trail.

Examples

- Simple threshold breach → alert (severity set on sensor rule)

Request:

```json
{
  "readings": [
    {"sensor_id":"SENSOR-001","timestamp":"2026-03-30T10:05:00Z","voltage":18.5}
  ]
}
```

Assume `SENSOR-001` has `sensor_rules.max_voltage = 15.0` and `sensor_rules.severity = "critical"`.
- Result: anomaly recorded with `type='threshold'` and `is_suppressed=false` (if no suppression). Alert created with `severity='critical'`.

- Rate-of-change breach → alert

Request (spike):

```json
{
  "readings": [
    {"sensor_id":"SENSOR-002","timestamp":"2026-03-30T10:05:00Z","voltage":24.0}
  ]
}
```

Assume average of previous readings for `SENSOR-002` was 10.0 and `rate_change_threshold = 100` (percent).
- The percentage change is 140% (>100%) → rate_change anomaly recorded. If `sensor_rules.severity = 'warning'`, an alert is created with severity `warning`.

Response (on success):

```json
{
  "message": "Readings ingested",
  "inserted": 1,
  "skipped": 0
}
```

Implementation notes (for developers)

- The worker uses `FOR UPDATE SKIP LOCKED` when fetching unprocessed readings so multiple workers can run concurrently without duplicate processing.
- After processing, readings are marked `processed = TRUE` by `markReadingsProcessed(ids)`.
- Alerts are inserted by `insertAlert(anomalyId, sensorId, zoneId, severity, operator)` — check [Backend/src/dataAccess/anomalyDA.ts](Backend/src/dataAccess/anomalyDA.ts) for details.

If you want, I can:
- add JSON Schema (OpenAPI) for the request body and add it to Swagger, or
- implement magnitude-based severity classification (minor/major/critical) by modifying `detectAnomalies()` to examine breach magnitude.
