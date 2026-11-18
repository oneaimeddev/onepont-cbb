import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "../scripts/local-supabase.mjs";

const admin = createClient(localSupabase.url, localSupabase.adminKey, { auth: { persistSession: false } });
const users = [];
const athlete = randomUUID();
const cardAthlete = randomUUID();
const outsider = randomUUID();
const privateTitle = "NOTA-PRIVADA-LONGITUDINAL";
const privateBody = "CORPO-PRIVADO-LONGITUDINAL";
const prescriptionName = "Dipirona fictícia longitudinal";
const examName = "Hemograma fictício longitudinal";
const surgeryName = "Artroscopia fictícia longitudinal";
const physioTitle = "Evolução fictícia de fisioterapia";
const medicalTitle = "Evolução fictícia de medicina";
const oldTitle = "Evolução fictícia antiga";
const draftTitle = "Rascunho fictício do autor";

function sql(input) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_prontuario-cbb", "psql", "-X", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8" }).trim();
}

async function account(name, profession) {
  const email = `historico-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  const profile = await admin.from("profiles").insert({ id: data.user.id, display_name: name, profession, can_manage_access: false, can_read_audit: false });
  if (profile.error) throw profile.error;
  const client = createClient(localSupabase.url, localSupabase.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id: data.user.id, email, password, client };
}

test.afterAll(async () => {
  const ids = users.map((id) => `'${id}'`).join(",") || "null";
  sql(`delete from clinical.record_revisions where record_id in (select id from clinical.records where athlete_id in ('${athlete}', '${cardAthlete}', '${outsider}'));
    delete from clinical.document_revisions where document_id in (select id from clinical.documents where athlete_id in ('${athlete}', '${cardAthlete}', '${outsider}'));
    delete from clinical.documents where athlete_id in ('${athlete}', '${cardAthlete}', '${outsider}');
    delete from clinical.records where athlete_id in ('${athlete}', '${cardAthlete}', '${outsider}');
    delete from clinical.conversation_messages where session_id in (select id from clinical.conversation_sessions where professional_id in (${ids}));
    delete from clinical.conversation_sessions where professional_id in (${ids});
    delete from clinical.audit_events where actor_user_id in (${ids}) or athlete_id in ('${athlete}', '${cardAthlete}', '${outsider}');
    delete from clinical.medical_authors where professional_id in (${ids});
    delete from clinical.athlete_access where athlete_id in ('${athlete}', '${cardAthlete}', '${outsider}') or professional_id in (${ids});
    delete from clinical.athletes where id in ('${athlete}', '${cardAthlete}', '${outsider}');`);
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

test("a consulta percorre o histórico autorizado e não revela o restante", async () => {
  const phrases = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--import", "./tests/strip-ts-register.mjs", "--input-type=module", "-e", `
    import { collectHistory, historyRequest, resolveHistoryScope } from "./src/features/chat/history-analysis.ts";
    const today = "2026-11-17";
    const previous = {
      athleteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      athleteName: "Alice",
      from: "2026-05-17",
      to: "2026-11-17",
      unbounded: false,
      periodLabel: "últimos 6 meses",
      specialties: [],
      kinds: ["evolution", "prescription", "surgical_order", "exam_request"],
    };
    const athlete = { id: previous.athleteId, name: "Alice" };
    const focus = historyRequest("Agora foque somente na fisioterapia.", today);
    const wider = historyRequest("Amplie para todo o histórico.", today);
    const pages = [];
    for (let page = 1; page <= 4; page += 1) {
      pages.push({
        total: 50,
        documentsIncluded: true,
        athleteName: "Alice",
        records: Array.from({ length: 20 }, (_, index) => {
          const number = (page - 1) * 20 + index;
          return number < 50 ? {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-" + String(number).padStart(12, "0"),
            kind: "evolution",
            clinicalAt: "2026-01-01",
            createdAt: "",
            updatedAt: "",
            specialty: "Medicina",
            authorName: "QA",
            status: "finalized",
            version: 1,
            title: "",
            revised: false,
          } : null;
        }).filter(Boolean),
      });
    }
    const duplicate = await collectHistory(async (page) => page === 1
      ? { total: 2, documentsIncluded: false, athleteName: "Alice", records: [{ ...pages[0].records[0], version: 1 }] }
      : { total: 2, documentsIncluded: false, athleteName: "Alice", records: [{ ...pages[0].records[0], version: 2 }, pages[0].records[1]] });
    const failed = await collectHistory(async (page) => page === 1 ? pages[0] : null);
    const cancelled = await collectHistory(async () => pages[0], AbortSignal.abort());
    const limited = await collectHistory(async (page) => ({
      total: 250,
      documentsIncluded: false,
      athleteName: "Alice",
      records: Array.from({ length: 20 }, (_, index) => ({
        id: "cccccccc-cccc-4ccc-8ccc-" + String((page - 1) * 20 + index).padStart(12, "0"),
        kind: "evolution",
        clinicalAt: "2026-01-01",
        createdAt: "",
        updatedAt: "",
        specialty: "Medicina",
        authorName: "QA",
        status: "finalized",
        version: 1,
        title: "não entra",
        revised: false,
      })),
    }));
    const walked = await collectHistory(async (page) => pages[page - 1] ?? { total: 50, documentsIncluded: true, athleteName: "Alice", records: [] });
    console.log(JSON.stringify({
      year: historyRequest("Quais lesões o Heitor teve no último ano?", today),
      months: historyRequest("Analise o histórico clínico da Alice nos últimos seis meses.", today),
      quarter: historyRequest("Analise o histórico deste atleta nos últimos três meses.", today),
      range: historyRequest("O que aconteceu entre julho e setembro?", today),
      all: historyRequest("Analise todo o histórico.", today),
      sources: historyRequest("De onde veio essa informação?", today),
      documents: historyRequest("Me mostre os documentos desse atleta.", today),
      latest: historyRequest("Abra a última solicitação.", today),
      evolutions: historyRequest("Quais foram as últimas evoluções dela?", today),
      focus: resolveHistoryScope(focus, previous, athlete, today),
      wider: resolveHistoryScope(wider, previous, athlete, today),
      duplicate: { count: duplicate.records.length, version: duplicate.records[0]?.version, revised: duplicate.records[0]?.revised, complete: duplicate.complete },
      failed: { complete: failed.complete, reason: failed.reason, kept: failed.records.length },
      cancelled: cancelled.reason,
      limited: { complete: limited.complete, reason: limited.reason, examined: limited.records.length },
      walked: { complete: walked.complete, examined: walked.records.length },
    }));
  `], { encoding: "utf8" }));
  expect(phrases.year.command).toBe("analyze");
  expect(phrases.year.months).toBe(12);
  expect(phrases.year.name).toBe("heitor");
  expect(phrases.months.months).toBe(6);
  expect(phrases.months.name).toBe("alice");
  expect(phrases.quarter.months).toBe(3);
  expect(phrases.quarter.context).toBe(true);
  expect(phrases.range.from).toBe("2026-07-01");
  expect(phrases.range.to).toBe("2026-09-30");
  expect(phrases.all.unbounded).toBe(true);
  expect(phrases.sources.command).toBe("sources");
  expect(phrases.documents.command).toBe("unknown");
  expect(phrases.latest.command).toBe("unknown");
  expect(phrases.evolutions.command).toBe("unknown");
  expect(phrases.focus.specialties).toEqual(["Fisioterapia"]);
  expect(phrases.focus.kinds).toEqual(["evolution"]);
  expect(phrases.focus.from).toBe("2026-05-17");
  expect(phrases.wider.unbounded).toBe(true);
  expect(phrases.wider.athleteId).toBe(phrases.focus.athleteId);
  expect(phrases.duplicate).toEqual({ count: 2, version: 2, revised: true, complete: true });
  expect(phrases.failed).toEqual({ complete: false, reason: "failed", kept: 20 });
  expect(phrases.cancelled).toBe("cancelled");
  expect(phrases.limited.complete).toBe(false);
  expect(phrases.limited.reason).toBe("limit");
  expect(phrases.limited.examined).toBe(200);
  expect(phrases.walked).toEqual({ complete: true, examined: 50 });

  const physician = await account("QA História Médica", "Medicina");
  const colleague = await account("QA História Colega", "Medicina");
  const physio = await account("QA História Fisio", "Fisioterapia");
  const prescription = randomUUID();
  const exam = randomUUID();
  const surgery = randomUUID();
  const physioRecord = randomUUID();
  const medicalRecord = randomUUID();
  const oldRecord = randomUUID();
  const draftRecord = randomUUID();
  const privateRecord = randomUUID();
  const volume = Array.from({ length: 50 }, () => randomUUID());
  sql(`insert into clinical.athletes(id, full_name, source) values
      ('${athlete}', 'Atleta DEMO Longitudinal', 'demo'),
      ('${outsider}', 'Atleta DEMO Oculto', 'demo');
    insert into clinical.athlete_access(athlete_id, professional_id, can_read_records) values
      ('${athlete}', '${physician.id}', true),
      ('${athlete}', '${colleague.id}', true),
      ('${athlete}', '${physio.id}', true);
    insert into clinical.medical_authors(professional_id, credential_label, enabled, granted_by) values
      ('${physician.id}', 'CRM fictício', true, '${physician.id}'),
      ('${colleague.id}', 'CRM colega', true, '${colleague.id}');
    insert into clinical.records(id, athlete_id, author_id, author_name, specialty, title, body, occurred_at, status, visibility) values
      ('${physioRecord}', '${athlete}', '${physio.id}', 'QA História Fisio', 'Fisioterapia', '${physioTitle}', 'Texto fictício da fisioterapia.', '2026-08-02', 'finalized', 'care_team'),
      ('${medicalRecord}', '${athlete}', '${physician.id}', 'QA História Médica', 'Medicina', '${medicalTitle}', 'Texto fictício da medicina.', '2026-08-10', 'finalized', 'care_team'),
      ('${oldRecord}', '${athlete}', '${physician.id}', 'QA História Médica', 'Medicina', '${oldTitle}', 'Texto fictício antigo.', '2020-01-15', 'finalized', 'care_team'),
      ('${draftRecord}', '${athlete}', '${physician.id}', 'QA História Médica', 'Medicina', '${draftTitle}', 'Texto fictício do rascunho.', '2026-09-01', 'draft', 'author_only'),
      ('${privateRecord}', '${athlete}', '${colleague.id}', 'QA História Colega', 'Medicina', '${privateTitle}', '${privateBody}', '2026-08-20', 'finalized', 'author_only'),
      ${volume.map((id, index) => `('${id}', '${athlete}', '${physician.id}', 'QA História Médica', 'Medicina', 'Volume ${index}', 'Registro fictício de volume.', '2026-02-01', 'finalized', 'care_team')`).join(",\n")};`);
  const savedExam = await physician.client.rpc("document_save", {
    target: athlete, document_id: exam, expected_version: 0, kind: "exam_request", intent: "save",
    payload: { occurred_at: "2026-07-15", indication: "", justification: "Justificativa fictícia do exame.", diagnosis: "", priority: "", additional: "", items: [{ id: randomUUID(), name: examName, exam_type: "laboratory", region: "", laterality: "", technical_details: "", notes: "" }] },
  });
  expect(savedExam.data.status).toBe("draft");
  const savedPrescription = await physician.client.rpc("document_save", {
    target: athlete, document_id: prescription, expected_version: 0, kind: "prescription", intent: "save",
    payload: { notes: "", items: [{ id: randomUUID(), name: prescriptionName, presentation: "", dose: "500", dose_unit: "mg", route: "", schedule: "", duration: "", quantity: "", instructions: "" }] },
  });
  expect(savedPrescription.data.status).toBe("draft");
  const savedSurgery = await physician.client.rpc("document_save", {
    target: athlete, document_id: surgery, expected_version: 0, kind: "surgical_order", intent: "save",
    payload: { procedure: surgeryName, region: "Joelho", laterality: "right", indication: "", diagnosis: "", justification: "", priority: "", additional: "", materials: "" },
  });
  expect(savedSurgery.data.status).toBe("draft");
  // Fix all document creation dates; the period must not depend on the runner's clock.
  sql(`update clinical.documents set created_at = timestamptz '2026-11-01 12:00:00+00', updated_at = timestamptz '2026-11-02 12:00:00+00' where id in ('${exam}', '${prescription}', '${surgery}');`);

  const recent = await physician.client.rpc("chat_history_page", { target: athlete, filters: { from: "2026-05-17", to: "2026-11-17", page: "1", page_size: "20" }, mode: "text" });
  const recentIds = recent.data.records.map((item) => item.id);
  expect(recentIds).toContain(physioRecord);
  expect(recentIds).toContain(medicalRecord);
  expect(recentIds).toContain(draftRecord);
  expect(recentIds).toContain(prescription);
  expect(recentIds).toContain(surgery);
  expect(recentIds).not.toContain(oldRecord);
  expect(recentIds).not.toContain(privateRecord);
  expect(JSON.stringify(recent.data)).not.toContain(privateTitle);
  expect(JSON.stringify(recent.data)).not.toContain(privateBody);
  expect(recent.data.records.find((item) => item.id === exam).clinical_at).toBe("2026-07-15");
  expect(recent.data.records.find((item) => item.id === draftRecord).status).toBe("draft");
  expect(sql(`select origin_channel || ' ' || execution_method from clinical.audit_events where actor_user_id = '${physician.id}' and operation = 'history.read' order by occurred_at desc limit 1`)).toBe("ai_chat human_message");
  expect(sql(`select coalesce(string_agg(coalesce(operation, '') || coalesce(outcome, ''), ' '), '') from clinical.audit_events where actor_user_id = '${physician.id}' and operation = 'history.read'`)).not.toContain(medicalTitle);

  const voice = await physician.client.rpc("chat_history_page", { target: athlete, filters: { page: "1", page_size: "1" }, mode: "voice" });
  expect(voice.data.total).toBeGreaterThan(50);
  expect(sql(`select execution_method from clinical.audit_events where actor_user_id = '${physician.id}' and operation = 'history.read' order by occurred_at desc limit 1`)).toBe("human_voice");
  await physician.client.rpc("agent_history_page", { target: athlete, filters: { page: "1", page_size: "1" } });
  expect(sql(`select origin_channel || ' ' || execution_method from clinical.audit_events where actor_user_id = '${physician.id}' and operation = 'history.read' order by occurred_at desc limit 1`)).toBe("ai_chat agent_tool");

  const seen = new Set();
  let total = 0;
  for (let page = 1; page <= 5; page += 1) {
    const batch = await physician.client.rpc("chat_history_page", { target: athlete, filters: { page: String(page), page_size: "20" }, mode: "text" });
    total = batch.data.total;
    for (const item of batch.data.records) seen.add(item.id);
    if (seen.size >= total) break;
  }
  expect(total).toBe(seen.size);
  expect(seen.size).toBeGreaterThanOrEqual(50);
  expect(seen.has(privateRecord)).toBe(false);

  const physioPage = await physio.client.rpc("chat_history_page", { target: athlete, filters: { page: "1", page_size: "20" }, mode: "text" });
  expect(physioPage.data.documents_included).toBe(false);
  expect(physioPage.data.records.every((item) => item.kind === "evolution")).toBe(true);
  expect(JSON.stringify(physioPage.data)).not.toContain(prescriptionName);
  expect(JSON.stringify(physioPage.data)).not.toContain(privateTitle);
  expect(physioPage.data.records.map((item) => item.id)).not.toContain(draftRecord);

  const denied = await physician.client.rpc("chat_history_page", { target: outsider, filters: {}, mode: "text" });
  expect(denied.data).toEqual({ error: "denied" });
  expect(JSON.stringify(denied.data)).not.toContain("Oculto");
  expect(sql(`select outcome from clinical.audit_events where actor_user_id = '${physician.id}' and athlete_id = '${outsider}' and operation = 'history.read' order by occurred_at desc limit 1`)).toBe("denied");

  const kept = await physician.client.rpc("conversation_save", {
    target: null,
    context_athlete: athlete,
    transcript: [{
      id: "analise-1",
      role: "assistant",
      text: "A análise longitudinal está no cartão.",
      analysis: {
        athleteId: athlete,
        athleteName: "Atleta DEMO Longitudinal",
        from: "2026-05-17",
        to: "2026-11-17",
        unbounded: false,
        periodLabel: "últimos 6 meses",
        specialties: [],
        kinds: ["evolution", "prescription"],
        complete: true,
        reason: "complete",
        examined: 1,
        total: 1,
        documentsIncluded: true,
        counts: { prescription: 1 },
        summary: "Examinei 1 registro autorizado.",
        items: [{ id: prescription, kind: "prescription", clinicalAt: "2026-11-01", title: prescriptionName, body: "500 mg", status: "draft" }],
      },
    }],
  });
  expect(kept.data.ok).toBe(true);
  const stored = JSON.stringify(kept.data);
  expect(stored).toContain(prescription);
  expect(stored).not.toContain(prescriptionName);
  expect(stored).not.toContain("500 mg");
});
