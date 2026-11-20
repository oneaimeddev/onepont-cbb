import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "../scripts/local-supabase.mjs";

const admin = createClient(localSupabase.url, localSupabase.adminKey, { auth: { persistSession: false } });
const users = [];
const athlete = randomUUID();
const shots = "docs/visual/handoff-007-5-1d";
const secret = "MARCADOR-SECRETO-COLEGA";
const evolutionSecret = "SEGREDO-EVOLUCAO-AUTOR";
const dip = randomUUID();
const older = randomUUID();
const surgery = randomUUID();
const extraA = randomUUID();
const extraB = randomUUID();
const extraC = randomUUID();
const hiddenDoc = randomUUID();
const visibleEvolution = randomUUID();
const hiddenEvolution = randomUUID();

function sql(input) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_prontuario-cbb", "psql", "-X", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8" }).trim();
}

function medication(id, name, dose, schedule) {
  return {
    id, name, presentation: "", dose, dose_unit: dose ? "mg" : "", route: "",
    schedule, duration: "", quantity: "", instructions: "",
  };
}

async function account(name, profession, manage = false) {
  const email = `leitura-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  const profile = await admin.from("profiles").insert({ id: data.user.id, display_name: name, profession, can_manage_access: manage, can_read_audit: false });
  if (profile.error) throw profile.error;
  const client = createClient(localSupabase.url, localSupabase.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id: data.user.id, email, password, client };
}

async function save(client, id, kind, payload) {
  const saved = await client.rpc("document_save", {
    target: athlete, document_id: id, expected_version: 0, kind, payload, intent: "save",
  });
  if (saved.error || saved.data?.error || saved.data?.status !== "draft") throw new Error(JSON.stringify(saved));
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
    delete from clinical.athlete_access where athlete_id = '${athlete}';
    delete from clinical.athletes where id = '${athlete}';`);
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

test("consulta autorizada mostra o documento original e esconde o restante", async ({ page }) => {
  test.setTimeout(120_000);
  const phrases = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--import", "./tests/strip-ts-register.mjs", "--input-type=module", "-e", `
    import { documentChoice, documentRequest, examFollowUp, presentedReadings } from "./src/features/chat/document-resolution.ts";
    import { mergeExamContent } from "./src/features/chat/document-draft.ts";
    const dipirona = { id: "11111111-1111-4111-8111-111111111111", kind: "prescription", label: "Dipirona", status: "draft", updatedAt: "2026-11-16T20:00:00Z" };
    const paracetamol = { id: "22222222-2222-4222-8222-222222222222", kind: "prescription", label: "Paracetamol", status: "draft", updatedAt: "2026-11-15T20:00:00Z" };
    const cirurgia = { id: "33333333-3333-4333-8333-333333333333", kind: "surgical_order", label: "Artroscopia", status: "draft", updatedAt: "2026-11-16T18:00:00Z" };
    const board = presentedReadings({
      source: "document", athleteId: "44444444-4444-4444-8444-444444444444", total: 1, page: 1, pageSize: 1, kind: "prescription", status: "draft",
      items: [{ ...dipirona, athleteId: "44444444-4444-4444-8444-444444444444", open: true, dose: "500 mg", name: "Dipirona" }],
    });
    console.log(JSON.stringify({
      list: documentRequest("Me mostre os documentos desse atleta."),
      prescriptions: documentRequest("Quais prescrições ele possui?"),
      latest: documentRequest("Abra a última prescrição."),
      second: documentRequest("Mostre o segundo documento."),
      surgery: documentRequest("Quero ler o pedido cirúrgico."),
      because: documentRequest("Mostre a justificativa desse pedido."),
      created: documentRequest("Traga o documento que acabamos de salvar."),
      exams: documentRequest("Me mostre os exames solicitados para este atleta."),
      lastExam: documentRequest("Abra a última solicitação."),
      months: documentRequest("Quais exames foram pedidos nos últimos três meses?"),
      examOrder: documentRequest("Quero ler o pedido de exames."),
      follow: examFollowUp("Adicione também um hemograma."),
      fresh: examFollowUp("Prepare uma solicitação de ressonância magnética de joelho direito para Alice."),
      merged: mergeExamContent(
        { occurred_at: "", indication: "", justification: "Relato já informado.", diagnosis: "", priority: "", additional: "", items: [{ id: "55555555-5555-4555-8555-555555555555", name: "Ressonância magnética", exam_type: "imaging", region: "joelho", laterality: "right", technical_details: "", notes: "" }] },
        { occurred_at: "", indication: "", justification: "", diagnosis: "", priority: "", additional: "", items: [{ id: "66666666-6666-4666-8666-666666666666", name: "Hemograma completo", exam_type: "laboratory", region: "", laterality: "", technical_details: "", notes: "" }] },
      ),
      hole: documentChoice([dipirona, null, cirurgia], documentRequest("Mostre o segundo documento.").query),
      secondOne: documentChoice([dipirona, paracetamol], { ordinal: 2 }),
      latestOne: documentChoice([dipirona, paracetamol], { kind: "prescription", latest: true }),
      many: documentChoice([dipirona, paracetamol], { kind: "prescription" }),
      named: documentChoice([dipirona, paracetamol], { name: "Dipirona" }),
      board,
    }));
  `], { encoding: "utf8" }));
  expect(phrases.list.command).toBe("list");
  expect(phrases.list.query.kind).toBeUndefined();
  expect(phrases.prescriptions).toMatchObject({ command: "list", query: { kind: "prescription" } });
  expect(phrases.latest).toMatchObject({ command: "read", query: { latest: true, kind: "prescription" } });
  expect(phrases.second).toMatchObject({ command: "read", query: { ordinal: 2 } });
  expect(phrases.surgery).toMatchObject({ command: "read", query: { kind: "surgical_order" } });
  expect(phrases.because.query).toMatchObject({ kind: "surgical_order", reference: "previous" });
  expect(phrases.created.query.reference).toBe("created");
  expect(phrases.exams).toMatchObject({ command: "list", query: { kind: "exam_request" } });
  expect(phrases.lastExam).toMatchObject({ command: "read", query: { latest: true, kind: "exam_request" } });
  expect(phrases.months).toMatchObject({ command: "list", query: { kind: "exam_request", months: 3 } });
  expect(phrases.examOrder).toMatchObject({ command: "read", query: { kind: "exam_request" } });
  expect(phrases.follow).toBe(true);
  expect(phrases.fresh).toBe(false);
  expect(phrases.merged.items.map((item) => item.name)).toEqual(["Ressonância magnética", "Hemograma completo"]);
  expect(phrases.merged.justification).toBe("Relato já informado.");
  expect(phrases.hole.status).toBe("none");
  expect(phrases.secondOne.document.id).toBe("22222222-2222-4222-8222-222222222222");
  expect(phrases.latestOne.document.label).toBe("Dipirona");
  expect(phrases.many.status).toBe("many");
  expect(phrases.named.document.label).toBe("Dipirona");
  expect(phrases.board.items).toHaveLength(1);
  expect(JSON.stringify(phrases.board)).not.toContain("Dipirona");
  expect(JSON.stringify(phrases.board)).not.toContain("500");

  const physician = await account("QA Médica Leitura", "Medicina");
  const colleague = await account("QA Colega Leitura", "Medicina");
  const physio = await account("QA Fisioterapia Leitura", "Fisioterapia");
  const operator = await account("QA Operação Leitura", "Administração", true);
  sql(`insert into clinical.athletes(id, full_name, source) values('${athlete}', 'Atleta DEMO Leitura', 'demo');
    insert into clinical.athlete_access(athlete_id, professional_id, can_read_records) values
      ('${athlete}', '${physician.id}', true),
      ('${athlete}', '${colleague.id}', true),
      ('${athlete}', '${physio.id}', true);
    insert into clinical.medical_authors(professional_id, credential_label, enabled, granted_by) values
      ('${physician.id}', 'CRM fictício', true, '${physician.id}'),
      ('${colleague.id}', 'CRM colega', true, '${colleague.id}');
    insert into clinical.records(id, athlete_id, author_id, author_name, specialty, title, body, occurred_at, status, visibility) values
      ('${visibleEvolution}', '${athlete}', '${physician.id}', 'QA Médica Leitura', 'Medicina', 'Avaliação fictícia de leitura', 'Texto autorizado da evolução.', '2026-11-02', 'finalized', 'care_team'),
      ('${hiddenEvolution}', '${athlete}', '${colleague.id}', 'QA Colega Leitura', 'Medicina', 'Nota privada do colega', '${evolutionSecret}', '2026-11-03', 'finalized', 'author_only');`);

  await save(physician.client, dip, "prescription", {
    notes: "",
    items: [medication(randomUUID(), "Dipirona", "500", "a cada oito horas"), medication(randomUUID(), "Ibuprofeno", "400", "a cada doze horas")],
  });
  await save(physician.client, older, "prescription", { notes: "", items: [medication(randomUUID(), "Paracetamol", "750", "")] });
  await save(physician.client, surgery, "surgical_order", {
    procedure: "Artroscopia de joelho", region: "Joelho", laterality: "right", indication: "", diagnosis: "",
    justification: "Instabilidade após entorse fictícia.", priority: "", additional: "", materials: "",
  });
  await save(physician.client, extraA, "prescription", { notes: "", items: [medication(randomUUID(), "Soro fictício A", "", "")] });
  await save(physician.client, extraB, "prescription", { notes: "", items: [medication(randomUUID(), "Soro fictício B", "", "")] });
  await save(physician.client, extraC, "prescription", { notes: "", items: [medication(randomUUID(), "Soro fictício C", "", "")] });
  await save(colleague.client, hiddenDoc, "prescription", { notes: "", items: [medication(randomUUID(), secret, "999", "")] });
  sql(`update clinical.documents set updated_at = timestamptz '2026-11-16 20:00:00+00' where id = '${dip}';
    update clinical.documents set updated_at = timestamptz '2026-11-16 19:00:00+00' where id = '${surgery}';
    update clinical.documents set updated_at = timestamptz '2026-11-16 18:00:00+00' where id = '${older}';
    update clinical.documents set updated_at = timestamptz '2026-11-16 17:00:00+00' where id = '${extraA}';
    update clinical.documents set updated_at = timestamptz '2026-11-16 16:00:00+00' where id = '${extraB}';
    update clinical.documents set updated_at = timestamptz '2026-11-16 15:00:00+00' where id = '${extraC}';
    update clinical.documents set updated_at = timestamptz '2026-11-16 21:00:00+00' where id = '${hiddenDoc}';`);

  const latest = await physician.client.rpc("document_browse", { target: athlete, filters: { kind: "prescription", page: "1", page_size: "1" } });
  expect(latest.data.documents[0].id).toBe(dip);
  expect(latest.data.documents[0].label).toBe("Dipirona");
  expect(latest.data.total).toBe(5);
  const pageTwo = await physician.client.rpc("document_browse", { target: athlete, filters: { page: "2", page_size: "5" } });
  expect(pageTwo.data.documents.map((item) => item.id)).toEqual([extraC]);
  const opened = await physician.client.rpc("document_open", { target: athlete, document_id: dip });
  expect(opened.data.content.items.map((item) => item.name)).toEqual(["Dipirona", "Ibuprofeno"]);
  expect(opened.data.content.items[0].route).toBe("");
  expect(opened.data.content.items[0].dose).toBe("500");
  const aligned = await physician.client.rpc("document_browse", { target: athlete, filters: { ids: [older, hiddenDoc, dip] } });
  expect(aligned.data.documents.map((item) => item.id)).toEqual([older, dip]);
  expect(JSON.stringify(aligned.data)).not.toContain(secret);

  const deniedPhysio = await physio.client.rpc("document_browse", { target: athlete, filters: {} });
  expect(deniedPhysio.data).toEqual({ error: "denied" });
  expect(JSON.stringify(deniedPhysio.data)).not.toContain("Dipirona");
  expect(JSON.stringify(deniedPhysio.data)).not.toContain(secret);
  const deniedAdmin = await operator.client.rpc("document_open", { target: athlete, document_id: dip });
  expect(deniedAdmin.data).toEqual({ error: "denied" });
  expect(JSON.stringify(deniedAdmin.data)).not.toContain("500");
  const colleagueView = await colleague.client.rpc("document_browse", { target: athlete, filters: {} });
  expect(colleagueView.data.documents.map((item) => item.id)).toEqual([hiddenDoc]);

  const chatList = await physician.client.rpc("chat_document_browse", { target: athlete, filters: { page: "1", page_size: "5" } });
  expect(chatList.data.documents[0].id).toBe(dip);
  expect(sql(`select origin_channel || ' ' || execution_method from clinical.audit_events where actor_user_id = '${physician.id}' and operation = 'document.list' order by occurred_at desc limit 1`)).toBe("ai_chat human_ui");
  await physician.client.rpc("agent_document_browse", { target: athlete, filters: { page: "1", page_size: "1" } });
  expect(sql(`select origin_channel || ' ' || execution_method from clinical.audit_events where actor_user_id = '${physician.id}' and operation = 'document.list' order by occurred_at desc limit 1`)).toBe("ai_chat agent_tool");
  const timeline = await physician.client.rpc("chat_athlete_timeline", { target: athlete });
  expect(JSON.stringify(timeline.data)).toContain("Avaliação fictícia de leitura");
  expect(JSON.stringify(timeline.data)).not.toContain(evolutionSecret);
  expect(sql(`select count(*) from clinical.audit_events where actor_user_id = '${physician.id}' and operation = 'document.read' and outcome = 'success'`)).not.toBe("0");
  expect(sql(`select coalesce(string_agg(operation || outcome, ' '), '') from clinical.audit_events where actor_user_id = '${physician.id}'`)).not.toContain("Dipirona");

  const kept = await physician.client.rpc("conversation_save", {
    target: null,
    context_athlete: athlete,
    transcript: [{
      id: "leitura-1",
      role: "assistant",
      text: "Os cartões mostram o original.",
      readings: {
        source: "document",
        athleteId: athlete,
        total: 2,
        page: 1,
        pageSize: 5,
        items: [
          { id: dip, athleteId: athlete, kind: "prescription", open: true, name: "Dipirona", dose: "500 mg" },
          { id: hiddenDoc, athleteId: athlete, kind: "prescription", open: false, name: secret },
        ],
      },
    }],
  });
  expect(kept.data.ok).toBe(true);
  const stored = JSON.stringify(kept.data);
  expect(stored).not.toContain("Dipirona");
  expect(stored).not.toContain('"dose"');
  expect(stored).not.toContain("500 mg");
  expect(stored).not.toContain(secret);
  expect(stored).toContain(dip);
  expect(stored).not.toContain(hiddenDoc);

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(physician.email);
  await page.getByLabel("Senha", { exact: true }).fill(physician.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/?atleta=${athlete}`);
  await expect(page.getByRole("heading", { name: "Atleta DEMO Leitura" })).toBeVisible();
  const firstPage = chatList.data.documents.slice(0, 5).map((item) => ({ id: item.id, kind: item.document_type }));
  await page.evaluate(({ athleteId, items }) => {
    sessionStorage.setItem("cbb-intelligence-turns:v1", JSON.stringify({
      v: 1,
      turns: [{
        id: "lista-docs",
        role: "assistant",
        text: "Encontrei 6 registros autorizados. Os cartões mostram o original.",
        athletes: [],
        navigation: null,
        search: null,
        draft: null,
        document: null,
        readings: { source: "document", athleteId, total: 6, page: 1, pageSize: 5, kind: "", status: "", items: items.map((item) => ({ ...item, athleteId, open: false })) },
      }],
    }));
    window.dispatchEvent(new Event("cbb-intelligence-adopt"));
  }, { athleteId: athlete, items: firstPage });

  const dipCard = page.locator(".ia-reading-card").filter({ hasText: "Dipirona" });
  await expect(dipCard).toBeVisible();
  await expect(page.getByRole("heading", { name: "Artroscopia de joelho" })).toBeVisible();
  await expect(page.getByText(secret)).toHaveCount(0);
  await expect(dipCard.getByText("Rascunho não assinado")).toBeVisible();
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/lista.png` });
  await dipCard.getByRole("button", { name: "Ler" }).click();
  await expect(dipCard.getByText("Ibuprofeno")).toBeVisible();
  await expect(dipCard.getByText("500 mg")).toBeVisible();
  await expect(dipCard.getByText("400 mg")).toBeVisible();
  await expect(dipCard.getByText("a cada oito horas")).toBeVisible();
  await expect(dipCard.getByText("Via", { exact: true })).toHaveCount(0);
  await expect(dipCard.getByText("Conteúdo recuperado do registro. Não foi reescrito pelo assistente.")).toBeVisible();
  await page.screenshot({ path: `${shots}/prescricao.png` });
  const surgeryCard = page.locator(".ia-reading-card").filter({ hasText: "Artroscopia de joelho" });
  await surgeryCard.getByRole("button", { name: "Ler" }).click();
  await expect(surgeryCard.getByText("Instabilidade após entorse fictícia.")).toBeVisible();
  await expect(surgeryCard.getByText("Direita")).toBeVisible();
  await expect(surgeryCard.getByText("Indicação clínica")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Atleta DEMO Leitura" })).toBeVisible();
  await page.screenshot({ path: `${shots}/cirurgia.png` });
  await page.getByRole("button", { name: "Ver mais" }).click();
  await expect(page.getByRole("heading", { name: "Soro fictício C" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  expect(overflow).toBe(true);
  await page.screenshot({ path: `${shots}/mobile.png` });

  await page.evaluate(({ athleteId, evolutionId, privateId }) => {
    sessionStorage.setItem("cbb-intelligence-turns:v1", JSON.stringify({
      v: 1,
      turns: [{
        id: "lista-evolucao",
        role: "assistant",
        text: "Encontrei 1 registro autorizado. O cartão mostra o original.",
        athletes: [],
        navigation: null,
        search: null,
        draft: null,
        document: null,
        readings: {
          source: "evolution",
          athleteId,
          total: 1,
          page: 1,
          pageSize: 5,
          kind: "",
          status: "",
          items: [
            { id: evolutionId, athleteId, kind: "evolution", open: true },
            { id: privateId, athleteId, kind: "evolution", open: true },
          ],
        },
      }],
    }));
    window.dispatchEvent(new Event("cbb-intelligence-adopt"));
  }, { athleteId: athlete, evolutionId: visibleEvolution, privateId: hiddenEvolution });
  await expect(page.getByRole("heading", { name: "Avaliação fictícia de leitura" })).toBeVisible();
  await expect(page.getByText("Texto autorizado da evolução.")).toBeVisible();
  await expect(page.getByText(evolutionSecret)).toHaveCount(0);
  await expect(page.getByText("Nota privada do colega")).toHaveCount(0);

  sql(`delete from clinical.athlete_access where athlete_id = '${athlete}' and professional_id = '${physician.id}';`);
  const revoked = page.waitForResponse((response) => response.url().includes("/api/inteligencia/leituras"));
  await page.evaluate(({ athleteId, items }) => {
    sessionStorage.setItem("cbb-intelligence-turns:v1", JSON.stringify({
      v: 1,
      turns: [{
        id: "lista-revogada",
        role: "assistant",
        text: "Os cartões mostram o original.",
        athletes: [],
        navigation: null,
        search: null,
        draft: null,
        document: null,
        readings: { source: "document", athleteId, total: items.length, page: 1, pageSize: 5, kind: "", status: "", items: items.map((item) => ({ ...item, athleteId, open: true })) },
      }],
    }));
    window.dispatchEvent(new Event("cbb-intelligence-adopt"));
  }, { athleteId: athlete, items: firstPage });
  expect(JSON.stringify(await (await revoked).json())).not.toContain("Dipirona");
  await expect(page.getByText("Dipirona")).toHaveCount(0);
  await expect(page.getByText("Ibuprofeno")).toHaveCount(0);
  await expect(page.getByText("500 mg")).toHaveCount(0);
  await expect(page.getByText(secret)).toHaveCount(0);
  await expect(page.getByText(evolutionSecret)).toHaveCount(0);
  const leaked = await physician.client.rpc("document_open", { target: athlete, document_id: dip });
  expect(leaked.data).toEqual({ error: "denied" });
  expect(JSON.stringify(leaked.data)).not.toContain("Dipirona");
  expect(sql(`select outcome from clinical.audit_events where actor_user_id = '${physician.id}' and operation = 'document.read' and resource_id = '${dip}' order by occurred_at desc limit 1`)).toBe("denied");
});
