import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { expect, request, stubMicrophone, test } from "./fixtures.mjs";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "../scripts/local-supabase.mjs";

const admin = createClient(localSupabase.url, localSupabase.adminKey, { auth: { persistSession: false } });
const users = [];
const athlete = randomUUID();
const handoffAthlete = randomUUID();
const shots = "docs/visual/handoff-007-5-1";
const socketUrl = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";

function sql(input) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_prontuario-cbb", "psql", "-X", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8" }).trim();
}

async function user(name) {
  const email = `voz-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  const profile = await admin.from("profiles").insert({ id: data.user.id, display_name: name, profession: "Fisioterapia", can_read_audit: false });
  if (profile.error) throw profile.error;
  return { id: data.user.id, email, password };
}

async function signIn(page, account) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(account.email);
  await page.getByLabel("Senha", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
}

async function mockVoice(page, { holdSetup = false } = {}) {
  const live = { sockets: [], frames: 0, early: 0, ends: 0, closed: 0, hold: holdSetup, tokens: 0 };
  await page.route("**/api/inteligencia/voz", async (route) => {
    live.tokens += 1;
    await route.fulfill({ json: { token: `auth_tokens/offline-${live.tokens}`, url: socketUrl, expiresAt: new Date(Date.now() + 600_000).toISOString() } });
  });
  await page.routeWebSocket(/generativelanguage\.googleapis\.com/, (ws) => {
    const entry = { ws, ready: false, url: ws.url() };
    live.sockets.push(entry);
    ws.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      if (message.setup && !live.hold) {
        entry.ready = true;
        ws.send(JSON.stringify({ setupComplete: {} }));
      }
      if (message.realtimeInput?.audio) {
        live.frames += 1;
        if (!entry.ready) live.early += 1;
      }
      if (message.realtimeInput?.audioStreamEnd) live.ends += 1;
    });
    ws.onClose(() => { live.closed += 1; });
  });
  const current = () => live.sockets.at(-1);
  return {
    live,
    release() {
      live.hold = false;
      current().ready = true;
      current().ws.send(JSON.stringify({ setupComplete: {} }));
    },
    interim(text) {
      current().ws.send(JSON.stringify({ serverContent: { interimInputTranscription: { text } } }));
    },
    final(text) {
      current().ws.send(JSON.stringify({ serverContent: { inputTranscription: { text } } }));
    },
    say(text) {
      current().ws.send(JSON.stringify({ serverContent: { interimInputTranscription: { text: text.slice(0, 14) } } }));
      current().ws.send(JSON.stringify({ serverContent: { inputTranscription: { text } } }));
    },
    send(message) {
      current().ws.send(JSON.stringify(message));
    },
    close() {
      current().ws.close();
    },
  };
}

async function mockAgent(page) {
  const calls = [];
  const replies = [];
  await page.route("**/api/inteligencia", async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    const reply = replies.shift() ?? { text: `Resposta ${calls.length}.` };
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream; charset=utf-8" },
      body: `event: done\ndata: ${JSON.stringify({ athletes: [], navigation: null, search: null, draft: null, ...reply })}\n\n`,
    });
  });
  return { calls, replies };
}

test.afterAll(async () => {
  const ids = users.map((id) => `'${id}'`).join(",");
  if (ids) sql(`delete from clinical.consultation_sessions where athlete_id in ('${athlete}', '${handoffAthlete}');
    delete from clinical.conversation_messages where session_id in (select id from clinical.conversation_sessions where professional_id in (${ids}));
    delete from clinical.conversation_sessions where professional_id in (${ids});
    delete from clinical.audit_events where actor_user_id in (${ids}) or athlete_id in ('${athlete}', '${handoffAthlete}');
    delete from clinical.athletes where id in ('${athlete}', '${handoffAthlete}');`);
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

test("conversa por voz com turnos automáticos, controles, rascunho e recuperação", async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  const writer = await user("QA Voz");
  sql(`insert into clinical.athletes(id, full_name, category, source) values('${athlete}', 'Lara Menezes QA', 'Sub-19', 'demo');
    insert into clinical.athlete_access(athlete_id, professional_id, can_read_records, can_edit, can_write, can_finalize)
    values('${athlete}', '${writer.id}', true, false, true, false);`);

  const anonymous = await request.newContext();
  const unauthenticated = await anonymous.post(`${baseURL}/api/inteligencia/voz`, { headers: { origin: baseURL } });
  expect(unauthenticated.status()).toBe(401);
  expect(JSON.stringify(await unauthenticated.json())).not.toContain("auth_tokens");
  await anonymous.dispose();

  await signIn(page, writer);
  const foreign = await page.request.post("/api/inteligencia/voz", { headers: { origin: "https://example.invalid" } });
  expect(foreign.status()).toBe(403);
  const keyless = await page.request.post("http://127.0.0.1:3100/api/inteligencia/voz", { headers: { origin: "http://127.0.0.1:3100" } });
  expect(keyless.status()).toBe(503);
  expect((await keyless.json()).error).toBe("unavailable");

  const voice = await mockVoice(page, { holdSetup: true });
  const agent = await mockAgent(page);
  page.on("dialog", (dialog) => dialog.accept());
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/?atleta=${athlete}`);
  const composer = page.getByRole("form", { name: "Composição de mensagem" });
  const field = page.getByRole("textbox", { name: "Mensagem", exact: true });
  const panel = page.getByRole("region", { name: "Conversa por voz" });
  const state = panel.getByRole("status");
  const toggle = composer.getByRole("button", { name: "Iniciar conversa por voz" });
  await expect(toggle).toBeEnabled();
  expect(voice.live.tokens).toBe(0);

  await toggle.click();
  await expect(state).toContainText("Conectando a voz…");
  await expect(state).not.toContainText("Ouvindo");
  await expect.poll(() => voice.live.sockets.length).toBe(1);
  expect(voice.live.sockets[0].url).toContain("access_token=auth_tokens%2Foffline-1");
  expect(voice.live.sockets[0].url).not.toContain("key=");
  await page.waitForTimeout(400);
  expect(voice.live.frames).toBe(0);
  voice.release();
  await expect(state).toContainText("Ouvindo");
  await expect(state).toContainText("Microfone ativo");
  await expect(composer.getByRole("button", { name: "Encerrar conversa por voz" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => voice.live.frames).toBeGreaterThan(2);
  expect(voice.live.early).toBe(0);
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/ouvindo.png` });

  voice.interim("Quais foram as últimas");
  await expect(state).toContainText("Transcrevendo");
  await expect(panel.getByText("Quais foram as últimas")).toBeVisible();
  await page.screenshot({ path: `${shots}/transcrevendo.png` });
  voice.final("Quais foram as últimas evoluções dela?");
  await expect.poll(() => agent.calls.length).toBe(1);
  expect(agent.calls[0]).toMatchObject({ inputMode: "voice", contextAthleteId: athlete });
  expect(agent.calls[0].messages.at(-1)).toEqual({ role: "user", content: "Quais foram as últimas evoluções dela?" });
  await expect(page.locator(".ia-user-text").last()).toHaveText("Quais foram as últimas evoluções dela?");
  await expect(page.getByText("Resposta 1.")).toBeVisible();

  const spoken = [
    "E nos últimos seis meses?",
    "Agora veja a fisioterapia.",
    "E o que mudou depois da entorse de tornozelo direito?",
    "Ela nega dor noturna e não teve edema.",
    "Usou dipirona 500 mg de 8 em 8 horas por 3 dias.",
    "O teste de gaveta anterior foi negativo no joelho esquerdo.",
    "O atendimento foi em 10 de novembro de 2026.",
    "Quem acompanhou o retorno ao jogo?",
    "Houve afastamento?",
  ];
  for (const [index, text] of spoken.entries()) {
    voice.say(text);
    await expect.poll(() => agent.calls.length).toBe(index + 2);
    expect(agent.calls.at(-1).messages.at(-1).content).toBe(text);
    await expect(page.getByText(`Resposta ${index + 2}.`)).toBeVisible();
  }
  expect(agent.calls.every((call) => call.inputMode === "voice")).toBe(true);
  expect(agent.calls[1].messages.map((message) => message.content)).toEqual(["Quais foram as últimas evoluções dela?", "Resposta 1.", "E nos últimos seis meses?"]);
  await expect(page.locator(".ia-turn-user")).toHaveCount(10);

  voice.final("Atleta relata melhora da dorsiflexão.");
  await page.waitForTimeout(1200);
  voice.send({ voiceActivity: { type: "ACTIVITY_START" } });
  await page.waitForTimeout(900);
  voice.interim("mantém bandagem");
  voice.final("Mantém bandagem funcional e crioterapia após o treino.");
  await expect.poll(() => agent.calls.length).toBe(11);
  expect(agent.calls.at(-1).messages.at(-1).content).toBe("Atleta relata melhora da dorsiflexão. Mantém bandagem funcional e crioterapia após o treino.");

  voice.final("Houve afastamento?");
  await expect.poll(() => agent.calls.length).toBe(12);
  voice.final("hum");
  voice.final("   ");
  voice.final("Houve afastamento?");
  await page.waitForTimeout(2000);
  expect(agent.calls).toHaveLength(12);
  expect(agent.calls.at(-1).messages.at(-1).content).toBe("Houve afastamento?");

  await field.fill("Pergunta digitada no meio da conversa.");
  await field.press("Enter");
  await expect.poll(() => agent.calls.length).toBe(13);
  expect(agent.calls.at(-1)).toMatchObject({ inputMode: "text" });
  await expect(state).toContainText("Ouvindo");

  const muteButton = panel.getByRole("button", { name: "Pausar" });
  await muteButton.click();
  await expect(state).toContainText("Microfone silenciado");
  await expect(state).not.toContainText("Ouvindo");
  expect(voice.live.ends).toBeGreaterThan(0);
  const frozen = voice.live.frames;
  await page.waitForTimeout(600);
  expect(voice.live.frames).toBe(frozen);
  await page.screenshot({ path: `${shots}/silenciado.png` });
  await panel.getByRole("button", { name: "Retomar" }).click();
  await expect(state).toContainText("Ouvindo");
  await expect.poll(() => voice.live.frames).toBeGreaterThan(frozen);

  await panel.getByRole("checkbox", { name: "Revisar antes de enviar" }).check();
  voice.say("Relato longo para revisar antes do envio.");
  await expect(field).toHaveValue("Relato longo para revisar antes do envio.");
  await page.waitForTimeout(1500);
  expect(agent.calls).toHaveLength(13);
  await panel.getByRole("checkbox", { name: "Revisar antes de enviar" }).uncheck();
  await field.fill("");

  voice.final("Dor no joelho direito.");
  await panel.getByRole("button", { name: "Corrigir" }).click();
  await expect(field).toHaveValue("Dor no joelho direito.");
  expect(agent.calls).toHaveLength(13);
  await field.fill("Dor no joelho esquerdo.");
  await field.press("Enter");
  await expect.poll(() => agent.calls.length).toBe(14);
  expect(agent.calls.at(-1)).toMatchObject({
    inputMode: "voice",
    contextAthleteId: athlete,
  });
  expect(agent.calls.at(-1).messages.at(-1).content).toBe("Dor no joelho esquerdo.");
  await panel.getByRole("button", { name: "Retomar" }).click();

  const requestId = randomUUID();
  agent.replies.push({
    text: "Organizei uma proposta de evolução para revisão. Ela ainda não foi salva.",
    draft: {
      state: "proposal",
      requestId,
      athleteId: athlete,
      athleteName: "Lara Menezes QA",
      professionalName: "QA Voz",
      occurredOn: "2026-11-10",
      title: "Evolução fictícia por voz",
      body: "Relato fictício. Entorse de tornozelo direito. Nega dor noturna.",
      missing: [],
      restricted: true,
      recordId: null,
      error: null,
    },
  });
  voice.say("Faça uma evolução com essas informações.");
  const card = page.getByRole("region", { name: "Proposta de evolução" });
  await expect(card.getByText("Proposta ainda não salva")).toBeVisible();
  await page.screenshot({ path: `${shots}/rascunho-por-voz.png` });
  agent.replies.push({ text: "A gravação depende da sua confirmação no cartão." });
  voice.say("Pode salvar isso.");
  await expect.poll(() => agent.calls.length).toBe(16);
  await expect(page.getByText("A gravação depende da sua confirmação no cartão.")).toBeVisible();
  await expect(card.getByText("Proposta ainda não salva")).toBeVisible();
  expect(sql(`select count(*) from clinical.records where athlete_id = '${athlete}'`)).toBe("0");
  expect(sql(`select count(*) from clinical.evolution_approvals where athlete_id = '${athlete}'`)).toBe("0");

  voice.send({ goAway: { timeLeft: "5s" } });
  await expect.poll(() => voice.live.sockets.length).toBe(2);
  await expect(state).toContainText("Ouvindo");
  expect(voice.live.tokens).toBe(2);

  voice.final("Texto pendente antes da queda.");
  voice.close();
  const ended = page.getByRole("region", { name: "Conversa por voz" });
  await expect(state).toContainText("Reconectando");
  await expect(field).toHaveValue("Texto pendente antes da queda.");
  await expect(state).toContainText("Ouvindo");
  expect(agent.calls).toHaveLength(16);
  expect(voice.live.sockets).toHaveLength(3);
  await field.fill("");

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(state).toContainText("Microfone silenciado");
  await page.evaluate(() => {
    delete document.visibilityState;
  });
  await panel.getByRole("button", { name: "Retomar" }).click();
  await expect(state).toContainText("Ouvindo");

  await page.bringToFront();
  const closedBefore = voice.live.closed;
  await context.clearPermissions();
  await expect(ended.getByRole("alert")).toContainText("O acesso ao microfone foi interrompido");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => voice.live.closed).toBeGreaterThan(closedBefore);
  await expect(page.getByText("Resposta 13.")).toBeVisible();
});

test("transfere o microfone ao 009.1 e retorna para revisar a evolução do mesmo atleta", async ({ page }) => {
  test.setTimeout(45_000);
  await stubMicrophone(page);
  const writer = await user("QA Consulta");
  sql(`insert into clinical.athletes(id, full_name, category, source) values('${handoffAthlete}', 'Lara Menezes QA', 'Sub-19', 'demo');
    insert into clinical.athlete_access(athlete_id, professional_id, can_read_records, can_edit, can_write, can_finalize)
    values('${handoffAthlete}', '${writer.id}', true, false, true, false);`);
  await signIn(page, writer);
  const voice = await mockVoice(page);
  const agent = await mockAgent(page);
  await page.goto(`/?atleta=${handoffAthlete}`);
  const composer = page.getByRole("form", { name: "Composição de mensagem" });
  const ended = page.getByRole("region", { name: "Conversa por voz" });
  const state = ended.getByRole("status");
  await composer.getByRole("button", { name: "Iniciar conversa por voz" }).click();
  await expect(state).toContainText("Ouvindo");
  const client = createClient(localSupabase.url, localSupabase.publishableKey, { auth: { persistSession: false } });
  const signed = await client.auth.signInWithPassword({ email: writer.email, password: writer.password });
  expect(signed.error).toBeNull();
  expect((await client.rpc("chat_consultation_navigation", { target: handoffAthlete, review: false })).data).toEqual({ available: true });
  expect((await client.rpc("chat_consultation_navigation", { target: randomUUID(), review: false })).data).toBeNull();
  expect((await client.rpc("chat_consultation_navigation", { target: handoffAthlete, review: true })).data).toBeNull();
  const beforeHandoff = voice.live.closed;
  const capturePath = `/atletas/${handoffAthlete}/evolucao?modo=voz`;
  agent.replies.push({
    text: "Abra a experiência de evolução pelo link abaixo.",
    navigation: { id: handoffAthlete, name: "Lara Menezes QA", href: capturePath },
  });
  voice.say("Quero gravar a consulta e gerar a evolução depois.");
  await page.getByRole("region", { name: "Histórico da conversa" })
    .getByRole("link", { name: "Registrar evolução por voz" }).click();
  await page.waitForURL(`**${capturePath}`);
  await expect.poll(() => voice.live.closed).toBeGreaterThan(beforeHandoff);
  expect(await page.evaluate(() => window.testMicrophoneTracks.map((track) => track.readyState))).toEqual(["ended"]);
  await expect(page.getByRole("button", { name: "Iniciar gravação" })).toBeDisabled();
  await page.getByRole("link", { name: "Voltar ao CBB Intelligence" }).click();
  await expect(page.getByRole("region", { name: "Histórico da conversa" })
    .getByText("Quero gravar a consulta e gerar a evolução depois.", { exact: true })).toBeVisible();
  await expect(ended).toHaveCount(0);

  const consultation = randomUUID();
  sql(`insert into clinical.consultation_sessions
    (id, athlete_id, professional_id, specialty, authorization_basis, capture_state, processing_state, transcript, generated_body)
    values ('${consultation}', '${handoffAthlete}', '${writer.id}', 'Fisioterapia', 'staged_fictional_v1', 'complete', 'ready',
    'Relato fictício de desconforto no joelho esquerdo.', 'Evolução fictícia para revisão.');`);
  const latest = await client.rpc("chat_consultation_navigation", { target: handoffAthlete, review: true });
  expect(latest.data).toEqual({ captureId: consultation, recordId: null });
  const reviewPath = `${capturePath}&consulta=${consultation}`;
  agent.replies.push({
    text: "Confira a evolução gerada.",
    navigation: { id: handoffAthlete, name: "Lara Menezes QA", href: reviewPath },
  });
  const field = composer.getByRole("textbox", { name: "Mensagem", exact: true });
  await field.fill("Agora quero revisar o relatório que acabamos de gerar.");
  await field.press("Enter");
  await page.getByRole("link", { name: "Abrir revisão da evolução" }).click();
  await page.waitForURL(`**${reviewPath}`);
  await expect(page.getByRole("heading", { name: "Revisar evolução por voz" })).toBeVisible();
  await expect(page.getByLabel("Conteúdo", { exact: true })).toHaveValue("Evolução fictícia para revisão.");
  expect(sql(`select count(*) from clinical.records where athlete_id = '${handoffAthlete}'`)).toBe("0");
  await page.getByRole("link", { name: "Voltar ao CBB Intelligence" }).click();
  await expect(page.getByRole("region", { name: "Histórico da conversa" })
    .getByText("Agora quero revisar o relatório que acabamos de gerar.", { exact: true })).toBeVisible();
});

test("voz encerra por inatividade, ao sair da tela e funciona no celular", async ({ page }) => {
  test.setTimeout(60_000);
  const account = await user("QA Voz Celular");
  await page.clock.install();
  await signIn(page, account);
  const voice = await mockVoice(page);
  const agent = await mockAgent(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const composer = page.getByRole("form", { name: "Composição de mensagem" });
  await composer.getByRole("button", { name: "Iniciar conversa por voz" }).click();
  const panel = page.getByRole("region", { name: "Conversa por voz" });
  await expect(panel.getByRole("status")).toContainText("Ouvindo");
  voice.say("Abra a Lara Menezes.");
  await page.clock.runFor(2_000);
  await expect.poll(() => agent.calls.length).toBe(1);
  await expect(page.getByText("Resposta 1.")).toBeVisible();
  await page.screenshot({ path: `${shots}/celular.png` });

  await page.clock.fastForward(106_000);
  await page.clock.runFor(1_100);
  await expect(panel.getByRole("alert")).toContainText("Sem atividade");
  await page.screenshot({ path: `${shots}/aviso-inatividade.png` });
  await page.clock.fastForward(15_000);
  await page.clock.runFor(1_100);
  await expect(panel.getByRole("status")).toContainText("A conversa por voz foi encerrada após 2 minutos sem atividade.");
  await expect(composer.getByRole("button", { name: "Iniciar conversa por voz" })).toHaveAttribute("aria-pressed", "false");
  expect(voice.live.closed).toBe(1);

  await composer.getByRole("button", { name: "Iniciar conversa por voz" }).click();
  await expect(panel.getByRole("status")).toContainText("Ouvindo");
  await page.goto("/atletas");
  await expect.poll(() => voice.live.closed).toBeGreaterThan(1);
  expect(voice.live.sockets).toHaveLength(2);
});
