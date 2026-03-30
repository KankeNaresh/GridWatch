// Domain types — mirrors backend exactly

export type SensorStatus = 'healthy' | 'warning' | 'critical' | 'silent'
export type AlertSeverity = 'warning' | 'critical'
export type AlertStatus = 'open' | 'acknowledged' | 'resolved'
export type AnomalyType = 'threshold' | 'rate_change' | 'absence'

export interface Sensor {
  id: string
  zone_id: number
  status: SensorStatus
  last_seen: string | null
  created_at: string
  updated_at: string
}

export interface Reading {
  id: number
  sensor_id: string
  zone_id: number
  timestamp: string
  voltage: number | null
  current: number | null
  temperature: number | null
  status_code: number | null
  processed: boolean
  created_at: string
}

export interface Anomaly {
  id: number
  sensor_id: string
  reading_id: number | null
  zone_id: number
  type: AnomalyType
  is_suppressed: boolean
  created_at: string
  // joined from sensorDA detail query
  alert_id?: number | null
  alert_status?: AlertStatus | null
  alert_severity?: AlertSeverity | null
}

export interface Alert {
  id: number
  anomaly_id: number
  sensor_id: string
  zone_id: number
  severity: AlertSeverity
  status: AlertStatus
  is_suppressed: boolean
  is_escalated: boolean
  assigned_to: number | null
  created_at: string
  updated_at: string
}

export interface Suppression {
  id: number
  sensor_id: string
  zone_id: number
  start_time: string
  end_time: string
  created_by: number
  created_at: string
}

export interface SensorDetail {
  sensor: Sensor
  recent_readings: Reading[]
  active_anomalies: Anomaly[]
  active_suppression: Suppression | null
}

export interface HistoryRow {
  reading_id: number
  sensor_id: string
  timestamp: string
  voltage: number | null
  current: number | null
  temperature: number | null
  status_code: number | null
  anomalies: {
    anomaly_id: number
    type: AnomalyType
    alert_id: number | null
    alert_status: AlertStatus | null
  }[]
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  page_size: number
}

// SSE event types
export interface SensorStateChangeEvent {
  sensorId: string
  oldStatus: SensorStatus
  newStatus: SensorStatus
  zoneId: number
}

export interface AlertCreatedEvent {
  alertId: number
  sensorId: string
  severity: AlertSeverity
  zoneId: number
}
