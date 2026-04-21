# csv-to-api

![CI](https://github.com/Quesillo27/csv-to-api/actions/workflows/ci.yml/badge.svg) ![Node.js](https://img.shields.io/badge/Node.js-20+-green) ![License](https://img.shields.io/badge/license-MIT-orange)

Convierte archivos CSV en una REST API lista para explorar datos sin montar una base de datos. La revision 1.1.0 agrega validacion estricta de queries, respuestas uniformes, metrics reales de salud y endpoints de exploracion de esquema y valores distintos.

## Instalacion en 3 comandos

```bash
git clone https://github.com/Quesillo27/csv-to-api
cd csv-to-api
./setup.sh
```

## Uso rapido

```bash
make dev
```

```bash
# crear dataset inline
curl -s -X POST http://localhost:3000/datasets/inline \
  -H "Content-Type: text/plain" \
  --data-binary "name,age,city,salary
Alice,30,Madrid,50000
Bob,25,Barcelona,42000
Carol,35,Madrid,65000"

# explorar esquema
curl -s http://localhost:3000/datasets/<id>/schema

# listar valores distintos de una columna
curl -s "http://localhost:3000/datasets/<id>/distinct/city?search=mad"
```

## Variables de entorno

| Variable | Descripcion | Default | Obligatoria |
|----------|-------------|---------|-------------|
| `PORT` | Puerto HTTP del servicio | `3000` | No |
| `UPLOAD_DIR` | Directorio donde multer guarda CSVs subidos | `./uploads` | No |
| `MAX_FILE_SIZE_MB` | Tamano maximo por archivo CSV | `10` | No |
| `INLINE_CSV_LIMIT_MB` | Limite para `POST /datasets/inline` | `10` | No |
| `DEFAULT_PAGE_SIZE` | Tamano de pagina por defecto | `20` | No |
| `MAX_PAGE_SIZE` | Limite maximo de pagina | `1000` | No |
| `CORS_ORIGINS` | Lista separada por comas de origenes permitidos | `http://localhost:3000,http://127.0.0.1:3000` | No |
| `RATE_LIMIT_WINDOW_MS` | Ventana del rate limit | `900000` | No |
| `RATE_LIMIT_MAX_REQUESTS` | Requests maximos por IP y ventana | `300` | No |

## API

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/health` | Estado del servicio, version, datasets cargados y metrics |
| GET | `/datasets` | Lista datasets cargados en memoria |
| POST | `/datasets` | Sube CSV via `multipart/form-data` (`file`) |
| POST | `/datasets/inline` | Crea dataset enviando CSV como `text/plain` |
| GET | `/datasets/:id` | Metadata del dataset |
| GET | `/datasets/:id/schema` | Esquema inferido por columna |
| GET | `/datasets/:id/distinct/:field` | Valores distintos con conteo, search, limit y offset |
| GET | `/datasets/:id/data` | Consulta filas con filtros, sort, paginacion y seleccion de campos |
| GET | `/datasets/:id/data/:index` | Devuelve una fila por indice |
| GET | `/datasets/:id/stats` | Estadisticas numericas y categoricas por columna |
| DELETE | `/datasets/:id` | Elimina dataset y archivo temporal si existe |

## Filtros soportados en `/datasets/:id/data`

| Parametro | Ejemplo | Descripcion |
|-----------|---------|-------------|
| `campo=valor` | `?city=Madrid` | Igualdad exacta |
| `campo__contains=valor` | `?name__contains=ali` | Contiene sin distinguir mayusculas |
| `campo__startswith=valor` | `?name__startswith=A` | Prefijo |
| `campo__endswith=valor` | `?name__endswith=a` | Sufijo |
| `campo__gt=valor` | `?salary__gt=50000` | Mayor que |
| `campo__gte=valor` | `?age__gte=30` | Mayor o igual |
| `campo__lt=valor` | `?salary__lt=50000` | Menor que |
| `campo__lte=valor` | `?salary__lte=50000` | Menor o igual |
| `campo__ne=valor` | `?city__ne=Madrid` | Distinto |
| `sort=campo` | `?sort=age` | Ordena por columna valida |
| `order=asc\|desc` | `?order=desc` | Direccion de orden |
| `page=N` | `?page=2` | Numero de pagina |
| `limit=N` | `?limit=20` | Tamano de pagina |
| `fields=a,b` | `?fields=name,city` | Proyeccion de columnas |

## Docker

```bash
docker build -t csv-to-api .
docker run --rm -p 3000:3000 --env CORS_ORIGINS=http://localhost:3000 csv-to-api
```

## Calidad y DX

- `make dev`, `make test`, `make build`, `make docker`, `make lint`
- `./setup.sh` instala dependencias y prepara `.env`
- `npm test` ejecuta 29 pruebas de comportamiento real

## Roadmap

- Persistencia opcional en SQLite/PostgreSQL para datasets grandes o reinicios de proceso
- Cache de resultados para queries repetidas sobre datasets pesados
- Importacion remota segura desde URL firmadas o almacenamiento S3
