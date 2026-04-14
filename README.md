# csv-to-api

![Node.js](https://img.shields.io/badge/Node.js-20+-green) ![Express](https://img.shields.io/badge/Express-4.x-blue) ![License](https://img.shields.io/badge/license-MIT-orange)

Convierte cualquier archivo CSV en una REST API al instante. Sube un CSV y obtén endpoints con filtros, ordenamiento, paginación y estadísticas — sin base de datos, sin configuración.

## Instalación en 3 comandos

```bash
git clone https://github.com/Quesillo27/csv-to-api
cd csv-to-api
npm install
```

## Uso

```bash
npm start   # inicia el servidor en puerto 3000
```

## Ejemplo

```bash
# 1. Subir un CSV inline
curl -s -X POST http://localhost:3000/datasets/inline \
  -H "Content-Type: text/plain" \
  --data-binary "nombre,edad,ciudad
Alice,30,Madrid
Bob,25,Barcelona
Carol,35,Madrid"

# → {"id":"a1b2c3d4","rows":3,"columns":["nombre","edad","ciudad"],...}

# 2. Consultar datos con filtros
curl "http://localhost:3000/datasets/a1b2c3d4/data?ciudad=Madrid&sort=edad&order=asc"
# → {"data":[{"nombre":"Alice",...},{"nombre":"Carol",...}],"meta":{"total":2,...}}

# 3. Ver estadísticas de columnas
curl "http://localhost:3000/datasets/a1b2c3d4/stats"
# → {"stats":{"edad":{"type":"numeric","min":25,"max":35,...},...}}
```

## API — Endpoints disponibles

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/health` | Estado del servicio |
| GET | `/datasets` | Listar todos los datasets cargados |
| POST | `/datasets` | Subir CSV como multipart/form-data (campo: `file`) |
| POST | `/datasets/inline` | Subir CSV como body text/plain |
| GET | `/datasets/:id` | Info del dataset (filas, columnas, fecha) |
| GET | `/datasets/:id/data` | Consultar datos con filtros/sort/paginación |
| GET | `/datasets/:id/data/:index` | Obtener fila por índice (0-based) |
| GET | `/datasets/:id/stats` | Estadísticas por columna (min/max/media/top valores) |
| DELETE | `/datasets/:id` | Eliminar dataset |

## Filtros disponibles en `/data`

| Parámetro | Ejemplo | Descripción |
|-----------|---------|-------------|
| `campo=valor` | `?ciudad=Madrid` | Igualdad exacta |
| `campo__contains=valor` | `?nombre__contains=ali` | Contiene (case-insensitive) |
| `campo__startswith=valor` | `?nombre__startswith=A` | Empieza con |
| `campo__endswith=valor` | `?nombre__endswith=a` | Termina con |
| `campo__gt=valor` | `?edad__gt=30` | Mayor que |
| `campo__gte=valor` | `?edad__gte=30` | Mayor o igual |
| `campo__lt=valor` | `?salario__lt=50000` | Menor que |
| `campo__lte=valor` | `?salario__lte=50000` | Menor o igual |
| `campo__ne=valor` | `?ciudad__ne=Madrid` | Distinto de |
| `sort=campo` | `?sort=edad` | Ordenar por campo |
| `order=asc\|desc` | `?order=desc` | Dirección de orden |
| `page=N` | `?page=2` | Página (default: 1) |
| `limit=N` | `?limit=20` | Registros por página (default: 20, max: 1000) |
| `fields=a,b` | `?fields=nombre,ciudad` | Seleccionar columnas específicas |

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `PORT` | `3000` | Puerto del servidor |
| `UPLOAD_DIR` | `./uploads` | Directorio para CSVs subidos por archivo |
| `MAX_FILE_SIZE_MB` | `10` | Tamaño máximo de archivo en MB |

## Docker

```bash
docker build -t csv-to-api .
docker run -p 3000:3000 csv-to-api
```

## Contribuir

PRs bienvenidos. Corre `npm test` antes de enviar.
