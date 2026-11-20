import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { expect, test } from "./fixtures.mjs";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "../scripts/local-supabase.mjs";

const admin = createClient(localSupabase.url, localSupabase.adminKey, { auth: { persistSession: false } });
const users = [];
const athlete = randomUUID();
const shots = "docs/visual/handoff-007-5-1b";
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

async function doctor() {
  const email = `doc-ui-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  const profile = await admin.from("profiles").insert({ id: data.user.id, display_name: "QA Médica", profession: "Medicina", can_read_audit: false });
  if (profile.error) throw profile.error;
  const client = createClient(localSupabase.url, localSupabase.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id: data.user.id, email, password, client };
}

function card(kind, requestId, content, hash, version) {
  return [
    { id: "user-doc", role: "user", text: "Prepare o documento fictício.", athletes: [], navigation: null, search: null, draft: null, document: null },
    {
      id: "assistant-doc",
      role: "assistant",
      text: "Organizei uma proposta de documento para revisão. Ela ainda não foi salva.",
      athletes: [],
      navigation: null,
      search: null,
      draft: null,
      document: {
        state: "proposal",
        requestId,
        athleteId: athlete,
        athleteName: "Alice Almeida Lopes",
        professionalName: "QA Médica",
        credentialLabel: "CRM fictício",
        kind,
        title: kind === "prescription" ? "Dipirona" : "Artroscopia de joelho",
        content,
        missing: kind === "prescription" ? ["Medicamento 1: Duração"] : ["Indicação clínica"],
        documentId: null,
        error: null,
        contentHash: hash,
        version,
      },
    },
  ];
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

test("revisa os cartões e encontra os rascunhos no prontuário", async ({ page }) => {
  test.setTimeout(90_000);
  const user = await doctor();
  sql(`insert into clinical.athletes(id, full_name, source) values('${athlete}', 'Alice Almeida Lopes', 'demo');
    insert into clinical.athlete_access(athlete_id, professional_id, can_read_records, can_edit, can_write, can_finalize)
    values('${athlete}', '${user.id}', true, false, true, true);
    insert into clinical.medical_authors(professional_id, credential_label, enabled, granted_by)
    values('${user.id}', 'CRM fictício', true, '${user.id}');`);

  const discardedId = randomUUID();
  const discarded = await user.client.rpc("clinical_document_proposal_register", {
    target: athlete, request_id: discardedId, kind: "prescription", payload: prescription,
  });
  expect(discarded.data.ok).toBe(true);

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/?atleta=${athlete}`);
  await expect(page.getByRole("heading", { name: "Alice Almeida Lopes" })).toBeVisible();
  await page.evaluate((value) => {
    sessionStorage.setItem("cbb-intelligence-turns:v1", JSON.stringify({ v: 1, turns: value }));
    window.dispatchEvent(new Event("cbb-intelligence-adopt"));
  }, card("prescription", discardedId, prescription, discarded.data.contentHash, discarded.data.version));

  const proposal = page.getByRole("region", { name: "Proposta de prescrição" });
  await expect(proposal.getByText("Proposta ainda não salva")).toBeVisible();
  await expect(proposal.getByText("Dipirona")).toBeVisible();
  await expect(proposal.getByText("Medicamento 1: Duração")).toBeVisible();
  await expect(proposal.getByText("Rascunho — não assinado e não emitido.")).toBeVisible();
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/proposta-prescricao.png` });
  expect(sql(`select count(*) from clinical.documents where athlete_id = '${athlete}'`)).toBe("0");
  await proposal.getByRole("button", { name: "Descartar" }).click();
  await expect(proposal.getByText("Proposta descartada. Nenhum documento foi gravado.")).toBeVisible();
  expect(sql(`select count(*) from clinical.documents where athlete_id = '${athlete}'`)).toBe("0");

  const prescriptionId = randomUUID();
  const prepared = await user.client.rpc("clinical_document_proposal_register", {
    target: athlete, request_id: prescriptionId, kind: "prescription", payload: prescription,
  });
  expect(prepared.data.ok).toBe(true);
  await page.evaluate((value) => {
    sessionStorage.setItem("cbb-intelligence-turns:v1", JSON.stringify({ v: 1, turns: value }));
    window.dispatchEvent(new Event("cbb-intelligence-adopt"));
  }, card("prescription", prescriptionId, prescription, prepared.data.contentHash, prepared.data.version));
  const review = page.getByRole("region", { name: "Proposta de prescrição" });
  await review.getByRole("button", { name: "Confirmar e salvar" }).click();
  await expect(review.getByText("Rascunho salvo")).toBeVisible();
  await expect(review.getByRole("link", { name: "Abrir no prontuário" })).toBeVisible();
  await page.screenshot({ path: `${shots}/prescricao-salva.png` });
  expect(sql(`select status from clinical.documents where id = '${prescriptionId}'`)).toBe("draft");

  await review.getByRole("link", { name: "Abrir no prontuário" }).click();
  await expect(page.getByRole("textbox", { name: "Nome do medicamento" })).toHaveValue("Dipirona");
  await expect(page.getByRole("textbox", { name: "Frequência" })).toHaveValue("a cada oito horas");
  await page.getByRole("link", { name: "Pré-visualizar" }).click();
  await expect(page.getByText("Este documento não foi emitido nem assinado.")).toBeVisible();

  const surgicalId = randomUUID();
  const order = await user.client.rpc("clinical_document_proposal_register", {
    target: athlete, request_id: surgicalId, kind: "surgical_order", payload: surgical,
  });
  expect(order.data.ok).toBe(true);
  await page.goto(`/?atleta=${athlete}`);
  await page.evaluate((value) => {
    sessionStorage.setItem("cbb-intelligence-turns:v1", JSON.stringify({ v: 1, turns: value }));
    window.dispatchEvent(new Event("cbb-intelligence-adopt"));
  }, card("surgical_order", surgicalId, surgical, order.data.contentHash, order.data.version));
  const surgery = page.getByRole("region", { name: "Proposta de pedido cirúrgico" });
  await expect(surgery.getByText("Indicação clínica")).toBeVisible();
  await surgery.getByRole("button", { name: "Editar" }).click();
  await surgery.getByLabel("Justificativa").fill("Justificativa revisada no cartão.");
  await page.screenshot({ path: `${shots}/pedido-cirurgico.png` });
  await surgery.getByRole("button", { name: "Confirmar e salvar" }).click();
  await expect(surgery.getByText("Rascunho salvo")).toBeVisible();
  expect(sql(`select status || '|' || (content->>'justification') from clinical.documents where id = '${surgicalId}'`)).toBe("draft|Justificativa revisada no cartão.");

  await page.goto(`/atletas/${athlete}?aba=documentos`);
  const list = page.getByRole("region", { name: "Documentos" });
  await expect(list.getByRole("link", { name: "Prescrição", exact: true })).toBeVisible();
  await expect(list.getByRole("link", { name: "Pedido cirúrgico", exact: true })).toBeVisible();
  await expect(list.getByText("Rascunho").first()).toBeVisible();
  await page.screenshot({ path: `${shots}/documentos.png` });
  expect(sql(`select count(*) from clinical.documents where athlete_id = '${athlete}' and status = 'ready_for_review'`)).toBe("0");
  expect(sql(`select count(*) from clinical.audit_events where actor_user_id = '${user.id}' and operation = 'document.confirmed' and origin_channel = 'ai_chat' and execution_method = 'human_ui' and outcome = 'success'`)).toBe("2");
});
