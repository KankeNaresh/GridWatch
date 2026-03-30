import type {
  Alert,
  PaginatedResponse,
  Sensor,
  SensorDetail,
  HistoryRow,
  Suppression,
  AlertStatus,
} from './types'
import {
  API_BASE,
  SENSORS,
  SENSOR_DETAIL,
  SENSOR_HISTORY,
  ALERTS,
  ALERT_BY_ID,
  SUPPRESSION,
  INGEST,
} from './constants'

function headers(): HeadersInit {
  const userId = localStorage.getItem('gridwatch_user_id') || '1'
  return {
    'Content-Type': 'application/json',
    'X-User-Id': userId,
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + url, { headers: headers(), ...init })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message || `HTTP ${res.status}`)
  }
  return res.json()
}

// ─── Sensors ──────────────────────────────────────────
export async function fetchSensors(): Promise<Sensor[]> {
  const res = await request<{ data: Sensor[] }>(SENSORS)
  return res.data
}

export async function fetchSensorDetail(id: string): Promise<SensorDetail> {
  return request<SensorDetail>(SENSOR_DETAIL.replace(':id', encodeURIComponent(id)))
}

// ─── Alerts ───────────────────────────────────────────
export async function fetchAlerts(params?: {
  status?: AlertStatus
  sensor_id?: string
  page?: number
  page_size?: number
}): Promise<PaginatedResponse<Alert>> {
  const sp = new URLSearchParams()
  if (params?.status) sp.set('status', params.status)
  if (params?.sensor_id) sp.set('sensor_id', params.sensor_id)
  if (params?.page) sp.set('page', String(params.page))
  if (params?.page_size) sp.set('page_size', String(params.page_size))
  const qs = sp.toString()
  return request<PaginatedResponse<Alert>>(`${ALERTS}${qs ? '?' + qs : ''}`)
}

export async function transitionAlert(
  id: number,
  status: AlertStatus,
): Promise<Alert> {
  return request<Alert>(ALERT_BY_ID.replace(':id', String(id)), {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

// ─── History ──────────────────────────────────────────
export async function fetchHistory(
  sensorId: string,
  from?: string,
  to?: string,
  page = 1,
  pageSize = 100,
): Promise<PaginatedResponse<HistoryRow>> {
  const sp = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  if (from) sp.set('from', from)
  if (to) sp.set('to', to)
  return request<PaginatedResponse<HistoryRow>>(
    `${SENSOR_HISTORY.replace(':id', encodeURIComponent(sensorId))}?${sp}`,
  )
}

// ─── Suppression ──────────────────────────────────────
export async function fetchSuppressions(): Promise<Suppression[]> {
  const res = await request<{ data: Suppression[] }>(SUPPRESSION)
  return res.data
}

export async function createSuppression(body: {
  sensor_id: string
  start_time: string
  end_time: string
}): Promise<Suppression> {
  return request<Suppression>(SUPPRESSION, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// ─── Ingest (for testing) ─────────────────────────────
export async function ingestReadings(
  readings: {
    sensor_id: string
    timestamp: string
    voltage?: number
    temperature?: number
    current?: number
    status_code?: number
  }[],
): Promise<{ message: string; inserted: number; skipped: number }> {
  const res = await fetch(API_BASE + INGEST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ readings }),
  })
  return res.json()
}
