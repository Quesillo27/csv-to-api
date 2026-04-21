const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const config = require('../config');
const logger = require('../utils/logger');
const HttpError = require('../utils/http-error');
const { sendSuccess } = require('../utils/responses');
const datasetStore = require('../store/dataset-store');
const {
  ensureUploadDir,
  parseCsvContent,
  buildDataset,
  toDatasetSummary,
  buildSchema,
  buildStats,
  buildDistinctValues
} = require('../services/dataset-service');
const {
  validateQuery,
  applyFilters,
  applySort,
  selectFields,
  paginate,
  assertColumnExists
} = require('../services/query-service');

ensureUploadDir(config.uploadDir);

const storage = multer.diskStorage({
  destination: config.uploadDir,
  filename: (req, file, callback) => {
    const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    callback(null, `${Date.now()}_${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxFileSizeBytes },
  fileFilter: (req, file, callback) => {
    if (file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) {
      callback(null, true);
      return;
    }

    callback(new HttpError(400, 'Solo se aceptan archivos CSV'));
  }
});

const router = express.Router();

function getDatasetOrThrow(id) {
  const dataset = datasetStore.get(id);
  if (!dataset) {
    throw new HttpError(404, 'Dataset no encontrado');
  }

  return dataset;
}

function createDatasetFromCsv(csvText, filename, filePath) {
  const { rows, headers } = parseCsvContent(csvText);
  const id = require('crypto').randomBytes(8).toString('hex');
  const dataset = buildDataset({ filename, rows, headers, filePath });
  datasetStore.set(id, dataset);
  logger.info('dataset_created', { id, filename, rows: rows.length, columns: headers.length });
  return { id, dataset };
}

router.get('/datasets', (req, res) => {
  const datasets = datasetStore.list().map((dataset) => toDatasetSummary(dataset.id, dataset));
  return sendSuccess(res, { datasets }, 'Datasets listados');
});

router.post('/datasets', upload.single('file'), (req, res, next) => {
  if (!req.file) {
    next(new HttpError(400, 'Se requiere un archivo CSV (campo: file)'));
    return;
  }

  try {
    const csvText = fs.readFileSync(req.file.path, 'utf8');
    const { id, dataset } = createDatasetFromCsv(csvText, req.file.originalname, req.file.path);

    return sendSuccess(res, {
      id,
      filename: dataset.filename,
      rows: dataset.rows.length,
      columns: dataset.headers,
      api: {
        list: `GET /datasets/${id}/data`,
        get: `GET /datasets/${id}/data/:index`,
        stats: `GET /datasets/${id}/stats`,
        schema: `GET /datasets/${id}/schema`,
        distinct: `GET /datasets/${id}/distinct/:field`
      }
    }, 'Dataset creado', 201);
  } catch (error) {
    if (req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(error.statusCode ? error : new HttpError(422, `Error al parsear CSV: ${error.message}`));
  }
});

router.post('/datasets/inline', express.text({ type: '*/*', limit: `${config.inlineCsvLimitMb}mb` }), (req, res, next) => {
  if (!req.body || typeof req.body !== 'string') {
    next(new HttpError(400, 'Se requiere CSV como body text/plain'));
    return;
  }

  try {
    const { id, dataset } = createDatasetFromCsv(req.body, 'inline.csv');

    return sendSuccess(res, {
      id,
      rows: dataset.rows.length,
      columns: dataset.headers,
      api: {
        list: `GET /datasets/${id}/data`,
        get: `GET /datasets/${id}/data/:index`,
        stats: `GET /datasets/${id}/stats`,
        schema: `GET /datasets/${id}/schema`,
        distinct: `GET /datasets/${id}/distinct/:field`
      }
    }, 'Dataset creado', 201);
  } catch (error) {
    next(error.statusCode ? error : new HttpError(422, `Error al parsear CSV: ${error.message}`));
  }
});

router.get('/datasets/:id', (req, res, next) => {
  try {
    const dataset = getDatasetOrThrow(req.params.id);
    return sendSuccess(res, toDatasetSummary(req.params.id, dataset), 'Dataset encontrado');
  } catch (error) {
    return next(error);
  }
});

router.get('/datasets/:id/schema', (req, res, next) => {
  try {
    const dataset = getDatasetOrThrow(req.params.id);
    return sendSuccess(res, {
      id: req.params.id,
      columns: buildSchema(dataset)
    }, 'Esquema generado');
  } catch (error) {
    return next(error);
  }
});

router.get('/datasets/:id/distinct/:field', (req, res, next) => {
  try {
    const dataset = getDatasetOrThrow(req.params.id);
    assertColumnExists(dataset.headers, req.params.field);
    return sendSuccess(
      res,
      buildDistinctValues(dataset, req.params.field, req.query),
      'Valores distintos calculados'
    );
  } catch (error) {
    return next(error);
  }
});

router.get('/datasets/:id/data', (req, res, next) => {
  try {
    const dataset = getDatasetOrThrow(req.params.id);
    const selectedFields = validateQuery(dataset.headers, req.query);
    const filteredRows = applyFilters(dataset.rows, dataset.headers, req.query);
    const sortedRows = applySort(filteredRows, req.query.sort, req.query.order);
    const projectedRows = selectFields(sortedRows, selectedFields);
    const result = paginate(projectedRows, req.query.page, req.query.limit, config.maxPageSize, config.defaultPageSize);

    return sendSuccess(res, result, 'Datos consultados');
  } catch (error) {
    return next(error);
  }
});

router.get('/datasets/:id/data/:index', (req, res, next) => {
  try {
    const dataset = getDatasetOrThrow(req.params.id);
    const index = Number.parseInt(req.params.index, 10);
    if (!Number.isFinite(index) || index < 0 || index >= dataset.rows.length) {
      throw new HttpError(404, `Indice ${req.params.index} fuera de rango (0-${dataset.rows.length - 1})`);
    }

    return sendSuccess(res, { index, data: dataset.rows[index] }, 'Fila encontrada');
  } catch (error) {
    return next(error);
  }
});

router.get('/datasets/:id/stats', (req, res, next) => {
  try {
    const dataset = getDatasetOrThrow(req.params.id);
    return sendSuccess(res, buildStats({ ...dataset, id: req.params.id }), 'Estadisticas calculadas');
  } catch (error) {
    return next(error);
  }
});

router.delete('/datasets/:id', (req, res, next) => {
  try {
    const dataset = getDatasetOrThrow(req.params.id);
    if (dataset.filePath && fs.existsSync(dataset.filePath)) {
      fs.unlinkSync(dataset.filePath);
    }

    datasetStore.delete(req.params.id);
    logger.info('dataset_deleted', { id: req.params.id });
    return sendSuccess(res, { deleted: true, id: req.params.id }, 'Dataset eliminado');
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
