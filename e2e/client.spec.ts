import { test, expect, type Page } from "@playwright/test";

async function pickAvailableDay(page: Page) {
  // /agendar não tem landmark <main> (só plano/horarios têm) — escopar por
  // "main" aqui nunca casava nada. O botão de cada dia também mistura
  // dia-da-semana + número num só nó de texto acessível (ex.: "sáb. 22"),
  // por isso o filtro casa por "termina em dígitos", não por texto exato.
  const dayButtons = page.getByRole("button").filter({ hasText: /\d{1,2}$/ });
  const count = await dayButtons.count();
  for (let i = 0; i < count; i++) {
    await dayButtons.nth(i).click();
    const anyTime = page.getByRole("button", { name: /^\d{2}:\d{2}$/ });
    try {
      // Cada clique dispara uma consulta de disponibilidade real (Server
      // Action -> Postgres); contra um Supabase remoto isso facilmente
      // passa de 1s por rodada, então 2500ms era curto demais e fazia dias
      // COM horário livre parecerem sem.
      await anyTime.first().waitFor({ state: "visible", timeout: 6000 });
      return true;
    } catch {
      // este dia não tinha horário livre — tenta o próximo
    }
  }
  return false;
}

test.describe("Cliente — Home e wizard de agendamento", () => {
  test("Home mostra o catálogo com filtro de categoria", async ({ page }) => {
    await page.goto("/inicio");
    await expect(page.getByRole("button", { name: "Todos" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Masculino" })).toBeVisible();
    await page.getByRole("button", { name: "Masculino" }).click();
  });

  test("Wizard completo: serviço → profissional → horário → confirmar", async ({ page }) => {
    // O passo 3 faz várias consultas de disponibilidade (uma por mês
    // visível + uma por dia clicado) — contra o pooler do Supabase, cada
    // uma leva ~700ms desta máquina, o que estoura os 30s padrão em rede
    // mais lenta. Na VPS (mesma região do Supabase) deve ser bem mais rápido.
    test.setTimeout(60_000);
    await page.goto("/agendar");

    // Passo 1: Serviço
    await expect(page.getByRole("heading", { name: "Escolha o serviço" })).toBeVisible();
    await page.locator("button", { hasText: "min" }).first().click();
    await page.getByRole("button", { name: "Continuar" }).click();

    // Passo 2: Profissional
    await expect(page.getByRole("heading", { name: "Escolha o profissional" })).toBeVisible();
    await page.getByText("Qualquer Profissional").click();
    await page.getByRole("button", { name: "Continuar" }).click();

    // Passo 3: Horário
    await expect(page.getByRole("heading", { name: "Escolha o horário" })).toBeVisible();
    const found = await pickAvailableDay(page);
    expect(found).toBe(true);
    await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first().click();
    await page.getByRole("button", { name: "Continuar" }).click();

    // Passo 4: Confirmar
    await expect(page.getByRole("heading", { name: "Confirmar agendamento" })).toBeVisible();
    await expect(page.getByText("Pagar no Local")).toBeVisible();
    await page.getByRole("button", { name: "Confirmar agendamento" }).click();

    await expect(page.getByText("Agendamento confirmado!")).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/horarios/);
  });

  test("Horários lista o agendamento recém-criado", async ({ page }) => {
    await page.goto("/horarios");
    await expect(page.getByRole("heading", { name: "Meus horários" })).toBeVisible();
    await expect(page.getByText("Próximos")).toBeVisible();
  });

  test("Plano mostra planos disponíveis pra assinar", async ({ page }) => {
    await page.goto("/plano");
    await expect(page.getByRole("heading", { name: "Meu plano" })).toBeVisible();
    await expect(page.getByText("Planos disponíveis")).toBeVisible();
  });
});
