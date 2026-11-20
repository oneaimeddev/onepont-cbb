import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "../scripts/local-supabase.mjs";
const require = createRequire(import.meta.url);
test.use({
  baseURL: "http://127.0.0.1:3101",
  viewport: { width: 1440, height: 1000 },
  locale: "pt-BR",
});
const out = "docs/visual/handoff-007-10-1";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(localSupabase.url, localSupabase.adminKey, opts);
const athlete = randomUUID(),
  documentId = randomUUID();
let owner, previous;
function sql(input) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_prontuario-cbb",
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-tAq",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input, encoding: "utf8" },
  ).trim();
}
async function login(page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(owner.email);
  await page.getByLabel("Senha", { exact: true }).fill(owner.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
  await expect(page.locator(".ia-greeting")).toBeVisible();
  await page.waitForLoadState("networkidle");
}
async function mockStream(page) {
  await page.addInitScript(() => {
    const native = window.fetch.bind(window);
    window.fetch = (input, options) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : input.toString();
      if (new URL(url, location.href).pathname === "/api/inteligencia") {
        const body = new ReadableStream({
          start(controller) {
            window.__chatController = controller;
            options?.signal?.addEventListener(
              "abort",
              () =>
                controller.error(new DOMException("Cancelado", "AbortError")),
              { once: true },
            );
          },
        });
        return Promise.resolve(
          new Response(body, {
            headers: { "content-type": "text/event-stream" },
          }),
        );
      }
      return native(input, options);
    };
  });
}
async function emit(page, event, data, close = false) {
  await page.evaluate(
    ({ event, data, close }) => {
      window.__chatController.enqueue(
        new TextEncoder().encode(
          `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
        ),
      );
      if (close) window.__chatController.close();
    },
    { event, data, close },
  );
}
async function send(page, text) {
  await page.evaluate(() => {
    window.__chatController = null;
  });
  await page.getByLabel("Mensagem", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Preparando resposta…" }),
  ).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__chatController));
}

test.beforeAll(async () => {
  mkdirSync(out, { recursive: true });
  const email = `home-polish-${randomUUID()}@example.com`,
    password = randomUUID();
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(created.error).toBeNull();
  owner = { id: created.data.user.id, email, password };
  expect(
    (
      await admin
        .from("profiles")
        .insert({
          id: owner.id,
          display_name: "Profissional DEMO",
          profession: "Medicina",
        })
    ).error,
  ).toBeNull();
  sql(
    `insert into clinical.athletes(id,full_name,source) values('${athlete}','Atleta Home DEMO','demo');insert into clinical.athlete_access(athlete_id,professional_id,can_read_records) values('${athlete}','${owner.id}',true);insert into clinical.medical_authors(professional_id) values('${owner.id}');insert into clinical.documents(id,athlete_id,author_id,author_name,document_type,status,content,version) values('${documentId}','${athlete}','${owner.id}','Profissional DEMO','prescription','draft','{"notes":"Documento fictício preservado","items":[]}',1);`,
  );
  const client = createClient(
    localSupabase.url,
    localSupabase.publishableKey,
    opts,
  );
  await client.auth.signInWithPassword({ email, password });
  const started = await client.rpc("conversation_start");
  expect(started.error).toBeNull();
  previous = started.data.session.id;
  const saved = await client.rpc("conversation_save", {
    target: previous,
    context_athlete: athlete,
    transcript: [
      {
        id: "previous-user",
        role: "user",
        text: "Conversa anterior DEMO",
        athletes: [],
        navigation: null,
        search: null,
      },
      {
        id: "previous-assistant",
        role: "assistant",
        text: "Resposta anterior preservada DEMO",
        athletes: [],
        navigation: null,
        search: null,
      },
    ],
  });
  expect(saved.error).toBeNull();
});
test.afterAll(async () => {
  if (!owner) return;
  sql(
    `delete from clinical.conversation_sessions where professional_id='${owner.id}';delete from clinical.documents where author_id='${owner.id}';delete from clinical.audit_events where actor_user_id='${owner.id}';delete from clinical.athletes where id='${athlete}'`,
  );
  expect((await admin.auth.admin.deleteUser(owner.id)).error).toBeNull();
});

test("login mostra Home sem criar sessão; histórico, contexto e documentos são preservados", async ({
  page,
}) => {
  await mockStream(page);
  const count = () =>
    sql(
      `select count(*) from clinical.conversation_sessions where professional_id='${owner.id}'`,
    );
  const before = count();
  const messages = sql(
    `select jsonb_agg(to_jsonb(m) order by position)::text from clinical.conversation_messages m where session_id='${previous}'`,
  );
  await login(page);
  await expect(
    page.getByRole("region", { name: "Histórico da conversa" }),
  ).toHaveCount(0);
  expect(count()).toBe(before);
  await expect(
    page.getByRole("navigation", { name: "Tarefas clínicas" }),
  ).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Conversas anteriores" })
    .getByRole("button", { name: /Conversa anterior DEMO/ })
    .click();
  await expect(
    page.getByRole("region", { name: "Histórico da conversa" }),
  ).toContainText("Resposta anterior preservada DEMO");
  await expect(
    page.getByRole("complementary", { name: "Contexto da tarefa" }),
  ).toContainText("Atleta Home DEMO");
  await page
    .getByRole("button", { name: /^Conta de / })
    .click();
  await page.getByRole("menuitem", { name: "Sair", exact: true }).click();
  await page.waitForURL("/login");
  await login(page);
  await expect(
    page.getByRole("region", { name: "Histórico da conversa" }),
  ).toHaveCount(0);
  expect(count()).toBe(before);
  expect(
    sql(
      `select jsonb_agg(to_jsonb(m) order by position)::text from clinical.conversation_messages m where session_id='${previous}'`,
    ),
  ).toBe(messages);
  expect(
    sql(
      `select content->>'notes' from clinical.documents where id='${documentId}'`,
    ),
  ).toBe("Documento fictício preservado");
  await send(page, "Nova mensagem DEMO");
  await emit(
    page,
    "done",
    {
      text: "Resposta da nova conversa DEMO",
      athletes: [],
      navigation: null,
      search: null,
      draft: null,
      document: null,
      context: null,
    },
    true,
  );
  await expect(page.locator(".ia-pending")).toHaveCount(0);
  await expect.poll(count).toBe(String(Number(before) + 1));
  await expect
    .poll(() =>
      sql(
        `select count(*) from clinical.conversation_messages where text='Nova mensagem DEMO' and session_id<>'${previous}'`,
      ),
    )
    .toBe("1");
  expect(
    sql(
      `select jsonb_agg(to_jsonb(m) order by position)::text from clinical.conversation_messages m where session_id='${previous}'`,
    ),
  ).toBe(messages);
});
test("digitação, rotação, pausa inteligente e altura estável sem chamadas de saudação", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.clock.install();
  const api = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/")) api.push(r.url());
  });
  await login(page);
  await page.clock.pauseAt(await page.evaluate(() => Date.now()));
  const typed = page.locator(".ia-greeting-typed");
  const accessible = page.locator(".ia-greeting > .ia-sr");
  const first = await accessible.innerText();
  const start = await typed.innerText();
  await page.clock.runFor(150);
  expect((await typed.innerText()).length).toBeGreaterThan(start.length);
  await page.screenshot({ path: `${out}/home-typing.png`, fullPage: true });
  for (let i = 0; i < first.length + 8; i++) {
    await page.clock.runFor(100);
    await typed.innerText();
  }
  await expect(typed).toHaveText(first);
  const y = (await page.locator(".ia-composer").boundingBox()).y;
  await page.screenshot({ path: `${out}/home-desktop.png`, fullPage: true });
  await page.clock.runFor(14000);
  await typed.getAttribute("class");
  await page.clock.runFor(250);
  await typed.innerText();
  expect(await accessible.innerText()).not.toBe(first);
  expect(
    Math.abs((await page.locator(".ia-composer").boundingBox()).y - y),
  ).toBeLessThanOrEqual(1);
  const second = await accessible.innerText();
  await page.getByLabel("Mensagem", { exact: true }).focus();
  await page.clock.runFor(30000);
  expect(await accessible.innerText()).toBe(second);
  await page
    .getByLabel("Mensagem", { exact: true })
    .fill("Rascunho de mensagem");
  await page.locator(".ia-product").click();
  await page.clock.runFor(30000);
  expect(await accessible.innerText()).toBe(second);
  await page.getByLabel("Mensagem", { exact: true }).fill("");
  await page.locator(".ia-product").click();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (window.__testHidden ? "hidden" : "visible"),
    });
    window.__testHidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(30000);
  expect(await accessible.innerText()).toBe(second);
  await page.evaluate(() => {
    window.__testHidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(14000);
  await typed.getAttribute("class");
  await page.clock.runFor(250);
  await typed.innerText();
  expect(await accessible.innerText()).not.toBe(second);
  await expect(page.locator(".ia-greeting")).toHaveAttribute(
    "aria-live",
    "off",
  );
  await expect(typed).toHaveAttribute("aria-hidden", "true");
  expect(api).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobilePhrase = await accessible.innerText();
  for (let i = 0; i < mobilePhrase.length + 8; i++) { await page.clock.runFor(100); await typed.innerText(); }
  await expect(typed).toHaveText(mobilePhrase);
  const mobileY = (await page.locator(".ia-composer").boundingBox()).y;
  await page.clock.runFor(14000); await typed.getAttribute("class"); await page.clock.runFor(250); await typed.innerText();
  const followingPhrase = await accessible.innerText();
  expect(followingPhrase).not.toBe(mobilePhrase);
  for (let i = 0; i < followingPhrase.length + 8; i++) { await page.clock.runFor(100); await typed.innerText(); }
  await expect(typed).toHaveText(followingPhrase);
  const mobileShift = Math.abs((await page.locator(".ia-composer").boundingBox()).y - mobileY);
  expect(mobileShift).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${out}/home-mobile.png`, fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const metrics = {
    initial: first,
    next: second,
    composerY: y,
    mobileComposerY: mobileY,
    mobileShift,
    catalog: await page.locator(".ia-greeting-size > span").count(),
    apiCalls: api.length,
  };
  expect(metrics.catalog).toBe(20);
  writeFileSync(
    `${out}/animation.json`,
    JSON.stringify(metrics, null, 2) + "\n",
  );
  await page
    .getByRole("navigation", { name: "Atalhos" })
    .getByRole("link", { name: "Atletas", exact: true })
    .click();
  await page.waitForURL("/atletas");
  await page.clock.runFor(60000);
  await expect(page.locator(".ia-greeting")).toHaveCount(0);
});
test("indicador único para preparação/ferramentas, resposta parcial, erro e cancelamento", async ({
  page,
}) => {
  await mockStream(page);
  await login(page);
  await send(page, "Mensagem de processamento DEMO");
  await expect(page.locator(".ia-processing-dots > span")).toHaveCount(3);
  await emit(page, "status", { phase: "tool" });
  await expect(page.locator(".ia-pending")).toContainText(
    "Consultando informações autorizadas",
  );
  await emit(page, "delta", { text: "Trecho da resposta DEMO" });
  await expect(page.locator(".ia-pending")).toHaveCount(1);
  await page.screenshot({ path: `${out}/processing.png`, fullPage: true });
  await emit(
    page,
    "done",
    { text: "Resposta concluída DEMO", athletes: [] },
    true,
  );
  await expect(page.locator(".ia-pending")).toHaveCount(0);
  await send(page, "Mensagem com falha DEMO");
  await emit(page, "error", { error: "provider" }, true);
  await expect(page.locator(".ia-pending")).toHaveCount(0);
  await send(page, "Mensagem cancelada DEMO");
  await page
    .getByRole("button", { name: "Nova conversa", exact: true })
    .click();
  await expect(page.locator(".ia-pending")).toHaveCount(0);
  await expect(page.locator(".ia-greeting")).toBeVisible();
  expect(
    sql(
      `select count(*) from clinical.conversation_messages m join clinical.conversation_sessions s on s.id=m.session_id where s.professional_id='${owner.id}' and (m.text like '%Preparando resposta%' or m.text like '%Consultando informações autorizadas%')`,
    ),
  ).toBe("0");
});
test("movimento reduzido mostra frase completa estática e pontos sem animação; acessibilidade", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockStream(page);
  await login(page);
  const visible = page.locator(".ia-greeting-reduced");
  await expect(visible).toBeVisible();
  const phrase = await visible.innerText();
  await page.clock.install();
  await page.clock.runFor(60000);
  await expect(visible).toHaveText(phrase);
  await page.clock.resume();
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const a = await page.evaluate(async () => {
    const options = {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
      },
    };
    const r = await axe.run(document.querySelector("main"), options);
    const whole = await axe.run(document, options);
    return {
      violations: r.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
      incomplete: r.incomplete.map((v) => v.id),
      wholePageViolations: whole.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    };
  });
  writeFileSync(`${out}/accessibility.json`, JSON.stringify(a, null, 2) + "\n");
  expect(a.violations).toEqual([]);
  await send(page, "Teste com movimento reduzido DEMO");
  await expect(page.locator(".ia-processing-dots > span").first()).toHaveCSS(
    "animation-name",
    "none",
  );
  await emit(page, "done", { text: "Concluído DEMO", athletes: [] }, true);
  await expect(page.locator(".ia-pending")).toHaveCount(0);
});

test("cancelar durante a abertura não deixa resposta pendente nem troca a sessão nova", async ({
  page,
}) => {
  await mockStream(page);
  await login(page);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let entered;
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  let first = true;
  await page.route("**/api/inteligencia/sessao", async (route) => {
    if (route.request().postDataJSON()?.action === "start" && first) {
      first = false;
      entered();
      await gate;
    }
    await route.continue();
  });
  await page
    .getByLabel("Mensagem", { exact: true })
    .fill("Cancelar abertura DEMO");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await ready;
  await page
    .getByRole("button", { name: "Nova conversa", exact: true })
    .click();
  await expect(page.locator(".ia-pending")).toHaveCount(0);
  release();
  await expect(
    page.getByRole("button", { name: "Nova conversa", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".ia-greeting")).toBeVisible();
  expect(
    sql(
      `select count(*) from clinical.conversation_sessions where professional_id='${owner.id}' and status='active'`,
    ),
  ).toBe("1");
  await send(page, "Mensagem após cancelamento DEMO");
  await emit(
    page,
    "done",
    { text: "Resposta após cancelamento DEMO", athletes: [] },
    true,
  );
  await expect
    .poll(() =>
      sql(
        `select count(*) from clinical.conversation_messages m join clinical.conversation_sessions s on s.id=m.session_id where s.professional_id='${owner.id}' and s.status='active' and m.text='Mensagem após cancelamento DEMO'`,
      ),
    )
    .toBe("1");
});
