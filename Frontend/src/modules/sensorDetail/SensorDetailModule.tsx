import StatusDot from "../../components/StatusDot";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { createSuppression, fetchHistory, fetchSensorDetail } from "../../api";
import type { HistoryRow, SensorDetail } from "../../types";
import { formatTime, severityBadge, statusTextColor, timeAgo } from "../../utils";

export default function SensorDetailModule() {
  const { sensorId } = useParams<{ sensorId: string }>()
  const [detail, setDetail] = useState<SensorDetail | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyPage, setHistoryPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [suppressing, setSuppressing] = useState(false)
  const [suppressMin, setSuppressMin] = useState(30)

  const loadDetail = useCallback(async () => {
    if (!sensorId) return
    try {
      const d = await fetchSensorDetail(sensorId)
      setDetail(d)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load sensor')
    } finally {
      setLoading(false)
    }
  }, [sensorId])

  const loadHistory = useCallback(async () => {
    if (!sensorId) return
    try {
      const res = await fetchHistory(sensorId, undefined, undefined, historyPage, 20)
      setHistory(res.data)
      setHistoryTotal(res.total)
    } catch {
      // non-critical
    }
  }, [sensorId, historyPage])

  useEffect(() => { loadDetail() }, [loadDetail])
  useEffect(() => { loadHistory() }, [loadHistory])

  const handleSuppress = async () => {
    if (!sensorId) return
    setSuppressing(true)
    try {
      const start = new Date().toISOString()
      const end = new Date(Date.now() + suppressMin * 60_000).toISOString()
      await createSuppression({ sensor_id: sensorId, start_time: start, end_time: end })
      await loadDetail()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Suppression failed')
    } finally {
      setSuppressing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="text-center py-8">
        <p className="text-red-400 mb-4">{error || 'Sensor not found'}</p>
        <Link to="/" className="text-blue-400 hover:underline">Back to Dashboard</Link>
      </div>
    )
  }

  const historyPages = Math.ceil(historyTotal / 20)

  return (
    <div>
      {/* Breadcrumb */}
      <div className="text-sm text-gray-400 mb-4">
        <Link to="/" className="hover:text-gray-200">Dashboard</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-200">{detail.sensor.id}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold font-mono">{detail.sensor.id}</h1>
            <StatusDot status={detail.sensor.status} />
            <span className={`text-sm font-medium ${statusTextColor(detail.sensor.status)}`}>
              {detail.sensor.status}
            </span>
          </div>
          <p className="text-gray-400 text-sm">
            Zone {detail.sensor.zone_id} &middot; Last seen {timeAgo(detail.sensor.last_seen)}
          </p>
        </div>

        {/* Quick suppress */}
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={1440}
            value={suppressMin}
            onChange={(e) => setSuppressMin(Number(e.target.value))}
            className="w-20 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm"
          />
          <span className="text-xs text-gray-400">min</span>
          <button
            disabled={suppressing}
            onClick={handleSuppress}
            className="px-3 py-1.5 rounded bg-orange-600/20 text-orange-400 text-sm hover:bg-orange-600/30 disabled:opacity-50"
          >
            Suppress
          </button>
        </div>
      </div>

      {/* Latest readings */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Latest Readings</h2>
        {detail.recent_readings.length === 0 ? (
          <p className="text-gray-500 text-sm">No recent readings</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-800">
                  <th className="py-2 pr-4">Time</th>
                  <th className="py-2 pr-4">Voltage</th>
                  <th className="py-2 pr-4">Current</th>
                  <th className="py-2 pr-4">Temp</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {detail.recent_readings.map((r) => (
                  <tr key={r.id} className="border-b border-gray-800/50">
                    <td className="py-2 pr-4 text-gray-400">{formatTime(r.timestamp)}</td>
                    <td className="py-2 pr-4">{Number(r.voltage).toFixed(1)}V</td>
                    <td className="py-2 pr-4">{Number(r.current).toFixed(2)}A</td>
                    <td className="py-2 pr-4">{Number(r.temperature).toFixed(1)}°C</td>
                    <td className="py-2 pr-4 font-mono text-xs">{r.status_code}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Active anomalies */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">
          Active Anomalies
          {detail.active_anomalies.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-400">({detail.active_anomalies.length})</span>
          )}
        </h2>
        {detail.active_anomalies.length === 0 ? (
          <p className="text-gray-500 text-sm">No active anomalies</p>
        ) : (
          <div className="space-y-2">
            {detail.active_anomalies.map((a) => (
              <div key={a.id} className="rounded-lg border border-gray-800 bg-gray-900 p-3 flex items-center justify-between">
                <div>
                  {a.alert_severity && (
                    <span className={`inline-flex px-2 py-0.5 rounded border text-xs font-medium mr-2 ${severityBadge(a.alert_severity)}`}>
                      {a.alert_severity}
                    </span>
                  )}
                  <span className="text-sm text-gray-300">{a.type}</span>
                  <span className="text-xs text-gray-500 ml-2">Reading #{a.reading_id}</span>
                </div>
                <span className="text-xs text-gray-400">{timeAgo(a.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Active suppression */}
      {detail.active_suppression && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Active Suppression</h2>
          <div className="rounded-lg border border-orange-600/30 bg-orange-600/5 p-3 text-sm">
            Suppressed from <span className="font-medium">{formatTime(detail.active_suppression.start_time)}</span>
            {' '}until <span className="font-medium">{formatTime(detail.active_suppression.end_time)}</span>
            <span className="text-gray-400 ml-2">· by user {detail.active_suppression.created_by}</span>
          </div>
        </section>
      )}

      {/* History */}
      <section>
        <h2 className="text-lg font-semibold mb-3">History</h2>
        {history.length === 0 ? (
          <p className="text-gray-500 text-sm">No history data</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-800">
                    <th className="py-2 pr-4">Time</th>
                    <th className="py-2 pr-4">Voltage</th>
                    <th className="py-2 pr-4">Current</th>
                    <th className="py-2 pr-4">Temp</th>
                    <th className="py-2 pr-4">Anomalies</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.reading_id} className="border-b border-gray-800/50">
                      <td className="py-2 pr-4 text-gray-400">{formatTime(h.timestamp)}</td>
                      <td className="py-2 pr-4">{Number(h.voltage).toFixed(1)}V</td>
                      <td className="py-2 pr-4">{Number(h.current).toFixed(2)}A</td>
                      <td className="py-2 pr-4">{Number(h.temperature).toFixed(1)}°C</td>
                      <td className="py-2 pr-4">
                        {h.anomalies.length > 0 ? (
                          <div className="flex gap-1">
                            {h.anomalies.map((an, i) => (
                              <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-red-600/20 text-red-400">
                                {an.type}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {historyPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  disabled={historyPage <= 1}
                  onClick={() => setHistoryPage((p) => p - 1)}
                  className="px-3 py-1 rounded border border-gray-700 text-sm disabled:opacity-50"
                >
                  Prev
                </button>
                <span className="text-sm text-gray-400">
                  {historyPage} / {historyPages}
                </span>
                <button
                  disabled={historyPage >= historyPages}
                  onClick={() => setHistoryPage((p) => p + 1)}
                  className="px-3 py-1 rounded border border-gray-700 text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
