import { test, expect } from "@playwright/test";

/** Horário aleatório (passo de 1min, 09:00-18:59, 600 opções). */
function randomTime(): string {
  const slot = Math.floor(Math.random() * 600); // 0..599 -> 09:00..18:59
  const hour = 9 + Math.floor(slot / 60);
  const minute = slot % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Data bem no futuro (dentro de uma janela grande e aleatória) — a Agenda
 * Mestre/Minha Agenda aceitam ?date= na URL. "Hoje" acumula agendamentos de
 * toda execução anterior desta suíte (sem reset de DB entre runs), então
 * horário aleatório sozinho não basta pra evitar colisão; escapar pra uma
 * data distante praticamente elimina o problema. */
function farFutureDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 300 + Math.floor(Math.random() * 600));
  return d.toISOString().slice(0, 10);
}

test.describe("Admin — fluxos principais", () => {
  test("dashboard mostra KPIs", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /Bom dia|Boa tarde|Boa noite/ })).toBeVisible();
    await expect(page.getByText("Receita")).toBeVisible();
    await expect(page.getByText("Agendamentos")).toBeVisible();
  });

  test("Agenda Mestre: cria um agendamento walk-in", async ({ page }) => {
    await page.goto(`/agenda?date=${farFutureDate()}`);
    await expect(page.getByRole("heading", { name: "Agenda Mestre" })).toBeVisible();

    await page.getByRole("button", { name: "Novo Agendamento" }).click();
    await page.getByText("Walk-in / novo cliente").click();
    await page.getByLabel("Nome").fill("Cliente E2E Admin");
    await page.getByLabel("Telefone").fill("(81) 90000-1234");

    await page.locator("button", { hasText: "Selecione" }).first().click();
    await page.getByRole("option").first().click();

    await page.locator("button", { hasText: "Selecione" }).first().click();
    await page.getByRole("option").first().click();

    await page.getByLabel("Horário").fill(randomTime());

    await page.getByRole("button", { name: "Criar agendamento" }).click();
    await expect(page.getByText("Agendamento criado.")).toBeVisible({ timeout: 10_000 });
  });

  test("Clientes: cria um novo cliente", async ({ page }) => {
    // Nome único por execução — o Postgres de dev não é resetado entre runs,
    // então um nome fixo colide com clientes de execuções anteriores e quebra
    // a asserção "toBeVisible" em modo estrito (2+ elementos com o mesmo texto).
    const uniqueName = `Cliente E2E CRUD ${Date.now()}`;
    await page.goto("/clientes");
    await page.getByRole("button", { name: "Novo Cliente" }).click();
    await page.getByLabel("Nome").fill(uniqueName);
    await page.getByLabel("Telefone").fill("(81) 90000-5678");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Cliente criado.")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(uniqueName)).toBeVisible();
  });

  test("Equipe, Catálogo e Produtos carregam", async ({ page }) => {
    await page.goto("/equipe");
    await expect(page.getByRole("heading", { name: "Equipe" })).toBeVisible();

    await page.goto("/catalogo");
    await expect(page.getByRole("heading", { name: "Catálogo" })).toBeVisible();

    await page.goto("/produtos");
    await expect(page.getByRole("heading", { name: "Produtos" })).toBeVisible();
    await expect(page.getByText("Estoque Baixo")).toBeVisible();
  });

  test("Comissões, Assinaturas, Promoções e Cupons carregam", async ({ page }) => {
    await page.goto("/comissoes");
    await expect(page.getByRole("tab", { name: "Serviços" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Assinaturas" })).toBeVisible();

    await page.goto("/assinaturas");
    await expect(page.getByRole("heading", { name: "Assinaturas" })).toBeVisible();

    await page.goto("/promocoes");
    await expect(page.getByRole("heading", { name: "Promoções" })).toBeVisible();

    await page.goto("/cupons");
    await expect(page.getByRole("heading", { name: "Cupons" })).toBeVisible();
  });

  test("Configurações: dispara varredura de no-show manualmente", async ({ page }) => {
    await page.goto("/configuracoes");
    await expect(page.getByRole("heading", { name: "Automações" })).toBeVisible();

    const noShowCard = page.getByTestId("job-noshow");
    await noShowCard.getByRole("button", { name: "Rodar agora" }).click();
    await expect(page.getByText("Varredura de no-show executado.")).toBeVisible({ timeout: 10_000 });
  });
});
