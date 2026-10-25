#!/usr/bin/env bash
# Roda as migrações e os cenários de teste num PostgreSQL local (não usa o Supabase).
# Uso: PGHOST=... PGPORT=... PGUSER=postgres tests/db/rodar.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
P="psql -v ON_ERROR_STOP=1 -q"
$P -d postgres -c "drop database if exists matricula_teste" -c "create database matricula_teste" >/dev/null
for f in tests/db/00_supabase_shim.sql supabase/migrations/*.sql supabase/seed.sql; do
  $P -d matricula_teste -f "$f" >/dev/null
done
$P -d matricula_teste -f tests/db/10_cenarios.sql 2>&1 | sed 's/^psql:[^ ]* //'
if [ -f tests/db/20_concorrencia.sh ]; then tests/db/20_concorrencia.sh; fi
