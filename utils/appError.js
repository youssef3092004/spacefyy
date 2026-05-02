export class AppError extends Error {
  constructor(message, statusCode = 400, metadata = {}) {
    super(message);
    this.statusCode = statusCode;
    this.status = "false";
    if (metadata && typeof metadata === "object") {
      Object.assign(this, metadata);
    }
    Error.captureStackTrace(this, this.constructor);
  }
}
