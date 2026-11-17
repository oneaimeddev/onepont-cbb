import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "../scripts/local-supabase.mjs";

const admin = createClient(localSupabase.url, localSupabase.adminKey, { auth: { persistSession: false } });
const users = [];
const athlete = randomUUID();
const prescription = {
  notes: "",
  items: [{
    id: "11111111-1111-4111-8111-111111111111",
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
const surgical = {
  procedure: "Artroscopia de joelho",
  region: "Joelho",
  laterality: "right",
  indication: "",
  diagnosis: "",
  justification: "Instabilidade após entorse fictícia.",
  priority: "",
  additional: "",
  materials: "",
};

function sql(input) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_prontuario-cbb", "psql", "-X", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8" }).trim();
}

async function user(name, profession) {
  const email = `doc-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  const profile = await admin.from("profiles").insert({ id: data.user.id, display_name: name, profession, can_read_audit: false });
  if (profile.error) throw profile.error;
  const client = createClient(localSupabase.url, localSupabase.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id: data.user.id, client };
}

function confirm(client, requestId, utterance, payload, mode = "text", kind = "prescription") {
  return client.rpc("clinical_document_confirm_utterance", {
    utterance,
    request_id: requestId,
    kind,
    payload,
    input_mode: mode,
  });
}

test.afterAll(async () => {
  const ids = users.map((id) => `'${id}'`).join(",");
  sql(`delete from clinical.document_proposals where athlete_id = '${athlete}';
    delete from clinical.document_revisions where document_id in (select id from clinical.documents where athlete_id = '${athlete}');
    delete from clinical.documents where athlete_id = '${athlete}';
    delete from clinical.draft_proposals where athlete_id = '${athlete}';
    delete from clinical.record_revisions where record_id in (select id from clinical.records where athlete_id = '${athlete}');
    delete from clinical.records where athlete_id = '${athlete}';
    delete from clinical.encounters where athlete_id = '${athlete}';
    delete from clinical.evolution_approvals where athlete_id = '${athlete}';
    ${ids ? `delete from clinical.conversation_messages where session_id in (select id from clinical.conversation_sessions where professional_id in (${ids}));
    delete from clinical.conversation_sessions where professional_id in (${ids});
    delete from clinical.audit_events where actor_user_id in (${ids}) or athlete_id = '${athlete}';
    delete from clinical.medical_authors where professional_id in (${ids});` : ""}
    delete from clinical.athletes where id = '${athlete}';`);
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

test("confirmação grava só o rascunho médico exato e recusa o resto", async () => {
  const doctor = await user("QA Médica", "Medicina");
  const physio = await user("QA Fisioterapia", "Fisioterapia");
  sql(`insert into clinical.athletes(id, full_name, source) values('${athlete}', 'Alice Almeida Lopes', 'demo');
    insert into clinical.athlete_access(athlete_id, professional_id, can_read_records, can_edit, can_write, can_finalize)
    values('${athlete}', '${doctor.id}', true, false, true, true),
      ('${athlete}', '${physio.id}', true, false, true, false);
    insert into clinical.medical_authors(professional_id, credential_label, enabled, granted_by)
    values('${doctor.id}', 'CRM fictício', true, '${doctor.id}');`);

  const denied = await physio.client.rpc("clinical_document_proposal_register", {
    target: athlete, request_id: randomUUID(), kind: "prescription", payload: prescription,
  });
  expect(denied.data).toMatchObject({ ok: false, error: "denied" });
  expect(sql(`select count(*) from clinical.documents where athlete_id = '${athlete}'`)).toBe("0");

  const requestId = randomUUID();
  const registered = await doctor.client.rpc("clinical_document_proposal_register", {
    target: athlete, request_id: requestId, kind: "prescription", payload: prescription,
  });
  expect(registered.data.ok).toBe(true);
  expect(registered.data.version).toBe(1);
  expect(sql(`select count(*) from clinical.documents where athlete_id = '${athlete}'`)).toBe("0");

  const issued = await confirm(doctor.client, requestId, "Emita a prescrição.", prescription);
  expect(issued.data).toMatchObject({ ok: false, error: "ignored" });
  const question = await confirm(doctor.client, requestId, "Pode salvar a prescrição?", prescription);
  expect(question.data).toMatchObject({ ok: false, error: "ignored" });

  const other = randomUUID();
  const second = await doctor.client.rpc("clinical_document_proposal_register", {
    target: athlete, request_id: other, kind: "surgical_order", payload: surgical,
  });
  expect(second.data.ok).toBe(true);
  const ambiguous = await confirm(doctor.client, requestId, "Pode confirmar e salvar.", prescription);
  expect(ambiguous.data).toMatchObject({ ok: false, error: "ambiguous" });
  expect(sql(`select count(*) from clinical.documents where athlete_id = '${athlete}'`)).toBe("0");

  const named = await confirm(doctor.client, null, "Pode confirmar e salvar a prescrição.", prescription, "voice");
  expect(named.data.ok).toBe(true);
  expect(named.data.id).toBe(requestId);
  expect(sql(`select document_type || '|' || status from clinical.documents where id = '${requestId}'`)).toBe("prescription|draft");
  expect(sql(`select content->'items'->0->>'schedule' from clinical.documents where id = '${requestId}'`)).toBe("a cada oito horas");
  expect(sql(`select count(*) from clinical.documents where athlete_id = '${athlete}' and status = 'ready_for_review'`)).toBe("0");

  const replay = await confirm(doctor.client, requestId, "Pode confirmar e salvar.", prescription, "voice");
  expect(replay.data.id).toBe(requestId);
  expect(sql(`select count(*) from clinical.documents where athlete_id = '${athlete}'`)).toBe("1");

  const textId = randomUUID();
  const textPrescription = {
    ...prescription,
    items: [{ ...prescription.items[0], id: "33333333-3333-4333-8333-333333333333", name: "Paracetamol" }],
  };
  const textRegistered = await doctor.client.rpc("clinical_document_proposal_register", {
    target: athlete, request_id: textId, kind: "prescription", payload: textPrescription,
  });
  expect(textRegistered.data.ok).toBe(true);
  const typed = await confirm(doctor.client, null, "Pode confirmar e salvar a prescrição.", textPrescription, "text");
  expect(typed.data.id).toBe(textId);
  expect(sql(`select count(*) from clinical.documents where athlete_id = '${athlete}'`)).toBe("2");

  const changed = { ...surgical, justification: "Justificativa que não foi confirmada." };
  const modified = await confirm(doctor.client, other, "Pode confirmar e salvar o pedido cirúrgico.", changed, "text", "surgical_order");
  expect(modified.data).toMatchObject({ ok: false, error: "modified" });
  expect(sql(`select count(*) from clinical.documents where athlete_id = '${athlete}'`)).toBe("2");

  const edited = { ...surgical, justification: "Justificativa revisada no cartão." };
  const card = await doctor.client.rpc("clinical_document_confirm_card", { request_id: other, kind: "surgical_order", payload: edited });
  expect(card.data.ok).toBe(true);
  expect(card.data.id).toBe(other);
  expect(sql(`select status || '|' || (content->>'justification') from clinical.documents where id = '${other}'`)).toBe("draft|Justificativa revisada no cartão.");
  const surgicalReplay = await confirm(doctor.client, other, "Pode confirmar e salvar o pedido cirúrgico.", edited, "text", "surgical_order");
  expect(surgicalReplay.data.id).toBe(other);
  expect(sql(`select count(*) from clinical.documents where athlete_id = '${athlete}'`)).toBe("3");

  const evolutionId = randomUUID();
  const evolution = await doctor.client.rpc("clinical_draft_proposal_register", {
    target: athlete, request_id: evolutionId, entry_title: "Evolução fictícia", entry_body: "Relato fictício sem prescrição.", occurred_on: "2026-11-10", restricted: true,
  });
  expect(evolution.data.ok).toBe(true);
  const notEvolution = await doctor.client.rpc("clinical_draft_confirm_utterance", {
    utterance: "Pode confirmar e salvar a prescrição.",
    request_id: evolutionId,
    entry_title: "Evolução fictícia",
    entry_body: "Relato fictício sem prescrição.",
    occurred_on: "2026-11-10",
    restricted: true,
    input_mode: "text",
  });
  expect(notEvolution.data).toMatchObject({ ok: false, error: "ignored" });
  expect(sql(`select count(*) from clinical.records where athlete_id = '${athlete}'`)).toBe("0");

  const audit = sql(`select string_agg(origin_channel || '|' || execution_method || '|' || operation, ' ') from clinical.audit_events where actor_user_id = '${doctor.id}' and operation in ('document.confirmed', 'document.draft_created') and outcome = 'success'`);
  expect(audit).toContain("ai_chat|human_voice|document.confirmed");
  expect(audit).toContain("ai_chat|human_message|document.confirmed");
  expect(audit).toContain("ai_chat|human_ui|document.confirmed");
  expect(audit).not.toContain("a cada oito horas");
  expect(sql(`select count(*) from clinical.audit_events where actor_user_id = '${doctor.id}' and operation = 'document.proposal_prepared' and outcome = 'success'`)).not.toBe("0");

  await doctor.client.rpc("conversation_start");
  const stale = await confirm(doctor.client, other, "Pode confirmar e salvar o pedido cirúrgico.", surgical);
  expect(stale.data.ok).toBe(false);
  expect(sql(`select count(*) from clinical.documents where athlete_id = '${athlete}'`)).toBe("3");
});
