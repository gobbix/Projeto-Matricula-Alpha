# Sistema de Matrículas — Alphaville Clube

Inscrição online nas atividades esportivas do clube, com controle de vagas e listas de espera, chamada dos professores, desligamento por faltas com aprovação da coordenação, mensagens aos titulares e permissões por perfil.

O protótipo navegável usado para validar as telas e regras está em claude.ai (artefato "Gestão de Turmas Alphaville"). Este repositório é a versão definitiva.

## Arquitetura

| Parte | Tecnologia | Situação |
|---|---|---|
| Banco de dados, regras e segurança | Supabase (PostgreSQL + RLS) | **pronto e testado** (`supabase/`) |
| Envio automático de e-mails | Supabase Edge Function + Resend | pronto (`supabase/functions/enviar-mensagens`) |
| Site do associado (inscrição e comprovante) | Next.js na Vercel | **pronto e testado** (`app/`, `components/`) |
| Painel da equipe (`/painel`) | Next.js na Vercel + Supabase Auth | **pronto e testado** (`app/painel/`, `components/painel/`) |

Toda regra que mexe em vagas roda **dentro do banco**, em funções com trava por turma. O site só chama essas funções; ele não decide quem fica com a vaga.

## Regras de negócio

- **Inscrição sem login.** O associado informa titular (nome, quadra, lote, celular, e-mail), participantes (titular e/ou dependentes) e turmas. Função `inscrever`.
- **Idade** conferida na data da inscrição, dentro da faixa da turma (limites inclusivos). Turmas "Adulto" = 16+.
- **Máximo de 2 matrículas confirmadas por pessoa** (`config.max_matriculas`). Listas de espera ilimitadas.
- **Sem conflito de horário** entre as turmas ativas da mesma pessoa (confirmadas ou na espera).
- **Vagas por ordem de chegada.** Sem vaga, entra na lista de espera com posição.
- **Aceite LGPD obrigatório**, com versão do termo e declaração de responsável legal para menores de 18.
- **Chamamento automático:** cancelamento, desligamento ou aumento de vagas chamam o próximo elegível da fila (quem já tem 2 matrículas é pulado) e geram a mensagem para o titular.
- **Chamada:** só alunos confirmados; exige todos marcados; não permite aula futura. Presente (P), Falta (F), Justificada (J, não conta como falta). Alerta com presença abaixo de 75% ou 3 faltas seguidas.
- **Desligamento por faltas:** o professor solicita (`solicitar_desligamento`), a coordenação aprova ou recusa (`decidir_solicitacao`). Ao aprovar, a matrícula é cancelada, o titular do aluno desligado recebe aviso e o próximo da fila é chamado.
- **Rematrícula com prioridade:** decisão pendente da diretoria; a estrutura permite incluir janelas de inscrição sem refazer as regras.

## Perfis e permissões

Perfis em `perfis`, pessoas em `equipe`, pedidos de acesso em `pedidos_acesso`. O perfil **Coordenador** tem acesso total e não pode ser alterado. Permissões disponíveis:

`turmas.ver` · `turmas.editar` · `inscricoes.ver` · `inscricoes.gerenciar` · `inscricoes.balcao` · `config.periodo` · `mensagens.enviar` · `chamada.fazer` · `chamada.todas` · `desligamento.solicitar` · `desligamento.aprovar` · `equipe.gerenciar`

Padrões: **Secretaria** vê turmas, vê e gerencia inscrições, atende no balcão e envia mensagens. **Professor** faz a chamada das próprias turmas (vínculo pelo nome no cronograma) e solicita desligamentos.

## Estrutura

```
app/
  page.tsx                         inscrição (formulário em 5 etapas)
  comprovante/[token]/page.tsx     comprovante com situação atualizada (link enviado ao titular)
components/inscricao/              etapas do formulário
app/painel/                        painel da equipe: turmas, inscrições, balcão, chamada, equipe
components/painel/                 login, pedido de acesso, formulário de turma, chamada, mensagens, solicitações
lib/regras.ts                      regras usadas no formulário (idade, conflito, limite) + testes
supabase/
  migrations/
    20261025000001_estrutura.sql   tabelas
    20261025000002_regras.sql      funções de negócio (inscrever, promover, chamada, desligamento, equipe)
    20261025000003_seguranca.sql   Row Level Security
  seed.sql                         configuração, perfis e as 98 turmas do cronograma 2026/1 (vagas = 0)
  functions/enviar-mensagens/      envio de e-mails pela fila "mensagens"
tests/db/
  rodar.sh                         roda migrações + cenários num PostgreSQL local
  10_cenarios.sql                  regras de inscrição, permissões, chamada, desligamento, equipe
  20_concorrencia.sh               30 inscrições simultâneas disputando 3 vagas
tests/e2e/
  rodar.sh                         banco local + API de teste + site + navegador (Playwright)
  inscricao.spec.ts                família inscrevendo titular e dependente, turma lotada, celular
  painel.spec.ts                   coordenação, professor, desligamento com aprovação, pedido de acesso
```

## Como colocar no ar

1. **Criar o projeto** em [supabase.com](https://supabase.com), na região **São Paulo (sa-east-1)**.
2. **Aplicar o banco** (com a [Supabase CLI](https://supabase.com/docs/guides/cli)):
   ```bash
   npx supabase login
   npx supabase link --project-ref <id-do-projeto>
   npx supabase db push            # aplica as migrações
   psql "<connection string>" -f supabase/seed.sql   # carrega configuração, perfis e turmas
   ```
3. **Primeiro coordenador.** Crie a conta no site (ou em Authentication > Users) e rode no SQL Editor:
   ```sql
   insert into equipe (user_id, nome, perfil_id)
   select id, 'Nome da pessoa', 'coordenador' from auth.users where email = 'email@do.coordenador';
   ```
   Depois disso, as outras pessoas pedem acesso pelo site e a coordenação aprova.
4. **E-mails automáticos.**
   - Crie uma conta no [Resend](https://resend.com) e verifique o domínio do clube (registros SPF/DKIM no DNS).
   - Publique a função e os segredos:
     ```bash
     npx supabase functions deploy enviar-mensagens
     npx supabase secrets set RESEND_API_KEY=... EMAIL_REMETENTE="Alphaville Clube <atividades@dominio>" WEBHOOK_SECRET=...
     ```
   - Em Database > Webhooks, crie um webhook em **INSERT** na tabela `mensagens` apontando para a função, com o cabeçalho `x-webhook-secret`.
   - Opcional: agende com pg_cron uma chamada a cada 10 minutos para reenviar as que falharam.

## Site do associado

```bash
cp .env.example .env.local      # preencher com a URL e a chave anon do projeto Supabase
npm install
npm run dev                     # http://localhost:3000
```

## Painel da equipe

Em `/painel`. Cada pessoa cria a conta (e-mail e senha), pede acesso e a coordenação aprova na seção **Equipe**. As seções aparecem conforme as permissões do perfil:

| Seção | O que faz | Permissão |
|---|---|---|
| Turmas | cadastro, vagas (uma a uma ou em lote), faixa etária, conflitos de horário, exportar | `turmas.ver` / `turmas.editar` |
| Inscrições | período e textos, solicitações de desligamento, mensagens aos titulares, lista com filtros, cancelar, conferir, chamar a lista de espera, exportar | `inscricoes.*`, `desligamento.aprovar`, `mensagens.enviar`, `config.periodo` |
| Balcão | inscrição presencial feita pela equipe (vale com as inscrições fechadas) | `inscricoes.balcao` |
| Chamada | turmas do dia, P/F/J, frequência, alerta de faltas, solicitar ou fazer desligamento | `chamada.fazer` / `chamada.todas` |
| Equipe | pedidos de acesso, membros, perfis e matriz de permissões | `equipe.gerenciar` |

No Supabase, em Authentication > Providers > Email, decida se a conta precisa confirmar o e-mail antes de entrar (recomendado).

Publicação na **Vercel**: importar o repositório, informar `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` em Environment Variables e publicar. As inscrições só aparecem quando `config.inscricoes_abertas = true`.

## Testes

Precisam só de um PostgreSQL local (não usam o Supabase):

```bash
PGHOST=localhost PGPORT=5432 PGUSER=postgres tests/db/rodar.sh
```

Resultado esperado: 11 linhas `OK`, incluindo a disputa de 30 inscrições simultâneas por 3 vagas (3 confirmadas, 27 na espera, fila sem empates).

Regras do formulário, site e painel completos no navegador:

```bash
npm test                                                        # regras do formulário (Vitest)
PGHOST=localhost PGPORT=5432 PGUSER=postgres npm run test:e2e   # site de ponta a ponta (Playwright)
```

O teste de ponta a ponta não usa o Supabase: `tests/e2e/api-local.mjs` imita as rotas da API que o site chama, sobre o PostgreSQL local, sempre como usuário anônimo.

## Pendências do clube

- Vagas de cada turma e faixa etária das 19 turmas marcadas para revisão.
- Texto oficial do termo LGPD (hoje um rascunho em `config.lgpd_texto`).
- Modelo da planilha que o sistema do clube importa (para a exportação da secretaria).
- Domínio de e-mail do clube para o remetente.
- Decisão sobre prioridade de rematrícula.
