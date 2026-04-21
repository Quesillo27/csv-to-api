# Architecture

## Estructura

- `server.js`: entry point minimo para arranque local y Docker.
- `src/app.js`: configuracion del servidor Express, seguridad y health.
- `src/routes/`: endpoints HTTP.
- `src/services/`: parseo CSV, estadisticas, filtros y paginacion.
- `src/store/`: almacenamiento en memoria de datasets activos.
- `src/utils/`: logger JSON, errores HTTP y respuestas uniformes.

## Decisiones

1. Se mantiene almacenamiento en memoria porque el objetivo del proyecto es exponer un CSV rapido sin base de datos.
2. Se agrego validacion explicita de columnas y operadores para evitar resultados silenciosamente incorrectos cuando el cliente consulta campos inexistentes.
3. `schema` y `distinct` complementan el dominio del proyecto: ayudan a inspeccionar datasets antes de construir filtros o dashboards.
4. `helmet`, `cors` con allowlist y `express-rate-limit` endurecen la API sin cambiar su flujo principal.

## Trade-offs

- Los datasets siguen siendo efimeros: al reiniciar el proceso se pierden.
- La inferencia de tipos es intencionalmente simple (`numeric` vs `string`) para mantener respuestas rapidas y predecibles.
