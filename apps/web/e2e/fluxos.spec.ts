import { expect, test } from "@playwright/test";
import { createCharacter, e2eAccount } from "./helpers";

test.describe("login", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("senha errada mostra aviso e a certa entra", async ({ page }) => {
    const { email } = e2eAccount();
    await page.goto("/entrar");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill("senha-errada-1");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();

    // O React limpa o formulário depois de cada envio.
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill("senha-de-teste-123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/app$/);
  });

  test("área logada exige login", async ({ page }) => {
    await page.goto("/app/mestre");
    await expect(page).toHaveURL(/\/entrar/);
  });

  test("endereço inexistente mostra a página 404 do app", async ({ page }) => {
    const res = await page.goto("/pagina-que-nao-existe");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
  });
});

test("criar personagem, abrir a ficha e acessar um id inexistente", async ({ page }) => {
  const id = await createCharacter(page, "Aventureira E2E");
  await expect(page.getByText("Aventureira E2E").first()).toBeVisible();

  await page.goto(`/app/personagens/${id}/ficha`);
  await expect(page.getByText("Aventureira E2E").first()).toBeVisible();

  await page.goto("/app/personagens/nao-existe");
  await expect(page.getByRole("heading", { name: "Não encontramos isso" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mestre" })).toBeVisible(); // o menu continua lá
});

test("avatar: salvar a aparência e encontrar salva depois de recarregar", async ({ page }) => {
  const id = await createCharacter(page, "Modelo E2E");
  await page.goto(`/app/personagens/${id}/avatar`);
  await expect(page.getByText("Sugestão ainda não salva")).toBeVisible();
  await page.getByRole("button", { name: "Usar esta aparência" }).click();
  await expect(page.getByText(/Salvo às \d{2}:\d{2}/)).toBeVisible();

  await page.reload();
  await expect(page.getByText("Salvamento automático ativo")).toBeVisible();
});

test("mestre: montar encontro, ver ND e XP e rolar tesouro", async ({ page }) => {
  await page.goto("/app/mestre");
  await page.getByLabel("Buscar ameaça").first().fill("bandido");
  await page.getByRole("button", { name: /Bandido/ }).first().click();
  await page.getByRole("button", { name: "Um Bandido a mais" }).click();

  // Dois de ND 1/4 = ND 1/2; 2 × 250 XP = 500.
  const resultado = page.getByRole("region", { name: "Resultado" });
  await expect(resultado.getByText("1/2", { exact: true })).toBeVisible();
  await expect(resultado.getByText("500", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Rolar tesouro/ }).click();
  await expect(page.getByText(/Linha ND 1\/2/)).toBeVisible();
});

test("subir de nível: ver o próximo nível, subir e achar a versão no histórico", async ({ page }) => {
  const id = await createCharacter(page, "Veterana E2E");
  await page.getByRole("link", { name: "Subir de nível" }).click();
  await expect(page.getByRole("heading", { name: "Meu próximo nível" })).toBeVisible();
  await expect(page.getByText(/do 1º para o 2º nível/)).toBeVisible();

  await page.getByRole("button", { name: "Subir para o 2º nível" }).click();
  await expect(page).toHaveURL(new RegExp(`/app/personagens/${id}/ficha$`));

  await page.goto(`/app/personagens/${id}?etapa=review`);
  await expect(page.getByText(/Subida de nível · nível 2/)).toBeVisible();
  await expect(page.getByText("Nível 2").first()).toBeVisible();
});
