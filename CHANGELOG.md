# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-04-21

### Added
- Endpoints `GET /datasets/:id/schema` y `GET /datasets/:id/distinct/:field`.
- Health con version, timestamp y metrics de requests/errores/latencia.
- Seguridad base con `helmet`, `cors` con allowlist y rate limiting.
- CI con GitHub Actions, `.env.example`, `Makefile`, `setup.sh` y documentacion tecnica.

### Changed
- Refactor del servidor monolitico a `src/app.js`, rutas, servicios, store y utilidades.
- Respuestas estandarizadas a `{ success, data, error, message }`.
- Tests ampliados para cubrir happy path, validaciones y edge cases.

### Fixed
- Mediana correcta para columnas numericas con cantidad par de filas.
- Errores claros cuando el cliente consulta columnas, operadores o paginacion invalidos.
