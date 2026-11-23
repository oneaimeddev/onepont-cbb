import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { expect, mockDictation, test } from "./fixtures.mjs";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "../scripts/local-supabase.mjs";

// Runs in the voice project, where the assistant is enabled; provider calls are mocked.
const admin = createClient(localSupabase.url, localSupabase.adminKey, { auth: { persistSession: false } });
const users = [];
const athlete = randomUUID();
const transcript = "Profissional: Bom dia, Lara. O que aconteceu? Atleta: Torci o tornozelo direito no treino de ontem, caí de um rebote e o pé virou para dentro. Profissional: Consegue apoiar? Atleta: Com dor, sim. Não tive dor à noite. Profissional: Há edema leve na região lateral e dor à palpação do ligamento talofibular anterior; gaveta anterior negativa. Vamos fazer gelo e bandagem funcional e reavaliar em 7 dias.";

function sql(input) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_prontuario-cbb", "psql", "-X", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8" }).trim();
}

test.afterAll(async () => {
  const ids = users.map((id) => `'${id}'`).join(",");
  sql(`delete from clinical.draft_proposals where athlete_id = '${athlete}';
    ${ids ? `delete from clinical.conversation_messages where session_id in (select id from clinical.conversation_sessions where professional_id in (${ids}));
    delete from clinical.conversation_sessions where professional_id in (${ids});
    delete from clinical.audit_events where actor_user_id in (${ids}) or athlete_id = '${athlete}';` : ""}
    delete from clinical.athletes where id = '${athlete}';`);
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

test("transcrição de consulta oferece relatório detalhado ou sintético antes de qualquer texto", async ({ page }) => {
  test.setTimeout(60_000);
  const email = `relatorio-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  const profile = await admin.from("profiles").insert({ id: data.user.id, display_name: "QA Relatório", profession: "Medicina", can_manage_access: false, can_read_audit: false });
  if (profile.error) throw profile.error;
  sql(`insert into clinical.athletes(id, full_name, category, source) values('${athlete}', 'Lara Menezes QA', 'Sub-19', 'demo');
    insert into clinical.athlete_access(athlete_id, professional_id, can_read_records, can_edit, can_write, can_finalize)
    values('${athlete}', '${data.user.id}', true, false, true, false);`);

  const calls = [];
  await page.route("**/api/inteligencia", async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    const draft = {
      state: "choose", requestId: randomUUID(), athleteId: athlete, athleteName: "Lara Menezes QA", professionalName: "QA Relatório",
      occurredOn: null, title: "Relatório da consulta", body: body.messages.at(-1).content, missing: [], restricted: true,
      recordId: null, error: null, contentHash: null, version: null,
    };
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream; charset=utf-8" },
      body: `event: done\ndata: ${JSON.stringify({ text: "Recebi a transcrição da consulta de Lara Menezes QA. Escolha no cartão o modo do relatório: detalhado ou sintético.", athletes: [], navigation: null, search: null, draft, document: null, context: null, contextCleared: false })}\n\n`,
    });
  });
  const dictation = await mockDictation(page);
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
  await page.goto(`/?atleta=${athlete}`);

  // A dictated consultation longer than the former 2000-character limit is accepted.
  const long = `${transcript} ${transcript} ${transcript} ${transcript} ${transcript}`;
  expect(long.length).toBeGreaterThan(2000);
  await dictation.dictate(long);
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0].inputMode).toBe("voice");
  expect(calls[0].messages.at(-1).content).toBe(long);

  const card = page.getByRole("region", { name: "Relatório da consulta" });
  await expect(card).toBeVisible();
  await expect(card.getByText("Escolha o modo do relatório")).toBeVisible();
  const modes = card.getByRole("group", { name: "Modo do relatório" });
  await expect(modes.getByRole("button", { name: /Relatório detalhado/ })).toBeEnabled();
  await expect(modes.getByRole("button", { name: /Relatório sintético/ })).toBeEnabled();
  await expect(card.getByText(/Transcrição recebida/)).toBeVisible();
  // Nothing was generated or stored before the choice.
  expect(sql(`select count(*) from clinical.draft_proposals where athlete_id = '${athlete}'`)).toBe("0");
  expect(sql(`select count(*) from clinical.records where athlete_id = '${athlete}'`)).toBe("0");

  await card.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(page.getByText("A transcrição foi descartada. Nenhum relatório foi gerado.")).toBeVisible();
  expect(sql(`select count(*) from clinical.records where athlete_id = '${athlete}'`)).toBe("0");
});
