-- Cenários de teste das regras de negócio. Rodar depois do shim, das migrações e do seed.
-- Cada bloco "do" falha com uma mensagem clara se a regra não for respeitada.
\set ON_ERROR_STOP 1
\set QUIET 1

-- ---------- preparação (como administrador do banco) ----------
insert into auth.users values
  ('00000000-0000-0000-0000-00000000000c', 'coord@clube'),
  ('00000000-0000-0000-0000-00000000000a', 'sara@clube'),
  ('00000000-0000-0000-0000-00000000000b', 'secretaria@clube'),
  ('00000000-0000-0000-0000-00000000000d', 'novo@clube');
insert into equipe (user_id, nome, perfil_id, professor_nome) values
  ('00000000-0000-0000-0000-00000000000c', 'Coordenação', 'coordenador', ''),
  ('00000000-0000-0000-0000-00000000000a', 'Sara', 'professor', 'Sara'),
  ('00000000-0000-0000-0000-00000000000b', 'Secretaria', 'secretaria', '');
update turmas set vagas = 2 where codigo = 'NAT-01';            -- Natação Iniciação I, 5-6 anos, seg/qua 16:40
insert into turmas (codigo, modalidade, nome, idade_min, idade_max, dias, inicio, fim, local, professor, vagas) values
  ('TST-01', 'Teste', 'Conflita com NAT-01', 5, 6, '{seg}', '17:00', '17:30', 'Sala X', 'Vinicius', 5),
  ('TST-02', 'Teste', 'Terça manhã', 5, 6, '{ter}', '10:00', '10:30', 'Sala X', 'Vinicius', 5),
  ('TST-03', 'Teste', 'Quinta manhã', 5, 6, '{qui}', '10:00', '10:30', 'Sala X', 'Vinicius', 5),
  ('TST-04', 'Teste', 'Disputa da última vaga', 0, 99, '{sab}', '12:00', '13:00', 'Sala X', 'Vinicius', 3);

create temp table ids as select codigo, id from turmas;
grant select on ids to anon, authenticated;
create temp table r (k text primary key, v jsonb);
grant all on r to anon, authenticated;

create or replace function pg_temp.nasc(anos int) returns text language sql as $$
  select (hoje() - make_interval(years => anos) - interval '10 days')::date::text $$;
create or replace function pg_temp.payload(nome text, anos int, codigos text[]) returns jsonb language sql as $$
  select jsonb_build_object(
    'titular', jsonb_build_object('nome','Carlos Pereira','quadra','q 03','lote','12','telefone','(11) 99999-0000','email','carlos@email.com'),
    'participantes', jsonb_build_array(jsonb_build_object('nome', nome, 'nascimento', pg_temp.nasc(anos), 'tipo','dependente','parentesco','Filho(a)',
       'turmas', (select jsonb_agg(i.id order by array_position(codigos, i.codigo)) from ids i where i.codigo = any(codigos)))),
    'lgpd', jsonb_build_object('aceito', true, 'responsavel_legal', true)) $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- ---------- associado sem login ----------
set role anon;

do $$ begin
  perform inscrever(pg_temp.payload('Ana Pereira', 5, '{NAT-01}'));
  raise exception 'FALHOU: aceitou inscrição com as inscrições fechadas';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  assert sqlerrm like '%não estão abertas%', sqlerrm;
end $$;

reset role; update config set inscricoes_abertas = true; set role anon;

insert into r values ('ana',   inscrever(pg_temp.payload('Ana Pereira', 5, '{NAT-01}')));
insert into r values ('bia',   inscrever(pg_temp.payload('Bia Pereira', 6, '{NAT-01}')));
insert into r values ('caio',  inscrever(pg_temp.payload('Caio Pereira', 5, '{NAT-01}')));
insert into r values ('davi',  inscrever(pg_temp.payload('Davi Pereira', 8, '{NAT-01}')));
insert into r values ('ana2',  inscrever(pg_temp.payload('Ana Pereira', 5, '{TST-01,TST-02,TST-03,NAT-01}')));

do $$ declare x jsonb; begin
  x := (select v->'itens'->0 from r where k='ana');   assert x->>'status' = 'confirmada', 'Ana deveria estar confirmada: '||x;
  x := (select v->'itens'->0 from r where k='bia');   assert x->>'status' = 'confirmada', 'Bia deveria estar confirmada: '||x;
  x := (select v->'itens'->0 from r where k='caio');  assert x->>'status' = 'espera' and (x->>'posicao')::int = 1, 'Caio deveria ser 1º da espera: '||x;
  x := (select v->'itens'->0 from r where k='davi');  assert x->>'status' = 'recusada' and x->>'mensagem' like '%5 a 6 anos%', 'Davi (8 anos) deveria ser recusado pela idade: '||x;
  x := (select v->'itens' from r where k='ana2');
  assert x->0->>'status' = 'recusada' and x->0->>'mensagem' like 'Horário conflita%', 'TST-01 deveria conflitar com NAT-01: '||x;
  assert x->1->>'status' = 'confirmada', 'TST-02 deveria confirmar (2ª matrícula): '||x;
  assert x->2->>'status' = 'espera' and x->2->>'mensagem' like '%2 matrículas%', 'TST-03 deveria ir para a espera pelo limite de 2: '||x;
  assert x->3->>'status' = 'recusada' and x->3->>'mensagem' like 'Já existe%', 'NAT-01 repetida deveria ser recusada: '||x;
  raise notice 'OK  inscrição: vagas, lista de espera, idade, conflito de horário, limite de 2 e duplicidade';
end $$;

do $$ begin
  assert (select count(*) from inscricoes) = 0, 'anônimo não deveria ler inscrições';
  assert (select vagas_livres from turmas_publicas where codigo='NAT-01') = 0 and (select fila from turmas_publicas where codigo='NAT-01') = 1, 'catálogo público com ocupação errada';
  assert (select count(*) from consultar_inscricao((select (v->>'token')::uuid from r where k='ana2'))) = 2, 'consulta pelo token deveria trazer as 2 inscrições gravadas';
  raise notice 'OK  anônimo: não vê dados pessoais; vê vagas livres e fila; consulta o comprovante pelo token';
end $$;

do $$ begin
  update turmas set vagas = 99 where codigo = 'NAT-01';
  assert (select vagas from turmas where codigo='NAT-01') = 2, 'anônimo não deveria alterar turmas';
  raise notice 'OK  anônimo: não altera turmas';
end $$;
reset role;

-- ---------- professora Sara (vinculada a "Sara", não dá aula na NAT-01) ----------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select count(*) from inscricoes) = 0, 'professora não deveria ver alunos de turmas que não são dela';
  perform salvar_chamada((select id from ids where codigo='NAT-01'), hoje(), '[]', '');
  raise exception 'FALHOU: salvou chamada de turma de outro professor';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  assert sqlerrm like '%permissão%', sqlerrm;
  raise notice 'OK  professor: não vê nem faz chamada de turma de outro professor';
end $$;
reset role;
update equipe set professor_nome = 'Vinicius' where user_id = '00000000-0000-0000-0000-00000000000a';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ declare t uuid := (select id from ids where codigo='NAT-01'); ana uuid; bia uuid; begin
  assert (select count(*) from inscricoes where turma_id = t) = 2, 'professor deveria ver só os 2 confirmados da NAT-01 (não a espera)';
  select id into ana from inscricoes where turma_id = t and participante_nome = 'Ana Pereira';
  select id into bia from inscricoes where turma_id = t and participante_nome = 'Bia Pereira';
  begin
    perform salvar_chamada(t, hoje(), jsonb_build_array(jsonb_build_object('inscricao_id', ana, 'status', 'P')), '');
    raise exception 'FALHOU: salvou chamada sem marcar todos';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; assert sqlerrm like '%sem marcação%', sqlerrm; end;
  begin
    perform salvar_chamada(t, hoje() + 1, '[]', '');
    raise exception 'FALHOU: salvou chamada de aula futura';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; assert sqlerrm like '%ainda não aconteceu%', sqlerrm; end;
  -- três aulas com Bia faltando
  for d in 1..3 loop
    perform salvar_chamada(t, hoje() - d, jsonb_build_array(
      jsonb_build_object('inscricao_id', ana, 'status', 'P'), jsonb_build_object('inscricao_id', bia, 'status', 'F')), '');
  end loop;
  assert (select alerta from frequencia_turma(t) where inscricao_id = bia), 'Bia (3 faltas seguidas) deveria ter alerta';
  assert not (select alerta from frequencia_turma(t) where inscricao_id = ana), 'Ana (100%) não deveria ter alerta';
  perform solicitar_desligamento(bia, 'Excesso de faltas');
  begin
    perform solicitar_desligamento(bia, 'De novo');
    raise exception 'FALHOU: aceitou solicitação duplicada';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; assert sqlerrm like '%pendente%', sqlerrm; end;
  begin
    perform decidir_solicitacao((select id from solicitacoes limit 1), true, '');
    raise exception 'FALHOU: professor aprovou o próprio pedido';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; assert sqlerrm like '%permissão%', sqlerrm; end;
  update turmas set vagas = 50 where id = t;
  assert (select vagas from turmas where id = t) = 2, 'professor não deveria alterar vagas';
  assert (select count(*) from mensagens) = 0, 'professor não deveria ler mensagens';
  raise notice 'OK  chamada: exige todos marcados, bloqueia aula futura, calcula frequência e alerta';
  raise notice 'OK  professor: solicita desligamento (sem duplicar), não aprova, não altera turmas, não lê mensagens';
end $$;
reset role;

-- ---------- secretaria não aprova; coordenação aprova ----------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  perform decidir_solicitacao((select id from solicitacoes limit 1), true, '');
  raise exception 'FALHOU: secretaria aprovou desligamento';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if; assert sqlerrm like '%permissão%', sqlerrm;
  raise notice 'OK  secretaria: não aprova desligamento (padrão do perfil)';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ declare t uuid := (select id from ids where codigo='NAT-01'); chamados text; begin
  select string_agg(participante_nome, ',') into chamados from decidir_solicitacao((select id from solicitacoes limit 1), true, 'ok');
  assert chamados = 'Caio Pereira', 'Caio (1º da espera) deveria ser chamado; veio: '||coalesce(chamados,'ninguém');
  assert (select status from inscricoes where turma_id = t and participante_nome = 'Bia Pereira') = 'cancelada', 'Bia deveria estar cancelada';
  assert (select status from inscricoes where turma_id = t and participante_nome = 'Caio Pereira') = 'confirmada', 'Caio deveria estar confirmado';
  assert (select count(*) from mensagens where tipo = 'desligamento' and texto like '%Bia foi desligado(a) da turma Natação Iniciação I%') = 1, 'faltou a mensagem de desligamento';
  assert (select count(*) from mensagens where tipo = 'chamamento' and texto like 'Olá, Carlos!%Caio foi chamado(a)%') = 1, 'faltou a mensagem de chamamento';
  assert (select status from solicitacoes limit 1) = 'aprovada', 'solicitação deveria estar aprovada';
  raise notice 'OK  coordenação: aprova desligamento, chama o próximo da fila e gera as duas mensagens';
end $$;
reset role;

-- ---------- pedido de acesso ----------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
do $$ begin
  insert into pedidos_acesso (nome, perfil_id) values ('Novo Professor', 'professor');
  begin
    insert into equipe (user_id, nome, perfil_id) values (auth.uid(), 'Eu mesmo', 'coordenador');
    raise exception 'FALHOU: usuário se colocou na equipe como coordenador';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
  assert (select (minhas_permissoes()->>'membro')::boolean) = false, 'ainda não deveria ser membro';
  raise notice 'OK  equipe: pedido de acesso funciona e ninguém se autopromove';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select aprovar_pedido('00000000-0000-0000-0000-00000000000d', 'professor', 'Vinicius') \g /dev/null
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
do $$ begin
  assert (minhas_permissoes()->'permissoes') ? 'chamada.fazer', 'professor aprovado deveria poder fazer chamada';
  raise notice 'OK  equipe: coordenação aprova o pedido e o perfil passa a valer';
end $$;
reset role;
