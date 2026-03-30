import StatusDot from "../../components/StatusDot";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchSensors } from "../../api";
import type { Sensor, SensorStatus } from "../../types";
import { useSSE } from "../../useSSE";
import { statusTextColor, timeAgo } from "../../utils";

const STATUS_ORDER: Record<SensorStatus, number> = {
  critical: 0,
  warning: 1,
  silent: 2,
  healthy: 3,
}

export default function DashboardModule() {
  const [sensors, setSensors] = useState<Sensor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<SensorStatus | 'all'>('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await fetchSensors()
      setSensors(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load sensors')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Real-time SSE updates — no polling
  useSSE({
    onSensorStateChange(e) {
      setSensors((prev) =>
        prev.map((s) =>
          s.id === e.sensorId ? { ...s, status: e.newStatus } : s,
        ),
      )
    },
  })

  const filtered = sensors
    .filter((s) => filter === 'all' || s.status === filter)
    .filter((s) => !search || s.id.includes(search))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])

  // Status summary counts
  const counts = sensors.reduce(
    (acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  if (error) {
    return <div className="text-red-400 text-center py-8">{error}</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Live Sensor Dashboard</h1>
        <span className="text-sm text-gray-400">{sensors.length} sensors</span>
      </div>

      {/* Status summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {(['healthy', 'warning', 'critical', 'silent'] as SensorStatus[]).map((st) => (
          <button
            key={st}
            onClick={() => setFilter(filter === st ? 'all' : st)}
            className={`rounded-lg p-3 text-left border transition-colors ${
              filter === st
                ? 'border-blue-500 bg-gray-800'
                : 'border-gray-800 bg-gray-900 hover:border-gray-700'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <StatusDot status={st} />
              <span className="text-xs uppercase tracking-wider text-gray-400">{st}</span>
            </div>
            <span className="text-2xl font-bold">{counts[st] || 0}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search sensor ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-64 bg-gray-900 border border-gray-800 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      {/* Sensor grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filtered.slice(0, 200).map((sensor) => (
          <Link
            key={sensor.id}
            to={`/sensors/${sensor.id}`}
            className="block rounded-lg border border-gray-800 bg-gray-900 p-4 hover:border-gray-600 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-sm">{sensor.id}</span>
              <StatusDot status={sensor.status} />
            </div>
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span className={`font-medium ${statusTextColor(sensor.status)}`}>
                {sensor.status}
              </span>
              <span>Zone {sensor.zone_id}</span>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Last seen: {timeAgo(sensor.last_seen)}
            </div>
          </Link>
        ))}
      </div>

      {filtered.length > 200 && (
        <p className="text-center text-gray-500 text-sm mt-4">
          Showing 200 of {filtered.length} sensors. Use search to narrow down.
        </p>
      )}
    </div>
  )
}
