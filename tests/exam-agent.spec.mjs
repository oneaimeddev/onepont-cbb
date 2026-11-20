import { test, expect } from "./fixtures.mjs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { localSupabase } from "../scripts/local-supabase.mjs";

const admin = createClient(localSupabase.url, localSupabase.adminKey, { auth: { persistSession: false } });
const users = [];
const athlete = randomUUID();

function sql(input) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_prontuario-cbb", "psql", "-X", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8" }).trim();
}

async function user(name) {
  const email = `qa-exame-agente-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  const profile = await admin.from("profiles").insert({ id: data.user.id, display_name: name, profession: "Medicina" });
  if (profile.error) throw profile.error;
  const client = createClient(localSupabase.url, localSupabase.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const session = await client.auth.signInWithPassword({ email, password });
  if (session.error) throw session.error;
  return { id: data.user.id, client };
}

function exam(name, extra = {}) {
  return { id: randomUUID(), name, exam_type: extra.exam_type ?? "", region: extra.region ?? "", laterality: extra.laterality ?? "", technical_details: "", notes: "" };
}

function payload(items, extra = {}) {
  return {
    occurred_at: "",
    indication: extra.indication ?? "",
    justification: extra.justification ?? "",
    diagnosis: "",
    priority: "",
    additional: extra.additional ?? "",
    items,
  };
}

test.afterAll(async () => {
  const ids = users.map((id) => `'${id}'`).join(",") || "null";
  sql(`delete from clinical.document_proposals where athlete_id = '${athlete}';
    delete from clinical.document_revisions where document_id in (select id from clinical.documents where athlete_id = '${athlete}');
    delete from clinical.documents where athlete_id = '${athlete}';
    delete from clinical.conversation_messages where session_id in (select id from clinical.conversation_sessions where professional_id in (${ids}));
    delete from clinical.conversation_sessions where professional_id in (${ids});
    delete from clinical.audit_events where athlete_id = '${athlete}' or actor_user_id in (${ids});
    delete from clinical.medical_authors where professional_id in (${ids});
    delete from clinical.athlete_access where athlete_id = '${athlete}';
    delete from clinical.athletes where id = '${athlete}';`);
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

test("a confirmação grava uma única solicitação e a leitura devolve o original", async () => {
  const doctor = await user("QA Médica Exames");
  const colleague = await user("QA Colega Exames");
  const physio = await user("QA Sem exame");
  sql(`insert into clinical.athletes(id, full_name, source) values('${athlete}', 'Alice Almeida Lopes', 'demo');
    insert into clinical.athlete_access(athlete_id, professional_id, can_read_records) values
      ('${athlete}', '${doctor.id}', true),
      ('${athlete}', '${colleague.id}', true),
      ('${athlete}', '${physio.id}', true);
    insert into clinical.medical_authors(professional_id, credential_label, enabled, granted_by) values
      ('${doctor.id}', 'CRM fictício', true, '${doctor.id}'),
      ('${colleague.id}', 'CRM fictício', true, '${colleague.id}');`);

  const requestId = randomUUID();
  const first = payload([exam("Ressonância magnética", { exam_type: "imaging", region: "joelho", laterality: "right" })]);
  const denied = await physio.client.rpc("clinical_document_proposal_register", {
    target: athlete, request_id: randomUUID(), kind: "exam_request", payload: first,
  });
  expect(denied.data).toMatchObject({ ok: false, error: "denied" });
  expect(sql(`select count(*) from clinical.documents where athlete_id = '${athlete}'`)).toBe("0");

  const registered = await doctor.client.rpc("clinical_document_proposal_register", {
    target: athlete, request_id: requestId, kind: "exam_request", payload: first,
  });
  expect(registered.data.ok).toBe(true);
  const current = await doctor.client.rpc("clinical_document_proposal_current", { target: athlete, kind: "exam_request" });
  expect(current.data.requestId).toBe(requestId);
  expect(current.data.content.items[0].name).toBe("Ressonância magnética");

  const added = payload(
    [...first.items, exam("Hemograma completo", { exam_type: "laboratory" })],
    { justification: "Relato fictício informado pelo médico." },
  );
  const updated = await doctor.client.rpc("clinical_document_proposal_register", {
    target: athlete, request_id: requestId, kind: "exam_request", payload: added,
  });
  expect(updated.data.ok).toBe(true);
  expect(sql(`select count(*) from clinical.documents where athlete_id = '${athlete}'`)).toBe("0");

  const early = await doctor.client.rpc("clinical_document_confirm_utterance", {
    utterance: "Mostre a solicitação antes de salvar.", request_id: requestId, kind: "exam_request", payload: added, input_mode: "text",
  });
  expect(early.data).toMatchObject({ ok: false, error: "ignored" });
  expect(sql(`select count(*) from clinical.documents where athlete_id = '${athlete}'`)).toBe("0");

  const saved = await doctor.client.rpc("clinical_document_confirm_utterance", {
    utterance: "Isso, pode salvar o pedido de exames.", request_id: requestId, kind: "exam_request", payload: added, input_mode: "voice",
  });
  expect(saved.data.ok).toBe(true);
  expect(saved.data.id).toBe(requestId);
  expect(sql(`select document_type || '|' || status from clinical.documents where id = '${requestId}'`)).toBe("exam_request|draft");
  expect(sql(`select count(*) from clinical.documents where athlete_id = '${athlete}' and document_type = 'exam_request'`)).toBe("1");
  const replay = await doctor.client.rpc("clinical_document_confirm_utterance", {
    utterance: "Isso, pode salvar o pedido de exames.", request_id: requestId, kind: "exam_request", payload: added, input_mode: "voice",
  });
  expect(replay.data.id).toBe(requestId);
  expect(sql(`select count(*) from clinical.documents where athlete_id = '${athlete}' and document_type = 'exam_request'`)).toBe("1");

  const opened = await doctor.client.rpc("document_open", { target: athlete, document_id: requestId });
  expect(opened.data.content.items.map((item) => item.name)).toEqual(["Ressonância magnética", "Hemograma completo"]);
  expect(opened.data.content.justification).toBe("Relato fictício informado pelo médico.");
  const listed = await doctor.client.rpc("document_browse", { target: athlete, filters: { kind: "exam_request", months: "3" } });
  expect(listed.data.documents[0].id).toBe(requestId);
  expect(listed.data.documents[0].label).toBe("Ressonância magnética");

  const hidden = await colleague.client.rpc("document_browse", { target: athlete, filters: { kind: "exam_request" } });
  expect(JSON.stringify(hidden.data)).not.toContain(requestId);
  expect(JSON.stringify(hidden.data)).not.toContain("Hemograma");
  const foreign = await colleague.client.rpc("document_open", { target: athlete, document_id: requestId });
  expect(foreign.data.error).toBe("denied");

  const other = randomUUID();
  const second = await doctor.client.rpc("clinical_document_proposal_register", {
    target: athlete, request_id: other, kind: "exam_request", payload: payload([exam("Ultrassonografia")]),
  });
  expect(second.data.ok).toBe(true);
  const third = randomUUID();
  await doctor.client.rpc("clinical_document_proposal_register", {
    target: athlete, request_id: third, kind: "exam_request", payload: payload([exam("Radiografia")]),
  });
  const ambiguous = await doctor.client.rpc("clinical_document_proposal_current", { target: athlete, kind: "exam_request" });
  expect(ambiguous.data).toMatchObject({ ok: false, error: "ambiguous" });
  const spoken = await doctor.client.rpc("clinical_document_confirm_utterance", {
    utterance: "Pode confirmar e salvar.", request_id: null, kind: null, payload: null, input_mode: "text",
  });
  expect(spoken.data).toMatchObject({ ok: false, error: "ambiguous" });
  expect(sql(`select count(*) from clinical.documents where athlete_id = '${athlete}' and document_type = 'exam_request'`)).toBe("1");

  const trail = sql(`select coalesce(string_agg(operation || ' ' || outcome || ' ' || origin_channel || ' ' || execution_method, E'\\n'), '')
    from clinical.audit_events where athlete_id = '${athlete}';`);
  expect(trail).toContain("document.proposal_prepared success ai_chat agent_tool");
  expect(trail).toContain("document.draft_created success ai_chat human_voice");
  expect(trail).toContain("document.confirmed success ai_chat human_voice");
  expect(trail).not.toContain("Hemograma");
  expect(trail).not.toContain("Relato fictício");
});
