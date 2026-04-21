const path = require('path');
const pkg = require('../package.json');

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const config = {
  appName: 'csv-to-api',
  version: pkg.version,
  env: process.env.NODE_ENV || 'development',
  port: parseInteger(process.env.PORT, 3000),
  uploadDir: process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'),
  maxFileSizeMb: parseInteger(process.env.MAX_FILE_SIZE_MB, 10),
  defaultPageSize: parseInteger(process.env.DEFAULT_PAGE_SIZE, 20),
  maxPageSize: parseInteger(process.env.MAX_PAGE_SIZE, 1000),
  inlineCsvLimitMb: parseInteger(process.env.INLINE_CSV_LIMIT_MB, 10),
  rateLimitWindowMs: parseInteger(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  rateLimitMaxRequests: parseInteger(process.env.RATE_LIMIT_MAX_REQUESTS, 300),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
};

config.maxFileSizeBytes = config.maxFileSizeMb * 1024 * 1024;
config.inlineCsvLimitBytes = config.inlineCsvLimitMb * 1024 * 1024;

module.exports = config;
