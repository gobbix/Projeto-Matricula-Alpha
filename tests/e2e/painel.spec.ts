import { expect, test, type Page } from "@playwright/test";

// Roda depois de inscricao.spec.ts, que deixa na NAT-01 (1 vaga): Ana Pereira confirmada e Leo Souza na lista de espera.
// Equipe criada pelo rodar.sh: coord@clube.com.br (Coordenador), prof@clube.com.br (Professor, vinculado a "Vinicius"), secretaria@clube.com.br.
test.describe.configure({ mode: "serial" });

async function entrar(page: Page, email: string) {
  await page.goto("/painel");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("senha-teste");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

// Últimas segundas e quartas até hoje (dias de aula da NAT-01), no formato do campo de data
function diasDeAula(qtd: number): string[] {
  const res: string[] = [];
  const d = new Date();
  while (res.length < qtd) {
    if ([1, 3].includes(d.getDay())) res.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    d.setDate(d.getDate() - 1);
  }
  return res.reverse();
}

test("coordenação: aumenta vagas, chama a lista de espera e a mensagem fica pronta", async ({ page }) => {
  await entrar(page, "coord@clube.com.br");
  await expect(page.getByRole("heading", { name: "Turmas", exact: true })).toBeVisible();
  for (const aba of ["Turmas", "Inscrições", "Balcão", "Chamada", "Equipe"]) await expect(page.getByRole("link", { name: aba, exact: true })).toBeVisible();
  await expect(page.locator(".stat", { hasText: "Turmas ativas" })).toContainText("98");

  await page.getByLabel("Buscar").fill("NAT-01");
  await page.getByRole("button", { name: "Mais uma vaga em NAT-01" }).click();
  await expect(page.getByLabel("Vagas de NAT-01")).toHaveValue("2");
  await page.waitForTimeout(1200); // gravação após a pausa
  await page.screenshot({ path: "tests/e2e/resultados/painel-turmas.png", fullPage: true });

  await page.getByRole("link", { name: "Inscrições", exact: true }).click();
  const filtroTurma = page.getByLabel("Turma", { exact: true });
  await filtroTurma.selectOption((await filtroTurma.locator("option", { hasText: "NAT-01" }).getAttribute("value"))!);
  await expect(page.getByText("1 vaga livre e 1 na lista de espera.")).toBeVisible();
  await page.getByRole("button", { name: "Chamar da lista de espera" }).click();
  await expect(page.getByText(/Leo Souza chamado\(a\) da lista de espera/)).toBeVisible();
  const msg = page.locator(".caixa", { hasText: "Para Marina Souza" });
  await expect(msg).toContainText("Chamamento");
  await expect(msg.getByRole("textbox")).toHaveValue(/Olá, Marina! .*Leo foi chamado\(a\) da lista de espera/);
  await expect(msg.getByRole("link", { name: "Abrir no WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/5511999990000\?text=/);
});

test("coordenação: cria uma turma nova com validação", async ({ page }) => {
  await entrar(page, "coord@clube.com.br");
  await page.getByRole("button", { name: "+ Nova turma" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: "Salvar turma" }).click();
  await expect(dlg.getByText("Informe a modalidade.")).toBeVisible();
  await dlg.getByLabel("Modalidade").fill("Xadrez");
  await dlg.getByLabel("Nome da turma").fill("Xadrez Infantil");
  await dlg.getByLabel("Faixa definida").check();
  await dlg.getByLabel("De", { exact: true }).fill("7");
  await dlg.getByLabel("até").fill("12");
  await dlg.getByLabel("Sáb").check();
  await dlg.getByLabel("Início").fill("10:00");
  await dlg.getByLabel("Término").fill("11:00");
  await dlg.getByLabel("Professor").fill("Marcos");
  await dlg.getByLabel("Vagas", { exact: true }).fill("12");
  await dlg.getByRole("button", { name: "Salvar turma" }).click();
  await expect(page.getByText("Turma XAD-01 criada.")).toBeVisible();
});

test("professor: faz chamadas e solicita desligamento por faltas", async ({ page }) => {
  await entrar(page, "prof@clube.com.br");
  await expect(page.getByRole("heading", { name: "Chamada", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Equipe" })).toHaveCount(0);
  await expect(page.getByLabel("Professor")).toBeDisabled();

  for (const dia of diasDeAula(3)) {
    await page.getByLabel("Data da aula").fill(dia);
    await page.getByRole("button", { name: /NAT-01/ }).click();
    await expect(page.getByText("Ana Pereira")).toBeVisible();
    await page.getByRole("button", { name: "Salvar chamada" }).click();
    await expect(page.getByText(/Marque todos os alunos antes de salvar/)).toBeVisible();
    await page.getByRole("button", { name: "Presente: Ana Pereira" }).click();
    await page.getByRole("button", { name: "Falta: Leo Souza" }).click();
    await page.getByRole("button", { name: "Salvar chamada" }).click();
    await expect(page.getByText("Chamada salva: 1 presentes, 1 faltas.")).toBeVisible();
    await page.getByRole("button", { name: "‹ Turmas do dia" }).click();
  }
  await page.getByRole("button", { name: /NAT-01/ }).click();
  const leo = page.locator(".aluno", { hasText: "Leo Souza" });
  await expect(leo.getByText("Atenção")).toBeVisible();
  await page.screenshot({ path: "tests/e2e/resultados/painel-chamada.png", fullPage: true });
  await leo.getByRole("button", { name: "Solicitar desligamento" }).click();
  await page.getByRole("button", { name: "Enviar solicitação" }).isDisabled();
  await page.getByLabel(/Confirmo que quero solicitar o desligamento de Leo/).check();
  await page.getByRole("button", { name: "Enviar solicitação" }).click();
  await expect(page.getByText("Solicitação enviada para a coordenação. Leo continua na turma até a aprovação.")).toBeVisible();
  await expect(leo.getByText("Desligamento solicitado")).toBeVisible();
});

test("coordenação: aprova o desligamento e as mensagens ficam prontas", async ({ page }) => {
  await entrar(page, "coord@clube.com.br");
  await page.getByRole("link", { name: "Inscrições", exact: true }).click();
  const sol = page.locator(".caixa", { hasText: "Aguardando aprovação" });
  await expect(sol).toContainText("Leo Souza");
  await expect(sol).toContainText("0% presença");
  await sol.getByRole("button", { name: "Aprovar desligamento" }).click();
  await sol.getByRole("button", { name: "Confirmar: desligar e chamar o próximo" }).click();
  await expect(page.getByText(/Leo Souza desligado\(a\)\./)).toBeVisible();
  await expect(page.locator(".caixa", { hasText: "Desligamento" }).getByRole("textbox")).toHaveValue(/Leo foi desligado\(a\) da turma Natação Iniciação I/);
});

test("pedido de acesso: nova pessoa pede, coordenação aprova e muda permissões", async ({ browser }) => {
  const novo = await browser.newPage();
  await novo.goto("/painel");
  await novo.getByRole("button", { name: "Criar conta" }).click();
  await novo.getByLabel("E-mail").fill("nova@clube.com.br");
  await novo.getByLabel("Senha").fill("senha-teste");
  await novo.getByRole("button", { name: "Criar conta" }).last().click();
  await novo.getByLabel("Seu nome completo").fill("Nova Secretária");
  await novo.getByLabel("Função no clube").selectOption({ label: "Secretaria" });
  await novo.getByRole("button", { name: "Enviar pedido" }).click();
  await expect(novo.getByText("Pedido de acesso enviado")).toBeVisible();

  const coord = await browser.newPage();
  await entrar(coord, "coord@clube.com.br");
  await coord.getByRole("link", { name: "Equipe", exact: true }).click();
  const pedido = coord.locator(".caixa", { hasText: "Nova Secretária" });
  await expect(pedido).toContainText("nova@clube.com.br");
  await pedido.getByRole("button", { name: "Aprovar acesso" }).click();
  await expect(coord.getByText("Nova Secretária agora faz parte da equipe como Secretaria.")).toBeVisible();
  await coord.getByLabel("Secretaria: Criar, editar e excluir turmas; definir vagas").check();
  await expect(coord.getByText("Permissões de Secretaria salvas.")).toBeVisible();

  await novo.reload();
  await expect(novo.getByRole("link", { name: "Turmas", exact: true })).toBeVisible();
  await expect(novo.getByRole("link", { name: "Equipe", exact: true })).toHaveCount(0);
  await expect(novo.getByRole("button", { name: "+ Nova turma" })).toBeVisible(); // permissão recém-liberada
});
