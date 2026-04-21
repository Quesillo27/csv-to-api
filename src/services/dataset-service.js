const crypto = require('crypto');
const fs = require('fs');
const { parse } = require('csv-parse/sync');

const config = require('../config');
const HttpError = require('../utils/http-error');

function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

function ensureUploadDir(uploadDir) {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
}

function parseCsvContent(content) {
  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true
  });

  if (rows.length === 0) {
    throw new HttpError(400, 'El CSV esta vacio o no tiene datos');
  }

  const headers = Object.keys(rows[0]);
  if (headers.length === 0) {
    throw new HttpError(422, 'El CSV no contiene encabezados validos');
  }

  return { rows, headers };
}

function buildDataset({ filename, rows, headers, filePath }) {
  return {
    filename,
    headers,
    rows,
    createdAt: new Date().toISOString(),
    filePath: filePath || null
  };
}

function toDatasetSummary(id, dataset) {
  return {
    id,
    filename: dataset.filename,
    rows: dataset.rows.length,
    columns: dataset.headers,
    createdAt: dataset.createdAt
  };
}

function calculateMedian(values) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(4));
  }

  return sorted[middle];
}

function inferColumnType(values) {
  if (values.length === 0) {
    return 'empty';
  }

  const numericValues = values.map(Number).filter((value) => !Number.isNaN(value));
  if (numericValues.length === values.length) {
    return 'numeric';
  }

  return 'string';
}

function buildSchema(dataset) {
  return dataset.headers.map((column) => {
    const values = dataset.rows
      .map((row) => row[column])
      .filter((value) => value !== '' && value != null);

    return {
      name: column,
      type: inferColumnType(values),
      nullable: values.length !== dataset.rows.length,
      uniqueValues: new Set(values).size,
      sampleValues: values.slice(0, 3)
    };
  });
}

function buildStats(dataset) {
  const stats = {};

  for (const column of dataset.headers) {
    const values = dataset.rows
      .map((row) => row[column])
      .filter((value) => value !== '' && value != null);
    const numericValues = values.map(Number).filter((value) => !Number.isNaN(value));
    const uniqueValues = new Set(values).size;
    const nullCount = dataset.rows.length - values.length;

    stats[column] = {
      count: values.length,
      unique: uniqueValues,
      nullCount,
      type: inferColumnType(values)
    };

    if (numericValues.length === values.length && numericValues.length > 0) {
      const min = Math.min(...numericValues);
      const max = Math.max(...numericValues);
      const sum = numericValues.reduce((total, current) => total + current, 0);

      Object.assign(stats[column], {
        min,
        max,
        mean: Number((sum / numericValues.length).toFixed(4)),
        median: calculateMedian(numericValues)
      });
      continue;
    }

    const frequency = {};
    values.forEach((value) => {
      frequency[value] = (frequency[value] || 0) + 1;
    });

    stats[column].topValues = Object.entries(frequency)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([value, count]) => ({ value, count }));
  }

  return {
    id: dataset.id,
    rows: dataset.rows.length,
    columns: dataset.headers.length,
    stats
  };
}

function buildDistinctValues(dataset, field, options = {}) {
  const search = String(options.search || '').toLowerCase();
  const offset = Math.max(0, Number.parseInt(options.offset, 10) || 0);
  const limit = Math.min(config.maxPageSize, Math.max(1, Number.parseInt(options.limit, 10) || 20));
  const counts = {};

  dataset.rows.forEach((row) => {
    const value = row[field];
    const normalized = value == null ? '' : String(value);
    if (search && !normalized.toLowerCase().includes(search)) {
      return;
    }
    counts[normalized] = (counts[normalized] || 0) + 1;
  });

  const values = Object.entries(counts)
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));

  return {
    field,
    total: values.length,
    offset,
    limit,
    values: values.slice(offset, offset + limit)
  };
}

module.exports = {
  config,
  ensureUploadDir,
  parseCsvContent,
  buildDataset,
  toDatasetSummary,
  buildSchema,
  buildStats,
  buildDistinctValues
};
