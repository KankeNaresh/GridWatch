import type { SensorStatus } from "../types";
import { statusColor } from "../utils";

export default function StatusDot({ status }: { status: SensorStatus }) {
  return (
    <span className="relative flex h-3 w-3">
      {(status === 'critical' || status === 'warning') && (
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${statusColor(status)}`}
        />
      )}
      <span className={`relative inline-flex rounded-full h-3 w-3 ${statusColor(status)}`} />
    </span>
  )
}
