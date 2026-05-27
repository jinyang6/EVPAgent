/**
 * Global Error Handler Middleware
 *
 * Catches unhandled errors and returns them in OpenAI-compatible error format,
 * mimicking OpenAI's API error response shape.
 */

/**
 * Express error-handling middleware (4-argument signature).
 *
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
export function errorHandler(err, req, res, _next) {
  // If headers already sent, delegate to Express default
  if (res.headersSent) {
    return _next(err);
  }

  console.error(`[API Error] ${err.message}`);
  if (err.stack) console.error(err.stack);

  const statusCode = err.statusCode || 500;
  const errorType = statusCode === 400 ? 'invalid_request_error'
    : statusCode === 401 ? 'authentication_error'
    : statusCode === 404 ? 'invalid_request_error'
    : statusCode === 429 ? 'rate_limit_error'
    : 'server_error';

  res.status(statusCode).json({
    error: {
      message: err.message || 'An internal server error occurred.',
      type: errorType,
      code: statusCode === 401 ? 'invalid_api_key' : null,
      param: err.param || null,
    },
  });
}

/**
 * Not Found Middleware
 * Catches requests to undefined routes.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      message: `Unknown endpoint: ${req.method} ${req.path}`,
      type: 'invalid_request_error',
      code: null,
      param: null,
    },
  });
}
