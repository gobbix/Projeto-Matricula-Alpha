-- =====================================================================
-- 2. Regras de negócio (funções chamadas pelo site)
--    Todas as operações que mexem em vagas rodam aqui, dentro do banco,
--    com trava por turma: duas pessoas nunca ficam com a mesma última vaga.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
create or replace function public.tem_permissao(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when pf.fixo then true else p = any(pf.permissoes) end
    from equipe e join perfis pf on pf.id = e.perfil_id
    where e.user_id = auth.uid() and e.ativo
  ), false)
$$;

-- Professor da turma: o nome vinculado na equipe aparece no campo "professor" (aceita "Diogo Aguiar / Sara").
create or replace function public.eh_professor_da_turma(p_turma uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from equipe e, turmas t
    where e.user_id = auth.uid() and e.ativo and t.id = p_turma and e.professor_nome <> ''
      and normalizar(e.professor_nome) = any (
        select normalizar(x) from unnest(string_to_array(t.professor, '/')) x)
  )
$$;

create or replace function public.pode_chamada(p_turma uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select tem_permissao('chamada.todas')
      or (tem_permissao('chamada.fazer') and eh_professor_da_turma(p_turma))
$$;

create or replace function public.exigir(p text) returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not tem_permissao(p) then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
create or replace function public.hoje() returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

create or replace function public.idade_em(nasc date, ref date default public.hoje())
returns int language sql stable as $$
  select extract(year from age(ref, nasc))::int
$$;

create or replace function public.turmas_conflitam(a public.turmas, b public.turmas)
returns boolean language sql immutable as $$
  select a.dias && b.dias and a.inicio < b.fim and b.inicio < a.fim
$$;

create or replace function public.dias_txt(d text[]) returns text language sql immutable as $$
  select string_agg(initcap(x), '/' order by array_position(array['seg','ter','qua','qui','sex','sab','dom'], x))
  from unnest(d) x
$$;

create or replace function public.faixa_txt(t public.turmas) returns text language sql immutable as $$
  select case
    when t.idade_min is null and t.idade_max is null then 'livre'
    when t.idade_max is null then t.idade_min || '+ anos'
    when t.idade_min is null then 'até ' || t.idade_max || ' anos'
    else t.idade_min || ' a ' || t.idade_max || ' anos' end
$$;

-- Posição na lista de espera (1 = próximo a ser chamado)
create or replace function public.posicao_espera(p_inscricao uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when i.status <> 'espera' then null else (
    select count(*)::int from inscricoes x
    where x.turma_id = i.turma_id and x.status = 'espera'
      and (x.criado_em, x.id) <= (i.criado_em, i.id)) end
  from inscricoes i where i.id = p_inscricao
$$;

-- ---------------------------------------------------------------------
-- Mensagens aos titulares
-- ---------------------------------------------------------------------
create or replace function public.criar_mensagem(p_inscricao uuid, p_tipo text, p_motivo text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  i inscricoes; t turmas; c config; tpl text; txt text; id_msg uuid;
begin
  select * into i from inscricoes where id = p_inscricao;
  select * into t from turmas where id = i.turma_id;
  select * into c from config;
  tpl := case p_tipo when 'desligamento' then c.msg_desligamento else c.msg_chamamento end;
  txt := tpl;
  txt := replace(txt, '{titular}', split_part(i.titular_nome, ' ', 1));
  txt := replace(txt, '{participante}', split_part(i.participante_nome, ' ', 1));
  txt := replace(txt, '{turma}', t.nome);
  txt := replace(txt, '{dias}', dias_txt(t.dias));
  txt := replace(txt, '{horario}', to_char(t.inicio, 'HH24:MI') || ' às ' || to_char(t.fim, 'HH24:MI'));
  txt := replace(txt, '{local}', t.local);
  txt := replace(txt, '{professor}', t.professor);
  txt := replace(txt, '{periodo}', c.periodo);
  insert into mensagens (tipo, inscricao_id, titular_nome, telefone, email, assunto, texto, motivo)
  values (p_tipo, i.id, i.titular_nome, i.telefone, i.email,
          case p_tipo when 'desligamento' then 'Desligamento da turma ' || t.nome
                      else 'Vaga liberada: ' || t.nome end || ' — Alphaville Clube',
          txt, coalesce(p_motivo, ''))
  returning id into id_msg;
  return id_msg;
end $$;

-- ---------------------------------------------------------------------
-- Chamar a lista de espera: preenche vagas livres na ordem de chegada,
-- pulando quem já tem o máximo de matrículas confirmadas.
-- Uso interno (a turma já deve estar travada pelo chamador ou é travada aqui).
-- ---------------------------------------------------------------------
create or replace function public.promover(p_turma uuid, p_motivo text default '')
returns setof public.inscricoes language plpgsql security definer set search_path = public as $$
declare
  t turmas; c config; livres int; i inscricoes; conf int;
begin
  select * into t from turmas where id = p_turma for update;
  select * into c from config;
  livres := t.vagas - (select count(*) from inscricoes where turma_id = p_turma and status = 'confirmada');
  for i in
    select * from inscricoes where turma_id = p_turma and status = 'espera' order by criado_em, id
  loop
    exit when livres <= 0;
    select count(*) into conf from inscricoes where pessoa_key = i.pessoa_key and status = 'confirmada';
    continue when conf >= c.max_matriculas;
    update inscricoes set status = 'confirmada', promovido_em = now() where id = i.id returning * into i;
    perform criar_mensagem(i.id, 'chamamento', p_motivo);
    livres := livres - 1;
    return next i;
  end loop;
end $$;
revoke all on function public.promover(uuid, text) from public, anon, authenticated;

-- Botão "Chamar da lista de espera" (após aumentar vagas)
create or replace function public.chamar_lista_espera(p_turma uuid)
returns setof public.inscricoes language plpgsql security definer set search_path = public as $$
begin
  perform exigir('inscricoes.gerenciar');
  return query select * from promover(p_turma, 'aumento de vagas');
end $$;

-- ---------------------------------------------------------------------
-- INSCRIÇÃO (associado, sem login, ou equipe no balcão)
-- payload:
-- { "titular": {"nome","quadra","lote","telefone","email"},
--   "participantes": [{"nome","nascimento":"AAAA-MM-DD","tipo":"titular|dependente","parentesco","turmas":[uuid,...]}],
--   "lgpd": {"aceito":true,"responsavel_legal":true} }
-- ---------------------------------------------------------------------
create or replace function public.inscrever(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c config; tit jsonb := payload->'titular'; p jsonb; tid text;
  t turmas; v_quadra text; v_lote text; v_tel text; v_email text; v_nome_tit text;
  v_nasc date; v_idade int; v_chave text; conf_turma int; conf_pessoa int;
  outra turmas; v_status text; v_msg text; nova inscricoes;
  balcao boolean := tem_permissao('inscricoes.balcao');
  v_protocolo text := 'AV-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
  v_token uuid := gen_random_uuid();
  itens jsonb := '[]'; menor boolean := false;
begin
  select * into c from config;
  if not c.inscricoes_abertas and not balcao then
    raise exception 'As inscrições não estão abertas no momento.';
  end if;

  -- titular
  v_nome_tit := btrim(coalesce(tit->>'nome', ''));
  v_quadra := normalizar_ql(tit->>'quadra');
  v_lote := normalizar_ql(tit->>'lote');
  v_tel := regexp_replace(coalesce(tit->>'telefone', ''), '\D', '', 'g');
  v_email := lower(btrim(coalesce(tit->>'email', '')));
  if coalesce(array_length(string_to_array(normalizar(v_nome_tit), ' '), 1), 0) < 2 then
    raise exception 'Informe o nome completo do titular.';
  end if;
  if v_quadra = '' or v_lote = '' then raise exception 'Informe a quadra e o lote.'; end if;
  if length(v_tel) not between 10 and 11 then raise exception 'Informe um celular com DDD.'; end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'Informe um e-mail válido.'; end if;
  if c.validar_associados and not exists (select 1 from associados a where a.quadra = v_quadra and a.lote = v_lote and a.ativo) then
    raise exception 'Quadra % e lote % não constam como associados ativos. Procure a secretaria.', v_quadra, v_lote;
  end if;
  if coalesce((payload->'lgpd'->>'aceito')::boolean, false) is not true then
    raise exception 'É preciso aceitar o termo de tratamento de dados (LGPD).';
  end if;
  if jsonb_array_length(coalesce(payload->'participantes', '[]')) = 0 then
    raise exception 'Escolha pelo menos uma atividade.';
  end if;

  for p in select * from jsonb_array_elements(payload->'participantes') loop
    if coalesce(array_length(string_to_array(normalizar(p->>'nome'), ' '), 1), 0) < 2 then
      raise exception 'Informe o nome completo de cada participante.';
    end if;
    v_nasc := (p->>'nascimento')::date;
    if v_nasc is null or v_nasc > hoje() or v_nasc < date '1900-01-01' then
      raise exception 'Data de nascimento inválida para %.', p->>'nome';
    end if;
    v_idade := idade_em(v_nasc);
    if v_idade < 18 then menor := true; end if;
    if coalesce(p->>'tipo', '') not in ('titular', 'dependente') then raise exception 'Tipo de participante inválido.'; end if;
    v_chave := v_quadra || '|' || v_lote || '|' || normalizar(p->>'nome') || '|' || v_nasc::text;
    -- impede que a mesma pessoa seja processada em paralelo (dois envios ao mesmo tempo)
    perform pg_advisory_xact_lock(hashtext(v_chave));

    for tid in select * from jsonb_array_elements_text(coalesce(p->'turmas', '[]')) loop
      nova := null; v_msg := null;
      select * into t from turmas where id = tid::uuid for update;   -- trava a turma até o fim da transação
      if not found or not t.ativa then
        v_status := 'recusada'; v_msg := 'Turma indisponível.';
      elsif (t.idade_min is not null and v_idade < t.idade_min) or (t.idade_max is not null and v_idade > t.idade_max) then
        v_status := 'recusada'; v_msg := format('Turma para %s; %s tem %s anos.', faixa_txt(t), split_part(p->>'nome', ' ', 1), v_idade);
      elsif exists (select 1 from inscricoes x where x.pessoa_key = v_chave and x.turma_id = t.id and x.status <> 'cancelada') then
        v_status := 'recusada'; v_msg := 'Já existe inscrição nesta turma.';
      else
        select o.* into outra from inscricoes x join turmas o on o.id = x.turma_id
        where x.pessoa_key = v_chave and x.status <> 'cancelada' and turmas_conflitam(o, t) limit 1;
        if found then
          v_status := 'recusada'; v_msg := format('Horário conflita com %s (%s %s).', outra.nome, dias_txt(outra.dias), to_char(outra.inicio, 'HH24:MI'));
        end if;
      end if;

      if v_msg is null then
        select count(*) into conf_turma from inscricoes x where x.turma_id = t.id and x.status = 'confirmada';
        select count(*) into conf_pessoa from inscricoes x where x.pessoa_key = v_chave and x.status = 'confirmada';
        if conf_turma < t.vagas and conf_pessoa < c.max_matriculas then
          v_status := 'confirmada';
        else
          v_status := 'espera';
          if conf_turma < t.vagas then
            v_msg := format('Entrou na lista de espera porque já tem %s matrículas confirmadas.', c.max_matriculas);
          end if;
        end if;
        insert into inscricoes (protocolo, token, turma_id, status, pessoa_key, participante_nome, participante_nasc,
          idade_na_inscricao, tipo, parentesco, titular_nome, quadra, lote, telefone, email, lgpd, origem, registrado_por)
        values (v_protocolo, v_token, t.id, v_status, v_chave, btrim(p->>'nome'), v_nasc, v_idade, p->>'tipo',
          coalesce(p->>'parentesco', ''), v_nome_tit, v_quadra, v_lote, v_tel, v_email,
          jsonb_build_object('aceito', true, 'versao', c.lgpd_versao, 'em', now(),
                             'responsavel_legal', v_idade < 18 and coalesce((payload->'lgpd'->>'responsavel_legal')::boolean, false)),
          case when balcao and auth.uid() is not null then 'balcao' else 'online' end,
          case when balcao then auth.uid() end)
        returning * into nova;
      end if;

      itens := itens || jsonb_build_object(
        'participante', btrim(p->>'nome'), 'turma_id', tid, 'codigo', t.codigo, 'turma', t.nome,
        'detalhe', case when t.id is null then '' else dias_txt(t.dias) || ' ' || to_char(t.inicio, 'HH24:MI') || '–' || to_char(t.fim, 'HH24:MI') || ' · ' || t.local end,
        'status', v_status, 'mensagem', v_msg,
        'posicao', case when v_status = 'espera' then posicao_espera(nova.id) end);
    end loop;
  end loop;

  if menor and coalesce((payload->'lgpd'->>'responsavel_legal')::boolean, false) is not true then
    raise exception 'Confirme que você é o responsável legal dos menores de 18 anos.';
  end if;

  return jsonb_build_object('protocolo', v_protocolo, 'token', v_token, 'em', now(), 'itens', itens);
end $$;
grant execute on function public.inscrever(jsonb) to anon, authenticated;

-- Consulta pública do comprovante (pelo link com o token)
create or replace function public.consultar_inscricao(p_token uuid)
returns table (protocolo text, participante text, codigo text, turma text, detalhe text, status text, posicao int, criado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select i.protocolo, i.participante_nome, t.codigo, t.nome,
         dias_txt(t.dias) || ' ' || to_char(t.inicio, 'HH24:MI') || '–' || to_char(t.fim, 'HH24:MI') || ' · ' || t.local,
         i.status, posicao_espera(i.id), i.criado_em
  from inscricoes i join turmas t on t.id = i.turma_id
  where i.token = p_token
  order by i.participante_nome, t.codigo
$$;
grant execute on function public.consultar_inscricao(uuid) to anon, authenticated;

-- Catálogo público: turmas ativas com vagas livres e tamanho da fila (sem dados pessoais)
create or replace view public.turmas_publicas with (security_invoker = false) as
  select t.id, t.codigo, t.modalidade, t.nome, t.idade_min, t.idade_max, t.dias, t.inicio, t.fim, t.local, t.professor, t.vagas,
         greatest(t.vagas - count(i.*) filter (where i.status = 'confirmada'), 0)::int as vagas_livres,
         (count(i.*) filter (where i.status = 'confirmada'))::int as confirmadas,
         (count(i.*) filter (where i.status = 'espera'))::int as fila
  from turmas t left join inscricoes i on i.turma_id = t.id
  where t.ativa
  group by t.id;
grant select on public.turmas_publicas to anon, authenticated;

-- Ocupação de todas as turmas (inclusive inativas), para o painel da equipe. Só contagens, sem dados pessoais.
create or replace view public.ocupacao with (security_invoker = false) as
  select t.id as turma_id,
         (count(i.*) filter (where i.status = 'confirmada'))::int as confirmadas,
         (count(i.*) filter (where i.status = 'espera'))::int as espera
  from turmas t left join inscricoes i on i.turma_id = t.id
  group by t.id;
revoke all on public.ocupacao from anon;
grant select on public.ocupacao to authenticated;

-- Para o formulário: inscrições ativas da pessoa (evita escolher turma repetida ou com conflito)
create or replace function public.inscricoes_da_pessoa(p_quadra text, p_lote text, p_nome text, p_nasc date)
returns table (turma_id uuid, status text)
language sql stable security definer set search_path = public as $$
  select i.turma_id, i.status from inscricoes i
  where i.pessoa_key = normalizar_ql(p_quadra) || '|' || normalizar_ql(p_lote) || '|' || normalizar(p_nome) || '|' || p_nasc::text
    and i.status <> 'cancelada'
$$;
grant execute on function public.inscricoes_da_pessoa(text, text, text, date) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Gestão das inscrições
-- ---------------------------------------------------------------------
create or replace function public.cancelar_inscricao(p_inscricao uuid, p_motivo text default '')
returns setof public.inscricoes language plpgsql security definer set search_path = public as $$
declare i inscricoes;
begin
  perform exigir('inscricoes.gerenciar');
  select * into i from inscricoes where id = p_inscricao;
  if not found or i.status = 'cancelada' then raise exception 'Inscrição não encontrada ou já cancelada.'; end if;
  perform 1 from turmas where id = i.turma_id for update;
  update inscricoes set status = 'cancelada', cancelado_em = now(), motivo_cancelamento = nullif(p_motivo, '') where id = i.id;
  if i.status = 'confirmada' then
    return query select * from promover(i.turma_id, 'cancelamento de ' || i.participante_nome);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Chamada e frequência
-- ---------------------------------------------------------------------
-- p_presencas: [{"inscricao_id": uuid, "status": "P|F|J"}, ...]
create or replace function public.salvar_chamada(p_turma uuid, p_data date, p_presencas jsonb, p_obs text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; faltando int;
begin
  if not pode_chamada(p_turma) then raise exception 'Você não tem permissão para fazer a chamada desta turma.' using errcode = '42501'; end if;
  if p_data > hoje() then raise exception 'Esta aula ainda não aconteceu.'; end if;
  if exists (select 1 from jsonb_array_elements(p_presencas) x
             left join inscricoes i on i.id = (x->>'inscricao_id')::uuid
             where i.turma_id is distinct from p_turma or x->>'status' not in ('P','F','J')) then
    raise exception 'A chamada contém alunos de outra turma ou marcações inválidas.';
  end if;
  select count(*) into faltando from inscricoes i
  where i.turma_id = p_turma and i.status = 'confirmada'
    and not exists (select 1 from jsonb_array_elements(p_presencas) x where (x->>'inscricao_id')::uuid = i.id);
  if faltando > 0 then raise exception 'Marque todos os alunos antes de salvar (% sem marcação).', faltando; end if;

  insert into chamadas (turma_id, data, obs, registrado_por) values (p_turma, p_data, coalesce(p_obs, ''), auth.uid())
  on conflict (turma_id, data) do update set obs = excluded.obs, registrado_em = now(), registrado_por = excluded.registrado_por
  returning id into v_id;
  delete from presencas where chamada_id = v_id;
  insert into presencas (chamada_id, inscricao_id, status)
  select v_id, (x->>'inscricao_id')::uuid, x->>'status' from jsonb_array_elements(p_presencas) x;
  return v_id;
end $$;

-- Frequência por aluno. Justificada não conta como falta.
-- Alerta: presença abaixo de 75% ou 3 faltas seguidas.
create or replace function public.frequencia_turma(p_turma uuid)
returns table (inscricao_id uuid, participante text, aulas int, faltas int, justificadas int, pct int, ultimas text[], alerta boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not (pode_chamada(p_turma) or tem_permissao('inscricoes.ver')) then
    raise exception 'Você não tem permissão para ver esta frequência.' using errcode = '42501';
  end if;
  return query
  with r as (
    select p.inscricao_id, p.status, c.data from presencas p join chamadas c on c.id = p.chamada_id where c.turma_id = p_turma
  ), a as (
    select r.inscricao_id, count(*)::int aulas,
           (count(*) filter (where r.status = 'F'))::int faltas,
           (count(*) filter (where r.status = 'J'))::int justificadas,
           (array_agg(r.status order by r.data desc))[1:3] ultimas
    from r group by r.inscricao_id
  )
  select a.inscricao_id, i.participante_nome, a.aulas, a.faltas, a.justificadas,
         round(100.0 * (a.aulas - a.faltas) / a.aulas)::int,
         a.ultimas,
         ((a.aulas - a.faltas)::numeric / a.aulas < 0.75) or (array_length(a.ultimas, 1) = 3 and a.ultimas = array['F','F','F'])
  from a join inscricoes i on i.id = a.inscricao_id
  order by i.participante_nome;
end $$;

-- ---------------------------------------------------------------------
-- Desligamento por faltas: professor solicita, coordenação aprova
-- ---------------------------------------------------------------------
create or replace function public.executar_desligamento(p_inscricao uuid, p_info jsonb)
returns setof public.inscricoes language plpgsql security definer set search_path = public as $$
declare i inscricoes;
begin
  select * into i from inscricoes where id = p_inscricao;
  perform 1 from turmas where id = i.turma_id for update;
  update inscricoes set status = 'cancelada', cancelado_em = now(), motivo_cancelamento = 'faltas',
    desligamento = p_info || jsonb_build_object('em', now(), 'aprovado_por', auth.uid())
  where id = i.id;
  perform criar_mensagem(i.id, 'desligamento');
  return query select * from promover(i.turma_id, 'desligamento de ' || i.participante_nome || ' por faltas');
end $$;
revoke all on function public.executar_desligamento(uuid, jsonb) from public, anon, authenticated;

create or replace function public.frequencia_aluno(p_inscricao uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select to_jsonb(f) - 'inscricao_id' - 'participante'
    from inscricoes i, frequencia_turma(i.turma_id) f where i.id = p_inscricao and f.inscricao_id = p_inscricao), '{}'::jsonb)
$$;
revoke all on function public.frequencia_aluno(uuid) from public, anon;

create or replace function public.solicitar_desligamento(p_inscricao uuid, p_motivo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare i inscricoes; v_id uuid;
begin
  select * into i from inscricoes where id = p_inscricao;
  if not found or i.status <> 'confirmada' then raise exception 'O aluno não está matriculado nesta turma.'; end if;
  if not ((tem_permissao('desligamento.solicitar') and pode_chamada(i.turma_id)) or tem_permissao('desligamento.aprovar')) then
    raise exception 'Você não tem permissão para solicitar este desligamento.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo.'; end if;
  insert into solicitacoes (inscricao_id, motivo, frequencia, solicitado_por)
  values (i.id, btrim(p_motivo), frequencia_aluno(i.id), auth.uid())
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Já existe uma solicitação pendente para este aluno.';
end $$;

create or replace function public.decidir_solicitacao(p_solicitacao uuid, p_aprovar boolean, p_nota text default '')
returns setof public.inscricoes language plpgsql security definer set search_path = public as $$
declare s solicitacoes; i inscricoes;
begin
  perform exigir('desligamento.aprovar');
  select * into s from solicitacoes where id = p_solicitacao for update;
  if not found or s.status <> 'pendente' then raise exception 'Solicitação não encontrada ou já decidida.'; end if;
  select * into i from inscricoes where id = s.inscricao_id;
  if not p_aprovar then
    update solicitacoes set status = 'recusada', decidido_em = now(), decidido_por = auth.uid(), nota_decisao = coalesce(p_nota, '') where id = s.id;
    return;
  end if;
  if i.status <> 'confirmada' then
    update solicitacoes set status = 'sem_efeito', decidido_em = now(), decidido_por = auth.uid(), nota_decisao = coalesce(p_nota, '') where id = s.id;
    return;
  end if;
  update solicitacoes set status = 'aprovada', decidido_em = now(), decidido_por = auth.uid(), nota_decisao = coalesce(p_nota, '') where id = s.id;
  return query select * from executar_desligamento(i.id,
    jsonb_build_object('motivo', s.motivo, 'frequencia', s.frequencia, 'solicitacao_id', s.id, 'solicitado_por', s.solicitado_por));
end $$;

create or replace function public.desligar_direto(p_inscricao uuid, p_motivo text)
returns setof public.inscricoes language plpgsql security definer set search_path = public as $$
declare i inscricoes;
begin
  perform exigir('desligamento.aprovar');
  select * into i from inscricoes where id = p_inscricao;
  if not found or i.status <> 'confirmada' then raise exception 'O aluno não está matriculado nesta turma.'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo.'; end if;
  return query select * from executar_desligamento(i.id, jsonb_build_object('motivo', btrim(p_motivo), 'frequencia', frequencia_aluno(i.id)));
end $$;

-- ---------------------------------------------------------------------
-- Equipe
-- ---------------------------------------------------------------------
create or replace function public.aprovar_pedido(p_user uuid, p_perfil text, p_professor text default '')
returns void language plpgsql security definer set search_path = public as $$
declare pd pedidos_acesso;
begin
  perform exigir('equipe.gerenciar');
  select * into pd from pedidos_acesso where user_id = p_user;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  insert into equipe (user_id, nome, email, perfil_id, professor_nome, aprovado_por)
  values (pd.user_id, pd.nome, pd.email, coalesce(p_perfil, pd.perfil_id), coalesce(p_professor, pd.professor_nome), auth.uid())
  on conflict (user_id) do update set perfil_id = excluded.perfil_id, professor_nome = excluded.professor_nome, ativo = true;
  delete from pedidos_acesso where user_id = p_user;
end $$;

-- O e-mail do pedido vem da conta, não do que a pessoa digita
create or replace function public.tg_pedido_email() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.email := coalesce((select email from auth.users where id = auth.uid()), '');
  return new;
end $$;
create trigger pedido_email before insert on public.pedidos_acesso for each row execute function public.tg_pedido_email();

-- O que o usuário logado pode fazer (para o site montar o menu)
create or replace function public.minhas_permissoes()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'membro', e.user_id is not null,
    'nome', e.nome, 'perfil', pf.nome, 'professor_nome', e.professor_nome,
    'permissoes', case when pf.fixo then (select array_agg(x) from unnest(array[
        'turmas.ver','turmas.editar','inscricoes.ver','inscricoes.gerenciar','inscricoes.balcao','config.periodo',
        'mensagens.enviar','chamada.fazer','chamada.todas','desligamento.solicitar','desligamento.aprovar','equipe.gerenciar']) x)
      else coalesce(pf.permissoes, '{}') end)
  from (select auth.uid() uid) u
  left join equipe e on e.user_id = u.uid and e.ativo
  left join perfis pf on pf.id = e.perfil_id
$$;
