// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  console.error(`Error: ${message}, Status Code: ${statusCode}`);

  res.status(statusCode).json({
    success: err.success ?? false,
    error: message,
  });
}
