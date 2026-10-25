-- =====================================================================
-- Sistema de Matrículas — Alphaville Clube
-- 1. Estrutura das tabelas
-- =====================================================================

-- Normaliza textos para comparação: minúsculas, sem acentos, espaços simples.
create or replace function public.normalizar(t text)
returns text language sql immutable parallel safe as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(t, '')),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'),
    '\s+', ' ', 'g'))
$$;

-- Padroniza Quadra/Lote: "q 03" -> "3", "Lote 12A" -> "12A".
create or replace function public.normalizar_ql(t text)
returns text language sql immutable parallel safe as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(upper(translate(coalesce(t, ''), 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')),
        'QUADRA|LOTE|\mQD\M|\mLT\M|^\s*Q|^\s*L', '', 'g'),
      '[^A-Z0-9]', '', 'g'),
    '^0+(?=\d)', '')
$$;

-- ---------------------------------------------------------------------
-- Configuração geral (linha única)
-- ---------------------------------------------------------------------
create table public.config (
  id                 boolean primary key default true check (id),
  periodo            text not null default '',
  inscricoes_abertas boolean not null default false,
  max_matriculas     int not null default 2 check (max_matriculas between 1 and 10),
  idade_adulto       int not null default 16,
  lgpd_versao        text not null default 'v0-rascunho',
  lgpd_texto         text not null default '',
  msg_chamamento     text not null default '',
  msg_desligamento   text not null default '',
  -- Quando a base de associados estiver disponível, ligar para exigir Quadra/Lote cadastrados.
  validar_associados boolean not null default false,
  atualizado_em      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Turmas
-- ---------------------------------------------------------------------
create table public.turmas (
  id                  uuid primary key default gen_random_uuid(),
  codigo              text not null unique,
  modalidade          text not null,
  nome                text not null,
  idade_min           int check (idade_min between 0 and 120),
  idade_max           int check (idade_max between 0 and 120),
  faixa_revisar       boolean not null default false,
  dias                text[] not null check (array_length(dias, 1) > 0 and dias <@ array['seg','ter','qua','qui','sex','sab','dom']),
  inicio              time not null,
  fim                 time not null,
  local               text not null default '',
  professor           text not null default '',
  local_compartilhado boolean not null default false,
  vagas               int not null default 0 check (vagas >= 0),
  ativa               boolean not null default true,
  obs                 text not null default '',
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  check (fim > inicio),
  check (idade_min is null or idade_max is null or idade_min <= idade_max)
);
create index on public.turmas (modalidade);

-- ---------------------------------------------------------------------
-- Associados (integração futura com a base de moradores)
-- ---------------------------------------------------------------------
create table public.associados (
  quadra        text not null,
  lote          text not null,
  titular_nome  text not null default '',
  ativo         boolean not null default true,
  importado_em  timestamptz not null default now(),
  primary key (quadra, lote)
);

-- ---------------------------------------------------------------------
-- Inscrições (uma linha por pessoa + turma)
-- ---------------------------------------------------------------------
create table public.inscricoes (
  id                  uuid primary key default gen_random_uuid(),
  protocolo           text not null,
  token               uuid not null,          -- permite ao titular consultar a situação pelo link do comprovante
  turma_id            uuid not null references public.turmas(id),
  status              text not null check (status in ('confirmada','espera','cancelada')),
  pessoa_key          text not null,          -- quadra|lote|nome normalizado|nascimento
  participante_nome   text not null,
  participante_nasc   date not null,
  idade_na_inscricao  int not null,
  tipo                text not null check (tipo in ('titular','dependente')),
  parentesco          text not null default '',
  titular_nome        text not null,
  quadra              text not null,
  lote                text not null,
  telefone            text not null,
  email               text not null,
  lgpd                jsonb not null,
  origem              text not null check (origem in ('online','balcao')),
  registrado_por      uuid,                   -- usuário da equipe, quando feito no balcão
  conferido           boolean not null default false,
  criado_em           timestamptz not null default clock_timestamp(),
  promovido_em        timestamptz,
  cancelado_em        timestamptz,
  motivo_cancelamento text,
  desligamento        jsonb
);
create index on public.inscricoes (turma_id, status, criado_em);
create index on public.inscricoes (pessoa_key);
create index on public.inscricoes (token);
create index on public.inscricoes (protocolo);

-- ---------------------------------------------------------------------
-- Chamadas
-- ---------------------------------------------------------------------
create table public.chamadas (
  id             uuid primary key default gen_random_uuid(),
  turma_id       uuid not null references public.turmas(id),
  data           date not null,
  obs            text not null default '',
  registrado_em  timestamptz not null default now(),
  registrado_por uuid,
  unique (turma_id, data)
);
create table public.presencas (
  chamada_id    uuid not null references public.chamadas(id) on delete cascade,
  inscricao_id  uuid not null references public.inscricoes(id),
  status        text not null check (status in ('P','F','J')),
  primary key (chamada_id, inscricao_id)
);
create index on public.presencas (inscricao_id);

-- ---------------------------------------------------------------------
-- Solicitações de desligamento por faltas
-- ---------------------------------------------------------------------
create table public.solicitacoes (
  id               uuid primary key default gen_random_uuid(),
  inscricao_id     uuid not null references public.inscricoes(id),
  status           text not null default 'pendente' check (status in ('pendente','aprovada','recusada','sem_efeito')),
  motivo           text not null,
  frequencia       jsonb not null default '{}',
  solicitado_em    timestamptz not null default now(),
  solicitado_por   uuid,
  decidido_em      timestamptz,
  decidido_por     uuid,
  nota_decisao     text not null default ''
);
create unique index solicitacao_pendente_unica on public.solicitacoes (inscricao_id) where status = 'pendente';

-- ---------------------------------------------------------------------
-- Mensagens aos titulares (fila de envio)
-- ---------------------------------------------------------------------
create table public.mensagens (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null check (tipo in ('chamamento','desligamento','comprovante')),
  inscricao_id   uuid references public.inscricoes(id),
  titular_nome   text not null,
  telefone       text not null default '',
  email          text not null default '',
  assunto        text not null default '',
  texto          text not null,
  motivo         text not null default '',
  status         text not null default 'pendente' check (status in ('pendente','enviada','erro')),
  erro           text,
  tentativas     int not null default 0,
  criado_em      timestamptz not null default now(),
  enviada_em     timestamptz,
  enviada_por    uuid            -- nulo quando o envio foi automático
);
create index on public.mensagens (status, criado_em);

-- ---------------------------------------------------------------------
-- Equipe e permissões
-- ---------------------------------------------------------------------
create table public.perfis (
  id          text primary key,
  nome        text not null unique,
  fixo        boolean not null default false,   -- perfil com acesso total (Coordenador)
  ordem       int not null default 9,
  permissoes  text[] not null default '{}'
);
create table public.equipe (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  nome           text not null,
  perfil_id      text not null references public.perfis(id),
  professor_nome text not null default '',      -- nome como aparece no cronograma (para a chamada)
  ativo          boolean not null default true,
  aprovado_em    timestamptz not null default now(),
  aprovado_por   uuid
);
create table public.pedidos_acesso (
  user_id        uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  nome           text not null,
  perfil_id      text not null references public.perfis(id),
  professor_nome text not null default '',
  pedido_em      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Gatilhos de atualização
-- ---------------------------------------------------------------------
create or replace function public.tg_atualizado_em() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;
create trigger turmas_atualizado before update on public.turmas for each row execute function public.tg_atualizado_em();
create trigger config_atualizado before update on public.config for each row execute function public.tg_atualizado_em();
