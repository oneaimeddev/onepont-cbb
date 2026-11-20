import { test, expect } from "./fixtures.mjs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { localSupabase } from "../scripts/local-supabase.mjs";
import { birthParts, saoPauloToday, validateBirth } from "../src/features/athletes/birth-date.ts";

test.use({ locale: "pt-BR", timezoneId: "America/Sao_Paulo" });

const require = createRequire(import.meta.url);
const admin = createClient(localSupabase.url, localSupabase.adminKey, { auth: { persistSession: false } });
const accounts = [], athleteIds = [], optionIds = [];
let author, reader, empty;
const shots = "docs/visual/handoff-007-10-3b-inline-filters";
const scans = [];
const sql = (input) => execFileSync("docker", ["exec", "-i", "supabase_db_prontuario-cbb", "psql", "-X", "-U", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8" });
const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
const today = saoPauloToday();
const dateGroup = (page) => page.getByRole("group", { name: "Data de nascimento (opcional)", exact: true });
async function setBirth(scope, iso) {
  const parts = birthParts(iso);
  await scope.getByRole("combobox", { name: "Dia", exact: true }).selectOption(parts.day);
  await scope.getByRole("combobox", { name: "Mês", exact: true }).selectOption(parts.month);
  await scope.getByRole("combobox", { name: "Ano", exact: true }).selectOption(parts.year);
}
async function account(name, create = false) {
  const email = `ux-directory-${randomUUID()}@example.com`, password = randomUUID();
  const r = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (r.error) throw r.error;
  const id = r.data.user.id;
  accounts.push(id);
  const p = await admin.from("profiles").insert({ id, display_name: name, profession: "Medicina" });
  if (p.error) throw p.error;
  if (create) sql(`insert into clinical.athlete_creators(professional_id) values('${id}');`);
  const client = createClient(localSupabase.url, localSupabase.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id, email, password, client };
}
async function login(page, user = author) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
}
async function capture(page, name, widths = [1440, 390, 320], axe = false) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (axe) {
      if (!await page.evaluate(() => Boolean(window.axe))) await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      const r = await page.evaluate(async () => {
        const r = await window.axe.run(document.querySelector('dialog[open]') ?? document.querySelector("main"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
        return { violations: r.violations.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map((n) => n.target) })), incomplete: r.incomplete.map((r) => r.id) };
      });
      scans.push({ name, width, ...r });
      expect(r.violations).toEqual([]);
    }
    await page.screenshot({ path: `${shots}/${name}-${width}.png`, fullPage: true });
  }
}

test.beforeAll(async () => {
  mkdirSync(shots, { recursive: true });
  author = await account("Dra. Diretório DEMO", true);
  reader = await account("Profissional limitado DEMO");
  empty = await account("Profissional sem atletas DEMO");
});
test.afterAll(async () => {
  writeFileSync(`${shots}/acessibilidade.json`, JSON.stringify(scans, null, 2));
  const userIds = accounts.map(quote).join(",") || "null";
  sql(`delete from clinical.athletes where created_by in (${userIds}) or id in (${athleteIds.map(quote).join(",") || "null"});`);
  sql(`delete from clinical.sport_options where id in (${optionIds.map(quote).join(",") || "null"});`);
  for (const id of accounts) {
    const r = await admin.auth.admin.deleteUser(id);
    if (r.error) throw r.error;
  }
});

test("datas civis: bissexto, parcial, limites e fronteira UTC/São Paulo", () => {
  expect(saoPauloToday(new Date("2026-11-19T00:30:00Z"))).toBe("2026-11-18");
  expect(saoPauloToday(new Date("2026-01-01T01:00:00Z"))).toBe("2025-12-31");
  expect(saoPauloToday(new Date("2026-01-01T03:00:00Z"))).toBe("2026-01-01");
  for (const value of ["1990-04-12", "2006-04-12", "2012-04-12", "2018-04-12", "2024-02-29", "2026-11-18", "1900-01-01", "2000-02-29", ""]) expect(validateBirth(birthParts(value), "2026-11-18")).toEqual({ value, error: null });
  for (const value of ["2023-02-29", "1900-02-29", "1899-12-31", "2026-11-19", "2026-04-31"]) expect(validateBirth(birthParts(value), "2026-11-18").error).toBeTruthy();
  expect(validateBirth({ day: "29", month: "2", year: "" }, "2026-11-18").value).toBe("");
});

test("nascimento nos três fluxos: selecionar, validar, salvar e reabrir", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  for (const value of ["1990-04-12", "2006-04-12", "2012-04-12", "2018-04-12", today, "2024-02-29", ""]) {
    await page.goto("/atletas/novo");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Nome completo", { exact: true }).fill(`Nascimento UX DEMO ${value || "vazio"}`);
    await setBirth(dateGroup(page), value);
    await expect(page.locator('input[name="birth"]')).toHaveValue(value);
    await page.getByRole("button", { name: "Salvar cadastro", exact: true }).click();
    await page.waitForURL(/\/atletas\/[a-f0-9-]{36}$/);
    const id = page.url().match(/atletas\/([a-f0-9-]{36})/)[1];
    await page.goto(`/atletas/${id}?aba=cadastro`);
    await page.getByText("Editar identificação e status", { exact: true }).click();
    await expect(page.locator('input[name="birth"]')).toHaveValue(value);
    expect(sql(`select coalesce(birth_date::text,'') from clinical.athletes where id='${id}';`).trim()).toBe(value);
    if (value === "1990-04-12") {
      await capture(page, "nascimento-edicao", [1440, 390, 320], true);
      await setBirth(dateGroup(page), "2012-02-29");
      await page.getByRole("button", { name: "Salvar cadastro", exact: true }).click();
      await page.waitForURL(/salvo=1/);
      await page.reload();
      await page.getByText("Editar identificação e status", { exact: true }).click();
      await expect(page.locator('input[name="birth"]')).toHaveValue("2012-02-29");
    }
  }
  await page.goto("/atletas/novo");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Nome completo", { exact: true }).fill("Nascimento incompleto DEMO");
  const group = dateGroup(page);
  await group.getByRole("combobox", { name: "Dia", exact: true }).selectOption("29");
  await expect(page.locator('input[name="birth"]')).toHaveValue("");
  await expect(group).toContainText("Selecione o mês");
  await setBirth(group, "2024-02-29");
  await group.getByRole("combobox", { name: "Ano", exact: true }).selectOption("2023");
  await expect(group.getByRole("combobox", { name: "Dia", exact: true })).toHaveValue("29");
  await expect(group).toContainText("28 dias em 2023");
  await expect(page.locator('input[name="birth"]')).toHaveValue("");
  await page.getByRole("tab", { name: "Dados esportivos", exact: true }).click();
  await page.getByRole("button", { name: "Salvar cadastro", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Dados pessoais", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(group.getByRole("combobox", { name: "Dia", exact: true })).toBeFocused();
  await capture(page, "nascimento-invalido", [1440, 390, 320]);
  await group.getByRole("button", { name: "Limpar nascimento", exact: true }).click();
  await expect(page.locator('input[name="birth"]')).toHaveValue("");
  await expect(group.getByRole("combobox", { name: "Ano", exact: true }).locator('option[value="1899"]')).toHaveCount(0);
  await capture(page, "nascimento-pagina", [1440, 390, 320], true);
  await page.goto("/atletas");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Cadastrar atleta", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Cadastrar atleta", exact: true });
  const birth = dialog.getByRole("group", { name: "Data de nascimento (opcional)", exact: true });
  await expect(dialog.locator('input[name="birth"]')).toHaveValue("");
  await dialog.getByLabel("Nome completo", { exact: true }).fill("Nascimento Modal DEMO");
  await setBirth(birth, "2006-04-12");
  await capture(page, "nascimento-modal", [1440, 390, 320], true);
  await dialog.getByRole("button", { name: "Salvar cadastro", exact: true }).click();
  await page.waitForURL(/\/atletas\/[a-f0-9-]{36}$/);
  const modalId = page.url().match(/atletas\/([a-f0-9-]{36})/)[1];
  expect(sql(`select birth_date::text from clinical.athletes where id='${modalId}';`).trim()).toBe("2006-04-12");
});

test("ano por teclado e limite de hoje em São Paulo no cliente", async ({ page }) => {
  await login(page);
  await page.clock.install({ time: new Date("2026-11-19T00:30:00Z") });
  await page.goto("/atletas/novo");
  await page.waitForLoadState("networkidle");
  const group = dateGroup(page), year = group.getByRole("combobox", { name: "Ano", exact: true });
  await year.focus();
  await page.keyboard.type("1990");
  await expect(year).toHaveValue("1990");
  await setBirth(group, "2026-11-19");
  await expect(group).toContainText("não pode ser futura");
  await expect(page.locator('input[name="birth"]')).toHaveValue("");
  await page.clock.setSystemTime(new Date("2026-11-19T03:01:00Z"));
  await group.getByRole("combobox", { name: "Dia", exact: true }).focus();
  await expect(page.locator('input[name="birth"]')).toHaveValue("2026-11-19");
  // The clock is mocked only in this browser; do not persist this synthetic future date.
});

test("diretório 0/1/10/50/3000, vínculos, filtros, autorização e escala", async ({ page }) => {
  test.setTimeout(150_000);
  const names = ["Ana Carolina Nascimento de Albuquerque e Vasconcelos Atleta DEMO", "Bruna Multivínculos DEMO", "Carlos Sem Clube DEMO", "Davi Histórico DEMO", "Érica DEMO", "Fábio Inativo DEMO", "Gabriela Foto DEMO", "Helena DEMO", "Igor Três por Três DEMO", "Zuleica Nome Civil DEMO"];
  const ids = Array.from({ length: 3000 }, () => randomUUID());
  athleteIds.push(...ids);
  await login(page, empty);
  await page.goto("/atletas");
  await expect(page.getByText("Nenhum atleta disponível para este perfil.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cadastrar atleta" })).toHaveCount(0);
  await capture(page, "vazio-inicial", [1440, 390, 320]);
  // A separate owner makes the authorized count independent of the birthday test.
  const owner = await account("Dra. Listagem DEMO", true);
  await login(page, owner);
  const options = [randomUUID(), randomUUID(), randomUUID()];
  optionIds.push(...options);
  sql(`insert into clinical.sport_options(id,category,modality,division,season) values
    ('${options[0]}','Sub-17 UX DEMO','5x5','Feminino',2026),
    ('${options[1]}','Adulto UX DEMO','3x3','Feminino',2026),
    ('${options[2]}','Histórico UX DEMO','5x5','Masculino',2025);`);
  for (const [start, end] of [[0, 1], [1, 10], [10, 50], [50, 3000]]) {
    const values = ids.slice(start, end).map((id, n) => {
      const i = start + n;
      return `('${id}',${quote(names[i] || `Escala UX ${String(i + 1).padStart(4, "0")} DEMO`)},${i === 9 ? "'Aline Nome Social DEMO'" : "null"},${i === 5 ? "'inactive'" : "'active'"},'demo')`;
    });
    sql(`insert into clinical.athletes(id,full_name,social_name,status,source) values ${values.join(",")};
      insert into clinical.athlete_access(athlete_id,professional_id,can_read_records,can_edit) select id,'${owner.id}',true,true from clinical.athletes where id in (${ids.slice(start, end).map(quote).join(",")});`);
    if (end === 10) {
      sql(`insert into clinical.sport_links(athlete_id,option_id,club,starts_on,ends_on) values
        ('${ids[1]}','${options[0]}','Aurora DEMO','2026-01-01',null),
        ('${ids[1]}','${options[1]}','Horizonte DEMO','2026-01-01',null),
        ('${ids[1]}','${options[2]}','Antigo DEMO','2025-01-01','2025-12-31'),
        ('${ids[8]}','${options[1]}','Horizonte DEMO','2026-01-01',null),
        ('${ids[3]}','${options[2]}','Antigo DEMO','2025-01-01','2025-12-31');
        update clinical.athletes set category='Sub-15 legada DEMO',team='Clube Antigo DEMO' where id='${ids[3]}';
        update clinical.athletes set document_id='RESTRITO-UX-103B',gender_identity='nao_binario' where id='${ids[1]}';
        insert into clinical.athlete_access(athlete_id,professional_id,can_read_records) values('${ids[1]}','${reader.id}',true);`);
      const photo = await page.request.post(`/api/atletas/${ids[6]}/foto`, { headers: { origin: "http://127.0.0.1:3100" }, multipart: { photo: { name: "demo.jpg", mimeType: "image/jpeg", buffer: readFileSync("public/design-lab/lara-benedetti.jpg") } } });
      expect(photo.status()).toBe(200);
    }
    await page.goto("/atletas");
    await expect(page.locator(".result-count")).toHaveText(`${end === 1 ? "1 atleta" : `${end} atletas`}`);
    await expect(page.locator(".athlete-list > li")).toHaveCount(Math.min(end, 25));
    if (end === 10) {
      await expect(page.locator(".athlete-row-main > a")).toHaveText(names.map((name, i) => i === 9 ? "Aline Nome Social DEMO" : name));
      await expect(page.locator(".record-id").first()).toHaveAttribute("aria-hidden", "true");
    }
    await capture(page, `lista-${end}`, [1440, 390, 320], end === 10);
  }
  await page.goto("/atletas?q=Aline");
  await expect(page.getByRole("link", { name: "Aline Nome Social DEMO", exact: true })).toBeVisible();
  await expect(page.locator(".directory-legal")).toHaveText("Zuleica Nome Civil DEMO");
  await page.goto("/atletas?status=inactive");
  await expect(page.locator(".result-count")).toHaveText("1 atleta");
  await expect(page.getByRole("link", { name: "Fábio Inativo DEMO", exact: true })).toBeVisible();
  await page.goto(`/atletas?${new URLSearchParams({ category: "Histórico UX DEMO" })}`);
  await expect(page.getByText("Nenhum atleta corresponde aos critérios aplicados.", { exact: true })).toBeVisible();
  await page.goto("/atletas?q=Escala+UX+3000");
  await expect(page.getByRole("link", { name: "Escala UX 3000 DEMO", exact: true })).toBeVisible();
  await page.goto("/atletas?q=erica");
  await expect(page.getByRole("link", { name: "Érica DEMO", exact: true })).toBeVisible();
  const category = `Adulto UX DEMO`;
  const filter = new URLSearchParams({ q: "Bruna", category, modality: "3x3", division: "Feminino", club: "Horizonte DEMO" });
  await page.goto(`/atletas?${filter}`);
  const row = page.locator(".athlete-list li").filter({ hasText: "Bruna Multivínculos DEMO" });
  await expect(row).toContainText(category);
  await expect(row).toContainText("Horizonte DEMO");
  await expect(row).not.toContainText(`Sub-17 UX DEMO`);
  await expect(row).toContainText("Mais 1 vínculo vigente");
  await expect(page.getByRole("combobox", { name: /^Categoria/ })).toBeVisible();
  await capture(page, "vinculo-filtrado", [1440, 390, 320], true);
  await page.getByRole("link", { name: "Bruna Multivínculos DEMO", exact: true }).click();
  await page.getByRole("link", { name: /Trocar atleta/ }).click();
  await page.waitForURL(/category=/);
  expect(new URL(page.url()).searchParams.get("q")).toBe("Bruna");
  expect(new URL(page.url()).searchParams.get("category")).toBe(category);
  await page.goto(`/atletas?${new URLSearchParams({ q: "Bruna", category: category.toLowerCase() })}`);
  const fallback = page.locator(".athlete-list li");
  await expect(fallback).toContainText("2 vínculos vigentes");
  await expect(fallback).toContainText("Aurora DEMO");
  await expect(fallback).toContainText("Horizonte DEMO");
  await page.goto(`/atletas?${new URLSearchParams({ category: `Sub-17 UX DEMO`, modality: "3x3" })}`);
  await expect(page.getByText("Nenhum atleta corresponde aos critérios aplicados.", { exact: true })).toBeVisible();
  await capture(page, "sem-correspondencia", [1440, 390, 320]);
  await page.getByRole("link", { name: "Limpar busca e filtros", exact: true }).click();
  await page.waitForURL("/atletas");
  await page.goto("/atletas?q=Davi");
  await expect(page.locator(".athlete-list")).toContainText("Informação esportiva legada");
  await expect(page.locator(".athlete-list")).not.toContainText("vínculos vigentes");
  await capture(page, "legado", [1440]);
  await page.goto("/atletas?page=999");
  await page.waitForURL(/page=120/);
  await expect(page.getByRole("navigation", { name: "Paginação" })).toContainText("Página 120 de 120");
  await capture(page, "pagina-recuperada", [1440]);
  await page.goto(`/atletas?${filter}&page=999`);
  await page.waitForURL(/page=1$/);
  expect(new URL(page.url()).searchParams.get("q")).toBe("Bruna");
  await page.goto("/atletas");
  await page.waitForLoadState("networkidle");
  const categoryControl = page.getByRole("combobox", { name: /^Categoria/ });
  await expect(categoryControl).toBeVisible();
  await categoryControl.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox", { name: /^Naipe/ })).toBeFocused();
  await page.getByRole("combobox", { name: /^Categoria/ }).selectOption(category);
  expect(new URL(page.url()).search).toBe("");
  await capture(page, "filtros-abertos", [1440, 390, 320]);
  await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
  await page.waitForURL(/category=/);
  await expect(page.getByRole("combobox", { name: /^Categoria/ })).toBeVisible();

  await expect(page.locator(".filter-applied")).toContainText(category);
  const requested = await owner.client.rpc("athlete_directory", { filters: { category } });
  expect(requested.data.total).toBe(2);
  expect(await page.locator(".athlete-list li").count()).toBe(requested.data.total);
  await login(page, reader);
  const limited = await reader.client.rpc("athlete_directory", { filters: {} });
  expect(limited.data.total).toBe(1);
  expect(JSON.stringify(limited.data)).not.toContain("RESTRITO-UX-103B");
  expect(JSON.stringify(limited.data)).not.toContain("gender_identity");
  await page.goto("/atletas");
  await expect(page.locator(".athlete-list li")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Cadastrar atleta" })).toHaveCount(0);
  await page.goto(`/atletas/${ids[0]}`);
  await expect(page.getByRole("heading", { name: "Página indisponível" })).toBeVisible();
});
