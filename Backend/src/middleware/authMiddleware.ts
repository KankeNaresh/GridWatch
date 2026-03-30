import { NextFunction, Request, Response } from "express";
import { getPool } from "../config/db";
import { AuthContext } from "../types";
import { ApiError } from "../utils/errors";

/**
 * Auth middleware — extracts user context from X-User-Id header.
 * In production this would validate a JWT; for this assessment
 * we trust the header (simulates authenticated user).
 *
 * Attaches AuthContext to req for downstream use.
 */
export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userIdHeader = req.headers["x-user-id"];
    if (!userIdHeader) {
      throw ApiError.unauthorized("Missing X-User-Id header");
    }

    const userId = parseInt(userIdHeader as string, 10);
    if (isNaN(userId)) {
      throw ApiError.unauthorized("Invalid X-User-Id header");
    }

    const pool = getPool();

    // Fetch user + their zone assignments in one query
    const result = await pool.query<{
      id: number;
      name: string;
      role: "operator" | "supervisor";
      zone_ids: number[] | null;
    }>(
      `SELECT u.id, u.name, u.role,
              ARRAY_AGG(uz.zone_id) FILTER (WHERE uz.zone_id IS NOT NULL) AS zone_ids
       FROM users u
       LEFT JOIN user_zones uz ON uz.user_id = u.id
       WHERE u.id = $1
       GROUP BY u.id, u.name, u.role`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw ApiError.unauthorized("User not found");
    }

    const user = result.rows[0]!;

    const authContext: AuthContext = {
      user_id: user.id,
      role: user.role,
      zone_ids: user.role === "supervisor" ? [] : (user.zone_ids || []),
    };

    // Operator with no zones assigned can't see anything
    if (user.role === "operator" && authContext.zone_ids.length === 0) {
      throw ApiError.forbidden("Operator has no zones assigned");
    }

    (req as any).auth = authContext;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Helper to extract auth context from request.
 */
export function getAuth(req: Request): AuthContext {
  const auth = (req as any).auth as AuthContext | undefined;
  if (!auth) {
    throw ApiError.unauthorized("No auth context");
  }
  return auth;
}

/**
 * Builds a zone filter clause for SQL queries.
 * Supervisors: no filter (returns TRUE).
 * Operators: filters by their assigned zone_ids.
 *
 * Returns { clause: string, params: any[], nextParamIndex: number }
 */
export function buildZoneFilter(
  auth: AuthContext,
  column: string,
  startParamIndex: number
): { clause: string; params: any[]; nextParamIndex: number } {
  if (auth.role === "supervisor") {
    return { clause: "TRUE", params: [], nextParamIndex: startParamIndex };
  }
  return {
    clause: `${column} = ANY($${startParamIndex}::int[])`,
    params: [auth.zone_ids],
    nextParamIndex: startParamIndex + 1,
  };
}
