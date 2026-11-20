import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { expect, test } from "./fixtures.mjs";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "../scripts/local-supabase.mjs";

const admin = createClient(localSupabase.url, localSupabase.adminKey, { auth: { persistSession: false } });
const users = [];
const athlete = randomUUID();
const title = "Evolução fictícia falada";
const body = "Relato fictício. Entorse de tornozelo direito. Nega dor noturna.";

function sql(input) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_prontuario-cbb", "psql", "-X", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8" }).trim();
}

async function user(name) {
  const email = `fala-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  const profile = await admin.from("profiles").insert({ id: data.user.id, display_name: name, profession: "Fisioterapia", can_read_audit: false });
  if (profile.error) throw profile.error;
  const client = createClient(localSupabase.url, localSupabase.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id: data.user.id, client };
}

function confirm(client, requestId, utterance, mode = "voice", entry = body) {
  return client.rpc("clinical_draft_confirm_utterance", {
    utterance,
    request_id: requestId,
    entry_title: title,
    entry_body: entry,
    occurred_on: "2026-11-10",
    restricted: true,
    input_mode: mode,
  });
}

test.afterAll(async () => {
  const ids = users.map((id) => `'${id}'`).join(",");
  sql(`delete from clinical.draft_proposals where athlete_id = '${athlete}';
    delete from clinical.record_revisions where record_id in (select id from clinical.records where athlete_id = '${athlete}');
    delete from clinical.records where athlete_id = '${athlete}';
    delete from clinical.encounters where athlete_id = '${athlete}';
    delete from clinical.evolution_approvals where athlete_id = '${athlete}';
    ${ids ? `delete from clinical.conversation_messages where session_id in (select id from clinical.conversation_sessions where professional_id in (${ids}));
    delete from clinical.conversation_sessions where professional_id in (${ids});
    delete from clinical.audit_events where actor_user_id in (${ids}) or athlete_id = '${athlete}';` : ""}
    delete from clinical.athletes where id = '${athlete}';`);
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

test("confirmação falada grava só o rascunho exato e recusa o resto", async () => {
  const writer = await user("QA Fala");
  const reader = await user("QA Sem gravação");
  sql(`insert into clinical.athletes(id, full_name, source) values('${athlete}', 'Alice Almeida Lopes', 'demo');
    insert into clinical.athlete_access(athlete_id, professional_id, can_read_records, can_edit, can_write, can_finalize)
    values('${athlete}', '${writer.id}', true, false, true, true),
      ('${athlete}', '${reader.id}', true, false, false, false);`);

  const ignored = await confirm(writer.client, randomUUID(), "sim");
  expect(ignored.data).toMatchObject({ ok: false, error: "ignored" });
  const question = await confirm(writer.client, randomUUID(), "Pode salvar?");
  expect(question.data).toMatchObject({ ok: false, error: "ignored" });
  const finalize = await confirm(writer.client, randomUUID(), "Pode finalizar e salvar.");
  expect(finalize.data).toMatchObject({ ok: false, error: "ignored" });
  expect(sql(`select count(*) from clinical.records where athlete_id = '${athlete}'`)).toBe("0");

  const requestId = randomUUID();
  const registered = await writer.client.rpc("clinical_draft_proposal_register", {
    target: athlete, request_id: requestId, entry_title: title, entry_body: body, occurred_on: "2026-11-10", restricted: true,
  });
  expect(registered.data.ok).toBe(true);
  expect(registered.data.version).toBe(1);
  const other = randomUUID();
  const second = await writer.client.rpc("clinical_draft_proposal_register", {
    target: athlete, request_id: other, entry_title: title, entry_body: `${body} Segunda proposta.`, occurred_on: "2026-11-10", restricted: true,
  });
  expect(second.data.ok).toBe(true);
  const ambiguous = await confirm(writer.client, requestId, "Pode confirmar e salvar.");
  expect(ambiguous.data).toMatchObject({ ok: false, error: "ambiguous" });
  expect(sql(`select count(*) from clinical.records where athlete_id = '${athlete}'`)).toBe("0");
  await writer.client.rpc("clinical_draft_proposal_discard", { request_id: other });

  const modified = await confirm(writer.client, requestId, "Isso, perfeito. Pode confirmar e salvar.", "text", `${body} Texto alterado.`);
  expect(modified.data).toMatchObject({ ok: false, error: "modified" });
  expect(sql(`select count(*) from clinical.records where athlete_id = '${athlete}'`)).toBe("0");

  sql(`update clinical.athlete_access set can_write = false where athlete_id = '${athlete}' and professional_id = '${writer.id}'`);
  const denied = await confirm(writer.client, requestId, "Pode confirmar e salvar.", "text");
  expect(denied.data).toMatchObject({ ok: false, error: "denied" });
  sql(`update clinical.athlete_access set can_write = true where athlete_id = '${athlete}' and professional_id = '${writer.id}'`);

  const saved = await confirm(writer.client, requestId, "Pode confirmar e salvar.", "voice");
  expect(saved.data.ok).toBe(true);
  const recordId = saved.data.id;
  expect(sql(`select title || '|' || body || '|' || status || '|' || visibility from clinical.records where id = '${recordId}'`)).toBe(`${title}|${body}|draft|author_only`);
  const replay = await confirm(writer.client, requestId, "Pode confirmar e salvar.", "voice");
  expect(replay.data.id).toBe(recordId);
  expect(sql(`select count(*) from clinical.records where athlete_id = '${athlete}'`)).toBe("1");
  const audit = sql(`select outcome || '|' || origin_channel || '|' || execution_method from clinical.audit_events where actor_user_id = '${writer.id}' and operation = 'clinical_draft.confirmed' and outcome = 'success'`);
  expect(audit).toContain("success|ai_chat|human_voice");
  expect(sql(`select count(*) from clinical.audit_events where resource_id = '${recordId}' and operation = 'clinical_record.draft_saved' and execution_method = 'human_voice'`)).toBe("1");

  const readerRequest = randomUUID();
  const readerRegister = await reader.client.rpc("clinical_draft_proposal_register", {
    target: athlete, request_id: readerRequest, entry_title: title, entry_body: body, occurred_on: "2026-11-10", restricted: true,
  });
  expect(readerRegister.data).toMatchObject({ ok: false, error: "denied" });
  const foreign = await confirm(reader.client, requestId, "Pode confirmar e salvar.", "text");
  expect(foreign.data.ok).toBe(false);
  expect(sql(`select count(*) from clinical.records where athlete_id = '${athlete}'`)).toBe("1");

  await writer.client.rpc("conversation_start");
  const stale = await confirm(writer.client, requestId, "Pode confirmar e salvar.", "text");
  expect(stale.data.ok).toBe(false);
  expect(sql(`select count(*) from clinical.records where athlete_id = '${athlete}'`)).toBe("1");
});
