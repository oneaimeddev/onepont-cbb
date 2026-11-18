import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "../scripts/local-supabase.mjs";

const opts = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(localSupabase.url, localSupabase.adminKey, opts);
const accounts = [];
const stamp = randomUUID().slice(0, 8);
const categoryName = `Categoria QA ${stamp}`;
const clubName = `Clube QA ${stamp}`;
const newCategory = `Categoria Nova ${stamp}`;
const newClub = `Clube Novo ${stamp}`;
const historyCategory = `Categoria Historico ${stamp}`;
const historyClub = `Clube Historico ${stamp}`;
const minimumName = `Atleta QA Minimo ${stamp}`;
const enrichedName = `Atleta QA Completo ${stamp}`;
const socialName = `Social QA ${stamp}`;
const reuseName = `Atleta QA Reuso ${stamp}`;
const documentId = "00000000000";

function sql(statement) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_prontuario-cbb",
    "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA"], {
    input: statement, stdio: ["pipe", "pipe", "pipe"],
  }).toString();
}

async function account() {
  const email = `test-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const id = data.user.id;
  accounts.push(id);
  const profile = await admin.from("profiles").insert({
    id, display_name: "Teste DEMO", profession: "Medicina esportiva", can_read_audit: false,
  });
  if (profile.error) throw profile.error;
  const client = createClient(localSupabase.url, localSupabase.publishableKey, opts);
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  return { id, email, password, client };
}

async function chooseOption(scope, label, name) {
  const combo = scope.getByRole("combobox", { name: label });
  await combo.click();
  await combo.fill(name);
  await scope.getByRole("option", { name, exact: true }).click();
}

async function addOption(scope, label, name) {
  const combo = scope.getByRole("combobox", { name: label });
  await combo.click();
  await combo.fill(name);
  await scope.getByRole("button", { name: `Adicionar “${name}”` }).click();
}

test.afterAll(async () => {
  const ids = accounts.map((id) => `'${id}'`).join(",");
  if (ids) {
    sql(`
      delete from clinical.audit_events where actor_user_id in (${ids});
      delete from clinical.athletes where created_by in (${ids});
      delete from clinical.categories where created_by in (${ids});
      delete from clinical.organizations where created_by in (${ids});
      delete from clinical.sport_options where category in (
        '${categoryName}', '${newCategory}', '${historyCategory}'
      );
    `);
  }
  for (const id of accounts) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  }
});

test("cria, deduplica e nega catálogos sem ampliar acesso clínico", async () => {
  const creator = await account();
  const outsider = await account();
  sql(`insert into clinical.athlete_creators (professional_id) values ('${creator.id}');`);

  const listed = await creator.client.rpc("catalog_list");
  expect(listed.error).toBeNull();
  expect(listed.data.categories.length).toBeGreaterThan(0);
  expect(listed.data.clubs.length).toBeGreaterThan(0);

  const category = await creator.client.rpc("catalog_create_category", { label: categoryName });
  expect(category.data).toMatchObject({ ok: true, name: categoryName });
  const duplicateCategory = await creator.client.rpc("catalog_create_category", {
    label: `  ${categoryName.toLowerCase().replace(" ", "   ")} `,
  });
  expect(duplicateCategory.data).toMatchObject({ ok: false, error: "duplicate", id: category.data.id, name: categoryName });

  const club = await creator.client.rpc("catalog_create_organization", { label: clubName, org_kind: "club" });
  expect(club.data).toMatchObject({ ok: true, name: clubName });
  const duplicateClub = await creator.client.rpc("catalog_create_organization", {
    label: clubName.toUpperCase(), org_kind: "club",
  });
  expect(duplicateClub.data).toMatchObject({ ok: false, error: "duplicate", id: club.data.id });

  const deniedCategory = await outsider.client.rpc("catalog_create_category", { label: `Negada ${stamp}` });
  expect(deniedCategory.data).toMatchObject({ ok: false, error: "denied" });
  const deniedClub = await outsider.client.rpc("catalog_create_organization", {
    label: `Clube Negado ${stamp}`, org_kind: "club",
  });
  expect(deniedClub.data).toMatchObject({ ok: false, error: "denied" });

  expect(sql(`select count(*) from clinical.athlete_access where professional_id = '${creator.id}';`).trim()).toBe("0");
  expect(sql(`select count(*) from clinical.categories where name = 'Negada ${stamp}';`).trim()).toBe("0");
  const audit = sql(`
    select operation || ':' || outcome from clinical.audit_events
    where actor_user_id in ('${creator.id}', '${outsider.id}') and operation like 'catalog.%'
    order by operation, outcome;
  `);
  expect(audit).toContain("catalog.category.create:success");
  expect(audit).toContain("catalog.category.create:denied");
  expect(audit).toContain("catalog.organization.create:success");
  expect(audit).toContain("catalog.organization.create:denied");
  expect(audit).not.toContain("catalog.category.create:success\ncatalog.category.create:success");
});

test("cadastra dados mínimos ou enriquecidos e preserva o histórico esportivo", async ({ page }) => {
  test.setTimeout(120_000);
  const creator = await account();
  const reader = await account();
  sql(`insert into clinical.athlete_creators (professional_id) values ('${creator.id}');`);
  const listed = await creator.client.rpc("catalog_list");
  const existingCategory = listed.data.categories.find((item) => item.name !== categoryName) ?? listed.data.categories[0];
  const existingClub = listed.data.clubs[0];

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(creator.email);
  await page.getByLabel("Senha").fill(creator.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));

  await page.goto("/atletas");
  await page.getByRole("button", { name: "Cadastrar atleta" }).click();
  const dialog = page.getByRole("dialog", { name: "Cadastrar atleta" });
  const panelHeight = async () => Math.round((await dialog.boundingBox()).height);
  const personalHeight = await panelHeight();
  await dialog.getByRole("tab", { name: "Dados esportivos" }).click();
  const sportsHeight = await panelHeight();
  await dialog.getByRole("tab", { name: "Contatos" }).click();
  const contactsHeight = await panelHeight();
  expect(sportsHeight).toBe(personalHeight);
  expect(contactsHeight).toBe(personalHeight);
  await dialog.getByRole("tab", { name: "Dados pessoais" }).click();
  await dialog.getByLabel("Nome completo").fill(minimumName);
  await dialog.getByRole("button", { name: "Salvar cadastro" }).click();
  await expect(page.getByRole("heading", { name: minimumName })).toBeVisible();
  await expect(page.getByText("Nenhum vínculo esportivo vigente.")).toBeVisible();
  await page.getByRole("link", { name: "Dados cadastrais" }).click();
  await expect(page.getByText("Não informada")).toHaveCount(2);

  await page.goto("/atletas/novo");
  await page.getByLabel("Nome completo").fill(enrichedName);
  await page.getByRole("tab", { name: "Dados esportivos" }).click();
  await page.getByRole("tab", { name: "Dados pessoais" }).click();
  await expect(page.getByLabel("Nome completo")).toHaveValue(enrichedName);
  await page.getByLabel("Nome social (opcional)").fill(socialName);
  await page.getByRole("combobox", { name: "Dia", exact: true }).selectOption("12");
  await page.getByRole("combobox", { name: "Mês", exact: true }).selectOption("4");
  await page.getByRole("combobox", { name: "Ano", exact: true }).selectOption("2010");
  await page.getByLabel("CPF ou identificador institucional (opcional)").fill(documentId);
  await page.getByLabel("Identidade de gênero (opcional)").selectOption("nao_binario");

  await page.getByRole("tab", { name: "Contatos" }).click();
  await page.getByLabel("Telefone (opcional)").fill("123");
  await page.getByRole("button", { name: "Salvar cadastro" }).click();
  await expect(page.getByText("Informe um telefone fictício")).toBeVisible();
  await page.getByLabel("Telefone (opcional)").fill("(11) 98888-0000");
  await page.getByLabel("E-mail (opcional)").fill("qa.catalogo@example.com");
  await page.getByLabel("Responsável legal (opcional)").fill("Responsavel QA Ficticio");
  await page.getByLabel("Relação com o responsável (opcional)").fill("Mae");
  await page.getByLabel("Contato do responsável (opcional)").fill("(11) 97777-0000");
  await page.getByLabel("Contato de emergência (opcional)").fill("(11) 96666-0000");

  await page.getByRole("tab", { name: "Dados esportivos" }).click();
  await chooseOption(page, "Categoria", existingCategory.name);
  await expect(page.locator('input[name="category_id"]')).toHaveValue(existingCategory.id);
  await addOption(page, "Categoria", newCategory);
  await addOption(page, "Categoria", newCategory.replace(" ", "   "));
  await expect(page.getByRole("status")).toContainText("Essa opção já existe e foi selecionada.");
  await chooseOption(page, "Clube ou equipe (opcional)", existingClub.name);
  await expect(page.locator('input[name="club_id"]')).toHaveValue(existingClub.id);
  await addOption(page, "Clube ou equipe (opcional)", newClub);
  await addOption(page, "Clube ou equipe (opcional)", newClub.replace(" ", "  "));
  await expect(page.getByRole("status").last()).toContainText("Essa opção já existe e foi selecionada.");
  await page.getByLabel("Feminino ou masculino").selectOption("Masculino");
  await page.getByLabel("Modalidade").selectOption("5x5");
  await page.getByLabel("Posição esportiva (opcional)").selectOption("Ala");
  await page.getByLabel("Número da camisa (opcional)").fill("7");
  await page.getByRole("button", { name: "Salvar cadastro" }).click();

  await expect(page.getByRole("heading", { name: socialName })).toBeVisible();
  await expect(page.getByText("Posição Ala")).toBeVisible();
  await expect(page.getByText("Camisa 7")).toBeVisible();
  await expect(page.getByText(newClub).first()).toBeVisible();
  const enrichedUrl = page.url();
  const enrichedId = enrichedUrl.match(/\/atletas\/([0-9a-f-]{36})/)[1];

  await page.getByRole("link", { name: "Dados cadastrais" }).click();
  await expect(page.getByText("Não binário")).toBeVisible();
  await expect(page.getByText(documentId)).toBeVisible();
  await expect(page.getByText("Responsavel QA Ficticio")).toBeVisible();
  await expect(page.getByText("(11) 98888-0000")).toBeVisible();
  await expect(page.getByText("qa.catalogo@example.com")).toBeVisible();

  await page.getByText("Registrar novo vínculo esportivo", { exact: true }).click();
  const linkForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Novo vínculo" }) });
  await addOption(linkForm, "Categoria", historyCategory);
  await linkForm.getByLabel("Feminino ou masculino").selectOption("Masculino");
  await linkForm.getByLabel("Modalidade").selectOption("5x5");
  await addOption(linkForm, "Clube ou equipe (opcional)", historyClub);
  await linkForm.getByRole("button", { name: "Registrar vínculo" }).click();
  await expect(page.getByText("Cadastro salvo.")).toBeVisible();
  await expect(page.locator(".sport-history li").filter({ hasText: newClub })).toContainText("até");
  await expect(page.getByRole("region", { name: "Histórico de vínculos" })).toContainText(historyClub);
  const clubs = sql(`
    select club || '|' || coalesce(ends_on::text, 'aberto') from clinical.sport_links
    where athlete_id = '${enrichedId}' order by starts_on, id;
  `);
  expect(clubs).toContain(`${newClub}|`);
  expect(clubs).toContain(`${historyClub}|aberto`);

  await page.goto("/atletas/novo");
  await page.getByLabel("Nome completo").fill(reuseName);
  await page.getByRole("tab", { name: "Dados esportivos" }).click();
  await chooseOption(page, "Categoria", newCategory);
  await chooseOption(page, "Clube ou equipe (opcional)", newClub);
  await page.getByLabel("Feminino ou masculino").selectOption("Masculino");
  await page.getByLabel("Modalidade").selectOption("5x5");
  await page.getByRole("button", { name: "Salvar cadastro" }).click();
  await expect(page.getByRole("heading", { name: reuseName })).toBeVisible();
  await expect(page.getByText(newCategory).first()).toBeVisible();
  await expect(page.getByText(newClub).first()).toBeVisible();

  sql(`
    insert into clinical.athlete_access (athlete_id, professional_id, can_read_records)
    values ('${enrichedId}', '${reader.id}', true);
  `);
  const registration = await reader.client.rpc("athlete_registration", { target: enrichedId });
  expect(registration.data).toBeNull();
  const workspace = await reader.client.rpc("athlete_workspace", { target: enrichedId, view_name: "profile" });
  expect(workspace.error).toBeNull();
  expect(JSON.stringify(workspace.data.athlete)).not.toContain("document_id");
  expect(JSON.stringify(workspace.data.athlete)).not.toContain(documentId);
  expect(JSON.stringify(workspace.data.athlete)).not.toContain("gender_identity");

  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(reader.email);
  await page.getByLabel("Senha").fill(reader.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.goto(`/atletas/${enrichedId}?aba=cadastro`);
  await expect(page.getByRole("heading", { name: socialName })).toBeVisible();
  await expect(page.getByText("Identidade de gênero")).toHaveCount(0);
  await expect(page.getByText("Responsável legal")).toHaveCount(0);
  await expect(page.getByText(documentId)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Histórico de vínculos" })).toContainText(historyClub);
});
