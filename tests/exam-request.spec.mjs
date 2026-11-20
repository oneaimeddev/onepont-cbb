import { test, expect } from "./fixtures.mjs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { localSupabase } from "../scripts/local-supabase.mjs";

const admin = createClient(localSupabase.url, localSupabase.adminKey, { auth: { persistSession: false } });
const users = [];
const athlete = randomUUID();
const otherAthlete = randomUUID();
const shots = "docs/visual/handoff-007-8";

function sql(input) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_prontuario-cbb", "psql", "-X", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8" });
}

async function user(name, profession, manage = false) {
  const email = `qa-exame-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  const profile = await admin.from("profiles").insert({ id: data.user.id, display_name: name, profession, can_manage_access: manage });
  if (profile.error) throw profile.error;
  const client = createClient(localSupabase.url, localSupabase.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const session = await client.auth.signInWithPassword({ email, password });
  if (session.error) throw session.error;
  return { id: data.user.id, email, password, client };
}

function exam(name, extra = {}) {
  return {
    id: randomUUID(),
    name,
    exam_type: "",
    region: "",
    laterality: "",
    technical_details: "",
    notes: "",
    ...extra,
  };
}

test.afterAll(async () => {
  const ids = users.map((id) => `'${id}'`).join(",") || "null";
  sql(`delete from clinical.document_revisions where document_id in (select id from clinical.documents where athlete_id in ('${athlete}', '${otherAthlete}'));
    delete from clinical.documents where athlete_id in ('${athlete}', '${otherAthlete}');
    delete from clinical.audit_events where athlete_id in ('${athlete}', '${otherAthlete}') or actor_user_id in (${ids});
    delete from clinical.medical_authors where professional_id in (${ids});
    delete from clinical.athlete_access where athlete_id in ('${athlete}', '${otherAthlete}');
    delete from clinical.athletes where id in ('${athlete}', '${otherAthlete}');`);
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

test("médico prepara, revisa e recupera uma solicitação de exames", async ({ page }) => {
  test.setTimeout(120_000);
  const physician = await user("Dra. QA Exames", "Fisioterapia");
  const colleague = await user("Dr. QA Outro", "Clínica");
  const physio = await user("QA Sem habilitação exame", "Ortopedista");
  const operator = await user("QA Operação exame", "Administração", true);
  sql(`insert into clinical.athletes(id, full_name, source) values
      ('${athlete}', 'Atleta QA Exame', 'demo'),
      ('${otherAthlete}', 'Atleta QA Sem exame', 'demo');
    insert into clinical.athlete_access(athlete_id, professional_id, can_read_records) values
      ('${athlete}', '${physician.id}', true),
      ('${athlete}', '${colleague.id}', true),
      ('${athlete}', '${physio.id}', true),
      ('${athlete}', '${operator.id}', true);
    insert into clinical.medical_authors(professional_id, enabled, granted_by) values
      ('${physician.id}', true, '${operator.id}'),
      ('${colleague.id}', true, '${operator.id}');`);

  const stillPrescription = await physician.client.rpc("document_save", {
    target: athlete, document_id: randomUUID(), expected_version: 0, kind: "prescription",
    payload: { notes: "", items: [{ id: randomUUID(), name: "Dipirona estável", presentation: "", dose: "", dose_unit: "", route: "", schedule: "", duration: "", quantity: "", instructions: "" }] },
    intent: "save",
  });
  expect(stillPrescription.data.status).toBe("draft");

  mkdirSync(shots, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(physician.email);
  await page.getByLabel("Senha", { exact: true }).fill(physician.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
  await page.goto(`/atletas/${athlete}`);
  await page.getByRole("link", { name: "Documentos médicos", exact: true }).click();
  await page.getByRole("button", { name: "+ Novo documento", exact: true }).click();
  await page.getByRole("link", { name: "Nova solicitação de exames", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Atleta QA Exame" })).toBeVisible();
  await expect(page.getByText("Dra. QA Exames")).toBeVisible();
  await page.getByRole("button", { name: "Conferir todos", exact: true }).click();
  await page.getByLabel("Nome do exame").fill("Hemograma fictício");
  await page.getByLabel("Tipo").selectOption("laboratory");
  await page.getByRole("button", { name: "Adicionar exame" }).click();
  const names = page.getByLabel("Nome do exame");
  await names.nth(1).fill("Ressonância fictícia de joelho");
  const second = names.nth(1).locator("xpath=ancestor::fieldset");
  await second.getByLabel("Tipo").selectOption("imaging");
  await second.getByLabel("Região anatômica").fill("Joelho");
  await second.getByLabel("Lateralidade").selectOption("right");
  await page.getByLabel("Justificativa").fill("Justificativa fictícia da solicitação.");
  await names.nth(0).fill("Hemograma fictício revisado");
  await page.getByRole("button", { name: "Remover exame 2" }).click();
  await expect(page.getByLabel("Nome do exame")).toHaveCount(1);
  await page.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Rascunho salvo.");
  const documentId = page.url().split("/").at(-1).split("?")[0];
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${shots}/editor-1440x900.png` });
  await page.getByRole("link", { name: "Pré-visualizar", exact: true }).click();
  await expect(page.getByText("RASCUNHO — NÃO ASSINADO / NÃO EMITIDO")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hemograma fictício revisado" })).toBeVisible();
  await expect(page.getByText("Justificativa fictícia da solicitação.")).toBeVisible();
  await expect(page.getByText("Ressonância fictícia de joelho")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /emitir|assinar/i })).toHaveCount(0);
  await page.screenshot({ path: `${shots}/previa-1440x900.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${shots}/previa-390x844.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto(`/atletas/${athlete}`);
  await page.getByRole("link", { name: "Documentos médicos", exact: true }).click();
  await expect(page.getByRole("link", { name: "Solicitação de exames", exact: true })).toBeVisible();
  await page.screenshot({ path: `${shots}/perfil-1440x900.png` });
  await page.getByRole("link", { name: "Solicitação de exames", exact: true }).click();
  await expect(page.getByLabel("Nome do exame")).toHaveValue("Hemograma fictício revisado");

  const blocked = await physician.client.rpc("document_save", {
    target: athlete, document_id: randomUUID(), expected_version: 0, kind: "exam_request",
    payload: { occurred_at: "", indication: "", justification: "", diagnosis: "", priority: "", additional: "", items: [exam("")] },
    intent: "review",
  });
  expect(blocked.data.status).toBe("draft");
  expect(blocked.data.review).toBe("blocked");

  const foreign = await colleague.client.rpc("document_open", { target: athlete, document_id: documentId });
  expect(foreign.data.error).toBe("denied");
  const listed = await colleague.client.rpc("document_browse", { target: athlete, filters: { kind: "exam_request" } });
  expect(JSON.stringify(listed.data)).not.toContain("Hemograma");
  const byProfession = await physio.client.rpc("document_save", {
    target: athlete, document_id: randomUUID(), expected_version: 0, kind: "exam_request",
    payload: { items: [exam("Não autorizado")] }, intent: "save",
  });
  expect(byProfession.data.error).toBe("denied");
  const byAdmin = await operator.client.rpc("document_open", { target: athlete, document_id: documentId });
  expect(byAdmin.data.error).toBe("denied");
  const unlinked = await physician.client.rpc("document_save", {
    target: otherAthlete, document_id: randomUUID(), expected_version: 0, kind: "exam_request",
    payload: { items: [exam("Fora do vínculo")] }, intent: "save",
  });
  expect(unlinked.data.error).toBe("denied");

  const trail = sql(`select coalesce(string_agg(e.operation || ' ' || e.outcome, E'\\n'), '')
    from clinical.audit_events e where e.athlete_id = '${athlete}';`);
  expect(trail).toContain("document.draft_created success");
  expect(trail).toContain("document.read success");
  expect(trail).toContain("document.save denied");
  expect(trail).not.toContain("Hemograma");
  expect(trail).not.toContain("Justificativa fictícia");

  await page.getByRole("button", { name: /^Conta de / }).click();

  await page.getByRole("menuitem", { name: "Sair", exact: true }).click();
  await page.waitForURL(/\/login/);
  await page.getByLabel("E-mail").fill(physio.email);
  await page.getByLabel("Senha", { exact: true }).fill(physio.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
  await page.goto(`/atletas/${athlete}`);
  await expect(page.getByRole("link", { name: "Nova solicitação de exames" })).toHaveCount(0);
  await page.goto(`/atletas/${athlete}/documentos/nova?tipo=exames`);
  await expect(page.getByRole("heading", { name: "Página indisponível" })).toBeVisible();
});
