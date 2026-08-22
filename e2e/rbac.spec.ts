import { test, expect } from "@playwright/test";

test.describe("RBAC — acesso cruzado é bloqueado", () => {
  test("sem login, rota protegida redireciona pro /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test.describe("profissional", () => {
    test.use({ storageState: "playwright/.auth/professional.json" });

    test("não acessa área do admin nem do cliente", async ({ page }) => {
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/login/);

      await page.goto("/inicio");
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe("cliente", () => {
    test.use({ storageState: "playwright/.auth/client.json" });

    test("não acessa área do admin nem do profissional", async ({ page }) => {
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/login/);

      await page.goto("/minha-agenda");
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe("admin", () => {
    test.use({ storageState: "playwright/.auth/admin.json" });

    test("não acessa área do profissional nem do cliente (áreas exclusivas de outro papel)", async ({ page }) => {
      await page.goto("/minha-agenda");
      await expect(page).toHaveURL(/\/login/);

      await page.goto("/inicio");
      await expect(page).toHaveURL(/\/login/);
    });
  });
});
