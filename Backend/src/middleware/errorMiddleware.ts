import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/errors";

/**
 * Central error handler — catches ApiError and unknown errors.
 * Pattern from Cynterview: structured { code, message } responses.
 */
export function errorMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
    });
    return;
  }

  console.error("Unhandled error:", err);
  res.status(500).json({
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred",
  });
}
