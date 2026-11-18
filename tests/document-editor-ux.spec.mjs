import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { localSupabase } from "../scripts/local-supabase.mjs";

test.use({ actionTimeout: 10_000, navigationTimeout: 15_000 });

const admin = createClient(localSupabase.url, localSupabase.adminKey, { auth: { persistSession: false } });
const athlete = randomUUID();
const users = [];
let physician;
let blocked;
const require = createRequire(import.meta.url);
const accessibility = [];
const shots = "docs/visual/handoff-007-10-2b";
const long = "Texto sintético para inspeção de legibilidade: conferir todas as informações antes de qualquer uso. ".repeat(4).trim();
const sql = (input) => execFileSync("docker", ["exec", "-i", "supabase_db_prontuario-cbb", "psql", "-X", "-U", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8" });

async function user(name) {
  const email = `ux-doc-${randomUUID()}@example.com`, password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  const profile = await admin.from("profiles").insert({ id: data.user.id, display_name: name, profession: "Medicina" });
  if (profile.error) throw profile.error;
  const client = createClient(localSupabase.url, localSupabase.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  return { id: data.user.id, email, password, client };
}
function payload(kind, count = 1) {
  if (kind === "surgical_order") return { procedure: "artroscopia de joelho — LCA DEMO", region: "Joelho DEMO", laterality: "right", indication: long, diagnosis: "LCA — DEMO", justification: long, priority: "elective", materials: "Materiais DEMO", additional: "Somente inspeção visual." };
  const items = Array.from({ length: count }, (_, i) => kind === "prescription"
    ? { id: randomUUID(), name: ["dipirona monoidratada DEMO", "DIPIRONA DEMO", "vitamina B12 DEMO", "solução NaCl DEMO", "fármaco β DEMO", "Medicamento seis DEMO"][i], presentation: "Solução DEMO — 500 mg/mL", dose: "1", dose_unit: "mL", route: "via oral — DEMO", schedule: "Somente simulação: frequência extensa para verificar leitura integral em um campo de linha única", duration: "DEMO", quantity: "DEMO", instructions: long }
    : { id: randomUUID(), name: ["HbA1c DEMO", "RM de joelho DEMO", "β-hCG DEMO", "Hemograma completo DEMO", "PCR DEMO", "Exame seis DEMO"][i], exam_type: "other", region: "Joelho — DEMO", laterality: "right", technical_details: long, notes: "Conteúdo fictício; sem finalidade assistencial." });
  return kind === "prescription" ? { notes: "Dados fictícios — auditoria de UX.", items } : { occurred_at: "2026-11-18", priority: "elective", indication: long, justification: long, diagnosis: "Hipótese DEMO", additional: "Orientação fictícia.", items };
}
async function seed(kind, count) {
  const content = payload(kind, count), id = randomUUID();
  const saved = await physician.client.rpc("document_save", { target: athlete, document_id: id, expected_version: 0, kind, payload: content, intent: "save" });
  expect(saved.error).toBeNull();
  expect(saved.data.error).toBeUndefined();
  return { id, content, path: `/atletas/${athlete}/documentos/${id}` };
}
async function login(page, account = physician) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(account.email);
  await page.getByLabel("Senha", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
}
const contentOf = async (page) => JSON.parse(await page.locator('input[name="content"]').inputValue());
const dirty = async (page) => page.evaluate(() => sessionStorage.getItem("cbb-unsaved-clinical:v1"));
async function save(page) {
  await page.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(page.getByText("Rascunho salvo.", { exact: true })).toBeVisible();
  await expect.poll(() => dirty(page)).toBeNull();
}
async function responsive(page, prefix) {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect.poll(() => page.locator(".document-editor textarea").evaluateAll((fields) => fields.every((field) => field.scrollHeight <= field.clientHeight + 2))).toBe(true);
    // Manual shrinking must not hide the content after automatic expansion.
    await page.locator(".document-editor textarea").first().evaluate((field) => { field.style.height = "44px"; });
    await expect.poll(() => page.locator(".document-editor textarea").first().evaluate((field) => field.scrollHeight <= field.clientHeight + 2)).toBe(true);
    expect(await page.locator(".document-action-bar").evaluate((el) => getComputedStyle(el).position)).toBe(width === 1440 ? "sticky" : "static");
    expect(await page.evaluate(() => {
      const bar = document.querySelector(".document-action-bar").getBoundingClientRect();
      const editor = document.querySelector(".document-editor").getBoundingClientRect();
      return bar.left >= editor.right || bar.top >= editor.bottom;
    })).toBe(true);
    if (!await page.evaluate(() => Boolean(window.axe))) await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const scan = await page.evaluate(async () => {
      const results = await window.axe.run(document.querySelector("main"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
      return { violations: results.violations.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map((node) => node.target) })), incomplete: results.incomplete.map(({ id }) => id) };
    });
    accessibility.push({ scenario: prefix, width, ...scan });
    expect(scan.violations).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${shots}/${prefix}-${width}.png`, fullPage: true });
    if (prefix.endsWith("6") || prefix === "cirurgia") await page.screenshot({ path: `${shots}/${prefix}-${width}-inicial.png` });
  }
}

test.beforeAll(async () => {
  mkdirSync(shots, { recursive: true });
  physician = await user("Dra. Clara DEMO");
  blocked = await user("Dr. Sem habilitação DEMO");
  sql(`insert into clinical.athletes(id, full_name, source) values ('${athlete}', 'Atleta Documentos DEMO', 'demo');
    insert into clinical.athlete_access(athlete_id, professional_id, can_read_records) values ('${athlete}', '${physician.id}', true), ('${athlete}', '${blocked.id}', true);
    insert into clinical.medical_authors(professional_id, enabled, credential_label) values ('${physician.id}', true, 'CRM DEMO');`);
});
test.afterAll(async () => {
  writeFileSync(`${shots}/acessibilidade.json`, JSON.stringify(accessibility, null, 2));
  sql(`delete from clinical.athletes where id='${athlete}'; delete from clinical.medical_authors where professional_id in (${users.map((id) => `'${id}'`).join(",") || "null"});`);
  for (const id of users) {
    const result = await admin.auth.admin.deleteUser(id);
    if (result.error) throw result.error;
  }
});

test("medicamentos e exames: 1/3/6 itens, foco, desfazer, integridade e responsividade", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page);
  for (const kind of ["prescription", "exam_request"]) for (const count of [1, 3, 6]) {
    const doc = await seed(kind, count);
    await page.goto(doc.path);
    const noun = kind === "prescription" ? "medicamento" : "exame";
    const names = page.getByLabel(kind === "prescription" ? "Nome do medicamento" : "Nome do exame");
    await expect(names).toHaveCount(count);
    expect(await contentOf(page)).toEqual(doc.content);
    await responsive(page, `${kind === "prescription" ? "prescricao" : "exames"}-${count}`);
    if (kind === "exam_request") {
      expect(await page.getByRole("heading", { name: "Exames solicitados" }).evaluate((el) => el.getBoundingClientRect().top + scrollY)).toBeLessThan(await page.getByLabel("Justificativa").evaluate((el) => el.getBoundingClientRect().top + scrollY));
    }
    // A removal alone is dirty; undoing it restores the saved state exactly.
    await page.getByRole("button", { name: new RegExp(`^Remover ${noun} 1:`) }).click();
    await expect.poll(() => dirty(page)).toBe("1");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("link", { name: "Voltar aos documentos", exact: true }).click();
    await expect(names).toHaveCount(count - 1);
    await page.getByRole("button", { name: /^Desfazer remoção de/ }).click();
    expect(await contentOf(page)).toEqual(doc.content);
    await expect.poll(() => dirty(page)).toBeNull();
    await page.getByRole("button", { name: `Adicionar ${noun}`, exact: true }).click();
    await expect(names.last()).toBeFocused();
    await expect.poll(() => dirty(page)).toBe("1");
    await names.last().fill("ITEM NOVO DEMO");
    const added = await contentOf(page);
    const middle = Math.floor(count / 2);
    await page.getByRole("button", { name: new RegExp(`^Remover ${noun} ${middle + 1}:`) }).click();
    await expect(names.nth(middle)).toBeFocused();
    const remaining = await contentOf(page);
    expect(remaining.items).toEqual(added.items.filter((_, index) => index !== middle));
    // Removing has not persisted anything before explicit save.
    const beforeSave = await physician.client.rpc("document_open", { target: athlete, document_id: doc.id });
    expect(beforeSave.data.content).toEqual(doc.content);
    await page.getByRole("button", { name: /^Desfazer remoção de/ }).click();
    await expect(names.nth(middle)).toBeFocused();
    expect(await contentOf(page)).toEqual(added);
    // Exercise multiple undo and the empty list without repeating every removal in six-item cases.
    const removals = count === 6 ? 0 : 2;
    for (let i = added.items.length; i > added.items.length - removals; i--) await page.getByRole("button", { name: new RegExp(`^Remover ${noun} ${i}:`) }).click();
    if (count === 1) {
      await expect(page.getByRole("button", { name: `Adicionar ${noun}`, exact: true })).toBeFocused();
      await expect(names).toHaveCount(0);
    }
    await expect.poll(() => dirty(page)).toBe("1");
    for (let i = 0; i < removals; i++) await page.getByRole("button", { name: /^Desfazer remoção de/ }).click();
    expect(await contentOf(page)).toEqual(added);
    await save(page);
    await page.reload();
    expect(await contentOf(page)).toEqual(added);
    const reopened = await physician.client.rpc("document_open", { target: athlete, document_id: doc.id });
    expect(reopened.data.content).toEqual(added);
  }
});

test("protege edição, histórico, recarga e prévia persistida nos três tipos", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  for (const kind of ["prescription", "exam_request", "surgical_order"]) {
    const doc = await seed(kind, 1);
    await page.goto(`/atletas/${athlete}?aba=documentos`);
    await page.goto(doc.path);
    const field = page.getByLabel(kind === "prescription" ? "Nome do medicamento" : kind === "exam_request" ? "Nome do exame" : "Procedimento proposto");
    const initial = await field.inputValue();
    await page.getByRole("link", { name: "Pré-visualizar", exact: true }).click();
    await expect(page.getByText("Pré-visualização da última versão salva.", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Voltar ao editor", exact: true }).click();
    await field.fill("ALTERAÇÃO NÃO SALVA DEMO");
    const reject = (dialog) => { expect(dialog.message()).toContain("não salvas"); return dialog.dismiss(); };
    page.once("dialog", reject);
    await page.getByRole("link", { name: "Voltar aos documentos", exact: true }).click();
    await expect(field).toHaveValue("ALTERAÇÃO NÃO SALVA DEMO");
    page.once("dialog", reject);
    await page.getByRole("link", { name: "Pré-visualizar", exact: true }).click();
    await expect(field).toHaveValue("ALTERAÇÃO NÃO SALVA DEMO");
    if (kind === "prescription") {
      const nativeDialog = page.waitForEvent("dialog");
      const reload = page.reload({ timeout: 5000 }).catch(() => null);
      const dialog = await nativeDialog;
      expect(dialog.type()).toBe("beforeunload");
      await dialog.dismiss();
      await reload;
      await expect(field).toHaveValue("ALTERAÇÃO NÃO SALVA DEMO");
      if (await page.evaluate(() => Boolean(window.navigation))) {
        const historyDialog = page.waitForEvent("dialog");
        const traversal = page.evaluate(() => history.back());
        const back = await historyDialog;
        expect(back.message()).toContain("não salvas");
        await back.dismiss();
        await traversal;
        await expect(field).toHaveValue("ALTERAÇÃO NÃO SALVA DEMO");
      }
    }
    page.once("dialog", (dialog) => { expect(dialog.message()).toContain("última versão salva"); return dialog.accept(); });
    await page.getByRole("link", { name: "Pré-visualizar", exact: true }).click();
    await expect(page.locator(".document-sheet")).toContainText(initial);
    await expect(page.locator(".document-sheet")).not.toContainText("ALTERAÇÃO NÃO SALVA DEMO");
    await page.getByRole("link", { name: "Voltar ao editor", exact: true }).click();
    await expect(field).toHaveValue(initial);
    await field.fill("DESCARTAR DEMO");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("link", { name: "Voltar aos documentos", exact: true }).click();
    await page.waitForURL(/aba=documentos/);
  }
});

test("pedido cirúrgico: textos extensos, campos, estado salvo e telas", async ({ page }) => {
  test.setTimeout(60_000);
  await login(page);
  const doc = await seed("surgical_order", 1);
  await page.goto(doc.path);
  expect(await contentOf(page)).toEqual(doc.content);
  await responsive(page, "cirurgia");
  const justification = "Justificativa DEMO. ".repeat(110).slice(0, 2000).trim();
  await page.getByLabel("Justificativa médica").fill(justification);
  await expect.poll(() => page.getByLabel("Justificativa médica").evaluate((el) => el.scrollHeight <= el.clientHeight + 2)).toBe(true);
  await save(page);
  await page.reload();
  expect(await contentOf(page)).toEqual({ ...doc.content, justification });
});

test("menu por teclado, Escape, foco e autorização preservada", async ({ page }) => {
  await login(page);
  await page.goto(`/atletas/${athlete}?aba=documentos`);
  const trigger = page.getByRole("button", { name: "+ Novo documento", exact: true });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Nova prescrição", exact: true })).toBeFocused();
    await page.screenshot({ path: `${shots}/menu-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  }
  await trigger.click();
  await page.getByRole("link", { name: "Nova prescrição", exact: true }).click();
  await expect(page.getByLabel("Nome do medicamento")).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page.waitForURL(/login/);
  await login(page, blocked);
  await page.goto(`/atletas/${athlete}`);
  await expect(trigger).toHaveCount(0);
  for (const slug of ["prescricao", "cirurgia", "exames"]) {
    await page.goto(`/atletas/${athlete}/documentos/nova?tipo=${slug}`);
    await expect(page.getByRole("heading", { name: "Página indisponível" })).toBeVisible();
  }
});
