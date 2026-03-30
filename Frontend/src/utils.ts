import type { AlertSeverity, SensorStatus } from "./types";

export function statusColor(status: SensorStatus): string {
  switch (status) {
    case 'healthy':  return 'bg-emerald-500'
    case 'warning':  return 'bg-amber-500'
    case 'critical': return 'bg-red-500'
    case 'silent':   return 'bg-gray-500'
  }
}

export function statusTextColor(status: SensorStatus): string {
  switch (status) {
    case 'healthy':  return 'text-emerald-400'
    case 'warning':  return 'text-amber-400'
    case 'critical': return 'text-red-400'
    case 'silent':   return 'text-gray-400'
  }
}

export function severityColor(severity: AlertSeverity): string {
  return severity === 'critical' ? 'text-red-400' : 'text-amber-400'
}

export function severityBadge(severity: AlertSeverity): string {
  return severity === 'critical'
    ? 'bg-red-500/20 text-red-400 border-red-500/30'
    : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
}

export function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString()
}
