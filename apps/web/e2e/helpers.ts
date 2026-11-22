import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

export const STATE_FILE = "e2e/.auth/user.json";
export const USER_FILE = "e2e/.auth/account.json";
export const E2E_PASSWORD = "senha-de-teste-123";
export const E2E_EMAIL_PATTERN = /^e2e-\d+@rpgforge\.test$/;

export const e2eEmail = () => `e2e-${Date.now()}@rpgforge.test`;
export const e2eAccount = (): { email: string } => JSON.parse(readFileSync(USER_FILE, "utf8"));

/** Cria um rascunho de personagem de Fantasia d20 e devolve o id. */
export async function createCharacter(page: Page, name: string): Promise<string> {
  await page.goto("/app/personagens/novo");
  await page.getByText("Fantasia d20 (2020)").click();
  await page.getByLabel("Nome do personagem (opcional)").fill(name);
  await page.getByRole("button", { name: "Criar rascunho" }).click();
  // Espera sair de /novo e chegar ao editor do personagem criado.
  await page.waitForURL((u) => /^\/app\/personagens\/(?!novo$)[a-z0-9]+$/.test(u.pathname));
  return new URL(page.url()).pathname.split("/").pop()!;
}
