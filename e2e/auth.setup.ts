import { test as setup, expect } from "@playwright/test";

const USERS = [
  { role: "admin", email: "admin@bacelar.dev", homeUrl: "/dashboard" },
  { role: "professional", email: "profissional@bacelar.dev", homeUrl: "/minha-agenda" },
  { role: "client", email: "cliente@bacelar.dev", homeUrl: "/inicio" },
] as const;

for (const user of USERS) {
  setup(`login as ${user.role}`, async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(user.email);
    await page.getByLabel("Senha").fill("senha123");
    await page.getByRole("button", { name: "Entrar" }).click();
    // Login passa por Supabase Auth (rede) + uma consulta ao Postgres pra
    // resolver o papel, e em dev ainda compila a rota de destino on-demand
    // na primeira visita — timeout maior que os 5s padrão evita flakiness.
    await expect(page).toHaveURL(new RegExp(user.homeUrl), { timeout: 15_000 });
    await page.context().storageState({ path: `playwright/.auth/${user.role}.json` });
  });
}
