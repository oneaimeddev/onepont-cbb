import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "../scripts/local-supabase.mjs";

const admin = createClient(localSupabase.url, localSupabase.adminKey, { auth: { persistSession: false } });
const users = [];
const jose = randomUUID();
const almeida = randomUUID();
const heitor = randomUUID();
const hidden = randomUUID();
const shots = "docs/visual/handoff-007-5-1c";

function sql(input) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_prontuario-cbb", "psql", "-X", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8" }).trim();
}

test.afterAll(async () => {
  const ids = [jose, almeida, heitor, hidden].map((id) => `'${id}'`).join(",");
  const people = users.map((id) => `'${id}'`).join(",");
  sql(`delete from clinical.sport_links where athlete_id in (${ids});
    delete from clinical.athlete_access where athlete_id in (${ids});
    ${people ? `delete from clinical.conversation_messages where session_id in (select id from clinical.conversation_sessions where professional_id in (${people}));
    delete from clinical.conversation_sessions where professional_id in (${people});
    delete from clinical.audit_events where actor_user_id in (${people}) or athlete_id in (${ids});` : ""}
    delete from clinical.athletes where id in (${ids});`);
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

test("a conversa envia a lista atual e uma conversa nova não reaproveita esses atletas", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `voz-resolucao-${randomUUID()}@example.com`;
  const password = randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const professional = created.data.user.id;
  users.push(professional);
  const profile = await admin.from("profiles").insert({ id: professional, display_name: "QA Voz Resolucao", profession: "Fisioterapia", can_read_audit: false });
  if (profile.error) throw profile.error;
  sql(`insert into clinical.sport_options(category, modality, division, season) values
      ('Sub-19', '5x5', 'Masculino', 2026)
    on conflict (category, modality, division, season) do nothing;
    insert into clinical.athletes(id, full_name, category, team, source) values
      ('${jose}', 'José Álvares', 'Sub-19', 'Franca', 'demo'),
      ('${almeida}', 'Heitor Almeida', 'Sub-19', 'Flamengo', 'demo'),
      ('${heitor}', 'Heitor Ibrahim Zanetti', 'Sub-19', 'Flamengo', 'demo'),
      ('${hidden}', 'Heitor Oculto', 'Sub-19', 'Flamengo', 'demo');
    insert into clinical.athlete_access(athlete_id, professional_id, can_read_records, can_write, can_finalize) values
      ('${jose}', '${professional}', true, false, false),
      ('${almeida}', '${professional}', true, false, false),
      ('${heitor}', '${professional}', true, false, false);
    insert into clinical.sport_links(athlete_id, option_id, club, starts_on)
    select v.id::uuid, o.id, v.club, date '2026-01-01'
    from (values ('${jose}', 'Franca'), ('${almeida}', 'Flamengo'), ('${heitor}', 'Flamengo')) as v(id, club)
    join clinical.sport_options o
      on o.category = 'Sub-19' and o.modality = '5x5' and o.division = 'Masculino' and o.season = 2026;`);

  const bodies = [];
  await page.route("**/api/inteligencia", async (route) => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    const last = body.messages.at(-1).content;
    const payload = last === "Coloca o terceiro em contexto."
      ? { text: "Heitor Ibrahim Zanetti está em contexto.", athletes: [], navigation: null, search: null, draft: null, document: null, context: { id: heitor, name: "Heitor Ibrahim Zanetti" }, contextCleared: false }
      : { text: "Resposta fictícia.", athletes: [], navigation: null, search: null, draft: null, document: null, context: null, contextCleared: false };
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream; charset=utf-8" },
      body: `event: done\ndata: ${JSON.stringify(payload)}\n\n`,
    });
  });

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/?atleta=${jose}`);
  await expect(page.getByRole("heading", { name: "José Álvares" })).toBeVisible();
  await page.evaluate(({ joseId, almeidaId, heitorId }) => {
    sessionStorage.setItem("cbb-intelligence-turns:v1", JSON.stringify({
      v: 1,
      turns: [{
        id: "lista",
        role: "assistant",
        text: "Encontrei 3 atletas autorizados.",
        athletes: [
          { id: joseId, name: "José Álvares", facts: ["Sub-19"], category: "Sub-19", division: "Masculino", club: "Franca" },
          { id: almeidaId, name: "Heitor Almeida", facts: ["Sub-19"], category: "Sub-19", division: "Masculino", club: "Flamengo" },
          { id: heitorId, name: "Heitor Ibrahim Zanetti", facts: ["Sub-19"], category: "Sub-19", division: "Masculino", club: "Flamengo" },
        ],
        navigation: null,
        search: { total: 3, page: 1, pageSize: 5, filters: {} },
        draft: null,
        document: null,
      }],
    }));
    window.dispatchEvent(new Event("cbb-intelligence-adopt"));
  }, { joseId: jose, almeidaId: almeida, heitorId: heitor });
  await expect(page.locator(".ia-card").filter({ hasText: "José Álvares" }).getByRole("button", { name: "Em contexto", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Colocar em contexto", exact: true })).toHaveCount(2);

  const field = page.getByRole("textbox", { name: "Mensagem", exact: true });
  await field.fill("Coloca o terceiro em contexto.");
  await field.press("Enter");
  await expect(page.getByRole("heading", { name: "Heitor Ibrahim Zanetti" })).toBeVisible();
  await expect(page.locator(".ia-card").filter({ hasText: "Heitor Ibrahim Zanetti" }).getByRole("button", { name: "Em contexto", exact: true })).toBeVisible();
  expect(bodies[0].roster).toEqual([jose, almeida, heitor]);
  expect(bodies[0].contextAthleteId).toBe(jose);
  expect(bodies[0].roster).not.toContain(hidden);
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/terceiro.png` });

  await field.fill("Mostre as informações.");
  await field.press("Enter");
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1].contextAthleteId).toBe(heitor);
  expect(bodies[1].roster).toEqual([jose, almeida, heitor]);
  expect(bodies[1].inputMode).toBe("text");

  await page.getByRole("button", { name: "Nova conversa" }).click();
  await expect(page.getByRole("heading", { name: "Heitor Ibrahim Zanetti" })).toHaveCount(0);
  await field.fill("Liste os atletas.");
  await field.press("Enter");
  await expect.poll(() => bodies.length).toBe(3);
  expect(bodies[2].roster).toEqual([]);
  expect(bodies[2].contextAthleteId).toBeNull();
  expect(JSON.stringify(bodies[2])).not.toContain(heitor);
});
