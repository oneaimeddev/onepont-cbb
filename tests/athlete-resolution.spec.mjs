import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "../scripts/local-supabase.mjs";

const opts = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(localSupabase.url, localSupabase.adminKey, opts);
const accounts = [];
const heitor = randomUUID();
const almeida = randomUUID();
const jose = randomUUID();
const beatriz = randomUUID();
const hidden = randomUUID();
const extras = Array.from({ length: 6 }, () => randomUUID());
const ids = [heitor, almeida, jose, beatriz, hidden, ...extras];
const secret = "SEGREDO-HEITOR-00751C";
const shots = "docs/visual/handoff-007-5-1c";

function sql(statement) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_prontuario-cbb",
    "psql", "-X", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], {
    input: statement, encoding: "utf8",
  });
}

test.afterAll(async () => {
  const list = ids.map((id) => `'${id}'`).join(",");
  const people = accounts.map((id) => `'${id}'`).join(",");
  sql(`delete from clinical.sport_links where athlete_id in (${list});
    delete from clinical.athlete_access where athlete_id in (${list});
    ${people ? `delete from clinical.conversation_messages where session_id in (select id from clinical.conversation_sessions where professional_id in (${people}));
    delete from clinical.conversation_sessions where professional_id in (${people});
    delete from clinical.audit_events where actor_user_id in (${people}) or athlete_id in (${list});` : `delete from clinical.audit_events where athlete_id in (${list});`}
    delete from clinical.athletes where id in (${list});`);
  for (const id of accounts) await admin.auth.admin.deleteUser(id);
});

test("nome incompleto, clube e lista da conversa resolvem sem ampliar o acesso", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `resolucao-${randomUUID()}@example.com`;
  const password = randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const professional = created.data.user.id;
  accounts.push(professional);
  const otherEmail = `resolucao-outro-${randomUUID()}@example.com`;
  const otherPassword = randomUUID();
  const other = await admin.auth.admin.createUser({ email: otherEmail, password: otherPassword, email_confirm: true });
  if (other.error) throw other.error;
  accounts.push(other.data.user.id);
  const profile = await admin.from("profiles").insert([
    { id: professional, display_name: "QA Resolucao", profession: "Medicina esportiva", can_read_audit: false },
    { id: other.data.user.id, display_name: "QA Sem acesso", profession: "Fisioterapia", can_read_audit: false },
  ]);
  if (profile.error) throw profile.error;
  sql(`
    insert into clinical.sport_options(category, modality, division, season) values
      ('Sub-19', '5x5', 'Masculino', 2026),
      ('Sub-19', '5x5', 'Feminino', 2026)
    on conflict (category, modality, division, season) do nothing;
    insert into clinical.athletes(id, full_name, category, team, source) values
      ('${heitor}', 'Heitor Ibrahim Zanetti', 'Sub-19', 'Flamengo', 'demo'),
      ('${almeida}', 'Heitor Almeida', 'Sub-19', 'Flamengo', 'demo'),
      ('${jose}', 'José Álvares', 'Sub-19', 'Franca', 'demo'),
      ('${beatriz}', 'Beatriz Campos', 'Sub-19', 'Franca', 'demo'),
      ('${hidden}', 'Heitor Secreto Zanetti ${secret}', 'Sub-19', 'Flamengo', 'demo'),
      ${extras.map((id, index) => `('${id}', 'AAA Resolucao ${index + 1}', 'Sub-19', 'Flamengo', 'demo')`).join(",\n      ")};
    insert into clinical.athlete_access(athlete_id, professional_id, can_read_records, can_write, can_finalize) values
      ('${heitor}', '${professional}', true, false, false),
      ('${almeida}', '${professional}', true, false, false),
      ('${jose}', '${professional}', true, false, false),
      ('${beatriz}', '${professional}', true, false, false),
      ${extras.map((id) => `('${id}', '${professional}', true, false, false)`).join(",\n      ")};
    insert into clinical.sport_links(athlete_id, option_id, club, starts_on)
    select v.id::uuid, o.id, v.club, date '2026-01-01'
    from (values
      ('${heitor}', 'Flamengo', 'Masculino'),
      ('${almeida}', 'Flamengo', 'Masculino'),
      ('${jose}', 'Franca', 'Masculino'),
      ('${beatriz}', 'Franca', 'Feminino'),
      ('${hidden}', 'Flamengo', 'Masculino'),
      ${extras.map((id) => `('${id}', 'Flamengo', 'Masculino')`).join(",\n      ")}
    ) as v(id, club, division)
    join clinical.sport_options o
      on o.category = 'Sub-19' and o.modality = '5x5' and o.division = v.division and o.season = 2026;
  `);

  const client = createClient(localSupabase.url, localSupabase.publishableKey, opts);
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  const full = await client.rpc("athlete_directory", { filters: { q: "Heitor Ibrahim Zanetti" } });
  expect(full.error).toBeNull();
  expect(full.data.total).toBe(1);
  expect(full.data.athletes[0].id).toBe(heitor);
  const partial = await client.rpc("athlete_directory", { filters: { q: "Heitor Zanetti" } });
  expect(partial.data.total).toBe(1);
  expect(partial.data.athletes[0].id).toBe(heitor);
  const spaced = await client.rpc("athlete_directory", { filters: { q: "  Heitor   Zanetti " } });
  expect(spaced.data.athletes.map((athlete) => athlete.id)).toEqual([heitor]);
  const reversed = await client.rpc("athlete_directory", { filters: { q: "Zanetti Heitor" } });
  expect(reversed.data.total).toBe(0);
  const ambiguous = await client.rpc("athlete_directory", { filters: { q: "Heitor" } });
  expect(ambiguous.data.total).toBe(2);
  expect(ambiguous.data.athletes.map((athlete) => athlete.id).sort()).toEqual([almeida, heitor].sort());
  const accent = await client.rpc("athlete_directory", { filters: { q: "Jose Alvares" } });
  expect(accent.data.total).toBe(1);
  expect(accent.data.athletes[0].id).toBe(jose);
  const club = await client.rpc("agent_athlete_directory", { filters: { club: "do Flamengo", page: "1", page_size: "5" } });
  expect(club.error).toBeNull();
  expect(club.data.total).toBe(8);
  expect(club.data.page_size).toBe(5);
  expect(club.data.athletes).toHaveLength(5);
  expect(club.data.athletes.map((athlete) => athlete.id)).not.toContain(heitor);
  const clubPage = await client.rpc("agent_athlete_directory", { filters: { club: "Flamengo", page: "2", page_size: "5" } });
  const clubIds = [...club.data.athletes, ...clubPage.data.athletes].map((athlete) => athlete.id);
  expect(clubIds).toContain(heitor);
  expect(clubIds).toContain(almeida);
  expect(clubIds).not.toContain(jose);
  expect(clubIds).not.toContain(hidden);
  expect(full.data.page_size).toBe(25);
  const men = await client.rpc("athlete_directory", { filters: { q: "Heitor", division: "masculino" } });
  expect(men.data.total).toBe(2);
  expect(men.data.athletes.map((athlete) => athlete.id)).not.toContain(beatriz);
  const women = await client.rpc("athlete_directory", { filters: { q: "Beatriz Campos", division: "feminino" } });
  expect(women.data.total).toBe(1);
  expect(women.data.athletes[0].id).toBe(beatriz);
  const wrongNaipe = await client.rpc("athlete_directory", { filters: { q: "Beatriz Campos", division: "masculino" } });
  expect(wrongNaipe.data.total).toBe(0);
  expect(JSON.stringify(club.data)).not.toContain(secret);
  expect(JSON.stringify(partial.data)).not.toContain(secret);

  const outsider = createClient(localSupabase.url, localSupabase.publishableKey, opts);
  const outsiderLogin = await outsider.auth.signInWithPassword({ email: otherEmail, password: otherPassword });
  if (outsiderLogin.error) throw outsiderLogin.error;
  const denied = await outsider.rpc("athlete_directory", { filters: { q: "Heitor Zanetti" } });
  expect(denied.data.total).toBe(0);
  expect(JSON.stringify(denied.data)).not.toContain(secret);
  const roster = await client.rpc("agent_presented_athletes", { ids: [jose, hidden, heitor] });
  expect(roster.error).toBeNull();
  expect(roster.data.map((athlete) => athlete.id)).toEqual([jose, heitor]);
  expect(roster.data.map((athlete) => Number(athlete.ordinal))).toEqual([1, 3]);
  expect(JSON.stringify(roster.data)).not.toContain(secret);

  const guards = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", `
    import { athleteCommand, nameMatches, presentedRoster, rosterChoice, rosterPrompt } from "./src/features/chat/athlete-resolution.ts";
    const heitor = { id: "${heitor}", name: "Heitor Ibrahim Zanetti", facts: [], club: "Flamengo", category: "Sub-19", division: "Masculino" };
    const almeida = { id: "${almeida}", name: "Heitor Almeida", facts: [], club: "Flamengo", category: "Sub-19", division: "Masculino" };
    const jose = { id: "${jose}", name: "José Álvares", facts: [], club: "Franca", category: "Sub-19", division: "Masculino" };
    const slots = [jose, almeida, null, heitor];
    const choice = (query) => rosterChoice(slots, query);
    console.log(JSON.stringify({
      full: nameMatches("Heitor Ibrahim Zanetti", "Heitor Ibrahim Zanetti"),
      middle: nameMatches("Heitor Ibrahim Zanetti", "Heitor Zanetti"),
      reversed: nameMatches("Heitor Ibrahim Zanetti", "Zanetti Heitor"),
      accent: nameMatches("José Álvares", "Jose Alvares"),
      club: nameMatches("Flamengo", "do Flamengo"),
      stop: nameMatches("Heitor Ibrahim Zanetti", "atleta"),
      list: athleteCommand("Busque os atletas do Flamengo."),
      bring: athleteCommand("Me traga o atleta do Flamengo."),
      context: athleteCommand("Beleza, coloca o Heitor Zanetti em contexto."),
      open: athleteCommand("Abra o prontuário."),
      read: athleteCommand("Mostre as informações."),
      clear: athleteCommand("Encerre o contexto."),
      alone: athleteCommand("O terceiro da lista."),
      ordinalSelect: athleteCommand("Coloca o terceiro da lista em contexto."),
      third: choice({ ordinal: 3 }).status,
      fourth: choice({ ordinal: 4 }).athlete.id,
      flamengo: choice({ club: "Flamengo" }).status,
      franca: choice({ club: "Franca" }).athlete.id,
      previousMany: choice({ reference: "previous" }).status,
      previousOne: rosterChoice([heitor], { reference: "previous" }).athlete.id,
      roster: presentedRoster([
        { role: "assistant", athletes: [{ id: "${jose}" }, { id: "${almeida}" }] },
        { role: "user", athletes: [] },
        { role: "assistant", athletes: [] },
      ]),
      latest: presentedRoster([
        { role: "assistant", athletes: [{ id: "${jose}" }] },
        { role: "assistant", athletes: [{ id: "${heitor}" }] },
      ]),
      prompt: rosterPrompt(slots).includes("4. Heitor Ibrahim Zanetti"),
    }));
  `], { encoding: "utf8" }));
  expect(guards).toEqual({
    full: true,
    middle: true,
    reversed: false,
    accent: true,
    club: true,
    stop: false,
    list: "list",
    bring: "select",
    context: "select",
    open: "open",
    read: "read",
    clear: "clear",
    alone: "unknown",
    ordinalSelect: "select",
    third: "none",
    fourth: heitor,
    flamengo: "many",
    franca: jose,
    previousMany: "many",
    previousOne: heitor,
    roster: [jose, almeida],
    latest: [heitor],
    prompt: true,
  });

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/?atleta=${jose}`);
  await expect(page.getByRole("heading", { name: "José Álvares" })).toBeVisible();
  const cards = [
    { id: jose, name: "José Álvares", facts: ["Sub-19"], category: "Sub-19", division: "Masculino", club: "Franca" },
    { id: almeida, name: "Heitor Almeida", facts: ["Sub-19"], category: "Sub-19", division: "Masculino", club: "Flamengo" },
    { id: heitor, name: "Heitor Ibrahim Zanetti", facts: ["Sub-19"], category: "Sub-19", division: "Masculino", club: "Flamengo" },
  ];
  await page.evaluate((athletes) => {
    sessionStorage.setItem("cbb-intelligence-turns:v1", JSON.stringify({
      v: 1,
      turns: [{
        id: "lista",
        role: "assistant",
        text: "Encontrei 3 atletas autorizados.",
        athletes,
        navigation: null,
        search: { total: 3, page: 1, pageSize: 5, filters: {} },
        draft: null,
        document: null,
      }],
    }));
    window.dispatchEvent(new Event("cbb-intelligence-adopt"));
  }, cards);
  await expect(page.locator(".ia-card").filter({ hasText: "José Álvares" }).getByRole("button", { name: "Em contexto", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Colocar em contexto", exact: true })).toHaveCount(2);
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/lista.png` });

  const requestId = randomUUID();
  await page.evaluate(({ athletes, draft }) => {
    sessionStorage.setItem("cbb-intelligence-turns:v1", JSON.stringify({
      v: 1,
      turns: [
        {
          id: "lista",
          role: "assistant",
          text: "Encontrei 3 atletas autorizados.",
          athletes,
          navigation: null,
          search: { total: 3, page: 1, pageSize: 5, filters: {} },
          draft: null,
          document: null,
        },
        {
          id: "proposta",
          role: "assistant",
          text: "Organizei uma proposta de evolução para revisão. Ela ainda não foi salva.",
          athletes: [],
          navigation: null,
          search: null,
          draft,
          document: null,
        },
      ],
    }));
    window.dispatchEvent(new Event("cbb-intelligence-adopt"));
  }, {
    athletes: cards,
    draft: {
      state: "proposal",
      requestId,
      athleteId: jose,
      athleteName: "José Álvares",
      professionalName: "QA Resolucao",
      occurredOn: "2026-11-10",
      title: "Evolução fictícia",
      body: "Relato fictício ainda não salvo.",
      missing: [],
      restricted: true,
      recordId: null,
      error: null,
    },
  });
  await expect(page.getByText("Proposta ainda não salva")).toBeVisible();
  const heitorCard = page.locator(".ia-card").filter({ hasText: "Heitor Ibrahim Zanetti" });
  page.once("dialog", (dialog) => dialog.dismiss());
  await heitorCard.getByRole("button", { name: "Colocar em contexto", exact: true }).click();
  await expect(page.getByRole("heading", { name: "José Álvares" })).toBeVisible();
  await expect(heitorCard.getByRole("button", { name: "Colocar em contexto", exact: true })).toBeVisible();
  await expect(page.getByText("Proposta ainda não salva")).toBeVisible();
  await page.screenshot({ path: `${shots}/rascunho-preservado.png` });

  page.once("dialog", (dialog) => dialog.accept());
  await heitorCard.getByRole("button", { name: "Colocar em contexto", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Heitor Ibrahim Zanetti" })).toBeVisible();
  await expect(heitorCard.getByRole("button", { name: "Em contexto", exact: true })).toBeVisible();
  await expect(page.getByText("Proposta ainda não salva")).toBeVisible();
  await expect(page.getByRole("heading", { name: "José Álvares" })).toHaveCount(0);
  await page.screenshot({ path: `${shots}/contexto.png` });
});
