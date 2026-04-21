const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

process.env.UPLOAD_DIR = path.join(__dirname, '../uploads_test');
process.env.PORT = '13099';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.RATE_LIMIT_MAX_REQUESTS = '1000';

const { app, datasetStore } = require('../src/app');

const PORT = 13099;
let server;

const SAMPLE_CSV = `name,age,city,salary
Alice,30,Madrid,50000
Bob,25,Barcelona,42000
Carol,35,Madrid,65000
David,28,Valencia,38000
Eve,32,Madrid,55000`;

const EVEN_MEDIAN_CSV = `name,score
Ana,10
Beto,20
Carla,30
Diego,40`;

function request(method, urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: PORT,
      path: urlPath,
      method,
      headers: options.headers || {}
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, body, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function createInlineDataset(csvText = SAMPLE_CSV) {
  const response = await request('POST', '/datasets/inline', {
    headers: { 'Content-Type': 'text/plain' },
    body: csvText
  });

  assert.equal(response.status, 201);
  return response.body.data.id;
}

before(async () => {
  server = app.listen(PORT);
  await new Promise((resolve) => server.on('listening', resolve));
});

beforeEach(() => {
  datasetStore.clear();
});

after(async () => {
  server.close();
  const testDir = path.join(__dirname, '../uploads_test');
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

describe('csv-to-api', () => {
  test('GET /health expone version y metricas', async () => {
    const response = await request('GET', '/health');

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.status, 'ok');
    assert.match(response.body.data.version, /^1\./);
    assert.ok(typeof response.body.data.metrics.requests === 'number');
  });

  test('GET /datasets devuelve lista vacia al iniciar', async () => {
    const response = await request('GET', '/datasets');

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data.datasets, []);
  });

  test('POST /datasets/inline crea dataset y expone endpoints nuevos', async () => {
    const response = await request('POST', '/datasets/inline', {
      headers: { 'Content-Type': 'text/plain' },
      body: SAMPLE_CSV
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.ok(response.body.data.id);
    assert.equal(response.body.data.rows, 5);
    assert.equal(response.body.data.api.schema.includes('/schema'), true);
    assert.equal(response.body.data.api.distinct.includes('/distinct/'), true);
  });

  test('GET /datasets lista el dataset creado', async () => {
    const datasetId = await createInlineDataset();
    const response = await request('GET', '/datasets');

    assert.equal(response.status, 200);
    const found = response.body.data.datasets.find((dataset) => dataset.id === datasetId);
    assert.ok(found);
    assert.equal(found.rows, 5);
  });

  test('GET /datasets/:id retorna info del dataset', async () => {
    const datasetId = await createInlineDataset();
    const response = await request('GET', `/datasets/${datasetId}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.id, datasetId);
    assert.equal(response.body.data.rows, 5);
  });

  test('GET /datasets/:id/schema infiere tipos y nulabilidad', async () => {
    const datasetId = await createInlineDataset();
    const response = await request('GET', `/datasets/${datasetId}/schema`);

    assert.equal(response.status, 200);
    const ageColumn = response.body.data.columns.find((column) => column.name === 'age');
    assert.equal(ageColumn.type, 'numeric');
    assert.equal(ageColumn.nullable, false);
  });

  test('GET /datasets/:id/distinct/:field retorna valores agrupados', async () => {
    const datasetId = await createInlineDataset();
    const response = await request('GET', `/datasets/${datasetId}/distinct/city`);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.field, 'city');
    assert.equal(response.body.data.values[0].value, 'Madrid');
    assert.equal(response.body.data.values[0].count, 3);
  });

  test('GET /datasets/:id/distinct/:field soporta search y limit', async () => {
    const datasetId = await createInlineDataset();
    const response = await request('GET', `/datasets/${datasetId}/distinct/city?search=mad&limit=1`);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.total, 1);
    assert.equal(response.body.data.values.length, 1);
    assert.equal(response.body.data.values[0].value, 'Madrid');
  });

  test('GET /datasets/:id/data retorna todos los registros paginados', async () => {
    const datasetId = await createInlineDataset();
    const response = await request('GET', `/datasets/${datasetId}/data`);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.data.length, 5);
    assert.equal(response.body.data.meta.total, 5);
    assert.equal(response.body.data.meta.page, 1);
  });

  test('GET /datasets/:id/data pagina correctamente', async () => {
    const datasetId = await createInlineDataset();
    const response = await request('GET', `/datasets/${datasetId}/data?limit=2&page=1`);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.data.length, 2);
    assert.equal(response.body.data.meta.pages, 3);
    assert.equal(response.body.data.meta.total, 5);
  });

  test('GET /datasets/:id/data filtra por igualdad exacta', async () => {
    const datasetId = await createInlineDataset();
    const response = await request('GET', `/datasets/${datasetId}/data?city=Madrid`);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.meta.total, 3);
    assert.ok(response.body.data.data.every((row) => row.city === 'Madrid'));
  });

  test('GET /datasets/:id/data filtra con contains', async () => {
    const datasetId = await createInlineDataset();
    const response = await request('GET', `/datasets/${datasetId}/data?name__contains=al`);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.meta.total, 1);
    assert.deepEqual(response.body.data.data.map((row) => row.name), ['Alice']);
  });

  test('GET /datasets/:id/data filtra numericamente', async () => {
    const datasetId = await createInlineDataset();
    const response = await request('GET', `/datasets/${datasetId}/data?salary__gt=50000`);

    assert.equal(response.status, 200);
    assert.ok(response.body.data.data.every((row) => Number.parseInt(row.salary, 10) > 50000));
  });

  test('GET /datasets/:id/data ordena correctamente', async () => {
    const datasetId = await createInlineDataset();
    const response = await request('GET', `/datasets/${datasetId}/data?sort=age&order=asc`);

    assert.equal(response.status, 200);
    const ages = response.body.data.data.map((row) => Number.parseInt(row.age, 10));
    assert.deepEqual(ages, [25, 28, 30, 32, 35]);
  });

  test('GET /datasets/:id/data selecciona columnas', async () => {
    const datasetId = await createInlineDataset();
    const response = await request('GET', `/datasets/${datasetId}/data?fields=name,city`);

    assert.equal(response.status, 200);
    const row = response.body.data.data[0];
    assert.deepEqual(Object.keys(row), ['name', 'city']);
  });

  test('GET /datasets/:id/data rechaza sort con columnas invalidas', async () => {
    const datasetId = await createInlineDataset();
    const response = await request('GET', `/datasets/${datasetId}/data?sort=unknown`);

    assert.equal(response.status, 422);
    assert.equal(response.body.success, false);
    assert.match(response.body.message, /sort invalido/);
  });

  test('GET /datasets/:id/data rechaza operadores no soportados', async () => {
    const datasetId = await createInlineDataset();
    const response = await request('GET', `/datasets/${datasetId}/data?city__regex=Madrid`);

    assert.equal(response.status, 422);
    assert.match(response.body.message, /operador invalido/);
  });

  test('GET /datasets/:id/data rechaza fields invalidos', async () => {
    const datasetId = await createInlineDataset();
    const response = await request('GET', `/datasets/${datasetId}/data?fields=name,unknown`);

    assert.equal(response.status, 422);
    assert.match(response.body.message, /campo invalido/);
  });

  test('GET /datasets/:id/data rechaza page invalido', async () => {
    const datasetId = await createInlineDataset();
    const response = await request('GET', `/datasets/${datasetId}/data?page=0`);

    assert.equal(response.status, 422);
    assert.match(response.body.message, /page debe ser/);
  });

  test('GET /datasets/:id/data/:index retorna fila por indice', async () => {
    const datasetId = await createInlineDataset();
    const response = await request('GET', `/datasets/${datasetId}/data/0`);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.index, 0);
    assert.equal(response.body.data.data.name, 'Alice');
  });

  test('GET /datasets/:id/data/:index fuera de rango retorna 404', async () => {
    const datasetId = await createInlineDataset();
    const response = await request('GET', `/datasets/${datasetId}/data/999`);

    assert.equal(response.status, 404);
    assert.match(response.body.message, /fuera de rango/);
  });

  test('GET /datasets/:id/stats calcula mediana correcta con cantidad impar', async () => {
    const datasetId = await createInlineDataset();
    const response = await request('GET', `/datasets/${datasetId}/stats`);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.stats.age.type, 'numeric');
    assert.equal(response.body.data.stats.age.min, 25);
    assert.equal(response.body.data.stats.age.max, 35);
    assert.equal(response.body.data.stats.age.median, 30);
    assert.equal(response.body.data.stats.city.topValues[0].value, 'Madrid');
  });

  test('GET /datasets/:id/stats calcula mediana correcta con cantidad par', async () => {
    const datasetId = await createInlineDataset(EVEN_MEDIAN_CSV);
    const response = await request('GET', `/datasets/${datasetId}/stats`);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.stats.score.median, 25);
  });

  test('GET /datasets/nonexistent retorna 404', async () => {
    const response = await request('GET', '/datasets/nonexistent');

    assert.equal(response.status, 404);
    assert.equal(response.body.success, false);
  });

  test('GET /datasets/:id/distinct/:field rechaza columnas inexistentes', async () => {
    const datasetId = await createInlineDataset();
    const response = await request('GET', `/datasets/${datasetId}/distinct/unknown`);

    assert.equal(response.status, 422);
    assert.match(response.body.message, /campo invalido/);
  });

  test('POST /datasets/inline con body vacio retorna 400', async () => {
    const response = await request('POST', '/datasets/inline', {
      headers: { 'Content-Type': 'text/plain' },
      body: ''
    });

    assert.equal(response.status, 400);
    assert.match(response.body.message, /Se requiere CSV/);
  });

  test('POST /datasets/inline con CSV invalido retorna error controlado', async () => {
    const response = await request('POST', '/datasets/inline', {
      headers: { 'Content-Type': 'text/plain' },
      body: 'just a line without headers that would be empty after parse'
    });

    assert.equal(response.status, 400);
    assert.match(response.body.message, /vacio|datos/);
  });

  test('DELETE /datasets/:id elimina el dataset', async () => {
    const datasetId = await createInlineDataset();
    const response = await request('DELETE', `/datasets/${datasetId}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.deleted, true);

    const check = await request('GET', `/datasets/${datasetId}`);
    assert.equal(check.status, 404);
  });

  test('CORS bloquea origenes no permitidos', async () => {
    const response = await request('GET', '/health', {
      headers: { Origin: 'https://evil.example.com' }
    });

    assert.equal(response.status, 500);
    assert.match(response.body.message, /Origen no permitido/);
  });
});
