// =========================================
// Domain Types — matches DB schema exactly
// =========================================

export interface Zone {
  id: number;
  name: string;
  created_at: Date;
}

export interface User {
  id: number;
  name: string;
  role: "operator" | "supervisor";
  created_at: Date;
}

export interface UserWithZones extends User {
  zone_ids: number[];
}

export interface Sensor {
  id: string;
  zone_id: number;
  status: SensorStatus;
  last_seen: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type SensorStatus = "healthy" | "warning" | "critical" | "silent";

export interface SensorRule {
  id: number;
  sensor_id: string;
  min_voltage: number | null;
  max_voltage: number | null;
  min_temperature: number | null;
  max_temperature: number | null;
  rate_change_threshold: number | null;
  severity: AlertSeverity;
}

export interface Reading {
  id: number;
  sensor_id: string;
  zone_id: number;
  timestamp: Date;
  voltage: number | null;
  current: number | null;
  temperature: number | null;
  status_code: number | null;
  processed: boolean;
  created_at: Date;
}

export interface IngestReading {
  sensor_id: string;
  timestamp: string;
  voltage: number | null;
  current: number | null;
  temperature: number | null;
  status_code: number | null;
}

export type AnomalyType = "threshold" | "rate_change" | "absence";

export interface Anomaly {
  id: number;
  sensor_id: string;
  reading_id: number | null;
  zone_id: number;
  type: AnomalyType;
  is_suppressed: boolean;
  created_at: Date;
}

export type AlertSeverity = "warning" | "critical";
export type AlertStatus = "open" | "acknowledged" | "resolved";

export interface Alert {
  id: number;
  anomaly_id: number;
  sensor_id: string;
  zone_id: number;
  severity: AlertSeverity;
  status: AlertStatus;
  is_suppressed: boolean;
  is_escalated: boolean;
  assigned_to: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface AlertLog {
  id: number;
  alert_id: number;
  from_status: string | null;
  to_status: string;
  changed_by: number;
  changed_at: Date;
}

export interface Suppression {
  id: number;
  sensor_id: string;
  zone_id: number;
  start_time: Date;
  end_time: Date;
  created_by: number;
  created_at: Date;
}

export interface EscalationLog {
  id: number;
  alert_id: number;
  escalated_to: number;
  created_at: Date;
}

// =========================================
// Request / Response DTOs
// =========================================

export interface IngestRequest {
  readings: IngestReading[];
}

export interface AlertTransitionRequest {
  status: AlertStatus;
}

export interface SuppressionRequest {
  sensor_id: string;
  start_time: string;
  end_time: string;
}

export interface HistoryQuery {
  from: string;
  to: string;
  page?: number;
  page_size?: number;
}

export interface HistoryRow {
  reading_id: number;
  sensor_id: string;
  timestamp: Date;
  voltage: number | null;
  current: number | null;
  temperature: number | null;
  status_code: number | null;
  anomalies: {
    anomaly_id: number;
    type: AnomalyType;
    alert_id: number | null;
    alert_status: AlertStatus | null;
  }[];
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  page_size: number;
  total: number;
}

// =========================================
// SSE Event Types
// =========================================

export interface SensorStateChangeEvent {
  event: "sensor_state_change";
  sensor_id: string;
  zone_id: number;
  old_status: SensorStatus;
  new_status: SensorStatus;
  timestamp: string;
}

export interface AlertCreatedEvent {
  event: "alert_created";
  alert_id: number;
  sensor_id: string;
  zone_id: number;
  severity: AlertSeverity;
  type: AnomalyType;
}

export type SSEEvent = SensorStateChangeEvent | AlertCreatedEvent;

// =========================================
// Express Request Extension
// =========================================

export interface AuthContext {
  user_id: number;
  role: "operator" | "supervisor";
  zone_ids: number[]; // empty for supervisor (means all)
}
