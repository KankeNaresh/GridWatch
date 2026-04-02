# Anomalies, Alerts, Suppression — Concepts & UI Effects

Generated: 2026-03-30

This document explains the domain concepts used in GridWatch — what an *anomaly*, *alert*, and *suppression* are, how they relate, which background *workers* process data, and how those events appear in the UI.

---

## 1) Definitions

- **Anomaly** — A detected unexpected or notable change in sensor telemetry. Examples: voltage spike above a threshold, a rapid rate-of-change, or a sensor not reporting (absence). Anomalies are always recorded in the `anomalies` table for auditing and analysis.

- **Alert** — A record created from a non-suppressed anomaly that requires operator attention. Alerts have a lifecycle (`open` → `acknowledged` → `resolved`), a severity (e.g., `critical`, `warning`), and metadata such as `assigned_to` and `is_escalated`. Alerts live in the `alerts` table.

- **Suppression** — A time-windowed, per-sensor maintenance window that silences alert generation for that sensor. Suppressions are stored in the `suppression` table and are used at detection time to prevent creating new alerts; anomalies during suppression are flagged `is_suppressed = TRUE` but still recorded.

---

## 2) Where these live in the code / DB

- Controllers and API:
  - Ingest endpoint: [Backend/src/controllers/ingestController.ts](Backend/src/controllers/ingestController.ts)
  - Suppression endpoints: [Backend/src/controllers/suppressionController.ts](Backend/src/controllers/suppressionController.ts)
  - Alerts/Sensors/History controllers: [Backend/src/controllers/alertController.ts](Backend/src/controllers/alertController.ts), [Backend/src/controllers/sensorController.ts](Backend/src/controllers/sensorController.ts), [Backend/src/controllers/historyController.ts](Backend/src/controllers/historyController.ts)

- Background workers:
  - Anomaly worker: [Backend/src/workers/anomalyWorker.ts](Backend/src/workers/anomalyWorker.ts)
  - Absence worker: [Backend/src/workers/absenceWorker.ts](Backend/src/workers/absenceWorker.ts)
  - Escalation worker: [Backend/src/workers/escalationWorker.ts](Backend/src/workers/escalationWorker.ts)

- Important DA helpers:
  - Bulk readings ingest: [Backend/src/dataAccess/readingDA.ts](Backend/src/dataAccess/readingDA.ts)
  - Anomaly/alert inserts & sensor status update: [Backend/src/dataAccess/anomalyDA.ts](Backend/src/dataAccess/anomalyDA.ts)
  - Suppression helpers: [Backend/src/dataAccess/suppressionDA.ts](Backend/src/dataAccess/suppressionDA.ts)

- DB Tables (schema reference: [Backend/src/db/Gridwatch_Schema.sql](Backend/src/db/Gridwatch_Schema.sql)):
  - `readings` — high-volume telemetry rows (fields: `id`, `sensor_id`, `zone_id`, `timestamp`, `voltage`, `current`, `temperature`, `status_code`, `processed`)
  - `anomalies` — detected events (fields: `id`, `sensor_id`, `reading_id`, `zone_id`, `type`, `is_suppressed`, `created_at`)
  - `alerts` — actionable records (fields: `id`, `anomaly_id`, `sensor_id`, `zone_id`, `severity`, `status`, `assigned_to`, `is_suppressed`, `is_escalated`, `created_at`, `updated_at`)
  - `suppression` — suppression windows (fields: `id`, `sensor_id`, `zone_id`, `start_time`, `end_time`, `created_by`, `created_at`)
  - `sensors`, `sensor_rules` — metadata and per-sensor thresholds

---

## 3) How they relate (end-to-end flow)

1. Sensors send telemetry via `POST /api/ingest` → rows inserted to `readings` (unprocessed = TRUE). See [Backend/src/controllers/ingestController.ts](Backend/src/controllers/ingestController.ts) and [Backend/src/dataAccess/readingDA.ts](Backend/src/dataAccess/readingDA.ts).
2. The **Anomaly Worker** polls unprocessed `readings` (uses `FOR UPDATE SKIP LOCKED` to be concurrency-safe), loads sensor rules, and checks each reading for rule violations (thresholds, rate-of-change). See [Backend/src/workers/anomalyWorker.ts](Backend/src/workers/anomalyWorker.ts).
3. For each detected anomaly the worker:
   - Inserts an `anomalies` row (always recorded).
   - Checks suppression status for that sensor (via `getSuppressedSensorIds` / `isSensorSuppressed`). If the sensor is NOT suppressed, the worker creates an `alerts` row (and may set sensor status and broadcast SSE). If the sensor IS suppressed, the anomaly is still stored but marked `is_suppressed = TRUE` and no new alert is created.
4. The **Absence Worker** periodically (≈30s) looks for sensors that haven't reported in a configured window (e.g., >2 minutes), calls `isSensorSuppressed()` before creating absence alerts, and updates sensor status to `silent` where appropriate. See [Backend/src/workers/absenceWorker.ts](Backend/src/workers/absenceWorker.ts).
5. The **Escalation Worker** periodically finds long-open critical alerts (e.g., open > 5 minutes) and auto-assigns/escalates them to supervisors. The worker writes escalation logs and uses DB constraints/`ON CONFLICT` to avoid double-escalation (idempotent behavior). See [Backend/src/workers/escalationWorker.ts](Backend/src/workers/escalationWorker.ts).
6. When alerts are created or sensor status changes, the server broadcasts SSE events (`alert_created`, `sensor_state_change`) via the SSE manager. Frontend clients receive and react to these events. See [Backend/src/realtime/sseManager.ts](Backend/src/realtime/sseManager.ts).

---

## 4) UI effects — what changes the user sees

- **Dashboard (Live Sensor Grid)** ([Frontend/src/modules/dashboard/DashboardModule.tsx](Frontend/src/modules/dashboard/DashboardModule.tsx))
  - Shows counts by status and a grid of sensors. When the anomaly worker changes a sensor's status (e.g., `healthy` → `warning` → `critical`), the backend broadcasts `sensor_state_change` and the dashboard updates in real time via `useSSE()`.
  - Absence detections set a sensor to `silent` and appear on the dashboard similarly.

- **Alerts Page** ([Frontend/src/modules/alerts/AlertsModule.tsx](Frontend/src/modules/alerts/AlertsModule.tsx))
  - New alerts (created by the anomaly or absence worker) trigger an `alert_created` SSE event; the Alerts UI reloads or highlights the new alert.
  - Users can acknowledge or resolve alerts via `PATCH /api/alerts/:id` — changes persisted in `alerts` and optionally broadcast to connected clients.
  - Suppressed alerts are present in history but flagged (`is_suppressed = TRUE`) and are not auto-escalated while suppressed.

- **Sensor Detail** ([Frontend/src/modules/sensorDetail/SensorDetailModule.tsx](Frontend/src/modules/sensorDetail/SensorDetailModule.tsx))
  - Shows recent readings and active anomalies for the sensor. When the anomaly worker inserts an anomaly for that sensor, the new anomaly appears in this view (either by SSE-driven update or by user-refresh).
  - The page shows an **Active Suppression** panel when a suppression window exists. Creating a suppression from this page calls `POST /api/suppression`; if the suppression starts immediately, the controller also marks existing open alerts for that sensor as suppressed.

- **Suppression Management** ([Frontend/src/modules/suppression/SuppressionModule.tsx](Frontend/src/modules/suppression/SuppressionModule.tsx))
  - Lists active and expired suppressions; users can create new windows here. Creating a suppression prevents new alerts during the window and updates open alerts when applicable.

---

## 5) Important behavior notes & edge cases

- **Anomalies are always recorded.** Even if a sensor is suppressed, the anomaly row still exists (helpful for post-maintenance analysis).
- **Suppression prevents alert creation, not anomaly detection.** This keeps a complete detection audit trail while reducing noise.
- **Open alerts become suppressed if a suppression starting now is created.** The controller runs an `UPDATE alerts SET is_suppressed = TRUE WHERE sensor_id = $1 AND status = 'open'` when suppression starts immediately.
- **Workers use DB-level concurrency controls.** `FOR UPDATE SKIP LOCKED` and `UPDATE ... WHERE id = ANY(...)` mark readings processed so multiple worker processes/instances don't double-process the same readings.
- **Escalation is idempotent.** The escalation worker uses DB constraints / `ON CONFLICT` patterns to avoid duplicate escalations.

---

## 6) Quick examples

- Create a suppression (curl):

```bash
curl -X POST http://localhost:3000/api/suppression \
  -H "Content-Type: application/json" \
  -H "X-User-Id: 1" \
  -d '{"sensor_id":"SENSOR-0100","start_time":"2026-03-30T10:00:00Z","end_time":"2026-03-30T12:00:00Z"}'
```

- Ingest a small batch of readings (test):

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"readings":[{"sensor_id":"SENSOR-0001","timestamp":"2026-03-30T10:05:00Z","voltage":12.3}]}'
```

---

## 7) Where to look for the implementation

- Workers: [Backend/src/workers/](Backend/src/workers/)
- DA helpers: [Backend/src/dataAccess/](Backend/src/dataAccess/)
- Controllers & API: [Backend/src/controllers/](Backend/src/controllers/)
- Frontend pages: [Frontend/src/modules/](Frontend/src/modules/)

---

If you want, I can:
- highlight exact lines of the detection logic in `anomalyWorker.ts`,
- add small sequence diagrams to this doc, or
- create automated tests that simulate ingestion → anomaly → alert creation → SSE.
