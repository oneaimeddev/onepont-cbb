import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "../scripts/local-supabase.mjs";

const opts = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(localSupabase.url, localSupabase.adminKey, opts);
const accounts = [];
const athlete = randomUUID();
const emptyAthlete = randomUUID();

function sql(statement) {
  execFileSync("docker", ["exec", "-i", "supabase_db_prontuario-cbb",
    "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
    input: statement, stdio: ["pipe", "pipe", "pipe"],
  });
}

async function account(canReadAudit) {
  const email = `test-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const id = data.user.id;
  accounts.push(id);
  const profile = await admin.from("profiles").insert({
    id, display_name: "Teste DEMO", profession: "Medicina esportiva", can_read_audit: canReadAudit,
  });
  if (profile.error) throw profile.error;
  const client = createClient(localSupabase.url, localSupabase.publishableKey, opts);
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  return { id, email, password, client };
}

test.afterAll(async () => {
  const ids = accounts.map((id) => `'${id}'`).join(",");
  if (ids) sql(`
    delete from clinical.audit_events where actor_user_id in (${ids});
    delete from clinical.records where athlete_id = '${athlete}';
    delete from clinical.athletes where id in ('${athlete}', '${emptyAthlete}') or created_by in (${ids});
  `);
  for (const id of accounts) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  }
});

test("busca, seleção, timeline, troca, cadastro e auditoria do atleta", async ({ page }, testInfo) => {
  const professional = await account(false);
  const auditor = await account(true);
  sql(`
    insert into clinical.athletes(id, full_name, social_name, source)
    values ('${athlete}', 'Cadastro sintético', 'Atleta DEMO Teste', 'demo'),
      ('${emptyAthlete}', 'Atleta DEMO Vazio', null, 'demo');
    insert into clinical.athlete_creators values ('${professional.id}');
    insert into clinical.athlete_access values
      ('${athlete}', '${professional.id}', true), ('${emptyAthlete}', '${professional.id}', true),
      ('${athlete}', '${auditor.id}', false);
    insert into clinical.records(athlete_id, author_id, author_name, specialty, title, body, occurred_at, status, visibility) values
      ('${athlete}', '${professional.id}', 'Autor DEMO', 'Medicina', 'Evento anterior', 'Conteúdo DEMO', '2026-11-01', 'finalized', 'care_team'),
      ('${athlete}', '${professional.id}', 'Autor DEMO', 'Medicina', 'Evento recente', 'Conteúdo DEMO', '2026-11-10', 'finalized', 'care_team'),
      ('${athlete}', '${auditor.id}', 'Autor restrito DEMO', 'Psicologia', 'Evento restrito', 'Conteúdo restrito DEMO', '2026-11-12', 'finalized', 'author_only'),
      ('${athlete}', '${auditor.id}', 'Autor restrito DEMO', 'Medicina', 'Rascunho de terceiro', 'Rascunho DEMO', '2026-11-13', 'draft', 'care_team');
  `);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(professional.email);
  await page.getByLabel("Senha").fill(professional.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("navigation", { name: "Tarefas clínicas" }).getByRole("link", { name: /^Buscar atleta/ }).click();
  await page.getByLabel("Nome ou identificador interno").fill("Cadastro sintético");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.getByRole("link", { name: "Atleta DEMO Vazio" })).toHaveCount(0);
  await page.getByRole("link", { name: "Atleta DEMO Teste" }).click();
  await expect(page.getByText("Cadastro sintético", { exact: true })).toBeVisible();
  await expect(page.getByText("Nascimento", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Linha do tempo" }).click();
  await expect(page.locator(".clinical-list summary")).toHaveText(["Evento recente", "Evento anterior"]);
  await page.getByText("Evento recente", { exact: true }).click();
  await expect(page.locator("details[open]").getByText("Conteúdo DEMO", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("timeline-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: testInfo.outputPath("timeline-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const timeline = await professional.client.rpc("athlete_workspace", { target: athlete, view_name: "timeline" });
  expect(timeline.error).toBeNull();
  expect(timeline.data.records.map((r) => r.title)).toEqual(["Evento recente", "Evento anterior"]);

  await page.getByRole("link", { name: "Abrir no chat" }).click();
  await expect(page.getByRole("complementary", { name: "Contexto da tarefa" })).toContainText(athlete);
  await expect(page.getByRole("button", { name: "Enviar", exact: true })).toBeDisabled();
  await page.getByRole("link", { name: "Voltar ao perfil" }).click();
  await page.getByRole("link", { name: "Trocar atleta" }).click();
  await page.getByRole("link", { name: "Atleta DEMO Vazio" }).click();
  await page.getByRole("link", { name: "Linha do tempo" }).click();
  await expect(page.getByText("Nenhum registro disponível para este perfil.")).toBeVisible();
  await page.getByRole("link", { name: "Abrir no chat" }).click();
  await expect(page.getByRole("complementary", { name: "Contexto da tarefa" })).toContainText(emptyAthlete);

  await page.goto("/atletas/novo");
  await page.getByLabel("Nome completo").fill("Atleta criado no teste");
  const creationId = await page.locator('input[name="creation_id"]').inputValue();
  await page.getByRole("button", { name: "Salvar cadastro" }).click();
  await expect(page.getByRole("heading", { name: "Atleta criado no teste" })).toBeVisible();

  const createArgs = {
    creation_id: creationId, name: "Atleta criado no teste", social: "", birth: null, club: "", sport_category: "",
  };
  const replay = await professional.client.rpc("athlete_create", createArgs);
  expect(replay.error).toBeNull();
  expect(page.url()).toMatch(new RegExp(`/atletas/${replay.data}$`));
  const deniedCreate = await auditor.client.rpc("athlete_create", createArgs);
  expect(deniedCreate.error).toBeNull();
  expect(deniedCreate.data).toBeNull();

  const denied = await auditor.client.rpc("athlete_workspace", { target: athlete, view_name: "timeline" });
  expect(denied.error).toBeNull();
  expect(denied.data).toBeNull();
  const noLink = await auditor.client.rpc("athlete_workspace", { target: emptyAthlete, view_name: "chat" });
  expect(noLink.error).toBeNull();
  expect(noLink.data).toBeNull();
  expect((await professional.client.rpc("athlete_audit")).error?.code).toBe("42501");

  const audit = await auditor.client.rpc("athlete_audit");
  expect(audit.error).toBeNull();
  const events = audit.data.filter((event) => accounts.includes(event.actor_user_id));
  expect(events).toEqual(expect.arrayContaining([
    expect.objectContaining({ operation: "athlete.create", outcome: "success", actor_user_id: professional.id }),
    expect.objectContaining({ operation: "clinical_record.timeline.read", outcome: "success", athlete_id: athlete, origin_channel: "traditional_ui" }),
    expect.objectContaining({ operation: "clinical_record.timeline.read", outcome: "denied", athlete_id: null }),
    expect.objectContaining({ operation: "athlete.context.open", outcome: "denied", athlete_id: null }),
  ]));
  expect(JSON.stringify(events)).not.toContain("Conteúdo");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page.getByLabel("E-mail").fill(auditor.email);
  await page.getByLabel("Senha").fill(auditor.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Como podemos ajudar?" })).toBeVisible();
  expect((await page.goto(`/atletas/${athlete}?aba=timeline`)).status()).toBe(404);
  expect((await page.goto(`/?atleta=${emptyAthlete}`)).status()).toBe(404);
  await page.goto("/auditoria");
  await expect(page.getByRole("heading", { name: "Auditoria" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Cadastro de atleta" })
    .filter({ hasText: "Concluída" }).filter({ hasText: professional.id })).toHaveCount(1);
});
