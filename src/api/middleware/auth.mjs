/**
 * API Key Authentication Middleware
 *
 * Validates the Authorization: Bearer <token> header.
 * Currently accepts any Bearer token — key validation will be implemented later.
 *
 * TODO: Implement API key validation against .env or a key store.
 */

/**
 * Express middleware that extracts and validates the Bearer token.
 * Attaches the token to req.apiKey for downstream use.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: {
        message: 'Missing or invalid Authorization header. Use: Authorization: Bearer YOUR_API_KEY',
        type: 'invalid_request_error',
        code: 'invalid_api_key',
      },
    });
  }

  const token = authHeader.slice(7); // strip "Bearer "

  if (!token) {
    return res.status(401).json({
      error: {
        message: 'API key must not be empty.',
        type: 'invalid_request_error',
        code: 'invalid_api_key',
      },
    });
  }

  // TODO: validate token against allowed keys
  req.apiKey = token;
  next();
}
