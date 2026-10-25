# Sistema de Matrículas — Alphaville Clube

Inscrição online nas atividades esportivas do clube, com controle de vagas e listas de espera, chamada dos professores, desligamento por faltas com aprovação da coordenação, mensagens aos titulares e permissões por perfil.

O protótipo navegável usado para validar as telas e regras está em claude.ai (artefato "Gestão de Turmas Alphaville"). Este repositório é a versão definitiva.

## Arquitetura

| Parte | Tecnologia | Situação |
|---|---|---|
| Banco de dados, regras e segurança | Supabase (PostgreSQL + RLS) | **pronto e testado** (`supabase/`) |
| Envio automático de e-mails | Supabase Edge Function + Resend | pronto (`supabase/functions/enviar-mensagens`) |
| Site do associado e painel da equipe | Next.js na Vercel | próximo passo |

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

## Testes

Precisam só de um PostgreSQL local (não usam o Supabase):

```bash
PGHOST=localhost PGPORT=5432 PGUSER=postgres tests/db/rodar.sh
```

Resultado esperado: 11 linhas `OK`, incluindo a disputa de 30 inscrições simultâneas por 3 vagas (3 confirmadas, 27 na espera, fila sem empates).

## Pendências do clube

- Vagas de cada turma e faixa etária das 19 turmas marcadas para revisão.
- Texto oficial do termo LGPD (hoje um rascunho em `config.lgpd_texto`).
- Modelo da planilha que o sistema do clube importa (para a exportação da secretaria).
- Domínio de e-mail do clube para o remetente.
- Decisão sobre prioridade de rematrícula.
