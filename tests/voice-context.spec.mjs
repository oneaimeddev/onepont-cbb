import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { expect, mockDictation, test } from "./fixtures.mjs";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "../scripts/local-supabase.mjs";

const admin = createClient(localSupabase.url, localSupabase.adminKey, { auth: { persistSession: false } });
const users = [];
const athlete = randomUUID();
const other = randomUUID();
const voiceAthlete = randomUUID();
const shots = "docs/visual/handoff-007-5-1a";
const title = "Evolução fictícia falada";
const proposalBody = "Relato fictício. Entorse de tornozelo direito. Nega dor noturna.";

function sql(input) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_prontuario-cbb", "psql", "-X", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8" }).trim();
}

test.afterAll(async () => {
  const ids = users.map((id) => `'${id}'`).join(",");
  sql(`delete from clinical.draft_proposals where athlete_id in ('${athlete}', '${other}', '${voiceAthlete}');
    delete from clinical.record_revisions where record_id in (select id from clinical.records where athlete_id in ('${athlete}', '${other}', '${voiceAthlete}'));
    delete from clinical.records where athlete_id in ('${athlete}', '${other}', '${voiceAthlete}');
    delete from clinical.encounters where athlete_id in ('${athlete}', '${other}', '${voiceAthlete}');
    delete from clinical.evolution_approvals where athlete_id in ('${athlete}', '${other}', '${voiceAthlete}');
    ${ids ? `delete from clinical.conversation_messages where session_id in (select id from clinical.conversation_sessions where professional_id in (${ids}));
    delete from clinical.conversation_sessions where professional_id in (${ids});
    delete from clinical.audit_events where actor_user_id in (${ids}) or athlete_id in ('${athlete}', '${other}', '${voiceAthlete}');` : ""}
    delete from clinical.athletes where id in ('${athlete}', '${other}', '${voiceAthlete}');`);
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

test("comando e voz selecionam o contexto e a frase explícita grava o rascunho", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `contexto-${randomUUID()}@example.com`;
  const password = randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const professional = created.data.user.id;
  users.push(professional);
  const profile = await admin.from("profiles").insert({ id: professional, display_name: "QA Contexto", profession: "Fisioterapia", can_read_audit: false });
  if (profile.error) throw profile.error;
  sql(`insert into clinical.athletes(id, full_name, category, source) values
      ('${athlete}', 'Alice Almeida Lopes', 'Sub-19', 'demo'),
      ('${other}', 'Alice Almeida Costa', 'Sub-19', 'demo');
    insert into clinical.athlete_access(athlete_id, professional_id, can_read_records, can_edit, can_write, can_finalize)
    values ('${athlete}', '${professional}', true, false, true, false),
      ('${other}', '${professional}', true, false, false, false);`);
  const client = createClient(localSupabase.url, localSupabase.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  const requestId = randomUUID();
  await page.route("**/api/inteligencia", async (route) => {
    const body = route.request().postDataJSON();
    const last = body.messages.at(-1).content;
    const alice = { id: athlete, name: "Alice Almeida Lopes", facts: ["Sub-19"] };
    const homonym = { id: other, name: "Alice Almeida Costa", facts: ["Sub-19"] };
    let payload = { text: "Resposta fictícia.", athletes: [], navigation: null, search: null, draft: null, context: null, contextCleared: false };
    if (last === "Coloque Alice Almeida Lopes em contexto." || last === "Coloque Alice em contexto.") {
      payload = { text: "Alice Almeida Lopes está em contexto.", athletes: [alice], navigation: null, search: null, draft: null, context: { id: athlete, name: "Alice Almeida Lopes" }, contextCleared: false };
    } else if (last === "Qual Alice?") {
      payload = { text: "Encontrei 2 atletas autorizados.", athletes: [alice, homonym], navigation: null, search: null, draft: null, context: null, contextCleared: false };
    } else if (last === "Tire do contexto.") {
      payload = { text: "Tirei a atleta do contexto.", athletes: [], navigation: null, search: null, draft: null, context: null, contextCleared: true };
    } else if (last === "Abra o prontuário.") {
      payload = { text: "O link abaixo abre o prontuário.", athletes: [], navigation: { id: athlete, href: `/atletas/${athlete}`, name: "Alice Almeida Lopes" }, search: null, draft: null, context: null, contextCleared: false };
    }
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream; charset=utf-8" },
      body: `event: done\ndata: ${JSON.stringify(payload)}\n\n`,
    });
  });

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
  await page.setViewportSize({ width: 1440, height: 900 });
  page.on("dialog", (dialog) => dialog.accept());
  const field = page.getByRole("textbox", { name: "Mensagem", exact: true });

  await field.fill("Qual Alice?");
  await field.press("Enter");
  await expect(page.getByRole("button", { name: "Colocar em contexto", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Contexto da tarefa" })).toHaveCount(0);

  await field.fill("Coloque Alice Almeida Lopes em contexto.");
  await field.press("Enter");
  await expect(page.getByRole("heading", { name: "Alice Almeida Lopes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Em contexto", exact: true }).first()).toBeVisible();
  expect(sql(`select athlete_id from clinical.conversation_sessions where professional_id = '${professional}' and status = 'active'`)).toBe(athlete);
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/contexto.png` });

  await field.fill("Abra o prontuário.");
  await field.press("Enter");
  await expect(page.getByRole("link", { name: "Abrir prontuário de Alice Almeida Lopes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Alice Almeida Lopes" })).toBeVisible();

  const registered = await client.rpc("clinical_draft_proposal_register", {
    target: athlete, request_id: requestId, entry_title: title, entry_body: proposalBody, occurred_on: "2026-11-10", restricted: true,
  });
  expect(registered.data.ok).toBe(true);

  await page.evaluate((value) => {
    sessionStorage.setItem("cbb-intelligence-turns:v1", JSON.stringify({ v: 1, turns: value }));
    window.dispatchEvent(new Event("cbb-intelligence-adopt"));
  }, [
    { id: "user-1", role: "user", text: "Prepare uma evolução da Alice.", athletes: [], navigation: null, search: null, draft: null },
    {
      id: "assistant-1", role: "assistant", text: "Organizei uma proposta de evolução para revisão. Ela ainda não foi salva.",
      athletes: [], navigation: null, search: null, draft: {
        state: "proposal", requestId, athleteId: athlete, athleteName: "Alice Almeida Lopes", professionalName: "QA Contexto",
        occurredOn: "2026-11-10", title, body: proposalBody, missing: [], restricted: true, recordId: null, error: null,
        contentHash: registered.data.contentHash, version: registered.data.version,
      },
    },
  ]);
  await expect(page.getByRole("region", { name: "Proposta de evolução" })).toBeVisible();
  await field.fill("Isso, perfeito. Pode confirmar e salvar.");
  await field.press("Enter");
  await expect(page.getByText("Rascunho salvo")).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir no prontuário" })).toBeVisible();
  const recordId = sql(`select id from clinical.records where athlete_id = '${athlete}' and status = 'draft'`);
  expect(recordId).toMatch(/^[0-9a-f-]{36}$/);
  await page.screenshot({ path: `${shots}/rascunho-falado.png` });
  await field.fill("Pode confirmar e salvar.");
  await field.press("Enter");
  expect(sql(`select count(*) from clinical.records where athlete_id = '${athlete}'`)).toBe("1");

  await field.fill("Tire do contexto.");
  await field.press("Enter");
  await expect(page.getByRole("heading", { name: "Alice Almeida Lopes" })).toHaveCount(0);
  expect(sql(`select coalesce(athlete_id::text, '') from clinical.conversation_sessions where professional_id = '${professional}' and status = 'active'`)).toBe("");

  await field.fill("Coloque Alice em contexto.");
  await field.press("Enter");
  await expect(page.getByRole("heading", { name: "Alice Almeida Lopes" })).toBeVisible();
  await page.getByRole("button", { name: "Nova conversa" }).click();
  await expect(page.getByRole("heading", { name: "Alice Almeida Lopes" })).toHaveCount(0);
  expect(sql(`select coalesce(athlete_id::text, '') from clinical.conversation_sessions where professional_id = '${professional}' and status = 'active'`)).toBe("");
});

test("voz seleciona o contexto e a frase explícita grava o rascunho", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `voz-contexto-${randomUUID()}@example.com`;
  const password = randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const professional = created.data.user.id;
  users.push(professional);
  const profile = await admin.from("profiles").insert({ id: professional, display_name: "QA Voz Contexto", profession: "Fisioterapia", can_read_audit: false });
  if (profile.error) throw profile.error;
  sql(`insert into clinical.athletes(id, full_name, category, source) values('${voiceAthlete}', 'Alice Almeida Lopes', 'Sub-19', 'demo');
    insert into clinical.athlete_access(athlete_id, professional_id, can_read_records, can_edit, can_write, can_finalize)
    values ('${voiceAthlete}', '${professional}', true, false, true, false);`);
  const client = createClient(localSupabase.url, localSupabase.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  const requestId = randomUUID();
  const calls = [];
  const dictation = await mockDictation(page);
  await page.route("**/api/inteligencia", async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    const last = body.messages.at(-1).content;
    const alice = { id: voiceAthlete, name: "Alice Almeida Lopes", facts: ["Sub-19"] };
    const payload = last === "Coloque Alice Almeida Lopes em contexto."
      ? { text: "Alice Almeida Lopes está em contexto.", athletes: [alice], navigation: null, search: null, draft: null, context: { id: voiceAthlete, name: "Alice Almeida Lopes" }, contextCleared: false }
      : { text: "Confirmação encaminhada.", athletes: [], navigation: null, search: null, draft: null, context: null, contextCleared: false };
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream; charset=utf-8" },
      body: `event: done\ndata: ${JSON.stringify(payload)}\n\n`,
    });
  });

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
  await page.setViewportSize({ width: 1440, height: 900 });
  await dictation.dictate("Coloque Alice Almeida Lopes em contexto.");
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0].inputMode).toBe("voice");
  await expect(page.getByRole("heading", { name: "Alice Almeida Lopes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Em contexto", exact: true }).first()).toBeVisible();
  expect(sql(`select athlete_id from clinical.conversation_sessions where professional_id = '${professional}' and status = 'active'`)).toBe(voiceAthlete);
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/voz-contexto.png` });

  const registered = await client.rpc("clinical_draft_proposal_register", {
    target: voiceAthlete, request_id: requestId, entry_title: title, entry_body: proposalBody, occurred_on: "2026-11-10", restricted: true,
  });
  expect(registered.data.ok).toBe(true);

  await page.evaluate((value) => {
    sessionStorage.setItem("cbb-intelligence-turns:v1", JSON.stringify({ v: 1, turns: value }));
    window.dispatchEvent(new Event("cbb-intelligence-adopt"));
  }, [
    { id: "user-1", role: "user", text: "Prepare uma evolução da Alice.", athletes: [], navigation: null, search: null, draft: null },
    {
      id: "assistant-1", role: "assistant", text: "Organizei uma proposta de evolução para revisão. Ela ainda não foi salva.",
      athletes: [], navigation: null, search: null, draft: {
        state: "proposal", requestId, athleteId: voiceAthlete, athleteName: "Alice Almeida Lopes", professionalName: "QA Voz Contexto",
        occurredOn: "2026-11-10", title, body: proposalBody, missing: [], restricted: true, recordId: null, error: null,
        contentHash: registered.data.contentHash, version: registered.data.version,
      },
    },
  ]);
  await expect(page.getByRole("region", { name: "Proposta de evolução" })).toBeVisible();
  await dictation.dictate("Pode confirmar e salvar.");
  await expect(page.getByText("Rascunho salvo")).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir no prontuário" })).toBeVisible();
  expect(sql(`select count(*) from clinical.records where athlete_id = '${voiceAthlete}' and status = 'draft'`)).toBe("1");
  expect(sql(`select execution_method from clinical.audit_events where actor_user_id = '${professional}' and operation = 'clinical_draft.confirmed' and outcome = 'success'`)).toBe("human_voice");
  await page.screenshot({ path: `${shots}/voz-rascunho.png` });
  await dictation.dictate("Pode salvar o rascunho.");
  await expect.poll(() => calls.length).toBe(3);
  expect(sql(`select count(*) from clinical.records where athlete_id = '${voiceAthlete}'`)).toBe("1");
});
