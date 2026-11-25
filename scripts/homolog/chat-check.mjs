// Verificação do chat no link de homologação (Vercel Preview), feita por um navegador real.
// Entra com a conta de avaliação de Medicina (dados fictícios), conversa com o CBB Intelligence e
// confere os fluxos que mais quebram: listar atletas no primeiro toque e iniciar a gravação da
// consulta com atleta em contexto. Não altera prontuários: só cria conversas e contexto.
//
// Variáveis: HOMOLOG_URL, EVALUATOR_PASSWORD, VERCEL_AUTOMATION_BYPASS_SECRET (proteção da Vercel),
// CHECK_EMAIL (opcional), CHECK_OUT (pasta dos resultados).
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const base = (process.env.HOMOLOG_URL || "https://prontuario-cbb-beta-git-homologacao-one-ai-dev.vercel.app").replace(/\/$/, "");
const host = new URL(base).host;
const email = process.env.CHECK_EMAIL || "carlos.andreoli@cbb-demo.test";
const password = process.env.EVALUATOR_PASSWORD;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const out = process.env.CHECK_OUT || "homolog-check";
if (!password) throw new Error("Falta EVALUATOR_PASSWORD.");
mkdirSync(out, { recursive: true });

const results = [];
const unavailable = /não está disponível|indisponível no momento/i;

async function check(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - started, detail: detail ?? "" });
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started, detail: String(error?.message ?? error).slice(0, 400) });
  }
  await page.screenshot({ path: join(out, `${String(results.length).padStart(2, "0")}.png`), fullPage: false }).catch(() => {});
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
if (bypass) {
  // The bypass header goes only to the preview host, never to fonts or other origins.
  await context.route("**/*", (route) => {
    const request = route.request();
    if (new URL(request.url()).host !== host) return route.continue();
    return route.continue({ headers: { ...request.headers(), "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } });
  });
}
const page = await context.newPage();
const assistantTurns = page.locator(".ia-turn:not(.ia-turn-user)");

/** Sends a message (or runs an action that posts to the chat) and waits for the full answer. */
async function exchange(action) {
  const before = await assistantTurns.count();
  const answered = page.waitForResponse((r) => r.url().endsWith("/api/inteligencia") && r.request().method() === "POST", { timeout: 90_000 });
  const started = Date.now();
  await action();
  const response = await answered;
  await response.finished();
  await page.waitForFunction((n) => document.querySelectorAll(".ia-turn:not(.ia-turn-user)").length > n, before, { timeout: 30_000 });
  await page.waitForTimeout(800);
  const turn = assistantTurns.last();
  return { turn, text: (await turn.innerText()).trim(), ms: Date.now() - started, status: response.status() };
}
async function say(text) {
  return exchange(async () => {
    const box = page.getByPlaceholder("Pergunte sobre um atleta, uma evolução ou um prontuário.");
    await box.fill(text);
    await page.getByRole("button", { name: "Enviar" }).click();
  });
}
const short = (text) => text.replace(/\s+/g, " ").slice(0, 220);

await check("Login (Medicina)", async () => {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  if (!(await page.locator("#email").count())) throw new Error("Tela de login não abriu (proteção da Vercel ativa? confira VERCEL_AUTOMATION_BYPASS_SECRET).");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByPlaceholder("Pergunte sobre um atleta, uma evolução ou um prontuário.").waitFor({ timeout: 30_000 });
});

await check("Nova conversa", async () => {
  const button = page.getByRole("button", { name: "Nova conversa" });
  if (await button.isVisible().catch(() => false)) await button.click();
  await page.waitForTimeout(800);
});

let replies = [];
await check("Pedir consulta sem atleta: pergunta qual atleta", async () => {
  const { turn, text, ms } = await say("quero iniciar uma consulta");
  if (unavailable.test(text)) throw new Error(`Disse que está indisponível: ${short(text)}`);
  replies = await turn.locator(".ia-reply").allInnerTexts();
  if (!/atleta/i.test(text)) throw new Error(`Não perguntou pelo atleta: ${short(text)}`);
  return `${ms} ms · opções: ${replies.join(" | ") || "nenhuma"}`;
});

await check("Listar os atletas funciona no primeiro toque", async () => {
  const option = assistantTurns.last().locator(".ia-reply", { hasText: /listar/i }).first();
  const { turn, ms } = await exchange(async () => {
    if (await option.count()) await option.click();
    else {
      await page.getByPlaceholder("Pergunte sobre um atleta, uma evolução ou um prontuário.").fill("Listar os atletas");
      await page.getByRole("button", { name: "Enviar" }).click();
    }
  });
  const cards = await turn.getByRole("button", { name: /colocar em contexto|em contexto/i }).count();
  if (!cards) throw new Error(`Nenhum atleta listado: ${short(await turn.innerText())}`);
  return `${ms} ms · ${cards} cartões`;
});

await check("Colocar atleta em contexto", async () => {
  const button = assistantTurns.last().getByRole("button", { name: /colocar em contexto/i }).first();
  if (!(await button.count())) throw new Error("Sem botão Colocar em contexto.");
  await button.click();
  await page.waitForTimeout(2500);
});

await check("Iniciar consulta com atleta em contexto: oferece a gravação", async () => {
  const { turn, text, ms } = await say("quero iniciar a consulta");
  if (unavailable.test(text)) throw new Error(`Disse que está indisponível: ${short(text)}`);
  const link = turn.getByRole("link", { name: /registrar evolução por voz/i });
  if (!(await link.count())) throw new Error(`Não ofereceu Registrar evolução por voz: ${short(text)}`);
  return `${ms} ms`;
});

await check("Tela de gravação abre com as orientações", async () => {
  const link = assistantTurns.last().getByRole("link", { name: /registrar evolução por voz/i }).first();
  await link.click();
  await page.getByRole("button", { name: "Iniciar gravação" }).waitFor({ timeout: 30_000 });
  if (!(await page.getByText("Antes de começar").count())) throw new Error("Orientações não aparecem.");
});

await browser.close();

const failed = results.filter((r) => !r.ok);
const table = ["| Verificação | Resultado | Tempo | Detalhe |", "|---|---|---|---|",
  ...results.map((r) => `| ${r.name} | ${r.ok ? "✅" : "❌"} | ${(r.ms / 1000).toFixed(1)} s | ${r.detail.replace(/\|/g, "/")} |`)].join("\n");
const summary = `## Verificação do chat em homologação\n\n${base}\n\n${table}\n`;
console.log(summary);
writeFileSync(join(out, "result.json"), JSON.stringify({ base, results }, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
process.exit(failed.length ? 1 : 0);
