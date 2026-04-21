const logger = require('../utils/logger');
const { sendError } = require('../utils/responses');

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return sendError(res, 413, `Archivo muy grande. Maximo: ${process.env.MAX_FILE_SIZE_MB || 10}MB`);
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  if (statusCode >= 500) {
    logger.error('request_failed', {
      method: req.method,
      path: req.originalUrl,
      statusCode,
      message
    });
  }

  return sendError(res, statusCode, message, err.details);
}

module.exports = errorHandler;
