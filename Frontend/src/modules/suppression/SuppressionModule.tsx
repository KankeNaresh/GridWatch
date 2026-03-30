import { useCallback, useEffect, useState } from "react";
import { createSuppression, fetchSuppressions } from "../../api";
import type { Suppression } from "../../types";
import { formatTime, timeAgo } from "../../utils";

export default function SuppressionModule() {
  const [suppressions, setSuppressions] = useState<Suppression[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Form state
  const [sensorId, setSensorId] = useState('')
  const [minutes, setMinutes] = useState(30)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await fetchSuppressions()
      setSuppressions(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load suppressions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sensorId.trim()) return
    setSubmitting(true)
    try {
      const start = new Date().toISOString()
      const end = new Date(Date.now() + minutes * 60_000).toISOString()
      await createSuppression({ sensor_id: sensorId.trim(), start_time: start, end_time: end })
      setSensorId('')
      setMinutes(30)
      await load()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create suppression')
    } finally {
      setSubmitting(false)
    }
  }

  const active = suppressions.filter((s) => new Date(s.end_time) > new Date())
  const expired = suppressions.filter((s) => new Date(s.end_time) <= new Date())

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
      <h1 className="text-2xl font-bold mb-6">Suppression Management</h1>

      {/* Create suppression form */}
      <form onSubmit={handleCreate} className="mb-8 rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h2 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">New Suppression</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Sensor ID</label>
            <input
              type="text"
              value={sensorId}
              onChange={(e) => setSensorId(e.target.value)}
              placeholder="e.g. SENSOR-0001"
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm w-48 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Duration (minutes)</label>
            <input
              type="number"
              min={1}
              max={1440}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm w-24 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Creating...' : 'Create Suppression'}
          </button>
        </div>
      </form>

      {/* Active suppressions */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">
          Active
          <span className="ml-2 text-sm font-normal text-gray-400">({active.length})</span>
        </h2>
        {active.length === 0 ? (
          <p className="text-gray-500 text-sm">No active suppressions</p>
        ) : (
          <div className="space-y-2">
            {active.map((s) => (
              <div key={s.id} className="rounded-lg border border-orange-600/30 bg-orange-600/5 p-4 flex items-center justify-between">
                <div>
                  <span className="font-mono text-sm font-medium">{s.sensor_id}</span>
                  <span className="text-gray-400 text-sm ml-3">
                    until {formatTime(s.end_time)}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  Created by user {s.created_by} &middot; {timeAgo(s.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Expired */}
      {expired.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 text-gray-400">
            Expired
            <span className="ml-2 text-sm font-normal">({expired.length})</span>
          </h2>
          <div className="space-y-2 opacity-60">
            {expired.map((s) => (
              <div key={s.id} className="rounded-lg border border-gray-800 bg-gray-900 p-4 flex items-center justify-between">
                <div>
                  <span className="font-mono text-sm">{s.sensor_id}</span>
                  <span className="text-gray-500 text-sm ml-3">
                    expired {timeAgo(s.end_time)}
                  </span>
                </div>
                <span className="text-xs text-gray-600">user {s.created_by}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
