#!/usr/bin/env bash
set -euo pipefail

npm install

if [ ! -f .env ]; then
  cp .env.example .env
fi

mkdir -p uploads

printf 'Proyecto listo. Ejecuta: make dev\n'
