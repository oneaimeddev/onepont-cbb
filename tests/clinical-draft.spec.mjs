import { test, expect } from "./fixtures.mjs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { localSupabase } from "../scripts/local-supabase.mjs";

const admin = createClient(localSupabase.url, localSupabase.adminKey, { auth: { persistSession: false } });
const users = [];
const athlete = randomUUID();
const proposed = "Relato fictício. Dor no tornozelo após o treino. Sem exame de imagem.";
const approved = "Relato fictício revisado. Dor no tornozelo após o treino. Conduta: gelo e reavaliação.";
const title = "Evolução fictícia de tornozelo";

function sql(input) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_prontuario-cbb", "psql", "-X", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8" }).trim();
}

async function user(name) {
  const email = `qa-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const id = data.user.id;
  users.push(id);
  const profile = await admin.from("profiles").insert({ id, display_name: name, profession: "Fisioterapia", can_read_audit: true });
  if (profile.error) throw profile.error;
  const client = createClient(localSupabase.url, localSupabase.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id, email, password, client };
}

function proposal(requestId) {
  return [
    { id: "user-draft", role: "user", text: "Elabore uma evolução fictícia do atendimento de hoje.", athletes: [], navigation: null, search: null, draft: null },
    {
      id: "assistant-draft",
      role: "assistant",
      text: "Organizei uma proposta de evolução para revisão. Ela ainda não foi salva.",
      athletes: [],
      navigation: null,
      search: null,
      draft: {
        state: "proposal",
        requestId,
        athleteId: athlete,
        athleteName: "Atleta QA evolução assistida",
        professionalName: "QA Evolução",
        occurredOn: "2026-11-10",
        title,
        body: proposed,
        missing: ["Exame de imagem"],
        restricted: true,
        recordId: null,
        error: null,
      },
    },
  ];
}

test.afterAll(async () => {
  const ids = users.map((id) => `'${id}'`).join(",");
  sql(`delete from clinical.record_revisions where record_id in (select id from clinical.records where athlete_id = '${athlete}');
    delete from clinical.records where athlete_id = '${athlete}';
    delete from clinical.encounters where athlete_id = '${athlete}';
    delete from clinical.evolution_approvals where athlete_id = '${athlete}';
    ${ids ? `delete from clinical.conversation_messages where session_id in (select id from clinical.conversation_sessions where professional_id in (${ids}));
    delete from clinical.conversation_sessions where professional_id in (${ids});
    delete from clinical.audit_events where actor_user_id in (${ids}) or athlete_id = '${athlete}';` : ""}
    delete from clinical.athletes where id = '${athlete}';`);
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

test("prepara, revisa, confirma e bloqueia a evolução assistida", async ({ page }) => {
  test.setTimeout(90_000);
  const writer = await user("QA Evolução");
  const reader = await user("QA Leitor");
  const stranger = await user("QA Sem acesso");
  sql(`insert into clinical.athletes(id, full_name, source) values('${athlete}', 'Atleta QA evolução assistida', 'demo');
    insert into clinical.athlete_access(athlete_id, professional_id, can_read_records, can_edit, can_write, can_finalize)
    values('${athlete}', '${writer.id}', true, false, true, true),
      ('${athlete}', '${reader.id}', true, false, false, false);`);

  const prepared = await writer.client.rpc("agent_clinical_draft_prepare", { target: athlete });
  expect(prepared.data.ok).toBe(true);
  expect(prepared.data.athleteName).toBe("Atleta QA evolução assistida");
  expect(prepared.data.professionalName).toBe("QA Evolução");
  expect(sql(`select count(*) from clinical.records where athlete_id = '${athlete}'`)).toBe("0");
  expect(sql(`select origin_channel || '|' || execution_method from clinical.audit_events where athlete_id = '${athlete}' and operation = 'clinical_draft.prepared' and outcome = 'success'`)).toBe("ai_chat|agent_tool");

  const denied = await reader.client.rpc("agent_clinical_draft_prepare", { target: athlete });
  expect(denied.data).toMatchObject({ ok: false, error: "denied" });
  const hidden = await stranger.client.rpc("clinical_draft_approve", {
    target: athlete, request_id: randomUUID(), entry_title: title, entry_body: proposed, occurred_on: null, restricted: true,
  });
  expect(hidden.data).toMatchObject({ ok: false, error: "denied" });
  expect(sql(`select count(*) from clinical.records where athlete_id = '${athlete}'`)).toBe("0");

  const unapproved = await writer.client.rpc("clinical_draft_commit", {
    approval_id: randomUUID(), target: athlete, entry_title: title, entry_body: proposed, occurred_on: "2026-11-10", restricted: true,
  });
  expect(unapproved.data).toMatchObject({ ok: false, error: "invalid" });
  const invalid = await writer.client.rpc("clinical_draft_approve", {
    target: athlete, request_id: randomUUID(), entry_title: " ", entry_body: proposed, occurred_on: null, restricted: true,
  });
  expect(invalid.data).toMatchObject({ ok: false, error: "invalid" });

  const reusedRequest = randomUUID();
  const reusedApproval = await writer.client.rpc("clinical_draft_approve", {
    target: athlete, request_id: reusedRequest, entry_title: "Evolução fictícia isolada", entry_body: "Texto A fictício.", occurred_on: null, restricted: true,
  });
  expect(reusedApproval.data.ok).toBe(true);
  const mismatched = await writer.client.rpc("clinical_draft_commit", {
    approval_id: reusedApproval.data.approvalId, target: athlete, entry_title: "Evolução fictícia isolada", entry_body: "Texto B fictício.", occurred_on: null, restricted: true,
  });
  expect(mismatched.data).toMatchObject({ ok: false, error: "reused" });
  const matched = await writer.client.rpc("clinical_draft_commit", {
    approval_id: reusedApproval.data.approvalId, target: athlete, entry_title: "Evolução fictícia isolada", entry_body: "Texto A fictício.", occurred_on: null, restricted: true,
  });
  expect(matched.data.ok).toBe(true);
  const replay = await writer.client.rpc("clinical_draft_commit", {
    approval_id: reusedApproval.data.approvalId, target: athlete, entry_title: "Evolução fictícia isolada", entry_body: "Texto A fictício.", occurred_on: null, restricted: true,
  });
  expect(replay.data.id).toBe(matched.data.id);
  const rewritten = await writer.client.rpc("clinical_draft_commit", {
    approval_id: reusedApproval.data.approvalId, target: athlete, entry_title: "Evolução fictícia isolada", entry_body: "Texto C fictício.", occurred_on: null, restricted: false,
  });
  expect(rewritten.data).toMatchObject({ ok: false, error: "reused" });
  expect(sql(`select body || '|' || status || '|' || visibility from clinical.records where id = '${matched.data.id}'`)).toBe("Texto A fictício.|draft|author_only");
  expect(sql(`select count(*) from clinical.records where id = '${matched.data.id}'`)).toBe("1");

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(writer.email);
  await page.getByLabel("Senha", { exact: true }).fill(writer.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/?atleta=${athlete}`);
  await expect(page.getByRole("heading", { name: "Atleta QA evolução assistida" })).toBeVisible();

  const before = sql(`select count(*) from clinical.records where athlete_id = '${athlete}' and title = '${title}'`);
  expect(before).toBe("0");
  const requestId = randomUUID();
  await page.evaluate((value) => {
    sessionStorage.setItem("cbb-intelligence-turns:v1", JSON.stringify({ v: 1, turns: value }));
    window.dispatchEvent(new Event("cbb-intelligence-adopt"));
  }, proposal(requestId));
  const card = page.getByRole("region", { name: "Proposta de evolução" });
  await expect(card.getByText("Proposta ainda não salva")).toBeVisible();
  await expect(card.getByText(proposed)).toBeVisible();
  await expect(card.getByText("Exame de imagem", { exact: true })).toBeVisible();
  await expect(card.getByText("QA Evolução", { exact: true })).toBeVisible();
  mkdirSync("docs/visual/handoff-007-5", { recursive: true });
  await page.screenshot({ path: "docs/visual/handoff-007-5/proposta.png" });
  expect(sql(`select count(*) from clinical.records where athlete_id = '${athlete}' and title = '${title}'`)).toBe("0");

  await card.getByRole("button", { name: "Descartar" }).click();
  await expect(card.getByText("Proposta descartada. Nenhum registro foi gravado.")).toBeVisible();
  expect(sql(`select count(*) from clinical.records where athlete_id = '${athlete}' and title = '${title}'`)).toBe("0");

  const savedRequest = randomUUID();
  await page.evaluate((value) => {
    sessionStorage.setItem("cbb-intelligence-turns:v1", JSON.stringify({ v: 1, turns: value }));
    window.dispatchEvent(new Event("cbb-intelligence-adopt"));
  }, proposal(savedRequest));
  const review = page.getByRole("region", { name: "Proposta de evolução" });
  await review.getByRole("button", { name: "Editar" }).click();
  const restrict = review.getByRole("checkbox", { name: "Restringir o registro ao autor" });
  const box = await restrict.boundingBox();
  expect(box?.width ?? 999).toBeLessThanOrEqual(24);
  expect(box?.height ?? 999).toBeLessThanOrEqual(24);
  await restrict.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "docs/visual/handoff-007-5/edicao.png" });
  await review.getByLabel("Conteúdo").fill(approved);
  await review.getByRole("button", { name: "Confirmar e salvar" }).click();
  await expect(review.getByText("Rascunho salvo")).toBeVisible();
  await expect(review.getByRole("link", { name: "Abrir no prontuário" })).toBeVisible();
  await page.screenshot({ path: "docs/visual/handoff-007-5/rascunho-salvo.png" });

  const recordId = sql(`select id from clinical.records where athlete_id = '${athlete}' and title = '${title}'`);
  expect(sql(`select body from clinical.records where id = '${recordId}'`)).toBe(approved);
  expect(sql(`select status || '|' || visibility || '|' || author_id || '|' || author_name from clinical.records where id = '${recordId}'`)).toBe(`draft|author_only|${writer.id}|QA Evolução`);
  expect(sql(`select to_char(occurred_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') from clinical.records where id = '${recordId}'`)).toBe("2026-11-10");
  expect(sql(`select count(*) from clinical.records where athlete_id = '${athlete}' and title = '${title}'`)).toBe("1");
  expect(sql(`select count(*) from clinical.audit_events where athlete_id = '${athlete}' and operation = 'clinical_record.finalized'`)).toBe("0");

  await expect.poll(() => sql(`select coalesce(string_agg(draft::text, ''), '') from clinical.conversation_messages message join clinical.conversation_sessions session on session.id = message.session_id where session.professional_id = '${writer.id}'`)).toContain(recordId);
  const transcript = sql(`select coalesce(string_agg(text || coalesce(draft::text, ''), ' '), '') from clinical.conversation_messages message join clinical.conversation_sessions session on session.id = message.session_id where session.professional_id = '${writer.id}'`);
  expect(transcript).not.toContain(approved);
  expect(transcript).not.toContain(proposed);
  const auditText = sql(`select coalesce(string_agg(operation || outcome || coalesce(resource_id::text, ''), ' '), '') from clinical.audit_events where athlete_id = '${athlete}'`);
  expect(auditText).not.toContain(approved);
  expect(sql(`select origin_channel || '|' || execution_method from clinical.audit_events where athlete_id = '${athlete}' and operation = 'clinical_draft.confirmed' and outcome = 'success' order by occurred_at desc limit 1`)).toBe("ai_chat|human_ui");
  expect(sql(`select origin_channel || '|' || execution_method from clinical.audit_events where resource_id = '${recordId}' and operation = 'clinical_record.draft_saved'`)).toBe("ai_chat|human_ui");

  const approvalId = sql(`select id from clinical.evolution_approvals where actor_id = '${writer.id}' and request_id = '${savedRequest}'`);
  const duplicate = await writer.client.rpc("clinical_draft_commit", {
    approval_id: approvalId, target: athlete, entry_title: title, entry_body: approved, occurred_on: "2026-11-10", restricted: true,
  });
  expect(duplicate.data.id).toBe(recordId);
  expect(sql(`select count(*) from clinical.records where athlete_id = '${athlete}' and title = '${title}'`)).toBe("1");

  const timeline = await reader.client.rpc("athlete_workspace", { target: athlete, view_name: "timeline" });
  expect(JSON.stringify(timeline.data)).not.toContain(approved);
  expect(JSON.stringify(timeline.data.records ?? [])).not.toContain(recordId);

  const failedModel = await page.request.post("/api/inteligencia", {
    data: { messages: [{ role: "user", content: "Elabore outra evolução fictícia deste atleta." }], contextAthleteId: athlete },
    headers: { origin: "http://127.0.0.1:3100" },
  });
  expect(failedModel.status()).toBe(503);
  expect(sql(`select count(*) from clinical.records where athlete_id = '${athlete}' and title = '${title}'`)).toBe("1");

  await review.getByRole("link", { name: "Abrir no prontuário" }).click();
  await expect(page.getByRole("heading", { name: "Revisar evolução" })).toBeVisible();
  await expect(page.getByLabel("Conteúdo")).toHaveValue(approved);
  await expect(page.getByText("Este registro permanece restrito ao autor.")).toBeVisible();
  await page.screenshot({ path: "docs/visual/handoff-007-5/evolucao-tradicional.png" });
  expect(sql(`select origin_channel || '|' || execution_method from clinical.audit_events where athlete_id = '${athlete}' and operation = 'clinical_record.timeline.read' and outcome = 'success' order by occurred_at desc limit 1`)).toBe("traditional_ui|human_ui");

  const traditional = await writer.client.rpc("clinical_save", {
    target: athlete, request_id: randomUUID(), record_id: null, expected_version: null,
    entry_title: "Evolução tradicional fictícia", entry_body: "Texto fictício da interface tradicional.", restricted: true, finalize: false,
  });
  expect(traditional.data.id).toBeTruthy();
  expect(sql(`select status from clinical.records where id = '${traditional.data.id}'`)).toBe("draft");
  expect(sql(`select origin_channel || '|' || execution_method from clinical.audit_events where resource_id = '${traditional.data.id}' and operation = 'clinical_record.draft_saved'`)).toBe("traditional_ui|human_ui");

  await page.goto(`/?atleta=${athlete}`);
  await expect(page.getByRole("heading", { name: "Atleta QA evolução assistida" })).toBeVisible();
  const savedCard = page.getByRole("region", { name: "Proposta de evolução" });
  await expect(savedCard.getByText("Rascunho salvo")).toBeVisible();
  await expect(savedCard.getByRole("link", { name: "Abrir no prontuário" })).toHaveAttribute("href", `/atletas/${athlete}/evolucao?registro=${recordId}`);
  const finish = savedCard.getByRole("button", { name: "Confirmar finalização" });
  await expect(finish).toBeDisabled();

  sql(`update clinical.athlete_access set can_finalize = false where athlete_id = '${athlete}' and professional_id = '${writer.id}';`);
  const blocked = await writer.client.rpc("clinical_draft_finalize", { target: athlete, record_id: recordId });
  expect(blocked.data).toMatchObject({ ok: false, error: "denied" });
  expect(sql(`select status from clinical.records where id = '${recordId}'`)).toBe("draft");
  expect(sql(`select origin_channel || '|' || execution_method from clinical.audit_events where resource_id = '${recordId}' and operation = 'clinical_record.finalized' and outcome = 'denied'`)).toBe("ai_chat|human_ui");
  sql(`update clinical.athlete_access set can_finalize = true where athlete_id = '${athlete}' and professional_id = '${writer.id}';`);

  await savedCard.getByRole("checkbox", { name: "Revisei esta versão e confirmo a finalização para este atleta." }).check();
  await expect(finish).toBeEnabled();
  await finish.click();
  await expect(savedCard.getByText("Finalizada")).toBeVisible();
  await expect(page.getByText("A evolução foi finalizada.")).toBeVisible();
  expect(sql(`select status || '|' || visibility || '|' || body from clinical.records where id = '${recordId}'`)).toBe(`finalized|author_only|${approved}`);
  expect(sql(`select origin_channel || '|' || execution_method from clinical.audit_events where resource_id = '${recordId}' and operation = 'clinical_record.finalized' and outcome = 'success'`)).toBe("ai_chat|human_ui");
  const repeated = await writer.client.rpc("clinical_draft_finalize", { target: athlete, record_id: recordId });
  expect(repeated.data).toMatchObject({ ok: true, id: recordId });
  expect(sql(`select count(*) from clinical.audit_events where resource_id = '${recordId}' and operation = 'clinical_record.finalized' and outcome = 'success'`)).toBe("1");
  await expect.poll(() => sql(`select coalesce(string_agg(coalesce(draft->>'state', ''), ''), '') from clinical.conversation_messages message join clinical.conversation_sessions session on session.id = message.session_id where session.professional_id = '${writer.id}'`)).toContain("finalized");
  const finalizedTranscript = sql(`select coalesce(string_agg(text || coalesce(draft::text, ''), ' '), '') from clinical.conversation_messages message join clinical.conversation_sessions session on session.id = message.session_id where session.professional_id = '${writer.id}'`);
  expect(finalizedTranscript).not.toContain(approved);

  const timelineHref = `/atletas/${athlete}?aba=timeline&registro=${recordId}#registro-${recordId}`;
  await expect(savedCard.getByRole("link", { name: "Abrir evolução" })).toHaveAttribute("href", timelineHref);
  await savedCard.getByRole("link", { name: "Abrir evolução" }).click();
  await expect(page.getByRole("heading", { name: "Linha do tempo" })).toBeVisible();
  await expect(page.getByText(approved)).toBeVisible();
  await expect(page.locator(`#registro-${recordId}`)).toBeVisible();
  await page.screenshot({ path: "docs/visual/handoff-007-5/finalizada.png" });
});
