import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { expect, mockDictation, request, stubMicrophone, test } from "./fixtures.mjs";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "../scripts/local-supabase.mjs";

const admin = createClient(localSupabase.url, localSupabase.adminKey, { auth: { persistSession: false } });
const users = [];
const athlete = randomUUID();
const handoffAthlete = randomUUID();
const shots = "docs/visual/ditado";

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

test("ditado grava como mensagem de voz, preenche o campo e só envia quando o profissional confirma", async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  await stubMicrophone(page);
  const writer = await user("QA Voz");
  sql(`insert into clinical.athletes(id, full_name, category, source) values('${athlete}', 'Lara Menezes QA', 'Sub-19', 'demo');
    insert into clinical.athlete_access(athlete_id, professional_id, can_read_records, can_edit, can_write, can_finalize)
    values('${athlete}', '${writer.id}', true, false, true, false);`);

  // The transcription route validates session, origin, provider key and audio format on the server.
  const wav = { "content-type": "audio/wav" };
  const anonymous = await request.newContext();
  const unauthenticated = await anonymous.post(`${baseURL}/api/inteligencia/ditado`, { headers: { origin: baseURL, ...wav }, data: Buffer.alloc(64) });
  expect(unauthenticated.status()).toBe(401);
  await anonymous.dispose();
  await signIn(page, writer);
  const foreign = await page.request.post("/api/inteligencia/ditado", { headers: { origin: "https://example.invalid", ...wav }, data: Buffer.alloc(64) });
  expect(foreign.status()).toBe(403);
  const keyless = await page.request.post("http://127.0.0.1:3100/api/inteligencia/ditado", { headers: { origin: "http://127.0.0.1:3100", ...wav }, data: Buffer.alloc(64) });
  expect(keyless.status()).toBe(503);
  expect((await keyless.json()).error).toBe("unavailable");
  const notAudio = await page.request.post("/api/inteligencia/ditado", { headers: { origin: baseURL }, data: { text: "nada" } });
  expect(notAudio.status()).toBe(415);
  const tooShort = await page.request.post("/api/inteligencia/ditado", { headers: { origin: baseURL, ...wav }, data: Buffer.alloc(64) });
  expect(tooShort.status()).toBe(413);
  const malformed = await page.request.post("/api/inteligencia/ditado", { headers: { origin: baseURL, ...wav }, data: Buffer.alloc(32_044) });
  expect(malformed.status()).toBe(400);

  const dictation = await mockDictation(page);
  const agent = await mockAgent(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/?atleta=${athlete}`);
  const composer = page.getByRole("form", { name: "Composição de mensagem" });
  const field = page.getByRole("textbox", { name: "Mensagem", exact: true });
  const record = composer.getByRole("button", { name: "Gravar áudio", exact: true });
  const recording = composer.getByRole("status").filter({ hasText: "Gravando" });
  await expect(record).toBeEnabled();
  // No conversation panel: the toolbar only shows that something is being recorded.
  await expect(page.getByRole("region", { name: "Conversa por voz" })).toHaveCount(0);

  await record.click();
  await expect(recording).toBeVisible();
  await expect(composer.locator(".ia-dictation-time")).toHaveText(/^0:0\d$/);
  await expect(composer.getByRole("button", { name: "Parar gravação", exact: true })).toHaveAttribute("aria-pressed", "true");
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/gravando.png` });
  await composer.getByRole("button", { name: "Descartar gravação", exact: true }).click();

  // Nothing is sent on its own: the transcription lands in the composer for review.
  await dictation.dictate("Atleta relata dor no joelho direito.", { send: false });
  await expect(field).toHaveValue("Atleta relata dor no joelho direito.");
  await expect(field).toBeFocused();
  await page.waitForTimeout(1500);
  expect(agent.calls).toHaveLength(0);
  expect(dictation.requests.every((item) => item.contentType === "audio/wav" && item.bytes > 44)).toBe(true);
  await page.screenshot({ path: `${shots}/transcricao-no-campo.png` });
  await field.fill("Atleta relata dor no joelho esquerdo.");
  await field.press("Enter");
  await expect.poll(() => agent.calls.length).toBe(1);
  expect(agent.calls[0]).toMatchObject({ inputMode: "voice", contextAthleteId: athlete });
  expect(agent.calls[0].messages.at(-1)).toEqual({ role: "user", content: "Atleta relata dor no joelho esquerdo." });

  // A typed message keeps the text origin.
  await field.fill("Pergunta digitada.");
  await field.press("Enter");
  await expect.poll(() => agent.calls.length).toBe(2);
  expect(agent.calls[1].inputMode).toBe("text");

  // A dictation appends to what was already typed.
  await field.fill("Complemento:");
  await dictation.dictate("sem edema.", { send: false });
  await expect(field).toHaveValue("Complemento: sem edema.");
  await field.fill("");

  // Discarding drops the recording without a transcription request and releases the microphone.
  const before = dictation.requests.length;
  await record.click();
  await expect(recording).toBeVisible();
  await composer.getByRole("button", { name: "Descartar gravação", exact: true }).click();
  await expect(record).toHaveAttribute("aria-pressed", "false");
  await page.waitForTimeout(500);
  expect(dictation.requests).toHaveLength(before);
  await expect(field).toHaveValue("");
  expect(await page.evaluate(() => window.testMicrophoneTracks.every((track) => track.readyState === "ended"))).toBe(true);

  // A provider failure keeps the recording so it can be sent again.
  await page.route("**/api/inteligencia/ditado", (route) => route.fulfill({ status: 502, json: { error: "provider", text: "Não foi possível transcrever a gravação agora. Tente novamente." } }), { times: 1 });
  await record.click();
  await expect(recording).toBeVisible();
  await page.waitForTimeout(500);
  await composer.getByRole("button", { name: "Parar gravação", exact: true }).click();
  await expect(composer.getByRole("alert")).toContainText("Não foi possível transcrever a gravação agora.");
  await page.screenshot({ path: `${shots}/falha.png` });
  dictation.next("Retorno ao treino sem dor.");
  await composer.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(composer.getByRole("alert")).toHaveCount(0);
  await expect(field).toHaveValue("Retorno ao treino sem dor.");
  expect(agent.calls).toHaveLength(2);
  expect(await page.evaluate(() => window.testMicrophoneTracks.every((track) => track.readyState === "ended"))).toBe(true);
});

test("transfere o microfone ao 009.1 e retorna para revisar a evolução do mesmo atleta", async ({ page }) => {
  test.setTimeout(45_000);
  await stubMicrophone(page);
  const writer = await user("QA Consulta");
  sql(`insert into clinical.athletes(id, full_name, category, source) values('${handoffAthlete}', 'Lara Menezes QA', 'Sub-19', 'demo');
    insert into clinical.athlete_access(athlete_id, professional_id, can_read_records, can_edit, can_write, can_finalize)
    values('${handoffAthlete}', '${writer.id}', true, false, true, false);`);
  await signIn(page, writer);
  const dictation = await mockDictation(page);
  const agent = await mockAgent(page);
  await page.goto(`/?atleta=${handoffAthlete}`);
  const composer = page.getByRole("form", { name: "Composição de mensagem" });
  const client = createClient(localSupabase.url, localSupabase.publishableKey, { auth: { persistSession: false } });
  const signed = await client.auth.signInWithPassword({ email: writer.email, password: writer.password });
  expect(signed.error).toBeNull();
  expect((await client.rpc("chat_consultation_navigation", { target: handoffAthlete, review: false })).data).toEqual({ available: true });
  expect((await client.rpc("chat_consultation_navigation", { target: randomUUID(), review: false })).data).toBeNull();
  expect((await client.rpc("chat_consultation_navigation", { target: handoffAthlete, review: true })).data).toBeNull();
  const capturePath = `/atletas/${handoffAthlete}/evolucao?modo=voz`;
  agent.replies.push({
    text: "Abra a experiência de evolução pelo link abaixo.",
    navigation: { id: handoffAthlete, name: "Lara Menezes QA", href: capturePath },
  });
  await dictation.dictate("Quero gravar a consulta e gerar a evolução depois.");
  await expect.poll(() => agent.calls.length).toBe(1);
  expect(agent.calls[0].inputMode).toBe("voice");
  await page.getByRole("region", { name: "Histórico da conversa" })
    .getByRole("link", { name: "Registrar evolução por voz" }).click();
  await page.waitForURL(`**${capturePath}`);
  expect(await page.evaluate(() => window.testMicrophoneTracks.map((track) => track.readyState))).toEqual(["ended"]);
  await expect(page.getByRole("button", { name: "Iniciar gravação" })).toBeDisabled();
  await page.getByRole("link", { name: "Voltar ao CBB Intelligence" }).click();
  await expect(page.getByRole("region", { name: "Histórico da conversa" })
    .getByText("Quero gravar a consulta e gerar a evolução depois.", { exact: true })).toBeVisible();

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

test("ditado funciona no celular e libera o microfone ao sair da tela", async ({ page }) => {
  test.setTimeout(60_000);
  await stubMicrophone(page);
  const account = await user("QA Voz Celular");
  await signIn(page, account);
  const dictation = await mockDictation(page);
  const agent = await mockAgent(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await dictation.dictate("Abra a Lara Menezes.");
  await expect.poll(() => agent.calls.length).toBe(1);
  expect(agent.calls[0].inputMode).toBe("voice");
  await expect(page.getByText("Resposta 1.")).toBeVisible();

  const composer = page.getByRole("form", { name: "Composição de mensagem" });
  await composer.getByRole("button", { name: "Gravar áudio", exact: true }).click();
  await expect(composer.getByRole("status").filter({ hasText: "Gravando" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/celular.png` });
  const before = dictation.requests.length;
  await page.goto("/atletas");
  expect(dictation.requests).toHaveLength(before);
});
