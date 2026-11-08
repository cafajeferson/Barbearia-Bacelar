import { test as setup, expect } from "@playwright/test";

const USERS = [
  // A senha do admin de teste é a do login rápido ("admin" / "123"), já com o sufixo.
  { role: "admin", email: "admin@bacelar.dev", password: "123-bacelar", homeUrl: "/dashboard" },
  { role: "professional", email: "profissional@bacelar.dev", password: "senha123", homeUrl: "/minha-agenda" },
  { role: "client", email: "cliente@bacelar.dev", password: "senha123", homeUrl: "/inicio" },
] as const;

for (const user of USERS) {
  setup(`login as ${user.role}`, async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/E-mail/).fill(user.email);
    await page.getByLabel("Senha").fill(user.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    // Login passa por Supabase Auth (rede) + uma consulta ao Postgres pra
    // resolver o papel, e em dev ainda compila a rota de destino on-demand
    // na primeira visita — timeout maior que os 5s padrão evita flakiness.
    await expect(page).toHaveURL(new RegExp(user.homeUrl), { timeout: 15_000 });
    await page.context().storageState({ path: `playwright/.auth/${user.role}.json` });
  });
}
