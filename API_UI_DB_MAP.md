# GridWatch — API ↔ UI ↔ DB Mapping

Generated: 2026-03-30

This document lists backend HTTP APIs, a short description, where each is used in the frontend UI, and the primary database table(s) and concepts involved.

**Notes**: backend routes are mounted under `/api` (see [Backend/src/routes/index.ts](Backend/src/routes/index.ts)). Frontend API helpers live in [Frontend/src/api.ts](Frontend/src/api.ts).

---

**POST /api/ingest**
- **Purpose:** Bulk ingest telemetry readings (up to 1000 per request). Durable write; anomaly detection runs asynchronously.
- **Request:** `{ readings: [ { sensor_id, timestamp, voltage?, temperature?, current?, status_code? }, ... ] }`
- **Response:** `{ message, inserted, skipped }`
- **Backend:** [Backend/src/controllers/ingestController.ts](Backend/src/controllers/ingestController.ts)
- **DataAccess:** [Backend/src/dataAccess/readingDA.ts](Backend/src/dataAccess/readingDA.ts)
- **DB tables:** `readings`, `sensors` (updates `sensors.last_seen`)
- **Frontend usage:** testing helper `ingestReadings()` in [Frontend/src/api.ts](Frontend/src/api.ts#L108-L118) (not used in core UI)
- **Concepts:** bulk insert via PostgreSQL `unnest()` arrays; denormalize `zone_id` onto readings for fast queries.

**GET /api/sensors**
- **Purpose:** Return sensors visible to the current user (zone-scoped for operators).
- **Backend:** [Backend/src/controllers/sensorController.ts](Backend/src/controllers/sensorController.ts)
- **DataAccess:** [Backend/src/dataAccess/sensorDA.ts](Backend/src/dataAccess/sensorDA.ts)
- **DB tables:** `sensors` (index `idx_sensors_zone`)
- **Frontend usage:** `fetchSensors()` → [Frontend/src/modules/dashboard/DashboardModule.tsx](Frontend/src/modules/dashboard/DashboardModule.tsx)
- **Concepts:** zone-based access control (operators see assigned zones; supervisors see all).

**GET /api/sensors/:id**
- **Purpose:** Sensor detail (sensor meta + recent readings + active anomalies + active suppression).
- **Backend:** [Backend/src/controllers/sensorController.ts](Backend/src/controllers/sensorController.ts)
- **DataAccess:** [Backend/src/dataAccess/sensorDA.ts](Backend/src/dataAccess/sensorDA.ts)
- **DB tables:** `sensors`, `readings`, `anomalies`, `alerts`, `suppression`
- **Frontend usage:** `fetchSensorDetail()` → [Frontend/src/modules/sensorDetail/SensorDetailModule.tsx](Frontend/src/modules/sensorDetail/SensorDetailModule.tsx)
- **Concepts:** returns `recent_readings`, `active_anomalies`, and `active_suppression` for UI.

**GET /api/sensors/:id/history**
- **Purpose:** Paginated sensor reading history with anomaly flags and linked alert info.
- **Backend:** [Backend/src/controllers/historyController.ts](Backend/src/controllers/historyController.ts)
- **DataAccess:** [Backend/src/dataAccess/historyDA.ts](Backend/src/dataAccess/historyDA.ts)
- **DB tables:** `readings`, `anomalies`, `alerts` (LEFT JOINs to enrich rows)
- **Frontend usage:** `fetchHistory()` → [Frontend/src/modules/sensorDetail/SensorDetailModule.tsx](Frontend/src/modules/sensorDetail/SensorDetailModule.tsx)
- **Concepts:** history queries use `idx_readings_sensor_time` and support `from/to` time window + pagination.

**GET /api/events**
- **Purpose:** Server-Sent Events (SSE) HTTP stream for real-time zone-scoped events (`sensor_state_change`, `alert_created`, heartbeat).
- **Backend:** [Backend/src/controllers/sensorController.ts](Backend/src/controllers/sensorController.ts) + SSE manager [Backend/src/realtime/sseManager.ts](Backend/src/realtime/sseManager.ts)
- **DB tables:** none directly; events are emitted by background workers/controllers when DB state changes
- **Frontend usage:** `useSSE()` hook → [Frontend/src/useSSE.ts](Frontend/src/useSSE.ts), subscribed by [Frontend/src/modules/dashboard/DashboardModule.tsx](Frontend/src/modules/dashboard/DashboardModule.tsx) (sensor updates) and [Frontend/src/modules/alerts/AlertsModule.tsx](Frontend/src/modules/alerts/AlertsModule.tsx) (reload on new alerts)
- **Concepts:** long-lived HTTP stream, heartbeat every 30s, zone filtering performed server-side.

**GET /api/alerts**
- **Purpose:** List alerts (zone-scoped), filterable by `status` and `sensor_id`, paginated.
- **Backend:** [Backend/src/controllers/alertController.ts](Backend/src/controllers/alertController.ts)
- **DataAccess:** [Backend/src/dataAccess/alertDA.ts](Backend/src/dataAccess/alertDA.ts)
- **DB tables:** `alerts` (indexes: `idx_alerts_zone_status`, `idx_alerts_sensor`), `alert_logs` (audit trail)
- **Frontend usage:** `fetchAlerts()` → [Frontend/src/modules/alerts/AlertsModule.tsx](Frontend/src/modules/alerts/AlertsModule.tsx)
- **Concepts:** operators see alerts in their zones; UI supports acknowledge/resolve transitions.

**PATCH /api/alerts/:id**
- **Purpose:** Transition alert status (open → acknowledged → resolved).
- **Backend:** [Backend/src/controllers/alertController.ts](Backend/src/controllers/alertController.ts) → [Backend/src/services/alertService.ts](Backend/src/services/alertService.ts)
- **DataAccess:** [Backend/src/dataAccess/alertDA.ts](Backend/src/dataAccess/alertDA.ts)
- **DB tables:** `alerts`, `alert_logs`
- **Frontend usage:** `transitionAlert()` → [Frontend/src/modules/alerts/AlertsModule.tsx](Frontend/src/modules/alerts/AlertsModule.tsx)
- **Concepts:** status transitions validated in service layer; updates recorded and SSE may notify UI.

**GET /api/suppression**
- **Purpose:** List active suppression windows (zone-scoped).
- **Backend:** [Backend/src/controllers/suppressionController.ts](Backend/src/controllers/suppressionController.ts)
- **DB tables:** `suppression` (index `idx_suppression_active`)
- **Frontend usage:** `fetchSuppressions()` → [Frontend/src/modules/suppression/SuppressionModule.tsx](Frontend/src/modules/suppression/SuppressionModule.tsx)
- **Concepts:** used to show active/expired windows in UI; operators limited to their zones.

**POST /api/suppression**
- **Purpose:** Create a suppression window for a sensor. New anomalies are still recorded but marked `is_suppressed = TRUE` and do not create alerts while the window is active.
- **Backend:** [Backend/src/controllers/suppressionController.ts](Backend/src/controllers/suppressionController.ts)
- **DB behavior:** Insert into `suppression`; if `start_time <= now()` then `UPDATE alerts SET is_suppressed = TRUE` for open alerts on that sensor (atomic in controller).
- **DB tables:** `suppression`, `alerts`
- **Frontend usage:** `createSuppression()` → [Frontend/src/modules/suppression/SuppressionModule.tsx](Frontend/src/modules/suppression/SuppressionModule.tsx) and quick-suppress in [Frontend/src/modules/sensorDetail/SensorDetailModule.tsx](Frontend/src/modules/sensorDetail/SensorDetailModule.tsx)
- **Concepts:** prevents alerts/escalations during maintenance windows; anomaly worker queries suppression (`getSuppressedSensorIds`) when processing readings.

---

**Background workers & DA (where relevant)**
- **Anomaly Worker**: [Backend/src/workers/anomalyWorker.ts](Backend/src/workers/anomalyWorker.ts) — polls `readings WHERE processed = FALSE` using `FOR UPDATE SKIP LOCKED`, applies `sensor_rules`, inserts into `anomalies` and `alerts`, updates sensor status. Uses [Backend/src/dataAccess/anomalyDA.ts](Backend/src/dataAccess/anomalyDA.ts) and suppression helpers [Backend/src/dataAccess/suppressionDA.ts](Backend/src/dataAccess/suppressionDA.ts).
- **Absence Worker**: [Backend/src/workers/absenceWorker.ts](Backend/src/workers/absenceWorker.ts) — detects sensors with no recent `readings` and inserts absence alerts unless suppressed.
- **Escalation Worker**: [Backend/src/workers/escalationWorker.ts](Backend/src/workers/escalationWorker.ts) — finds long-open critical alerts and auto-assigns/escalates (idempotent via `ON CONFLICT` / UNIQUE patterns).

**Auth & zone-scoping**
- Auth middleware: [Backend/src/middleware/authMiddleware.ts](Backend/src/middleware/authMiddleware.ts) — development JWT stub reads `X-User-Id`. Frontend sets `X-User-Id` in `headers()` (`Frontend/src/api.ts`) and `useSSE()` passes it on `/api/events` fetch.

**DB schema reference**
- Full schema: [Backend/src/db/Gridwatch_Schema.sql](Backend/src/db/Gridwatch_Schema.sql)
- Key tables: `sensors`, `readings`, `sensor_rules`, `anomalies`, `alerts`, `alert_logs`, `suppression`.

---

If you want, I can: (a) generate a compact CSV from this mapping, (b) link exact lines for each controller/DA function, or (c) open a PR that adds this doc to the repo README. Which would you like next?
