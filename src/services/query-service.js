const HttpError = require('../utils/http-error');

const RESERVED_QUERY_PARAMS = new Set([
  'page',
  'limit',
  'sort',
  'order',
  'fields',
  'offset',
  'search'
]);

const ALLOWED_OPERATORS = new Set([
  'contains',
  'startswith',
  'endswith',
  'gt',
  'gte',
  'lt',
  'lte',
  'ne',
  'eq'
]);

function assertColumnExists(headers, field, label = 'campo') {
  if (!headers.includes(field)) {
    throw new HttpError(422, `${label} invalido: ${field}`, {
      allowed: headers
    });
  }
}

function validateSelectionFields(headers, fields) {
  if (!fields) {
    return null;
  }

  const selected = fields
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);

  if (selected.length === 0) {
    throw new HttpError(422, 'fields debe incluir al menos una columna');
  }

  selected.forEach((field) => assertColumnExists(headers, field));
  return selected;
}

function validateQuery(headers, query) {
  if (query.sort) {
    assertColumnExists(headers, query.sort, 'sort');
  }

  if (query.order && !['asc', 'desc'].includes(query.order)) {
    throw new HttpError(422, 'order debe ser asc o desc');
  }

  const page = Number.parseInt(query.page, 10);
  if (query.page && (!Number.isFinite(page) || page < 1)) {
    throw new HttpError(422, 'page debe ser un entero mayor o igual a 1');
  }

  const limit = Number.parseInt(query.limit, 10);
  if (query.limit && (!Number.isFinite(limit) || limit < 1)) {
    throw new HttpError(422, 'limit debe ser un entero mayor o igual a 1');
  }

  return validateSelectionFields(headers, query.fields);
}

function matchFilter(cellValue, expectedValue, operator) {
  const normalizedCell = String(cellValue ?? '');
  const normalizedExpected = String(expectedValue);

  switch (operator) {
    case 'contains':
      return normalizedCell.toLowerCase().includes(normalizedExpected.toLowerCase());
    case 'startswith':
      return normalizedCell.toLowerCase().startsWith(normalizedExpected.toLowerCase());
    case 'endswith':
      return normalizedCell.toLowerCase().endsWith(normalizedExpected.toLowerCase());
    case 'gt':
      return Number.parseFloat(normalizedCell) > Number.parseFloat(normalizedExpected);
    case 'gte':
      return Number.parseFloat(normalizedCell) >= Number.parseFloat(normalizedExpected);
    case 'lt':
      return Number.parseFloat(normalizedCell) < Number.parseFloat(normalizedExpected);
    case 'lte':
      return Number.parseFloat(normalizedCell) <= Number.parseFloat(normalizedExpected);
    case 'ne':
      return normalizedCell !== normalizedExpected;
    case 'eq':
    default:
      return normalizedCell === normalizedExpected;
  }
}

function applyFilters(rows, headers, query) {
  return rows.filter((row) => {
    return Object.entries(query).every(([key, value]) => {
      if (RESERVED_QUERY_PARAMS.has(key)) {
        return true;
      }

      const [field, operator = 'eq'] = key.split('__');
      assertColumnExists(headers, field);

      if (!ALLOWED_OPERATORS.has(operator)) {
        throw new HttpError(422, `operador invalido: ${operator}`, {
          allowed: Array.from(ALLOWED_OPERATORS)
        });
      }

      return matchFilter(row[field], value, operator);
    });
  });
}

function applySort(rows, sortField, order = 'asc') {
  if (!sortField) {
    return rows;
  }

  return [...rows].sort((left, right) => {
    const leftValue = left[sortField] ?? '';
    const rightValue = right[sortField] ?? '';
    const leftNumber = Number.parseFloat(leftValue);
    const rightNumber = Number.parseFloat(rightValue);
    const bothNumeric = !Number.isNaN(leftNumber) && !Number.isNaN(rightNumber);
    const comparison = bothNumeric
      ? leftNumber - rightNumber
      : String(leftValue).localeCompare(String(rightValue));

    return order === 'desc' ? -comparison : comparison;
  });
}

function selectFields(rows, selectedFields) {
  if (!selectedFields) {
    return rows;
  }

  return rows.map((row) => {
    const partialRow = {};
    selectedFields.forEach((field) => {
      partialRow[field] = row[field];
    });
    return partialRow;
  });
}

function paginate(rows, page, limit, maxPageSize, defaultPageSize) {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safeLimit = Math.min(maxPageSize, Math.max(1, Number.parseInt(limit, 10) || defaultPageSize));
  const total = rows.length;
  const pages = total === 0 ? 0 : Math.ceil(total / safeLimit);
  const start = (safePage - 1) * safeLimit;

  return {
    data: rows.slice(start, start + safeLimit),
    meta: {
      page: safePage,
      limit: safeLimit,
      total,
      pages
    }
  };
}

module.exports = {
  validateQuery,
  applyFilters,
  applySort,
  selectFields,
  paginate,
  assertColumnExists
};
