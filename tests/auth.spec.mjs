import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "../scripts/local-supabase.mjs";

const admin = createClient(localSupabase.url, localSupabase.adminKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const users = [];
async function createAccount(canReadAudit) {
  const email = `demo-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const id = data.user.id;
  users.push(id);

  if (canReadAudit !== undefined) {
    const { error: insertError } = await admin.from("profiles").insert({
      id, display_name: "Profissional DEMO", profession: "Medicina esportiva", can_read_audit: canReadAudit,
    });
    if (insertError) throw insertError;
  }
  return { email, password, id };
}

test.afterAll(async () => {
  for (const id of users) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  }
});

async function signIn(page, account) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(account.email);
  await page.getByLabel("Senha").fill(account.password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("backend rejeita acesso anônimo e as duas interfaces exigem login", async ({ page }) => {
  const response = await page.request.get("/api/profile");
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  for (const path of ["/", "/prontuarios", "/auditoria"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("login individual, navegação nos dois modos e logout em tela móvel", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, await createAccount(true));
  await expect(page.getByRole("heading", { name: "Como podemos ajudar?" })).toBeVisible();
  await expect(page.getByLabel("Mensagem", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Enviar", exact: true })).toBeDisabled();
  await expect(page.getByRole("complementary", { name: "Contexto da tarefa" })).toHaveCount(0);
  const tasks = page.getByRole("navigation", { name: "Tarefas clínicas" });
  await expect(tasks.getByRole("link")).toHaveCount(2);
  await expect(tasks.getByRole("link", { name: /Nova evolução/ })).toHaveCount(0);
  await expect(tasks.getByRole("listitem").filter({ hasText: "Nova evolução" })).toContainText("Indisponível");
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await menu.click();
  await expect(page.getByText("Profissional DEMO")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();
  await menu.click();
  await expect(page.getByRole("navigation", { name: "Navegação do workspace" })
    .getByRole("link", { name: /^Nova evolução/ })).toContainText("Indisponível");
  const response = await page.request.get("/api/profile");
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ can_read_audit: true, profession: "Medicina esportiva" });
  await page.getByRole("link", { name: "Auditoria" }).click();
  await expect(page.getByRole("heading", { name: "Auditoria" })).toBeVisible();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  await page.getByRole("link", { name: "Chat", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Como podemos ajudar?" })).toBeVisible();
  await page.getByRole("navigation", { name: "Tarefas clínicas" }).getByRole("link", { name: /^Prontuários/ }).click();
  await expect(page.getByRole("heading", { name: "Prontuários" })).toBeVisible();
  await menu.click();
  await expect(page.getByRole("navigation", { name: "Navegação do workspace" }).getByRole("link", { name: "Prontuários", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get("/api/profile")).status()).toBe(401);
});

test("sem permissão a auditoria fica oculta e a URL direta recebe 404", async ({ page }) => {
  await signIn(page, await createAccount(false));
  await expect(page.getByRole("heading", { name: "Como podemos ajudar?" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Auditoria" })).toHaveCount(0);
  expect((await page.goto("/auditoria")).status()).toBe(404);
});

test("login sem perfil individual recebe 403 na API", async ({ page }) => {
  await signIn(page, await createAccount());
  await expect(page.getByText("Sua conta ainda não possui um perfil profissional.", { exact: true })).toBeVisible();
  expect((await page.request.get("/api/profile")).status()).toBe(403);
});

test("RLS limita leitura ao próprio perfil e bloqueia elevação de permissão", async () => {
  const owner = await createAccount(false);
  const other = await createAccount(true);
  const client = createClient(localSupabase.url, localSupabase.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword(owner);
  expect(error).toBeNull();
  const visible = await client.from("profiles").select("id");
  expect(visible.error).toBeNull();
  expect(visible.data).toEqual([{ id: owner.id }]);
  expect(visible.data).not.toContainEqual({ id: other.id });
  const update = await client.from("profiles").update({ can_read_audit: true }).eq("id", owner.id);
  expect(update.error?.code).toBe("42501");
});
