import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "../scripts/local-supabase.mjs";

const admin = createClient(localSupabase.url, localSupabase.adminKey, { auth: { persistSession: false } });
const users = [];
const athlete = randomUUID();
const prescription = {
  notes: "",
  items: [{
    id: "22222222-2222-4222-8222-222222222222",
    name: "Dipirona",
    presentation: "",
    dose: "500",
    dose_unit: "mg",
    route: "",
    schedule: "a cada oito horas",
    duration: "",
    quantity: "",
    instructions: "",
  }],
};

function sql(input) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_prontuario-cbb", "psql", "-X", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8" }).trim();
}

test.afterAll(async () => {
  const ids = users.map((id) => `'${id}'`).join(",");
  sql(`delete from clinical.document_proposals where athlete_id = '${athlete}';
    delete from clinical.document_revisions where document_id in (select id from clinical.documents where athlete_id = '${athlete}');
    delete from clinical.documents where athlete_id = '${athlete}';
    ${ids ? `delete from clinical.conversation_messages where session_id in (select id from clinical.conversation_sessions where professional_id in (${ids}));
    delete from clinical.conversation_sessions where professional_id in (${ids});
    delete from clinical.audit_events where actor_user_id in (${ids}) or athlete_id = '${athlete}';
    delete from clinical.medical_authors where professional_id in (${ids});` : ""}
    delete from clinical.athletes where id = '${athlete}';`);
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

test("uma frase explícita grava só o rascunho da prescrição", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `doc-voz-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const id = data.user.id;
  users.push(id);
  const profile = await admin.from("profiles").insert({ id, display_name: "QA Médica", profession: "Medicina", can_read_audit: false });
  if (profile.error) throw profile.error;
  const client = createClient(localSupabase.url, localSupabase.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  sql(`insert into clinical.athletes(id, full_name, source) values('${athlete}', 'Alice Almeida Lopes', 'demo');
    insert into clinical.athlete_access(athlete_id, professional_id, can_read_records, can_edit, can_write, can_finalize)
    values('${athlete}', '${id}', true, false, true, true);
    insert into clinical.medical_authors(professional_id, credential_label, enabled, granted_by)
    values('${id}', 'CRM fictício', true, '${id}');`);
  const requestId = randomUUID();
  await page.route("**/api/inteligencia", async (route) => {
    const payload = { text: "A confirmação fica com o sistema.", athletes: [], navigation: null, search: null, draft: null, document: null, context: null, contextCleared: false };
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
  // Match the real flow: open the current conversation before registering its proposal.
  await page.getByRole("textbox", { name: "Mensagem", exact: true }).fill("Prepare uma prescrição fictícia.");
  await page.getByRole("textbox", { name: "Mensagem", exact: true }).press("Enter");
  await expect(page.getByRole("region", { name: "Histórico da conversa" })).toContainText("A confirmação fica com o sistema.");
  const registered = await client.rpc("clinical_document_proposal_register", {
    target: athlete, request_id: requestId, kind: "prescription", payload: prescription,
  });
  expect(registered.data.ok).toBe(true);

  await page.evaluate((value) => {
    sessionStorage.setItem("cbb-intelligence-turns:v1", JSON.stringify({ v: 1, turns: value }));
    window.dispatchEvent(new Event("cbb-intelligence-adopt"));
  }, [
    { id: "user-doc", role: "user", text: "Prepare uma prescrição fictícia.", athletes: [], navigation: null, search: null, draft: null, document: null },
    {
      id: "assistant-doc",
      role: "assistant",
      text: "Organizei uma proposta de documento para revisão. Ela ainda não foi salva.",
      athletes: [], navigation: null, search: null, draft: null,
      document: {
        state: "proposal", requestId, athleteId: athlete, athleteName: "Alice Almeida Lopes", professionalName: "QA Médica",
        credentialLabel: "CRM fictício", kind: "prescription", title: "Dipirona", content: prescription,
        missing: ["Medicamento 1: Duração"], documentId: null, error: null,
        contentHash: registered.data.contentHash, version: registered.data.version,
      },
    },
  ]);
  const card = page.getByRole("region", { name: "Proposta de prescrição" });
  await expect(card.getByText("Proposta ainda não salva")).toBeVisible();
  const field = page.getByRole("textbox", { name: "Mensagem", exact: true });
  await field.fill("Pode confirmar e salvar.");
  await field.press("Enter");
  await expect(card.getByText("Rascunho salvo")).toBeVisible();
  await expect(card.getByText("Ele não foi emitido nem assinado.")).toBeVisible();
  mkdirSync("docs/visual/handoff-007-5-1b", { recursive: true });
  await page.screenshot({ path: "docs/visual/handoff-007-5-1b/prescricao-falada.png" });
  expect(sql(`select count(*) from clinical.documents where id = '${requestId}' and status = 'draft'`)).toBe("1");
  expect(sql(`select content->'items'->0->>'schedule' from clinical.documents where id = '${requestId}'`)).toBe("a cada oito horas");
  const replay = await client.rpc("clinical_document_confirm_utterance", {
    utterance: "Pode confirmar e salvar.",
    request_id: requestId,
    kind: "prescription",
    payload: prescription,
    input_mode: "text",
  });
  expect(replay.data.id).toBe(requestId);
  expect(sql(`select count(*) from clinical.documents where athlete_id = '${athlete}'`)).toBe("1");
  expect(sql(`select origin_channel || '|' || execution_method from clinical.audit_events where resource_id = '${requestId}' and operation = 'document.confirmed' and outcome = 'success'`)).toBe("ai_chat|human_message");
});
