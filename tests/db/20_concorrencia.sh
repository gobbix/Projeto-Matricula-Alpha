#!/usr/bin/env bash
# Disputa pela última vaga: 30 inscrições simultâneas numa turma com 3 vagas (TST-04, criada pelos cenários).
# Esperado: exatamente 3 confirmadas e 27 na espera, com posições 1..27 sem repetição.
set -euo pipefail
DB=matricula_teste
TURMA=$(psql -d $DB -Atqc "select id from turmas where codigo='TST-04'")
for n in $(seq 1 30); do
  psql -d $DB -Atq -v ON_ERROR_STOP=1 -c "set role anon; select inscrever(jsonb_build_object(
    'titular', jsonb_build_object('nome','Titular $n Silva','quadra','$n','lote','1','telefone','11999990000','email','t$n@email.com'),
    'participantes', jsonb_build_array(jsonb_build_object('nome','Pessoa $n Silva','nascimento','1990-01-01','tipo','titular','turmas', jsonb_build_array('$TURMA'))),
    'lgpd', jsonb_build_object('aceito', true)))" >/dev/null &
done
wait
psql -d $DB -Atq -v ON_ERROR_STOP=1 <<SQL
do \$\$ declare conf int; esp int; pos int; begin
  select count(*) filter (where status='confirmada'), count(*) filter (where status='espera') into conf, esp from inscricoes where turma_id = '$TURMA';
  select count(distinct posicao_espera(id)) into pos from inscricoes where turma_id = '$TURMA' and status = 'espera';
  assert conf = 3, format('esperava 3 confirmadas, vieram %s', conf);
  assert esp = 27 and pos = 27, format('esperava 27 na espera com posições distintas, vieram %s / %s', esp, pos);
  raise notice 'OK  concorrência: 30 inscrições simultâneas em 3 vagas -> 3 confirmadas, 27 na espera, fila sem empates';
end \$\$;
SQL
