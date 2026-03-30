import { useCallback, useEffect, useState } from "react";
import { fetchAlerts, transitionAlert } from "../../api";
import type { Alert, AlertStatus } from "../../types";
import { useSSE } from "../../useSSE";
import { severityBadge, timeAgo } from "../../utils";

const ALLOWED_TRANSITIONS: Record<AlertStatus, AlertStatus[]> = {
  open: ['acknowledged', 'resolved'],
  acknowledged: ['resolved'],
  resolved: [],
}

export default function AlertsModule() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<AlertStatus | 'all'>('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20
  const [transitioning, setTransitioning] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetchAlerts({
        page,
        page_size: pageSize,
        ...(statusFilter !== 'all' && { status: statusFilter }),
      })
      setAlerts(res.data)
      setTotal(res.total)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load alerts')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter])

  useEffect(() => { load() }, [load])

  // Real-time: new alerts via SSE — reload full list
  useSSE({
    onAlertCreated() {
      load()
    },
  })

  const handleTransition = async (alertId: number, newStatus: AlertStatus) => {
    setTransitioning(alertId)
    try {
      const updated = await transitionAlert(alertId, newStatus)
      setAlerts((prev) => prev.map((a) => (a.id === alertId ? updated : a)))
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Transition failed')
    } finally {
      setTransitioning(null)
    }
  }

  const totalPages = Math.ceil(total / pageSize)

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
        <h1 className="text-2xl font-bold">Alert Management</h1>
        <span className="text-sm text-gray-400">{total} total</span>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(['all', 'open', 'acknowledged', 'resolved'] as const).map((st) => (
          <button
            key={st}
            onClick={() => { setStatusFilter(st); setPage(1) }}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              statusFilter === st
                ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                : 'border-gray-700 text-gray-400 hover:border-gray-600'
            }`}
          >
            {st === 'all' ? 'All' : st.charAt(0).toUpperCase() + st.slice(1)}
          </button>
        ))}
      </div>

      {/* Alert table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-800">
              <th className="py-2 pr-4">ID</th>
              <th className="py-2 pr-4">Severity</th>
              <th className="py-2 pr-4">Anomaly</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Created</th>
              <th className="py-2 pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((a) => (
              <tr key={a.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                <td className="py-3 pr-4 font-mono">#{a.id}</td>
                <td className="py-3 pr-4">
                  <span className={`inline-flex px-2 py-0.5 rounded border text-xs font-medium ${severityBadge(a.severity)}`}>
                    {a.severity}
                  </span>
                </td>
                <td className="py-3 pr-4 font-mono text-xs text-gray-400">#{a.anomaly_id}</td>
                <td className="py-3 pr-4">
                  <span className={`text-xs font-medium ${
                    a.status === 'open' ? 'text-red-400' :
                    a.status === 'acknowledged' ? 'text-yellow-400' : 'text-green-400'
                  }`}>
                    {a.status}
                  </span>
                </td>
                <td className="py-3 pr-4 text-gray-400">{timeAgo(a.created_at)}</td>
                <td className="py-3 pr-4">
                  <div className="flex gap-2">
                    {ALLOWED_TRANSITIONS[a.status].map((next) => (
                      <button
                        key={next}
                        disabled={transitioning === a.id}
                        onClick={() => handleTransition(a.id, next)}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
                          next === 'acknowledged'
                            ? 'bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30'
                            : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
                        }`}
                      >
                        {next === 'acknowledged' ? 'Acknowledge' : 'Resolve'}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {alerts.length === 0 && (
        <p className="text-center text-gray-500 py-8">No alerts found.</p>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1 rounded border border-gray-700 text-sm disabled:opacity-50 hover:border-gray-600"
          >
            Prev
          </button>
          <span className="text-sm text-gray-400">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 rounded border border-gray-700 text-sm disabled:opacity-50 hover:border-gray-600"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
