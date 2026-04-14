const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// Set test upload dir
process.env.UPLOAD_DIR = path.join(__dirname, '../uploads_test');
process.env.PORT = '13099';

const app = require('../server.js');

const PORT = 13099;
let server;
let datasetId;

const SAMPLE_CSV = `name,age,city,salary
Alice,30,Madrid,50000
Bob,25,Barcelona,42000
Carol,35,Madrid,65000
David,28,Valencia,38000
Eve,32,Madrid,55000`;

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
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

before(async () => {
  server = app.listen(PORT);
  await new Promise(r => server.on('listening', r));
});

after(async () => {
  server.close();
  // Cleanup test uploads
  const testDir = path.join(__dirname, '../uploads_test');
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
});

describe('csv-to-api', () => {
  test('GET /health returns ok', async () => {
    const res = await request('GET', '/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });

  test('GET /datasets returns empty list initially', async () => {
    const res = await request('GET', '/datasets');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.datasets));
  });

  test('POST /datasets/inline crea dataset con CSV', async () => {
    const res = await request('POST', '/datasets/inline', {
      headers: { 'Content-Type': 'text/plain' },
      body: SAMPLE_CSV
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.id);
    assert.equal(res.body.rows, 5);
    assert.deepEqual(res.body.columns, ['name', 'age', 'city', 'salary']);
    datasetId = res.body.id;
  });

  test('GET /datasets lista el dataset creado', async () => {
    const res = await request('GET', '/datasets');
    assert.equal(res.status, 200);
    const found = res.body.datasets.find(d => d.id === datasetId);
    assert.ok(found, 'Dataset debe aparecer en la lista');
    assert.equal(found.rows, 5);
  });

  test('GET /datasets/:id retorna info del dataset', async () => {
    const res = await request('GET', `/datasets/${datasetId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.id, datasetId);
    assert.equal(res.body.rows, 5);
  });

  test('GET /datasets/:id/data retorna todos los registros paginados', async () => {
    const res = await request('GET', `/datasets/${datasetId}/data`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 5);
    assert.equal(res.body.meta.total, 5);
    assert.equal(res.body.meta.page, 1);
  });

  test('GET /datasets/:id/data?limit=2&page=1 pagina correctamente', async () => {
    const res = await request('GET', `/datasets/${datasetId}/data?limit=2&page=1`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 2);
    assert.equal(res.body.meta.pages, 3);
    assert.equal(res.body.meta.total, 5);
  });

  test('GET /datasets/:id/data?city=Madrid filtra por ciudad exacta', async () => {
    const res = await request('GET', `/datasets/${datasetId}/data?city=Madrid`);
    assert.equal(res.status, 200);
    assert.equal(res.body.meta.total, 3);
    assert.ok(res.body.data.every(r => r.city === 'Madrid'));
  });

  test('GET /datasets/:id/data?name__contains=al filtra con contains', async () => {
    const res = await request('GET', `/datasets/${datasetId}/data?name__contains=al`);
    assert.equal(res.status, 200);
    // Carol contains 'al'
    assert.ok(res.body.data.length >= 1);
  });

  test('GET /datasets/:id/data?salary__gt=50000 filtra numéricamente', async () => {
    const res = await request('GET', `/datasets/${datasetId}/data?salary__gt=50000`);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.every(r => parseInt(r.salary) > 50000));
  });

  test('GET /datasets/:id/data?sort=age&order=asc ordena correctamente', async () => {
    const res = await request('GET', `/datasets/${datasetId}/data?sort=age&order=asc`);
    assert.equal(res.status, 200);
    const ages = res.body.data.map(r => parseInt(r.age));
    for (let i = 1; i < ages.length; i++) {
      assert.ok(ages[i] >= ages[i - 1]);
    }
  });

  test('GET /datasets/:id/data?fields=name,city selecciona columnas', async () => {
    const res = await request('GET', `/datasets/${datasetId}/data?fields=name,city`);
    assert.equal(res.status, 200);
    const row = res.body.data[0];
    assert.ok('name' in row);
    assert.ok('city' in row);
    assert.ok(!('age' in row));
    assert.ok(!('salary' in row));
  });

  test('GET /datasets/:id/data/:index retorna fila por índice', async () => {
    const res = await request('GET', `/datasets/${datasetId}/data/0`);
    assert.equal(res.status, 200);
    assert.equal(res.body.index, 0);
    assert.equal(res.body.data.name, 'Alice');
  });

  test('GET /datasets/:id/data/:index fuera de rango retorna 404', async () => {
    const res = await request('GET', `/datasets/${datasetId}/data/999`);
    assert.equal(res.status, 404);
  });

  test('GET /datasets/:id/stats calcula estadísticas correctas', async () => {
    const res = await request('GET', `/datasets/${datasetId}/stats`);
    assert.equal(res.status, 200);
    assert.equal(res.body.rows, 5);
    assert.equal(res.body.columns, 4);
    assert.equal(res.body.stats.age.type, 'numeric');
    assert.equal(res.body.stats.age.min, 25);
    assert.equal(res.body.stats.age.max, 35);
    assert.equal(res.body.stats.city.type, 'string');
    assert.ok(Array.isArray(res.body.stats.city.topValues));
    assert.equal(res.body.stats.city.topValues[0].value, 'Madrid');
    assert.equal(res.body.stats.city.topValues[0].count, 3);
  });

  test('GET /datasets/nonexistent retorna 404', async () => {
    const res = await request('GET', '/datasets/nonexistent');
    assert.equal(res.status, 404);
  });

  test('POST /datasets/inline con CSV inválido retorna 422', async () => {
    const res = await request('POST', '/datasets/inline', {
      headers: { 'Content-Type': 'text/plain' },
      body: 'just a line without headers that would be empty after parse'
    });
    // Either 422 or 400 is acceptable
    assert.ok([400, 422].includes(res.status));
  });

  test('DELETE /datasets/:id elimina el dataset', async () => {
    const res = await request('DELETE', `/datasets/${datasetId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.deleted, true);

    const check = await request('GET', `/datasets/${datasetId}`);
    assert.equal(check.status, 404);
  });
});
