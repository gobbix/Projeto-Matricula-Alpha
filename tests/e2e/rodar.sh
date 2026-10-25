#!/usr/bin/env bash
# Teste de ponta a ponta do site do associado, sem Supabase:
# PostgreSQL local (migrações + seed) -> API de teste (tests/e2e/api-local.mjs) -> site Next.js -> Playwright.
# Uso: PGHOST=... PGPORT=... PGUSER=postgres tests/e2e/rodar.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
export PGDATABASE=matricula_e2e
P="psql -v ON_ERROR_STOP=1 -q"
$P -d postgres -c "drop database if exists $PGDATABASE" -c "create database $PGDATABASE" >/dev/null
for f in tests/db/00_supabase_shim.sql supabase/migrations/*.sql supabase/seed.sql; do $P -d $PGDATABASE -f "$f" >/dev/null; done
$P -d $PGDATABASE >/dev/null <<'SQL'
update config set inscricoes_abertas = true;
update turmas set vagas = 1 where codigo = 'NAT-01';
-- equipe de teste (a senha não é conferida pela API de teste)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'coord@clube.com.br'),
  ('00000000-0000-0000-0000-0000000000a1', 'prof@clube.com.br'),
  ('00000000-0000-0000-0000-0000000000b1', 'secretaria@clube.com.br');
insert into equipe (user_id, nome, email, perfil_id, professor_nome) values
  ('00000000-0000-0000-0000-0000000000c1', 'Coordenação Teste', 'coord@clube.com.br', 'coordenador', ''),
  ('00000000-0000-0000-0000-0000000000a1', 'Vinicius Professor', 'prof@clube.com.br', 'professor', 'Vinicius'),
  ('00000000-0000-0000-0000-0000000000b1', 'Secretaria Teste', 'secretaria@clube.com.br', 'secretaria', '');
SQL

# encerra servidores que tenham sobrado de uma execução anterior (os colchetes evitam que o pkill pegue a si mesmo)
encerrar() { pkill -f "[a]pi-local" 2>/dev/null || true; pkill -f "[n]ext start -p 3100" 2>/dev/null || true; pkill -f "[n]ext-server" 2>/dev/null || true; }
encerrar; sleep 1
mkdir -p tests/e2e/resultados
API_PORTA=54330 node tests/e2e/api-local.mjs > tests/e2e/resultados/api.log 2>&1 &
API=$!
export NEXT_PUBLIC_SUPABASE_URL=http://localhost:54330 NEXT_PUBLIC_SUPABASE_ANON_KEY=chave-de-teste
npx next build > tests/e2e/resultados/build.log 2>&1
npx next start -p 3100 > tests/e2e/resultados/site.log 2>&1 &
SITE=$!
trap 'kill $API $SITE 2>/dev/null; encerrar' EXIT
for _ in $(seq 1 60); do curl -sf http://localhost:3100 >/dev/null && break; sleep 1; done
npx playwright test "$@"
