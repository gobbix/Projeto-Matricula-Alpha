-- =====================================================================
-- 3. Segurança (Row Level Security)
--    O associado (sem login) só lê o catálogo e chama inscrever/consultar.
--    A equipe lê e altera conforme as permissões do seu perfil.
-- =====================================================================

alter table public.config         enable row level security;
alter table public.turmas         enable row level security;
alter table public.associados     enable row level security;
alter table public.inscricoes     enable row level security;
alter table public.chamadas       enable row level security;
alter table public.presencas      enable row level security;
alter table public.solicitacoes   enable row level security;
alter table public.mensagens      enable row level security;
alter table public.perfis         enable row level security;
alter table public.equipe         enable row level security;
alter table public.pedidos_acesso enable row level security;

-- Config: leitura pública (período, inscrições abertas, termo LGPD); edição por quem tem config.periodo
create policy config_ler on public.config for select using (true);
create policy config_editar on public.config for update to authenticated
  using (tem_permissao('config.periodo')) with check (tem_permissao('config.periodo'));

-- Turmas: catálogo público; edição com turmas.editar
create policy turmas_ler on public.turmas for select using (true);
create policy turmas_inserir on public.turmas for insert to authenticated with check (tem_permissao('turmas.editar'));
create policy turmas_alterar on public.turmas for update to authenticated
  using (tem_permissao('turmas.editar')) with check (tem_permissao('turmas.editar'));
create policy turmas_excluir on public.turmas for delete to authenticated
  using (tem_permissao('turmas.editar') and not exists (select 1 from inscricoes i where i.turma_id = turmas.id and i.status <> 'cancelada'));

-- Associados: só a equipe de inscrições
create policy associados_ler on public.associados for select to authenticated using (tem_permissao('inscricoes.gerenciar'));
create policy associados_editar on public.associados for all to authenticated
  using (tem_permissao('inscricoes.gerenciar')) with check (tem_permissao('inscricoes.gerenciar'));

-- Inscrições: criadas só pela função inscrever(); leitura por quem vê inscrições
-- ou pelo professor (alunos confirmados das suas turmas, para a chamada)
create policy inscricoes_ler on public.inscricoes for select to authenticated using (
  tem_permissao('inscricoes.ver')
  or tem_permissao('desligamento.aprovar')
  or (status = 'confirmada' and pode_chamada(turma_id)));
-- Única alteração direta permitida: marcar "conferido / lançado"
create policy inscricoes_conferir on public.inscricoes for update to authenticated
  using (tem_permissao('inscricoes.gerenciar')) with check (tem_permissao('inscricoes.gerenciar'));
revoke update on public.inscricoes from authenticated;
grant update (conferido) on public.inscricoes to authenticated;

-- Chamadas: leitura por quem faz a chamada da turma ou vê inscrições; gravação só via salvar_chamada()
create policy chamadas_ler on public.chamadas for select to authenticated
  using (pode_chamada(turma_id) or tem_permissao('inscricoes.ver'));
create policy presencas_ler on public.presencas for select to authenticated
  using (exists (select 1 from chamadas c where c.id = chamada_id and (pode_chamada(c.turma_id) or tem_permissao('inscricoes.ver'))));

-- Solicitações: quem aprova vê todas; quem pediu vê as suas. Criação/decisão via funções.
create policy solicitacoes_ler on public.solicitacoes for select to authenticated
  using (tem_permissao('desligamento.aprovar') or solicitado_por = auth.uid());

-- Mensagens: quem envia mensagens lê e marca como enviada (WhatsApp manual)
create policy mensagens_ler on public.mensagens for select to authenticated using (tem_permissao('mensagens.enviar'));
create policy mensagens_marcar on public.mensagens for update to authenticated
  using (tem_permissao('mensagens.enviar')) with check (tem_permissao('mensagens.enviar'));
revoke update on public.mensagens from authenticated;
grant update (status, enviada_em, enviada_por) on public.mensagens to authenticated;

-- Perfis: qualquer membro logado lê (para montar a tela); edição por equipe.gerenciar
create policy perfis_ler on public.perfis for select to authenticated using (true);
create policy perfis_editar on public.perfis for all to authenticated
  using (tem_permissao('equipe.gerenciar')) with check (tem_permissao('equipe.gerenciar'));
-- O perfil fixo (Coordenador) não pode ser alterado nem excluído pela tela
create policy perfis_fixo_protegido on public.perfis as restrictive for update to authenticated using (not fixo);
create policy perfis_fixo_nao_exclui on public.perfis as restrictive for delete to authenticated
  using (not fixo and not exists (select 1 from equipe e where e.perfil_id = perfis.id));

-- Equipe: cada um vê o próprio registro; quem gerencia vê e altera todos
create policy equipe_ler on public.equipe for select to authenticated
  using (user_id = auth.uid() or tem_permissao('equipe.gerenciar'));
create policy equipe_editar on public.equipe for all to authenticated
  using (tem_permissao('equipe.gerenciar')) with check (tem_permissao('equipe.gerenciar'));

-- Pedidos de acesso: cada pessoa cria/vê/cancela o seu; quem gerencia vê e recusa
create policy pedidos_proprio on public.pedidos_acesso for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy pedidos_gerenciar_ler on public.pedidos_acesso for select to authenticated using (tem_permissao('equipe.gerenciar'));
create policy pedidos_gerenciar_excluir on public.pedidos_acesso for delete to authenticated using (tem_permissao('equipe.gerenciar'));

-- Funções internas não podem ser chamadas pelo site
revoke all on function public.criar_mensagem(uuid, text, text) from public, anon, authenticated;
revoke all on function public.exigir(text) from public, anon;
