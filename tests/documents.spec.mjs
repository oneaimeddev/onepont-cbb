import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { localSupabase } from "../scripts/local-supabase.mjs";

const admin = createClient(localSupabase.url, localSupabase.adminKey, { auth: { persistSession: false } });
const users = [];
const athlete = randomUUID();
const otherAthlete = randomUUID();
const shots = "docs/visual/handoff-007";

function sql(input) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_prontuario-cbb", "psql", "-X", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8" });
}

async function user(name, profession, manage = false) {
  const email = `qa-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const id = data.user.id;
  users.push(id);
  const profile = await admin.from("profiles").insert({ id, display_name: name, profession, can_manage_access: manage });
  if (profile.error) throw profile.error;
  const client = createClient(localSupabase.url, localSupabase.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const session = await client.auth.signInWithPassword({ email, password });
  if (session.error) throw session.error;
  return { id, email, password, client };
}

function medication(name) {
  return {
    id: randomUUID(), name, presentation: "", dose: "", dose_unit: "", route: "",
    schedule: "", duration: "", quantity: "", instructions: "",
  };
}

test.afterAll(async () => {
  sql(`delete from clinical.athletes where id in ('${athlete}', '${otherAthlete}');
    delete from clinical.medical_authors where professional_id in (${users.map((id) => `'${id}'`).join(",") || "null"});`);
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

test("rascunhos médicos, revisão e bloqueios", async ({ page }) => {
  const physician = await user("Dra. QA Medicina", "Fisioterapia");
  const colleague = await user("Dr. QA Colega", "Clínica");
  const physio = await user("QA Sem habilitação", "Ortopedista");
  const operator = await user("QA Operação", "Administração", true);
  sql(`insert into clinical.athletes(id, full_name, source) values
      ('${athlete}', 'Atleta QA Documento', 'demo'),
      ('${otherAthlete}', 'Atleta QA Sem vínculo', 'demo');
    insert into clinical.athlete_access(athlete_id, professional_id, can_read_records) values
      ('${athlete}', '${physician.id}', true),
      ('${athlete}', '${colleague.id}', true),
      ('${athlete}', '${physio.id}', true),
      ('${athlete}', '${operator.id}', true);
    insert into clinical.medical_authors(professional_id, enabled, granted_by) values
      ('${physician.id}', true, '${operator.id}'),
      ('${colleague.id}', true, '${operator.id}');`);

  const self = await physician.client.rpc("medical_author_grant", { professional: physician.id, label: "CRM fictício" });
  expect(self.data.error).toBe("denied");
  const operatorSelf = await operator.client.rpc("medical_author_grant", { professional: operator.id, label: "CRM fictício" });
  expect(operatorSelf.data.error).toBe("denied");
  const emptyReview = await physician.client.rpc("document_save", {
    target: athlete, document_id: randomUUID(), expected_version: 0, kind: "prescription",
    payload: { notes: "", items: [] }, intent: "review",
  });
  expect(emptyReview.data.status).toBe("draft");
  expect(emptyReview.data.review).toBe("blocked");

  mkdirSync(shots, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(physician.email);
  await page.getByLabel("Senha", { exact: true }).fill(physician.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
  await page.goto(`/atletas/${athlete}`);
  await page.getByRole("link", { name: "Documentos médicos", exact: true }).click();
  await page.getByRole("link", { name: "Nova prescrição", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Atleta QA Documento" })).toBeVisible();
  await expect(page.getByText("Dra. QA Medicina")).toBeVisible();
  await page.getByRole("button", { name: "Adicionar medicamento" }).click();
  const names = page.getByLabel("Nome do medicamento");
  await names.nth(0).fill("Dipirona fictícia 500 mg");
  await names.nth(0).locator("xpath=ancestor::fieldset").getByLabel("Dose").fill("1");
  await names.nth(0).locator("xpath=ancestor::fieldset").getByLabel("Frequência").fill("6/6 h");
  await names.nth(1).fill("Soro fictício");
  await page.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Rascunho salvo.");
  const documentId = page.url().split("/").at(-1).split("?")[0];
  await names.nth(0).fill("Dipirona fictícia 1 g");
  await page.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(page.locator('input[name="version"]')).toHaveValue("2");
  await expect(page.getByRole("status")).toContainText("Rascunho salvo.");
  await expect(page.getByLabel("Nome do medicamento").nth(0)).toHaveValue("Dipirona fictícia 1 g");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${shots}/prescricao-editor-1440x900.png` });
  await page.getByRole("link", { name: "Pré-visualizar", exact: true }).click();
  await expect(page.getByText("RASCUNHO — NÃO ASSINADO / NÃO EMITIDO")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dipirona fictícia 1 g" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Soro fictício" })).toBeVisible();
  await expect(page.getByRole("button", { name: /emitir|assinar/i })).toHaveCount(0);
  await page.screenshot({ path: `${shots}/prescricao-previa-1440x900.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${shots}/prescricao-previa-390x844.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("link", { name: "Voltar ao editor" }).click();
  await page.getByRole("button", { name: "Apresentar para revisão", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("não foi emitido");
  await expect(page.getByText("Em revisão", { exact: true })).toBeVisible();

  const foreign = await colleague.client.rpc("document_open", { target: athlete, document_id: documentId });
  expect(foreign.data.error).toBe("denied");
  const overwritten = await colleague.client.rpc("document_save", {
    target: athlete, document_id: documentId, expected_version: 1, kind: "prescription",
    payload: { notes: "invasão", items: [medication("Troca indevida")] }, intent: "save",
  });
  expect(overwritten.data.error).toBe("denied");
  const byProfession = await physio.client.rpc("document_save", {
    target: athlete, document_id: randomUUID(), expected_version: 0, kind: "prescription",
    payload: { notes: "", items: [medication("Não autorizado")] }, intent: "save",
  });
  expect(byProfession.data.error).toBe("denied");
  const byAdmin = await operator.client.rpc("document_open", { target: athlete, document_id: documentId });
  expect(byAdmin.data.error).toBe("denied");
  const unlinked = await physician.client.rpc("document_save", {
    target: otherAthlete, document_id: randomUUID(), expected_version: 0, kind: "surgical_order",
    payload: { procedure: "Fora do vínculo", justification: "Não deve gravar" }, intent: "save",
  });
  expect(unlinked.data.error).toBe("denied");
  const replayId = randomUUID();
  const replayPayload = { notes: "replay", items: [medication("Item estável")] };
  const created = await physician.client.rpc("document_save", {
    target: athlete, document_id: replayId, expected_version: 0, kind: "prescription", payload: replayPayload, intent: "save",
  });
  const replayed = await physician.client.rpc("document_save", {
    target: athlete, document_id: replayId, expected_version: 0, kind: "prescription", payload: replayPayload, intent: "save",
  });
  expect(created.data.version).toBe(1);
  expect(replayed.data.version).toBe(1);

  await page.goto(`/atletas/${athlete}`);
  await page.getByRole("link", { name: "Documentos médicos", exact: true }).click();
  await page.getByRole("link", { name: "Novo pedido cirúrgico", exact: true }).click();
  await page.getByLabel("Procedimento proposto").fill("Artroscopia fictícia de joelho");
  await page.getByLabel("Justificativa médica").fill("Justificativa fictícia para revisão interna.");
  await page.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Rascunho salvo.");
  await page.getByLabel("Procedimento proposto").fill("Artroscopia fictícia revisada");
  await page.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(page.getByLabel("Procedimento proposto")).toHaveValue("Artroscopia fictícia revisada");
  await page.getByRole("link", { name: "Pré-visualizar", exact: true }).click();
  await expect(page.getByText("RASCUNHO — NÃO ASSINADO / NÃO EMITIDO")).toBeVisible();
  await expect(page.getByText("Artroscopia fictícia revisada")).toBeVisible();
  await expect(page.getByText("Justificativa fictícia para revisão interna.")).toBeVisible();
  await expect(page.getByRole("button", { name: /emitir|assinar/i })).toHaveCount(0);
  await page.screenshot({ path: `${shots}/cirurgia-previa-1440x900.png`, fullPage: true });

  const trail = sql(`select coalesce(string_agg(e.operation || ' ' || e.outcome || ' ' || e.origin_channel || ' ' || e.execution_method, E'\\n'), '')
    from clinical.audit_events e where e.athlete_id = '${athlete}';`);
  expect(trail).toContain("document.draft_created success traditional_ui human_ui");
  expect(trail).toContain("document.draft_saved success traditional_ui human_ui");
  expect(trail).toContain("document.read success traditional_ui human_ui");
  expect(trail).toContain("document.save denied traditional_ui human_ui");
  expect(trail).not.toContain("Dipirona");
  expect(trail).not.toContain("Artroscopia");
  expect(trail).not.toContain("Justificativa fictícia");

  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page.waitForURL(/\/login/);
  await page.getByLabel("E-mail").fill(physio.email);
  await page.getByLabel("Senha", { exact: true }).fill(physio.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
  await page.goto(`/atletas/${athlete}`);
  await expect(page.getByRole("link", { name: "Nova prescrição" })).toHaveCount(0);
  await page.goto(`/atletas/${athlete}/documentos/nova?tipo=prescricao`);
  await expect(page.getByRole("heading", { name: "Página indisponível" })).toBeVisible();
});
