import { test, expect } from "@playwright/test";

/** Horário aleatório (passo de 1min, 09:00-18:59, 600 opções). */
function randomTime(): string {
  const slot = Math.floor(Math.random() * 600); // 0..599 -> 09:00..18:59
  const hour = 9 + Math.floor(slot / 60);
  const minute = slot % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Data bem no futuro (dentro de uma janela grande e aleatória) — Minha
 * Agenda aceita ?date= na URL. "Hoje" acumula agendamentos de toda execução
 * anterior desta suíte (sem reset de DB entre runs), então horário
 * aleatório sozinho não basta pra evitar colisão; escapar pra uma data
 * distante praticamente elimina o problema. */
function farFutureDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 300 + Math.floor(Math.random() * 600));
  return d.toISOString().slice(0, 10);
}

test.describe("Profissional — Minha Agenda", () => {
  test("mostra KPIs do dia e permite alternar Dia/Semana", async ({ page }) => {
    await page.goto("/minha-agenda");
    await expect(page.getByRole("heading", { name: "Minha Agenda" })).toBeVisible();
    await expect(page.getByText("Agendamentos")).toBeVisible();
    await expect(page.getByText("Concluídos")).toBeVisible();
    await expect(page.getByText("Receita")).toBeVisible();
    await expect(page.getByText("Pendente")).toBeVisible();

    await page.getByRole("button", { name: "Ver Semana" }).click();
    await expect(page).toHaveURL(/view=semana/);
    await expect(page.getByRole("button", { name: "Ver Dia" })).toBeVisible();
  });

  test("registra um walk-in e o vê na agenda do dia", async ({ page }) => {
    await page.goto(`/minha-agenda?date=${farFutureDate()}`);
    await page.getByRole("button", { name: "Agendar horário" }).click();
    await page.getByText("Walk-in / novo cliente").click();
    await page.getByLabel("Nome").fill("Cliente E2E Profissional");
    await page.getByLabel("Telefone").fill("(81) 90000-9999");

    // Profissional (única opção: "Você")
    await page.locator("button", { hasText: "Selecione" }).first().click();
    await page.getByRole("option").first().click();
    // Serviço
    await page.locator("button", { hasText: "Selecione" }).first().click();
    await page.getByRole("option").first().click();

    await page.getByLabel("Horário").fill(randomTime());

    await page.getByRole("button", { name: "Criar agendamento" }).click();
    await expect(page.getByText("Agendamento criado.")).toBeVisible({ timeout: 10_000 });
  });
});
