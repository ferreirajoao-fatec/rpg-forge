import { expect, test } from "@playwright/test";
import { createCharacter, E2E_PASSWORD, e2eAccount, e2eEmail } from "./helpers";

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
  // Sem chave do Gemini, o retrato por IA avisa e o editor manual já vem aberto.
  await expect(page.getByRole("heading", { name: "Retrato com IA" })).toBeVisible();
  await expect(page.getByText(/não está configurada neste servidor/)).toBeVisible();
  // A imagem do retrato passa por uma rota que confere permissão; retrato inexistente = 404.
  expect((await page.request.get(`/app/personagens/${id}/retrato/nao-existe`)).status()).toBe(404);
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

test("campanha: mestre cria e convida, jogador entra pelo link sem estar logado e vincula a ficha", async ({ page, browser }) => {
  await page.goto("/app/campanhas");
  await page.getByLabel("Nome").fill("Mesa de Teste E2E");
  await page.getByLabel("Sistema de regras").selectOption({ label: "Fantasia d20 (2020)" });
  await page.getByRole("button", { name: "Criar campanha" }).click();
  await expect(page.getByRole("heading", { name: "Mesa de Teste E2E" })).toBeVisible();
  const campaignUrl = page.url();
  const inviteUrl = await page.getByRole("textbox", { name: "Link de convite" }).inputValue();
  expect(inviteUrl).toMatch(/\/convite\/[A-Za-z0-9_-]{12}$/);

  // Jogador: navegador sem sessão, cria a conta a partir do convite e volta para ele.
  const player = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: "pt-BR" });
  const p = await player.newPage();
  await p.goto(inviteUrl);
  await expect(p.getByRole("heading", { name: "Mesa de Teste E2E" })).toBeVisible();
  await p.getByRole("link", { name: "Criar conta" }).click();
  await p.getByLabel("Como devemos chamar você?").fill("Jogadora E2E");
  await p.getByLabel("E-mail").fill(e2eEmail());
  await p.getByLabel("Senha").fill(E2E_PASSWORD);
  await p.getByRole("button", { name: "Criar conta" }).click();
  await expect(p).toHaveURL(/\/convite\//);
  await p.getByRole("button", { name: "Entrar na campanha" }).click();
  await expect(p).toHaveURL(/\/app\/campanhas\/[a-z0-9]+$/);
  await expect(p.getByRole("heading", { name: "Mesa de Teste E2E" })).toBeVisible();

  // Sem ficha do sistema ainda: cria uma e vincula, sem aprovação.
  const playerCampaign = p.url();
  await createCharacter(p, "Barda E2E");
  await p.goto(playerCampaign);
  await p.getByRole("button", { name: "Vincular" }).click();
  await expect(p.getByText("Barda E2E")).toBeVisible();
  // Abrir o link de novo não duplica a entrada.
  await p.goto(inviteUrl);
  await expect(p.getByText("Você já está nesta campanha.")).toBeVisible();
  await player.close();

  // O mestre vê a jogadora e a ficha, e consegue abrir a ficha.
  await page.goto(campaignUrl);
  await expect(page.getByRole("region", { name: "Na mesa" }).getByText("Jogadora E2E")).toBeVisible();
  await expect(page.getByText("Barda E2E")).toBeVisible();
  await page.getByRole("link", { name: "Ver ficha" }).click();
  await expect(page.getByText("Barda E2E").first()).toBeVisible();

  // Link novo invalida o antigo.
  await page.goto(campaignUrl);
  await page.getByRole("button", { name: "Gerar link novo" }).click();
  await expect(page.getByRole("textbox", { name: "Link de convite" })).not.toHaveValue(inviteUrl);
  await page.goto(inviteUrl);
  await expect(page.getByRole("heading", { name: "Convite inválido" })).toBeVisible();
});
