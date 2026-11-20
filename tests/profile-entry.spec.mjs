import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { test, expect } from "./fixtures.mjs";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "../scripts/local-supabase.mjs";

const require = createRequire(import.meta.url);
const admin = createClient(localSupabase.url, localSupabase.adminKey, { auth: { persistSession: false } });
const accounts = [];
const shots = "docs/visual/professional-profile-entry";
let full, limited;
async function account(name, profession, privileged) {
  const email = `profile-entry-${randomUUID()}@example.com`, password = randomUUID();
  const r = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (r.error) throw r.error;
  accounts.push(r.data.user.id);
  const p = await admin.from("profiles").insert({ id: r.data.user.id, display_name: name, profession, can_read_audit: privileged, can_manage_access: privileged });
  if (p.error) throw p.error;
  return { id: r.data.user.id, name, email, password };
}
async function login(page, user) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
  await page.waitForLoadState("networkidle");
}
test.beforeAll(async () => {
  mkdirSync(shots, { recursive: true });
  full = await account("Profissional Perfil DEMO", "Medicina", true);
  limited = await account("Psicóloga Perfil DEMO", "Psicologia", false);
});
test.afterAll(async () => {
  for (const id of accounts) {
    const r = await admin.auth.admin.deleteUser(id);
    if (r.error) throw r.error;
  }
});

test("Meu perfil abre pelo menu da Home e das telas internas, com teclado e mobile", async ({ page }) => {
  test.setTimeout(60_000);
  await login(page, full);
  const trigger = page.getByRole("button", { name: `Conta de PP ${full.name} Medicina`, exact: true });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Meu perfil", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Auditoria", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await page.getByRole("menuitem", { name: "Meu perfil", exact: true }).click();
  await page.waitForURL("/perfil");
  await expect(page.getByRole("heading", { name: "Meu perfil", exact: true })).toBeVisible();
  await expect(page.getByText(full.email, { exact: true })).toBeVisible();
  await expect(page.getByText("Indisponível nesta versão.", { exact: true })).toBeVisible();
  // A declared profession does not enable medical authorship.
  await expect(page.locator(".professional-facts > div").filter({ hasText: "Autoria de documentos médicos" })).toContainText("Não habilitada");
  await expect(page.locator('main input[type="text"]')).toHaveCount(0);
  const scans = [];
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await page.waitForLoadState("networkidle");
    const box = await trigger.boundingBox();
    expect(box.x + box.width / 2).toBeGreaterThan(width / 2);
    expect(box.y).toBeLessThan(100);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const a = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.map(x => x.id));
    scans.push({ width, violations: a });
    expect(a).toEqual([]);
    await page.screenshot({ path: `${shots}/perfil-${width}.png`, fullPage: true });
    await trigger.click();
    await expect(page.getByRole("menuitem", { name: "Meu perfil", exact: true })).toBeFocused();
    const menuViolations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.map(x => x.id));
    scans.push({ width, scope: "menu", violations: menuViolations });
    expect(menuViolations).toEqual([]);
    await page.keyboard.press("End");
    await expect(page.getByRole("menuitem", { name: "Sair", exact: true })).toBeFocused();
    await page.screenshot({ path: `${shots}/menu-${width}.png`, fullPage: true });
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.getByRole("button", { name: "Fechar menu", exact: true }).click();
  await trigger.click();
  await page.mouse.click(4, page.viewportSize().height - 4);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await page.getByRole("menuitem", { name: "Sair", exact: true }).click();
  await page.waitForURL(/\/login$/);
  console.log("Profile accessibility", JSON.stringify(scans));
});

test("perfil é do usuário autenticado e query string não seleciona outro profissional", async ({ page }) => {
  await login(page, limited);
  await page.goto(`/perfil?user=${full.id}`);
  await expect(page.getByText(limited.email, { exact: true })).toBeVisible();
  await expect(page.getByText(full.email, { exact: true })).toHaveCount(0);
  await expect(page.getByText("Habilitada", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: `Conta de PP ${limited.name} Psicologia`, exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Auditoria", exact: true })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Meu perfil", exact: true })).toBeVisible();
});
