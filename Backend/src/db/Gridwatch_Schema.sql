-- =========================================
-- GRIDWATCH DATABASE SCHEMA
-- Production-grade: PostgreSQL
-- =========================================

-- Drop tables (for clean setup — ordered by dependency)
DROP TABLE IF EXISTS escalation_log CASCADE;
DROP TABLE IF EXISTS suppression CASCADE;
DROP TABLE IF EXISTS alert_logs CASCADE;
DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS anomalies CASCADE;
DROP TABLE IF EXISTS readings CASCADE;
DROP TABLE IF EXISTS sensor_rules CASCADE;
DROP TABLE IF EXISTS sensors CASCADE;
DROP TABLE IF EXISTS user_zones CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS zones CASCADE;

-- =========================================
-- ZONES
-- Geographic regions grouping sensors.
-- Operators are scoped to zones — this is the
-- root of the access control model.
-- =========================================
CREATE TABLE zones (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================
-- USERS
-- Operators see only their assigned zones.
-- Supervisors have unrestricted cross-zone access.
-- =========================================
CREATE TABLE users (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL,
  role  TEXT NOT NULL CHECK (role IN ('operator', 'supervisor')),

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================
-- USER ↔ ZONE MAPPING
-- Many-to-many. Operators may cover multiple zones.
-- Supervisors don't need entries here (they bypass).
-- =========================================
CREATE TABLE user_zones (
  user_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  zone_id  INT NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, zone_id)
);

-- =========================================
-- SENSORS
-- Each sensor belongs to exactly one zone.
-- status: healthy | warning | critical | silent
-- last_seen: updated on every ingested reading
-- =========================================
CREATE TABLE sensors (
  id       TEXT PRIMARY KEY,
  zone_id  INT NOT NULL REFERENCES zones(id),

  status     TEXT NOT NULL DEFAULT 'healthy'
               CHECK (status IN ('healthy', 'warning', 'critical', 'silent')),
  last_seen  TIMESTAMPTZ,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================
-- SENSOR RULES
-- Per-sensor thresholds for anomaly detection.
-- One rule row per sensor. Operators can configure
-- via API. severity determines alert level when breached.
-- =========================================
CREATE TABLE sensor_rules (
  id         SERIAL PRIMARY KEY,
  sensor_id  TEXT NOT NULL UNIQUE REFERENCES sensors(id) ON DELETE CASCADE,

  min_voltage      DOUBLE PRECISION,
  max_voltage      DOUBLE PRECISION,

  min_temperature  DOUBLE PRECISION,
  max_temperature  DOUBLE PRECISION,

  -- Rule B: rate-of-change threshold (percentage)
  rate_change_threshold  DOUBLE PRECISION,

  severity  TEXT NOT NULL DEFAULT 'warning'
              CHECK (severity IN ('warning', 'critical'))
);

-- =========================================
-- READINGS (HIGH VOLUME)
-- 10,000 readings/min target. Bulk-inserted via
-- unnest() arrays. `processed` flag drives the
-- async anomaly detection pipeline.
--
-- zone_id is denormalized from sensors to avoid
-- JOINs on every zone-scoped history query.
-- =========================================
CREATE TABLE readings (
  id         BIGSERIAL PRIMARY KEY,
  sensor_id  TEXT NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
  zone_id    INT NOT NULL REFERENCES zones(id),

  timestamp     TIMESTAMPTZ NOT NULL,
  voltage       DOUBLE PRECISION,
  current       DOUBLE PRECISION,
  temperature   DOUBLE PRECISION,
  status_code   INT,

  processed     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================
-- ANOMALIES
-- One anomaly per rule violation per reading.
-- A single reading can trigger multiple anomalies
-- (e.g., threshold + rate_change on same reading).
--
-- For Rule C (absence), reading_id is NULL (no
-- reading triggered it — the absence of one did).
--
-- is_suppressed: TRUE if sensor was under active
-- suppression at detection time. Suppressed anomalies
-- are recorded but don't produce alerts.
-- =========================================
CREATE TABLE anomalies (
  id          BIGSERIAL PRIMARY KEY,
  sensor_id   TEXT NOT NULL REFERENCES sensors(id),
  reading_id  BIGINT REFERENCES readings(id),
  zone_id     INT NOT NULL REFERENCES zones(id),

  type  TEXT NOT NULL CHECK (type IN ('threshold', 'rate_change', 'absence')),

  is_suppressed  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================
-- ALERTS
-- Created from non-suppressed anomalies.
-- Lifecycle: open → acknowledged → resolved
-- (open → resolved also allowed)
--
-- zone_id denormalized for fast zone-scoped queries.
-- is_escalated: set TRUE when auto-escalation fires.
-- =========================================
CREATE TABLE alerts (
  id          BIGSERIAL PRIMARY KEY,
  anomaly_id  BIGINT NOT NULL REFERENCES anomalies(id),
  sensor_id   TEXT NOT NULL REFERENCES sensors(id),
  zone_id     INT NOT NULL REFERENCES zones(id),

  severity  TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
  status    TEXT NOT NULL DEFAULT 'open'
              CHECK (status IN ('open', 'acknowledged', 'resolved')),

  is_suppressed  BOOLEAN NOT NULL DEFAULT FALSE,
  is_escalated   BOOLEAN NOT NULL DEFAULT FALSE,

  assigned_to  INT REFERENCES users(id),

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================
-- ALERT LOGS (APPEND-ONLY AUDIT TRAIL)
-- Every status transition is recorded.
-- No UPDATE or DELETE ever happens on this table.
-- =========================================
CREATE TABLE alert_logs (
  id         BIGSERIAL PRIMARY KEY,
  alert_id   BIGINT NOT NULL REFERENCES alerts(id),

  from_status  TEXT,
  to_status    TEXT NOT NULL,

  changed_by   INT NOT NULL REFERENCES users(id),
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================
-- SUPPRESSION
-- Time-windowed alert suppression per sensor.
-- During [start_time, end_time], anomalies are
-- still detected but marked is_suppressed = TRUE
-- and don't produce alerts or escalations.
--
-- created_by tracks which operator set it.
-- =========================================
CREATE TABLE suppression (
  id         SERIAL PRIMARY KEY,
  sensor_id  TEXT NOT NULL REFERENCES sensors(id),
  zone_id    INT NOT NULL REFERENCES zones(id),

  start_time  TIMESTAMPTZ NOT NULL,
  end_time    TIMESTAMPTZ NOT NULL,

  created_by  INT NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_suppression_window CHECK (end_time > start_time)
);

-- =========================================
-- ESCALATION LOG
-- Records exactly one escalation per alert.
-- UNIQUE on alert_id guarantees exactly-once.
-- INSERT ... ON CONFLICT DO NOTHING makes it
-- idempotent — safe for retry.
-- =========================================
CREATE TABLE escalation_log (
  id             SERIAL PRIMARY KEY,
  alert_id       BIGINT NOT NULL UNIQUE REFERENCES alerts(id),
  escalated_to   INT NOT NULL REFERENCES users(id),

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =========================================
-- INDEXES
-- =========================================

-- Readings: primary query path is sensor + time range (history endpoint)
CREATE INDEX idx_readings_sensor_time
  ON readings (sensor_id, timestamp DESC);

-- Readings: anomaly worker polls unprocessed readings
CREATE INDEX idx_readings_unprocessed
  ON readings (id)
  WHERE processed = FALSE;

-- Readings: zone-scoped history queries
CREATE INDEX idx_readings_zone_time
  ON readings (zone_id, timestamp DESC);

-- Alerts: operators query open alerts in their zones
CREATE INDEX idx_alerts_zone_status
  ON alerts (zone_id, status)
  WHERE status != 'resolved';

-- Alerts: escalation worker finds old open critical alerts
CREATE INDEX idx_alerts_escalation_candidates
  ON alerts (created_at)
  WHERE status = 'open' AND severity = 'critical' AND is_escalated = FALSE;

-- Alerts: by sensor (sensor detail view)
CREATE INDEX idx_alerts_sensor
  ON alerts (sensor_id);

-- Anomalies: by sensor (sensor detail view)
CREATE INDEX idx_anomalies_sensor
  ON anomalies (sensor_id, created_at DESC);

-- Anomalies: by reading (history endpoint — flag anomalies per reading)
CREATE INDEX idx_anomalies_reading
  ON anomalies (reading_id)
  WHERE reading_id IS NOT NULL;

-- Sensors: zone lookup (dashboard query)
CREATE INDEX idx_sensors_zone
  ON sensors (zone_id);

-- Suppression: check if sensor is currently suppressed
CREATE INDEX idx_suppression_active
  ON suppression (sensor_id, start_time, end_time);