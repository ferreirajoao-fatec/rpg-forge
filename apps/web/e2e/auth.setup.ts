import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test as setup } from "@playwright/test";
import { E2E_PASSWORD, STATE_FILE, USER_FILE, e2eEmail } from "./helpers";

/** Cria a conta de teste uma vez e guarda a sessão para os outros testes. */
setup("cadastro de uma conta nova", async ({ page }) => {
  const email = e2eEmail();
  await page.goto("/cadastro");
  await page.getByLabel("Como devemos chamar você?").fill("Mesa E2E");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("link", { name: "Mestre" })).toBeVisible();

  mkdirSync("e2e/.auth", { recursive: true });
  writeFileSync(USER_FILE, JSON.stringify({ email }));
  await page.context().storageState({ path: STATE_FILE });
});
