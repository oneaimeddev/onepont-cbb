import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { expect, test } from "./fixtures.mjs";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "../scripts/local-supabase.mjs";

const admin = createClient(localSupabase.url, localSupabase.adminKey, { auth: { persistSession: false } });
const users = [];
const athlete = randomUUID();
const shots = "docs/visual/handoff-007-5-2";
const prescriptionName = "Dipirona fictícia longitudinal";
const physioTitle = "Evolução fictícia de fisioterapia";
const medicalTitle = "Evolução fictícia de medicina";

function sql(input) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_prontuario-cbb", "psql", "-X", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8" }).trim();
}

test.afterAll(async () => {
  const ids = users.map((id) => `'${id}'`).join(",") || "null";
  sql(`delete from clinical.document_revisions where document_id in (select id from clinical.documents where athlete_id = '${athlete}');
    delete from clinical.documents where athlete_id = '${athlete}';
    delete from clinical.records where athlete_id = '${athlete}';
    delete from clinical.conversation_messages where session_id in (select id from clinical.conversation_sessions where professional_id in (${ids}));
    delete from clinical.conversation_sessions where professional_id in (${ids});
    delete from clinical.audit_events where actor_user_id in (${ids}) or athlete_id = '${athlete}';
    delete from clinical.medical_authors where professional_id in (${ids});
    delete from clinical.athlete_access where athlete_id = '${athlete}' or professional_id in (${ids});
    delete from clinical.athletes where id = '${athlete}';`);
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

async function mockVoice(page) {
  const live = { tokens: 0, sockets: [] };
  await page.route("**/api/inteligencia/voz", async (route) => {
    live.tokens += 1;
    const socketUrl = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent";
    await route.fulfill({ json: { token: `auth_tokens/offline-${live.tokens}`, url: socketUrl, expiresAt: new Date(Date.now() + 600_000).toISOString() } });
  });
  await page.routeWebSocket(/generativelanguage\.googleapis\.com/, (ws) => {
    const entry = { ws, ready: false };
    live.sockets.push(entry);
    ws.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      if (message.setup) {
        entry.ready = true;
        ws.send(JSON.stringify({ setupComplete: {} }));
      }
    });
  });
  return {
    final(text) {
      const current = live.sockets.at(-1);
      current.ws.send(JSON.stringify({ serverContent: { inputTranscription: { text } } }));
    },
  };
}

test("texto e voz usam a mesma análise longitudinal", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `voz-historico-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  const profile = await admin.from("profiles").insert({ id: data.user.id, display_name: "QA Voz História", profession: "Medicina", can_manage_access: false, can_read_audit: false });
  if (profile.error) throw profile.error;
  const client = createClient(localSupabase.url, localSupabase.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  const prescription = randomUUID();
  const physioRecord = randomUUID();
  const medicalRecord = randomUUID();
  sql(`insert into clinical.athletes(id, full_name, source) values ('${athlete}', 'Atleta DEMO Longitudinal', 'demo');
    insert into clinical.athlete_access(athlete_id, professional_id, can_read_records) values ('${athlete}', '${data.user.id}', true);
    insert into clinical.medical_authors(professional_id, credential_label, enabled, granted_by) values ('${data.user.id}', 'CRM fictício', true, '${data.user.id}');
    insert into clinical.records(id, athlete_id, author_id, author_name, specialty, title, body, occurred_at, status, visibility) values
      ('${physioRecord}', '${athlete}', '${data.user.id}', 'QA Voz História', 'Fisioterapia', '${physioTitle}', 'Texto fictício da fisioterapia.', '2026-08-02', 'finalized', 'care_team'),
      ('${medicalRecord}', '${athlete}', '${data.user.id}', 'QA Voz História', 'Medicina', '${medicalTitle}', 'Texto fictício da medicina.', '2026-08-10', 'finalized', 'care_team');`);
  const saved = await client.rpc("document_save", {
    target: athlete, document_id: prescription, expected_version: 0, kind: "prescription", intent: "save",
    payload: { notes: "", items: [{ id: randomUUID(), name: prescriptionName, presentation: "", dose: "500", dose_unit: "mg", route: "", schedule: "", duration: "", quantity: "", instructions: "" }] },
  });
  expect(saved.data.status).toBe("draft");

  const voice = await mockVoice(page);
  mkdirSync(shots, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
  await page.goto(`/?atleta=${athlete}`);
  await expect(page.getByRole("heading", { name: "Atleta DEMO Longitudinal" })).toBeVisible();
  const field = page.getByRole("textbox", { name: "Mensagem", exact: true });
  await expect(field).toBeEnabled();
  await field.fill("Analise o histórico deste atleta nos últimos doze meses.");
  await field.press("Enter");
  const card = page.getByRole("region", { name: "Análise longitudinal" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Cobertura completa dos registros autorizados neste recorte.");
  await expect(card).toContainText("Prescrição registrada não mostra que o medicamento foi utilizado.");
  await expect(card.getByRole("heading", { name: physioTitle })).toBeVisible();
  await expect(card.getByRole("heading", { name: medicalTitle })).toBeVisible();
  await card.getByText("Análise longitudinal").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/analise-1440x900.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await card.getByText("Análise longitudinal").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/analise-390x844.png` });
  await page.setViewportSize({ width: 1440, height: 900 });
  const physioCard = card.locator("li").filter({ has: page.getByRole("heading", { name: physioTitle }) });
  await physioCard.getByRole("button", { name: "Ler" }).click();
  await expect(physioCard.getByText("Texto fictício da fisioterapia.")).toBeVisible();
  await expect(physioCard.getByText("Conteúdo recuperado do registro. Não foi reescrito pelo assistente.")).toBeVisible();
  await physioCard.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/fonte-1440x900.png` });

  await field.fill("Agora foque somente na fisioterapia.");
  await field.press("Enter");
  const focused = page.getByRole("region", { name: "Análise longitudinal" }).last();
  await expect(focused.getByRole("heading", { name: physioTitle })).toBeVisible();
  await expect(focused.getByRole("heading", { name: medicalTitle })).toHaveCount(0);
  await expect(focused.getByRole("heading", { name: prescriptionName })).toHaveCount(0);
  await field.fill("De onde veio essa informação?");
  await field.press("Enter");
  await expect(page.getByText("As fontes estão nos cartões da análise.")).toBeVisible();
  await field.fill("Amplie para todo o histórico.");
  await field.press("Enter");
  await expect(page.getByRole("region", { name: "Análise longitudinal" }).last()).toContainText("todo o histórico autorizado");

  const heard = page.waitForRequest((request) => request.url().includes("/api/inteligencia/historico") && request.postDataJSON()?.inputMode === "voice");
  await page.getByRole("button", { name: "Iniciar conversa por voz" }).click();
  await expect(page.getByRole("region", { name: "Conversa por voz" }).getByRole("status")).toContainText("Ouvindo");
  voice.final("Analise o histórico deste atleta nos últimos seis meses.");
  const request = await heard;
  expect(request.postDataJSON().inputMode).toBe("voice");
  await expect(page.getByRole("region", { name: "Análise longitudinal" }).last()).toContainText("últimos 6 meses");
  expect(sql(`select execution_method from clinical.audit_events where actor_user_id = '${data.user.id}' and operation = 'history.read' order by occurred_at desc limit 1`)).toBe("human_voice");
});
