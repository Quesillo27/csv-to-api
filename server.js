const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || '10') * 1024 * 1024;

// In-memory store: datasetId -> { headers, rows, createdAt, filename }
const datasets = new Map();

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const id = crypto.randomBytes(8).toString('hex');
    cb(null, `${id}_${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se aceptan archivos CSV'));
    }
  }
});

app.use(express.json());

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

function applyFilters(rows, query) {
  let result = [...rows];

  // Field-level filters: ?field=value or ?field__contains=value or ?field__gt=value
  for (const [key, val] of Object.entries(query)) {
    if (['page', 'limit', 'sort', 'order', 'fields'].includes(key)) continue;

    if (key.includes('__')) {
      const [field, op] = key.split('__');
      result = result.filter(row => {
        const cell = String(row[field] ?? '');
        const v = String(val);
        switch (op) {
          case 'contains': return cell.toLowerCase().includes(v.toLowerCase());
          case 'startswith': return cell.toLowerCase().startsWith(v.toLowerCase());
          case 'endswith': return cell.toLowerCase().endsWith(v.toLowerCase());
          case 'gt': return parseFloat(cell) > parseFloat(v);
          case 'gte': return parseFloat(cell) >= parseFloat(v);
          case 'lt': return parseFloat(cell) < parseFloat(v);
          case 'lte': return parseFloat(cell) <= parseFloat(v);
          case 'ne': return cell !== v;
          default: return cell === v;
        }
      });
    } else {
      result = result.filter(row => String(row[key] ?? '') === String(val));
    }
  }

  return result;
}

function applySort(rows, sortField, order = 'asc') {
  if (!sortField) return rows;
  return [...rows].sort((a, b) => {
    const aVal = a[sortField] ?? '';
    const bVal = b[sortField] ?? '';
    const aNum = parseFloat(aVal);
    const bNum = parseFloat(bVal);
    const numeric = !isNaN(aNum) && !isNaN(bNum);
    const cmp = numeric ? aNum - bNum : String(aVal).localeCompare(String(bVal));
    return order === 'desc' ? -cmp : cmp;
  });
}

function paginate(rows, page, limit) {
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.min(1000, Math.max(1, parseInt(limit) || 20));
  const total = rows.length;
  const pages = Math.ceil(total / l);
  const start = (p - 1) * l;
  const data = rows.slice(start, start + l);
  return { data, meta: { page: p, limit: l, total, pages } };
}

function selectFields(rows, fields) {
  if (!fields) return rows;
  const cols = fields.split(',').map(f => f.trim());
  return rows.map(row => {
    const r = {};
    cols.forEach(c => { if (c in row) r[c] = row[c]; });
    return r;
  });
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', datasets: datasets.size }));

// List datasets
app.get('/datasets', (req, res) => {
  const list = [];
  for (const [id, ds] of datasets.entries()) {
    list.push({
      id,
      filename: ds.filename,
      rows: ds.rows.length,
      columns: ds.headers,
      createdAt: ds.createdAt
    });
  }
  res.json({ datasets: list });
});

// Upload CSV and create dataset
app.post('/datasets', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Se requiere un archivo CSV (campo: file)' });
  }

  try {
    const content = fs.readFileSync(req.file.path, 'utf8');
    const rows = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true
    });

    if (rows.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'El CSV está vacío o no tiene datos' });
    }

    const id = generateId();
    const headers = Object.keys(rows[0]);
    datasets.set(id, {
      filename: req.file.originalname,
      headers,
      rows,
      createdAt: new Date().toISOString(),
      filePath: req.file.path
    });

    echo(`[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Dataset ${id} cargado: ${rows.length} filas`);

    res.status(201).json({
      id,
      filename: req.file.originalname,
      rows: rows.length,
      columns: headers,
      api: {
        list: `GET /datasets/${id}/data`,
        get: `GET /datasets/${id}/data/:index`,
        stats: `GET /datasets/${id}/stats`
      }
    });
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(422).json({ error: `Error al parsear CSV: ${err.message}` });
  }
});

// Upload CSV from URL or inline text
app.post('/datasets/inline', express.text({ type: '*/*', limit: '10mb' }), (req, res) => {
  const csvText = req.body;
  if (!csvText || typeof csvText !== 'string') {
    return res.status(400).json({ error: 'Se requiere CSV como body text/plain' });
  }

  try {
    const rows = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true
    });

    if (rows.length === 0) {
      return res.status(400).json({ error: 'El CSV está vacío o no tiene datos' });
    }

    const id = generateId();
    const headers = Object.keys(rows[0]);
    datasets.set(id, {
      filename: 'inline.csv',
      headers,
      rows,
      createdAt: new Date().toISOString()
    });

    res.status(201).json({
      id,
      rows: rows.length,
      columns: headers,
      api: {
        list: `GET /datasets/${id}/data`,
        get: `GET /datasets/${id}/data/:index`,
        stats: `GET /datasets/${id}/stats`
      }
    });
  } catch (err) {
    res.status(422).json({ error: `Error al parsear CSV: ${err.message}` });
  }
});

// Get dataset info
app.get('/datasets/:id', (req, res) => {
  const ds = datasets.get(req.params.id);
  if (!ds) return res.status(404).json({ error: 'Dataset no encontrado' });
  res.json({
    id: req.params.id,
    filename: ds.filename,
    rows: ds.rows.length,
    columns: ds.headers,
    createdAt: ds.createdAt
  });
});

// Query data with filters, sort, pagination, field selection
app.get('/datasets/:id/data', (req, res) => {
  const ds = datasets.get(req.params.id);
  if (!ds) return res.status(404).json({ error: 'Dataset no encontrado' });

  try {
    let rows = applyFilters(ds.rows, req.query);
    rows = applySort(rows, req.query.sort, req.query.order);
    rows = selectFields(rows, req.query.fields);
    const result = paginate(rows, req.query.page, req.query.limit);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get single row by index
app.get('/datasets/:id/data/:index', (req, res) => {
  const ds = datasets.get(req.params.id);
  if (!ds) return res.status(404).json({ error: 'Dataset no encontrado' });

  const idx = parseInt(req.params.index);
  if (isNaN(idx) || idx < 0 || idx >= ds.rows.length) {
    return res.status(404).json({ error: `Índice ${idx} fuera de rango (0-${ds.rows.length - 1})` });
  }
  res.json({ index: idx, data: ds.rows[idx] });
});

// Column statistics
app.get('/datasets/:id/stats', (req, res) => {
  const ds = datasets.get(req.params.id);
  if (!ds) return res.status(404).json({ error: 'Dataset no encontrado' });

  const stats = {};
  for (const col of ds.headers) {
    const values = ds.rows.map(r => r[col]).filter(v => v !== '' && v != null);
    const nums = values.map(Number).filter(n => !isNaN(n));
    const unique = new Set(values).size;
    const nullCount = ds.rows.length - values.length;

    stats[col] = { count: values.length, unique, nullCount };

    if (nums.length > 0) {
      const sorted = [...nums].sort((a, b) => a - b);
      const sum = nums.reduce((a, b) => a + b, 0);
      stats[col].type = 'numeric';
      stats[col].min = sorted[0];
      stats[col].max = sorted[sorted.length - 1];
      stats[col].mean = parseFloat((sum / nums.length).toFixed(4));
      stats[col].median = sorted[Math.floor(sorted.length / 2)];
    } else {
      stats[col].type = 'string';
      // Top 5 values by frequency
      const freq = {};
      values.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
      stats[col].topValues = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([value, count]) => ({ value, count }));
    }
  }

  res.json({ id: req.params.id, rows: ds.rows.length, columns: ds.headers.length, stats });
});

// Delete dataset
app.delete('/datasets/:id', (req, res) => {
  const ds = datasets.get(req.params.id);
  if (!ds) return res.status(404).json({ error: 'Dataset no encontrado' });

  if (ds.filePath && fs.existsSync(ds.filePath)) {
    fs.unlinkSync(ds.filePath);
  }
  datasets.delete(req.params.id);
  res.json({ deleted: true, id: req.params.id });
});

// Error handler
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `Archivo muy grande. Máximo: ${process.env.MAX_FILE_SIZE_MB || 10}MB` });
  }
  res.status(400).json({ error: err.message });
});

// Remove undefined echo call — was placeholder, use console.log
function echo(msg) {
  console.log(msg);
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`csv-to-api corriendo en http://localhost:${PORT}`);
    console.log(`Health: http://localhost:${PORT}/health`);
  });
}

module.exports = app;
