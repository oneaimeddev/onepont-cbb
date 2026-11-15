import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { localSupabase } from "./local-supabase.mjs";

const destination = process.argv[2];
if (!destination) throw new Error("Informe a pasta de capturas.");
await mkdir(destination, { recursive: true });
const admin = createClient(localSupabase.url, localSupabase.adminKey, { auth: { persistSession: false } });
const email = `visual-${randomUUID()}@example.com`;
const password = randomUUID();
const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw error;
let browser;
try {
  const profile = await admin.from("profiles").insert({
    id: data.user.id, display_name: "Profissional DEMO", profession: "Medicina esportiva", can_read_audit: true,
  });
  if (profile.error) throw profile.error;
  browser = await chromium.launch();
  for (const [size, viewport] of Object.entries({
    desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 }, compact: { width: 320, height: 740 }, tablet: { width: 768, height: 1024 },
  })) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:3100/login");
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${destination}/login-${size}.png`, fullPage: true });
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL("http://127.0.0.1:3100/");
    for (const [name, path] of [["chat", "/"], ["prontuarios", "/prontuarios"]]) {
      await page.goto("http://127.0.0.1:3100" + path);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${destination}/${name}-${size}.png`, fullPage: true });
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) {
        throw new Error(`Overflow em ${name} ${size}`);
      }
    }
    if (viewport.width <= 700) {
      await page.getByRole("button", { name: "Menu", exact: true }).click();
      await page.screenshot({ path: `${destination}/navigation-${size}.png`, fullPage: true });
    }
    await context.close();
  }
} finally {
  await browser?.close();
  const { error: cleanupError } = await admin.auth.admin.deleteUser(data.user.id);
  if (cleanupError) throw cleanupError;
}
console.log("Capturas concluídas em " + destination);
