-- =========================================
-- GRIDWATCH SEED DATA
-- 3 zones, 1000 sensors, 2 operators, 1 supervisor
-- 48 hours of sample readings
-- =========================================

-- Zones
INSERT INTO zones (name) VALUES
  ('Zone North'),
  ('Zone South'),
  ('Zone East');

-- Users: 2 operators (one per zone), 1 supervisor
INSERT INTO users (name, role) VALUES
  ('Alice Operator', 'operator'),     -- id = 1
  ('Bob Operator', 'operator'),       -- id = 2
  ('Carol Supervisor', 'supervisor'); -- id = 3

-- Zone assignments
INSERT INTO user_zones (user_id, zone_id) VALUES
  (1, 1),  -- Alice → Zone North
  (2, 2);  -- Bob → Zone South
-- Carol is supervisor — no zone assignment needed (unrestricted)

-- =========================================
-- 1000 SENSORS across 3 zones
-- ~334 per zone (North: 1-334, South: 335-667, East: 668-1000)
-- =========================================
INSERT INTO sensors (id, zone_id, status, last_seen)
SELECT
  'sensor-' || LPAD(g::text, 4, '0'),
  CASE
    WHEN g <= 334 THEN 1  -- Zone North
    WHEN g <= 667 THEN 2  -- Zone South
    ELSE 3                -- Zone East
  END,
  'healthy',
  NOW() - INTERVAL '10 seconds'
FROM generate_series(1, 1000) AS g;

-- =========================================
-- SENSOR RULES (one per sensor)
-- Normal voltage range: 220-240V
-- Normal temperature range: 20-80°C
-- Rate-of-change threshold: 15%
-- Mix of warning and critical severity
-- =========================================
INSERT INTO sensor_rules (sensor_id, min_voltage, max_voltage, min_temperature, max_temperature, rate_change_threshold, severity)
SELECT
  'sensor-' || LPAD(g::text, 4, '0'),
  218 + (random() * 4),    -- min_voltage: 218-222
  238 + (random() * 4),    -- max_voltage: 238-242
  18 + (random() * 4),     -- min_temperature: 18-22
  78 + (random() * 4),     -- max_temperature: 78-82
  12 + (random() * 6),     -- rate_change_threshold: 12-18%
  CASE WHEN random() < 0.3 THEN 'critical' ELSE 'warning' END
FROM generate_series(1, 1000) AS g;

-- =========================================
-- 48 HOURS OF READINGS
-- One reading per sensor every 10 minutes for 48 hours
-- = 288 readings per sensor × 1000 sensors = 288,000 readings
-- (Using 10-min interval instead of 10s to keep seed reasonable)
--
-- Most readings are normal; ~5% have voltage spikes;
-- ~3% have temperature spikes.
-- =========================================
INSERT INTO readings (sensor_id, zone_id, timestamp, voltage, current, temperature, status_code, processed)
SELECT
  s.id,
  s.zone_id,
  ts,
  -- Voltage: mostly 228-232, with 5% spikes to 245-260
  CASE
    WHEN random() < 0.05 THEN 245 + (random() * 15)
    ELSE 228 + (random() * 4)
  END,
  -- Current: 10-15A
  10 + (random() * 5),
  -- Temperature: mostly 40-60, with 3% spikes to 85-100
  CASE
    WHEN random() < 0.03 THEN 85 + (random() * 15)
    ELSE 40 + (random() * 20)
  END,
  -- Status code: 0 = normal
  0,
  TRUE  -- Mark as processed (historical seed data)
FROM sensors s
CROSS JOIN generate_series(
  NOW() - INTERVAL '48 hours',
  NOW() - INTERVAL '10 minutes',
  INTERVAL '10 minutes'
) AS ts;

-- =========================================
-- A few recent UNPROCESSED readings to test the anomaly worker
-- =========================================
INSERT INTO readings (sensor_id, zone_id, timestamp, voltage, current, temperature, status_code, processed)
VALUES
  -- Voltage spike on sensor-0001 (Zone North)
  ('sensor-0001', 1, NOW() - INTERVAL '30 seconds', 255.0, 12.0, 50.0, 0, FALSE),
  -- Temperature spike on sensor-0335 (Zone South)
  ('sensor-0335', 2, NOW() - INTERVAL '20 seconds', 230.0, 13.0, 95.0, 0, FALSE),
  -- Normal reading on sensor-0668 (Zone East)
  ('sensor-0668', 3, NOW() - INTERVAL '10 seconds', 230.0, 11.0, 45.0, 0, FALSE);

-- =========================================
-- Sample suppression (sensor-0100 is under maintenance)
-- =========================================
INSERT INTO suppression (sensor_id, zone_id, start_time, end_time, created_by)
VALUES
  ('sensor-0100', 1, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '2 hours', 1);

SELECT 'Seed data inserted successfully' AS status;
SELECT COUNT(*) AS total_readings FROM readings;
SELECT COUNT(*) AS total_sensors FROM sensors;
