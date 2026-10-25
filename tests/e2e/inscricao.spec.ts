import { expect, test, type Page } from "@playwright/test";

// Data de nascimento (DD/MM/AAAA) para alguém com `anos` completos hoje
function nasc(anos: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - anos);
  d.setDate(d.getDate() - 10);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

async function preencherTitular(page: Page, nome: string, quadra: string, lote: string) {
  await page.getByLabel("Nome completo do titular").fill(nome);
  await page.getByLabel("Quadra").fill(quadra);
  await page.getByLabel("Lote").fill(lote);
  await page.getByLabel("Celular (WhatsApp)").fill("(11) 99999-0000");
  await page.getByLabel("E-mail").fill("familia@email.com");
}

test("família inscreve titular e dependente: vaga confirmada, lista de espera e comprovante", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Inscrição em atividades" })).toBeVisible();

  // 1. Titular, com validação e padronização de Quadra/Lote
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("Informe o nome completo do titular")).toBeVisible();
  await preencherTitular(page, "Carlos Pereira", "q 03", "Lote 12");
  await expect(page.getByText("Quadra 3 · Lote 12")).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();

  // 2. Participantes
  await expect(page.getByRole("heading", { name: "Quem vai fazer as atividades?" })).toBeVisible();
  const nascimentos = page.getByLabel("Nascimento");
  await nascimentos.first().pressSequentially(nasc(40).replace(/\//g, ""));
  await expect(nascimentos.first()).toHaveValue(nasc(40)); // máscara DD/MM/AAAA
  await expect(page.getByText("40 anos")).toBeVisible();
  await page.getByRole("button", { name: "+ Dependente" }).click();
  await page.getByLabel("Nome completo").nth(1).fill("Ana Pereira");
  await nascimentos.nth(1).fill(nasc(5));
  await page.getByLabel("Parentesco").selectOption("Filho(a)");
  await page.getByRole("button", { name: "Escolher atividades" }).click();

  // 3. Atividades: só aparecem turmas da idade de cada pessoa
  await expect(page.getByText("Aparecem somente as turmas permitidas para a idade de Carlos hoje (40 anos).")).toBeVisible();
  await expect(page.getByRole("button", { name: /Natação Iniciação I/ })).toHaveCount(0);
  await page.getByRole("button", { name: /Pilates.*Renata/ }).first().click(); // 0 vagas -> lista de espera
  await page.getByRole("button", { name: /^Ana · / }).click();
  await expect(page.getByText("(5 anos)").or(page.getByText("hoje (5 anos)"))).toBeVisible();
  const nat01 = page.getByRole("button", { name: /Natação Iniciação I.*16:40–17:20/ });
  await expect(nat01).toContainText("1 vaga");
  await nat01.click();
  await expect(page.getByText("Matrículas previstas: 1 de 2")).toBeVisible();
  await page.getByRole("button", { name: "Revisar e enviar" }).click();

  // 4. Termo e envio
  await page.getByRole("button", { name: "Enviar inscrição" }).click();
  await expect(page.getByText("é preciso aceitar o termo")).toBeVisible();
  await page.getByLabel("Li e concordo com o termo de tratamento de dados pessoais.").check();
  await page.getByLabel(/Declaro ser o responsável legal de Ana/).check();
  await page.getByRole("button", { name: "Enviar inscrição" }).click();

  // 5. Resultado
  await expect(page.locator(".proto")).toHaveText(/^AV-[0-9A-F]{6}$/);
  const ana = page.locator(".card", { has: page.getByRole("heading", { name: "Ana Pereira" }) });
  await expect(ana.getByText("Matrícula confirmada")).toBeVisible();
  const carlos = page.locator(".card", { has: page.getByRole("heading", { name: "Carlos Pereira" }) });
  await expect(carlos.getByText("Lista de espera · 1ª posição")).toBeVisible();
  await page.screenshot({ path: "tests/e2e/resultados/resultado.png", fullPage: true });

  // Comprovante pelo link
  await page.getByRole("link", { name: "Abrir comprovante" }).click();
  await expect(page.getByText("Comprovante de inscrição")).toBeVisible();
  await expect(page.locator(".card", { has: page.getByRole("heading", { name: "Ana Pereira" }) }).getByText("Matrícula confirmada")).toBeVisible();
});

test("outra família encontra a turma lotada e entra na lista de espera", async ({ page }) => {
  await page.goto("/");
  await preencherTitular(page, "Marina Souza", "7", "30");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Remover" }).click(); // só o dependente fará atividade
  await page.getByRole("button", { name: "+ Dependente" }).click();
  await page.getByLabel("Nome completo").fill("Leo Souza");
  await page.getByLabel("Nascimento").fill(nasc(6));
  await page.getByLabel("Parentesco").selectOption("Filho(a)");
  await page.getByRole("button", { name: "Escolher atividades" }).click();

  const nat01 = page.getByRole("button", { name: /Natação Iniciação I.*16:40–17:20/ });
  await expect(nat01).toContainText("Lista de espera");
  await nat01.click();
  await page.getByRole("button", { name: "Revisar e enviar" }).click();
  await page.getByLabel("Li e concordo com o termo de tratamento de dados pessoais.").check();
  await page.getByLabel(/Declaro ser o responsável legal de Leo/).check();
  await page.getByRole("button", { name: "Enviar inscrição" }).click();
  await expect(page.getByText("Lista de espera · 1ª posição")).toBeVisible();
});

test("celular: formulário cabe na tela sem rolagem lateral", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await preencherTitular(page, "Teste Celular", "1", "1");
  const larguras = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(larguras[0]).toBeLessThanOrEqual(larguras[1]);
  await page.screenshot({ path: "tests/e2e/resultados/celular.png", fullPage: true });
});
