const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const logger = require('./utils/logger');
const { sendSuccess } = require('./utils/responses');
const datasetStore = require('./store/dataset-store');
const createRequestMetrics = require('./middleware/request-metrics');
const errorHandler = require('./middleware/error-handler');
const datasetRoutes = require('./routes/datasets');

const metrics = createRequestMetrics();
const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || config.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origen no permitido por CORS'));
  }
}));
app.use(rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiadas solicitudes, intenta de nuevo mas tarde',
    data: null,
    error: { message: 'Demasiadas solicitudes, intenta de nuevo mas tarde' }
  }
}));
app.use(express.json({ limit: `${config.inlineCsvLimitMb}mb` }));
app.use(metrics.middleware);

app.get('/health', (req, res) => {
  return sendSuccess(res, {
    status: 'ok',
    version: config.version,
    env: config.env,
    datasets: datasetStore.size(),
    timestamp: new Date().toISOString(),
    metrics: metrics.snapshot()
  }, 'Servicio saludable');
});

app.use(datasetRoutes);
app.use(errorHandler);

module.exports = {
  app,
  config,
  logger,
  datasetStore
};
