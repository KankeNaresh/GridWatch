import { Alert, AlertStatus, AuthContext, PaginatedResponse } from "../types";
import { ApiError } from "../utils/errors";

import {
  getAlerts,
  getAlertById,
  updateAlertStatus,
  insertAlertLog,
} from "../dataAccess/alertDA";

// Valid state transitions
const VALID_TRANSITIONS: Record<AlertStatus, AlertStatus[]> = {
  open: ["acknowledged", "resolved"],
  acknowledged: ["resolved"],
  resolved: [], // terminal state
};

/**
 * List alerts — zone-scoped, paginated, filterable.
 */
export async function listAlerts(
  auth: AuthContext,
  filters: { status?: AlertStatus; sensor_id?: string; page?: number; page_size?: number }
): Promise<PaginatedResponse<Alert>> {
  const page = filters.page || 1;
  const pageSize = filters.page_size || 50;

  const zoneIds = auth.role === "supervisor" ? null : auth.zone_ids;

  const { alerts, total } = await getAlerts({
    zoneIds,
    status: filters.status,
    sensorId: filters.sensor_id,
    page,
    pageSize,
  });

  return { data: alerts, page, page_size: pageSize, total };
}

/**
 * Transition an alert status. Enforces valid transitions only.
 * Logs every transition to the audit trail.
 */
export async function transitionAlert(
  auth: AuthContext,
  alertId: number,
  newStatus: AlertStatus
): Promise<Alert> {
  const alert = await getAlertById(alertId);

  if (!alert) {
    throw ApiError.notFound("Alert not found");
  }

  // Zone isolation check
  if (auth.role === "operator" && !auth.zone_ids.includes(alert.zone_id)) {
    throw ApiError.forbidden("Alert belongs to a zone you don't have access to");
  }

  // Validate transition
  const allowed = VALID_TRANSITIONS[alert.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw ApiError.badRequest(
      "INVALID_TRANSITION",
      `Cannot transition from '${alert.status}' to '${newStatus}'`
    );
  }

  // Update status
  const updated = await updateAlertStatus(alertId, newStatus);

  // Append-only audit log
  await insertAlertLog(alertId, alert.status, newStatus, auth.user_id);

  return updated;
}
