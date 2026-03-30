/**
 * Structured API error — thrown in service/DA layers,
 * caught by Express error middleware.
 * Pattern: Cynterview Node.js ApiError class.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static badRequest(code: string, message: string): ApiError {
    return new ApiError(400, code, message);
  }

  static unauthorized(message = "Unauthorized"): ApiError {
    return new ApiError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message = "Forbidden"): ApiError {
    return new ApiError(403, "FORBIDDEN", message);
  }

  static notFound(message = "Not found"): ApiError {
    return new ApiError(404, "NOT_FOUND", message);
  }

  static conflict(code: string, message: string): ApiError {
    return new ApiError(409, code, message);
  }
}
