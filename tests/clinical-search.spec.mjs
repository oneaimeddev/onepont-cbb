import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "./fixtures.mjs";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { localSupabase } from "../scripts/local-supabase.mjs";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(localSupabase.url, localSupabase.adminKey, opts);
const users = [],
  athletes = [],
  options = [];
const stamp = randomUUID().slice(0, 8);
const shots = "docs/visual/handoff-007-5-3";
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
      "-tA",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input, stdio: ["pipe", "pipe", "pipe"] },
  )
    .toString()
    .trim();
}
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const today = () =>
  sql("select (clock_timestamp() at time zone 'America/Sao_Paulo')::date");
const shift = (day, n) => {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
async function account(medical = true) {
  const email = `clinical-search-${randomUUID()}@example.com`,
    password = randomUUID();
  const user = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (user.error) throw user.error;
  const id = user.data.user.id;
  users.push(id);
  const profile = await admin.from("profiles").insert({
    id,
    display_name: "Busca Clínica DEMO",
    profession: medical ? "Medicina" : "Fisioterapia",
    can_read_audit: false,
  });
  if (profile.error) throw profile.error;
  sql(
    `insert into clinical.athlete_creators(professional_id) values('${id}');${medical ? `insert into clinical.medical_authors(professional_id,credential_label) values('${id}','Credencial fictícia');` : ""}`,
  );
  const client = createClient(
    localSupabase.url,
    localSupabase.publishableKey,
    opts,
  );
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id, email, password, client };
}
async function rpc(client, name, args = {}) {
  const { data, error } = await client.rpc(name, args);
  expect(error).toBeNull();
  return data;
}
const search = (user, filters) =>
  rpc(user.client, "search_clinical_activity", { filters });
function athlete(user, name, read = true) {
  const id = randomUUID();
  athletes.push(id);
  sql(
    `insert into clinical.athletes(id,full_name,source) values('${id}',${quote(name)},'demo');${user ? `insert into clinical.athlete_access(athlete_id,professional_id,can_read_records,can_write,can_edit) values('${id}','${user.id}',${read},true,true);` : ""}`,
  );
  return id;
}
function evolution(owner, target, when, extra = {}) {
  const id = randomUUID();
  sql(
    `insert into clinical.records(id,athlete_id,author_id,author_name,specialty,title,body,occurred_at,status,visibility) values('${id}','${target}','${owner.id}','Autor DEMO',${quote(extra.specialty ?? "Fisioterapia")},${quote(extra.title ?? "Evolução DEMO")},'Conteúdo fictício não enviado ao modelo',${quote(when)}::timestamptz,${quote(extra.status ?? "finalized")},${quote(extra.visibility ?? "care_team")});`,
  );
  return id;
}
function document(
  owner,
  target,
  kind,
  created,
  clinical = "",
  title = "Exame DEMO",
) {
  const id = randomUUID();
  let content =
    kind === "exam_request"
      ? {
          occurred_at: clinical,
          items: [
            {
              id: randomUUID(),
              name: title,
              exam_type: "laboratory",
              region: "",
              laterality: "",
              technical_details: "",
              notes: "",
            },
          ],
          indication: "",
          justification: "Fictício",
          diagnosis: "",
          priority: "",
          additional: "",
        }
      : kind === "prescription"
        ? {
            notes: "",
            items: [
              {
                id: randomUUID(),
                name: "Medicamento DEMO",
                dose: "500",
                dose_unit: "mg",
                presentation: "",
                route: "",
                schedule: "",
                duration: "",
                quantity: "",
                instructions: "",
              },
            ],
          }
        : {
            procedure: "Procedimento DEMO",
            region: "",
            laterality: "",
            indication: "",
            diagnosis: "",
            justification: "",
            priority: "",
            additional: "",
            materials: "",
          };
  sql(
    `insert into clinical.documents(id,athlete_id,author_id,author_name,document_type,status,content,version,created_at,updated_at) values('${id}','${target}','${owner.id}','Autor DEMO','${kind}','draft',${quote(JSON.stringify(content))}::jsonb,1,${quote(created)}::timestamptz,${quote(created)}::timestamptz);`,
  );
  return id;
}
async function sport(
  owner,
  target,
  category = "Sub-19",
  division = "Masculino",
) {
  const org = await rpc(owner.client, "catalog_create_organization", {
    label: `Clube Transversal DEMO ${stamp}`,
    org_kind: "club",
  });
  const cat = await rpc(owner.client, "catalog_create_category", {
    label: category,
  });
  const inserted = sql(
    `insert into clinical.sport_options(category,modality,division,season) values('${category}','5x5','${division}',extract(year from current_date)::integer) on conflict do nothing returning id`,
  );
  const id = sql(
    `select id from clinical.sport_options where category='${category}' and modality='5x5' and division='${division}' and season=extract(year from current_date)::integer`,
  );
  if (inserted && /^[a-f0-9-]{36}$/.test(inserted)) options.push(id);
  sql(
    `insert into clinical.sport_links(athlete_id,option_id,club,club_id,starts_on) values('${target}','${id}',${quote(org.name)},'${org.id}',current_date-100);update clinical.athletes set category='${category}',team=${quote(org.name)} where id='${target}'`,
  );
  return { club: org.name, category: cat.name };
}
async function attachment(owner, target, date = null) {
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText(`LAUDO FICTICIO ${randomUUID()}`);
  const bytes = Buffer.from(await pdf.save());
  const id = randomUUID();
  const { createHash } = await import("node:crypto");
  const begin = await rpc(owner.client, "attachment_begin", {
    target,
    attachment_key: id,
    payload: {
      title: "Resultado laboratorial DEMO",
      category: "laboratory",
      document_date: date ?? "",
      original_filename: "resultado.pdf",
      mime_type: "application/pdf",
      size_bytes: bytes.length,
      checksum: createHash("sha256").update(bytes).digest("hex"),
    },
  });
  const stored = await admin.storage
    .from("clinical-attachments")
    .upload(begin.path, bytes, { contentType: "application/pdf" });
  if (stored.error) throw stored.error;
  expect(
    await rpc(owner.client, "attachment_finish", {
      attachment_key: id,
      attempt: begin.token,
      success: true,
    }),
  ).toMatchObject({ status: "ready" });
  return id;
}
async function login(page, user) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
}

test.afterAll(async () => {
  if (!users.length) return;
  const ids = users.map(quote).join(",");
  const targets = athletes.map(quote).join(",") || "null";
  const paths = JSON.parse(
    sql(
      `select coalesce(json_agg(u.storage_path),'[]') from clinical.attachment_uploads u join clinical.attachments a on a.id=u.attachment_id where a.uploaded_by in(${ids})`,
    ),
  );
  if (paths.length) {
    const r = await admin.storage.from("clinical-attachments").remove(paths);
    if (r.error) throw r.error;
  }
  sql(
    `delete from clinical.attachment_uploads where attachment_id in(select id from clinical.attachments where uploaded_by in(${ids}));delete from clinical.attachments where uploaded_by in(${ids});delete from clinical.document_proposals where actor_id in(${ids});delete from clinical.conversation_sessions where professional_id in(${ids});delete from clinical.audit_events where actor_user_id in(${ids});delete from clinical.documents where author_id in(${ids});delete from clinical.records where author_id in(${ids});delete from clinical.athletes where id in(${targets});delete from clinical.sport_options where id in(${options.map(quote).join(",") || "null"});delete from clinical.categories where created_by in(${ids});delete from clinical.organizations where created_by in(${ids});`,
  );
  for (const id of users) {
    const r = await admin.auth.admin.deleteUser(id);
    if (r.error) throw r.error;
  }
});

test("interpretação de tipos, períodos e refinamentos mantém semântica explícita", () => {
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--import",
        "./tests/strip-ts-register.mjs",
        "--input-type=module",
        "-e",
        `
 import {parseClinicalSearch} from './src/features/clinical-search/intent.ts';
 const cat={categories:[{name:'Sub-19'},{name:'Sub-17'}],clubs:[{name:'Flamengo'}]};
 const first=parseClinicalSearch('Mostre os atletas com exames nos últimos 20 dias.',null,cat);
 const previous={filters:{...first.filters,period:'range',from:'2026-10-30',to:'2026-11-18',days:undefined},page:1};
 console.log(JSON.stringify({first,follow:parseClinicalSearch('Agora filtre somente os resultados anexados.',previous,cat),sub:parseClinicalSearch('Desses, mostre somente os da categoria Sub-17.',previous,cat),club:parseClinicalSearch('Quais atletas do Flamengo têm exames solicitados?',null,cat),physio:parseClinicalSearch('Quem teve evolução fisioterapêutica nos últimos 30 dias?',null,cat),performed:parseClinicalSearch('Quais atletas têm exames realizados?',null,cat),single:parseClinicalSearch('Quais exames deste atleta?',null,cat),months:parseClinicalSearch('Quais atletas tiveram prescrições nos últimos 6 meses?',null,cat),range:parseClinicalSearch('Quais atletas tiveram evoluções entre 01/10/2026 e 18/11/2026?',null,cat)}));
 `,
      ],
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ),
  );
  expect(result.first.filters).toMatchObject({
    kinds: ["exam_request", "attachment_result"],
    period: "last_days",
    days: 20,
  });
  expect(result.follow.filters).toMatchObject({
    kinds: ["attachment_result"],
    from: "2026-10-30",
    to: "2026-11-18",
  });
  expect(result.sub.filters.category).toBe("Sub-17");
  expect(result.club.filters).toMatchObject({
    club: "Flamengo",
    kinds: ["exam_request"],
  });
  expect(result.physio.filters).toMatchObject({
    kinds: ["evolution"],
    specialty: "Fisioterapia",
    days: 30,
  });
  expect(result.performed.error).toContain("não tem confirmação estruturada");
  expect(result.single).toBeNull();
  expect(result.months.filters).toMatchObject({
    period: "last_months",
    months: 6,
  });
  expect(result.range.filters).toMatchObject({
    from: "2026-10-01",
    to: "2026-11-18",
  });
});

test("RPC agrupa fontes autorizadas e respeita datas civis, tipos, especialidade e filtros esportivos", async () => {
  const owner = await account(),
    colleague = await account(),
    reader = await account(false);
  const day = today(),
    start = shift(day, -19);
  const a = athlete(owner, `Atleta Busca DEMO ${stamp}`),
    hidden = athlete(null, "Atleta SEM ACESSO DEMO");
  const b = athlete(owner, "Atleta Outra Categoria DEMO");
  const sports = await sport(owner, a);
  await sport(owner, b, "Sub-17", "Feminino");
  sql(
    `insert into clinical.athlete_access(athlete_id,professional_id,can_read_records) values('${a}','${reader.id}',true),('${a}','${colleague.id}',true);`,
  );
  const first = document(owner, a, "exam_request", `${day}T12:00:00-03`, start);
  const last = document(owner, a, "exam_request", `${day}T12:00:00-03`, day);
  const fallback = document(owner, a, "exam_request", `${day}T01:00:00-03`, "");
  document(owner, a, "exam_request", `${day}T12:00:00-03`, shift(start, -1));
  document(
    colleague,
    a,
    "exam_request",
    `${day}T12:00:00-03`,
    day,
    "TÍTULO PRIVADO NÃO VAZAR",
  );
  document(owner, hidden, "exam_request", `${day}T12:00:00-03`, day);
  document(owner, b, "exam_request", `${day}T12:00:00-03`, day);
  const filters = {
    kinds: ["exam_request"],
    period: "last_days",
    days: 20,
    category: "Sub-19",
    club: sports.club,
    division: "Masculino",
    modality: "5x5",
  };
  const result = await search(owner, filters);
  expect(result).toMatchObject({
    total: 1,
    matched_records: 3,
    filters: { from: start, to: day },
    timezone: "America/Sao_Paulo",
  });
  expect(result.items[0].matched_records).toBe(3);
  expect(result.items[0].sources.map((s) => s.id)).toEqual(
    expect.arrayContaining([first, last, fallback]),
  );
  expect(
    result.items[0].sources.find((s) => s.id === fallback).date_basis,
  ).toBe("created");
  expect(JSON.stringify(result)).not.toContain("TÍTULO PRIVADO");
  expect(JSON.stringify(result)).not.toContain(hidden);
  document(owner, a, "prescription", `${day}T12:00:00-03`);
  document(owner, a, "surgical_order", `${day}T12:00:00-03`);
  expect(
    (await search(owner, { kinds: ["prescription"], period: "this_month" }))
      .total,
  ).toBe(1);
  expect(
    (await search(owner, { kinds: ["surgical_order"], period: "today" })).total,
  ).toBe(1);
  const inside = evolution(owner, a, `${start}T03:00:00Z`);
  evolution(owner, a, `${start}T02:59:59Z`);
  evolution(colleague, a, `${day}T12:00:00-03`, {
    visibility: "author_only",
    title: "Evolução privada",
  });
  evolution(colleague, a, `${day}T12:00:00-03`, { status: "draft" });
  expect(
    await search(owner, {
      kinds: ["evolution"],
      period: "last_days",
      days: 20,
      specialty: "Fisioterapia",
    }),
  ).toMatchObject({ total: 1, matched_records: 1 });
  expect(
    (
      await search(owner, {
        kinds: ["evolution"],
        period: "last_days",
        days: 20,
      })
    ).items[0].sources[0].id,
  ).toBe(inside);
  const file = await attachment(owner, a, shift(day, -40));
  await attachment(owner, a, null);
  const attached = await search(owner, {
    kinds: ["attachment_result"],
    period: "last_days",
    days: 20,
  });
  expect(attached).toMatchObject({ total: 1, matched_records: 1 });
  expect(attached.items[0].sources[0]).toMatchObject({
    date_basis: "upload",
    document_on: null,
  });
  expect(JSON.stringify(attached)).not.toContain(file);
  expect(
    (await search(reader, { kinds: ["exam_request"], period: "all" })).total,
  ).toBe(0);
  expect(
    (await search(reader, { kinds: ["attachment_result"], period: "all" }))
      .total,
  ).toBe(0);
  expect(
    (
      await search(reader, {
        kinds: ["evolution"],
        period: "last_days",
        days: 20,
      })
    ).matched_records,
  ).toBe(1);
  sql(
    `update clinical.athlete_access set can_read_records=false where athlete_id='${a}' and professional_id='${owner.id}'`,
  );
  expect((await search(owner, filters)).total).toBe(0);
});

test("validação impede SQL arbitrário e datas inválidas; auditoria contém apenas referências mínimas", async () => {
  const owner = await account();
  for (const filters of [
    { kinds: ["exam_request"], table: "clinical.records" },
    { kinds: ["performed"] },
    {
      kinds: ["evolution"],
      period: "range",
      from: "2026-02-30",
      to: "2026-03-01",
    },
    { kinds: ["evolution"], period: "last_days", days: 0 },
    { kinds: ["evolution"], sort: "DROP TABLE clinical.athletes" },
  ])
    expect((await search(owner, filters)).error).toBe("invalid");
  expect(
    (
      await search(owner, {
        kinds: ["prescription"],
        specialty: "Fisioterapia",
      })
    ).error,
  ).toBe("specialty");
  const anon = createClient(
    localSupabase.url,
    localSupabase.publishableKey,
    opts,
  );
  expect(
    (await anon.rpc("search_clinical_activity", { filters: {} })).error,
  ).not.toBeNull();
  const day = today();
  for (const period of ["today", "yesterday", "this_month"]) {
    const r = await search(owner, { kinds: ["evolution"], period });
    expect(r.today).toBe(day);
    expect(r.filters.to).toBe(period === "yesterday" ? shift(day, -1) : day);
  }
  const month = await search(owner, {
    kinds: ["evolution"],
    period: "last_months",
    months: 6,
  });
  expect(month.filters.from).toBe(
    sql(
      "select ((clock_timestamp() at time zone 'America/Sao_Paulo')::date-interval '6 months')::date",
    ),
  );
  const events = sql(
    `select operation||':'||safe_metadata::text from clinical.audit_events where actor_user_id='${owner.id}'`,
  );
  expect(events).toContain("clinical_activity.search");
  expect(events).not.toContain("Conteúdo fictício");
});

test("busca paginada em 3.000 atletas, fontes sem duplicação e plano real de execução", async () => {
  test.setTimeout(120_000);
  const owner = await account();
  const ids = Array.from({ length: 3000 }, () => randomUUID());
  athletes.push(...ids);
  const day = today();
  sql(
    `insert into clinical.athletes(id,full_name,source) values ${ids.map((id, i) => `('${id}','Atleta Escala DEMO ${stamp} ${String(i).padStart(4, "0")}','demo')`).join(",")};insert into clinical.athlete_access(athlete_id,professional_id,can_read_records) select id,'${owner.id}',true from clinical.athletes where id in(${ids.map(quote).join(",")});insert into clinical.documents(id,athlete_id,author_id,author_name,document_type,status,content,version,created_at) select gen_random_uuid(),id,'${owner.id}','Autor Escala DEMO','exam_request','draft',jsonb_build_object('occurred_at',case when n<=100 then '${day}' else '${shift(day, -90)}' end,'items','[]'::jsonb),1,clock_timestamp() from unnest(array[${ids.map(quote).join(",")}]::uuid[]) with ordinality r(id,n);`,
  );
  document(owner, ids[0], "exam_request", `${day}T12:00:00-03`, day);
  const begin = performance.now();
  const first = await search(owner, {
    kinds: ["exam_request"],
    period: "last_days",
    days: 20,
  });
  const elapsedMs = Math.round(performance.now() - begin);
  expect(first.total).toBe(100);
  expect(first.matched_records).toBe(101);
  expect(first.items).toHaveLength(5);
  const second = await search(owner, {
    kinds: ["exam_request"],
    period: "last_days",
    days: 20,
    page: 2,
  });
  expect(second.items).toHaveLength(5);
  expect(
    second.items.some((item) =>
      first.items.some((a) => a.athlete_id === item.athlete_id),
    ),
  ).toBe(false);
  const seen = new Set();
  for (let page = 1; page <= 20; page++) {
    const r = await search(owner, {
      kinds: ["exam_request"],
      period: "last_days",
      days: 20,
      page,
    });
    for (const item of r.items) seen.add(item.athlete_id);
  }
  expect(seen.size).toBe(100);
  const filters = {
    kinds: ["exam_request"],
    from: shift(day, -19),
    to: day,
    period: "range",
  };
  let query = sql(
    "select prosrc from pg_proc where oid='clinical.activity_matches(uuid,jsonb)'::regprocedure",
  );
  query = query
    .replaceAll("$1", quote(owner.id))
    .replace(/\bfilters\b/g, `(${quote(JSON.stringify(filters))}::jsonb)`);
  const plan = JSON.parse(
    sql(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${query}`),
  )[0];
  const simplify = (node) => ({
    node: node["Node Type"],
    relation: node["Relation Name"],
    index: node["Index Name"],
    rows: node["Actual Rows"],
    time: node["Actual Total Time"],
    plans: node.Plans?.map(simplify),
  });
  mkdirSync(shots, { recursive: true });
  writeFileSync(
    `${shots}/scale.json`,
    JSON.stringify(
      {
        athletes: 3000,
        matchingAthletes: 100,
        matchingRecords: 101,
        pageSize: 5,
        elapsedMs,
        executionMs: plan["Execution Time"],
        plan: simplify(plan.Plan),
      },
      null,
      2,
    ) + "\n",
  );
  expect(elapsedMs).toBeLessThan(10000);
  console.log(
    "Clinical search scale",
    JSON.stringify({
      athletes: 3000,
      matchingAthletes: first.total,
      elapsedMs,
      executionMs: plan["Execution Time"],
    }),
  );
});

test("chat refina a consulta, abre fontes, pagina e preserva o atleta em contexto", async ({
  page,
}) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(20_000);
  const owner = await account();
  const day = today();
  const initial = athlete(owner, `Atleta Contexto DEMO ${stamp}`);
  const ids = [];
  for (let i = 0; i < 7; i++) {
    const id = athlete(owner, `Resultado Busca DEMO ${stamp} ${i}`);
    ids.push(id);
    await sport(owner, id, i < 4 ? "Sub-19" : "Sub-17");
    document(owner, id, "exam_request", `${day}T12:00:00-03`, day);
    if (i === 0)
      for (let n = 0; n < 6; n++)
        document(owner, id, "exam_request", `${day}T12:00:00-03`, day);
  }
  await login(page, owner);
  await page.goto(`/?atleta=${initial}`);
  const ask = async (message, previous, mode = "text") => {
    const response = await page.request.post("/api/inteligencia", {
      headers: { Origin: "http://127.0.0.1:3100" },
      data: {
        messages: [{ role: "user", content: message }],
        contextAthleteId: initial,
        inputMode: mode,
        ...(previous ? { clinicalSearchScope: previous } : {}),
      },
    });
    expect(response.ok()).toBe(true);
    return JSON.parse((await response.text()).split("data: ")[1]);
  };
  const reply = await ask(
    "Quais atletas possuem exames registrados nos últimos 20 dias, por nome?",
  );
  expect(reply.clinicalSearch.filters.kinds).toEqual([
    "exam_request",
    "attachment_result",
  ]);
  expect(reply.context).toBeNull();
  expect(reply.athletes).toHaveLength(5);
  expect(JSON.stringify(reply)).not.toContain("Conteúdo fictício");
  await page.evaluate(
    async ({ reply }) => {
      sessionStorage.setItem(
        "cbb-intelligence-turns:v1",
        JSON.stringify({
          v: 1,
          turns: [
            {
              id: "cross-search",
              role: "assistant",
              text: reply.text,
              athletes: reply.athletes,
              navigation: null,
              search: null,
              draft: null,
              document: null,
              readings: null,
              clinicalSearch: reply.clinicalSearch,
            },
          ],
        }),
      );
      window.dispatchEvent(new Event("cbb-intelligence-adopt"));
    },
    { reply, initial },
  );
  const region = page.getByRole("region", {
    name: "Busca clínica transversal",
  });
  await expect(region.locator(".clinical-search-card")).toHaveCount(5);
  await expect(
    page.getByRole("heading", {
      name: `Atleta Contexto DEMO ${stamp}`,
      exact: true,
    }),
  ).toBeVisible();
  mkdirSync(shots, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: `${shots}/search-desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: `${shots}/search-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const manySources = region
    .locator(".clinical-search-card")
    .filter({ hasText: `Resultado Busca DEMO ${stamp} 0` });
  await manySources
    .getByRole("button", { name: "Ver registros correspondentes", exact: true })
    .click();
  const evidence = manySources.getByRole("region", {
    name: `Registros correspondentes de Resultado Busca DEMO ${stamp} 0`,
  });
  await expect(evidence.locator(".clinical-source-list > li")).toHaveCount(5);
  await evidence
    .getByRole("button", { name: "Próximas fontes", exact: true })
    .click();
  await expect(evidence.locator(".clinical-source-list > li")).toHaveCount(2);
  await region
    .getByRole("button", { name: "Próximos atletas", exact: true })
    .click();
  await expect(region.locator(".clinical-search-card")).toHaveCount(2);
  await region
    .getByRole("button", { name: "Abrir fonte", exact: true })
    .first()
    .click();
  await expect(
    region.getByRole("region", { name: "Fonte da busca clínica" }),
  ).toBeVisible();
  await expect(
    region.getByText("Exame DEMO", { exact: true }).last(),
  ).toBeVisible();
  await region
    .getByRole("button", { name: "Colocar em contexto", exact: true })
    .first()
    .click();
  await expect(
    page
      .getByRole("heading", {
        name: new RegExp(`Resultado Busca DEMO ${stamp}`),
      })
      .first(),
  ).toBeVisible();
  const sub = await ask(
    "Desses, mostre somente os da categoria Sub-17.",
    reply.clinicalSearch,
  );
  expect(sub.clinicalSearch.filters).toMatchObject({
    category: "Sub-17",
    from: reply.clinicalSearch.filters.from,
    to: day,
  });
  expect(sub.athletes).toHaveLength(3);
  const voiced = await ask(
    "Desses, mostre somente os da categoria Sub-17.",
    reply.clinicalSearch,
    "voice",
  );
  expect(voiced.clinicalSearch.filters).toEqual(sub.clinicalSearch.filters);
  expect(voiced.athletes).toHaveLength(3);
  expect(
    sql(
      `select count(*) from clinical.audit_events where actor_user_id='${owner.id}' and operation='clinical_activity.search' and origin_channel='ai_voice'`,
    ),
  ).not.toBe("0");
  const only = await ask(
    "Agora filtre somente os resultados anexados.",
    reply.clinicalSearch,
  );
  expect(only.clinicalSearch.filters.kinds).toEqual(["attachment_result"]);
  const performed = await ask("Quais atletas têm exames realizados?");
  expect(performed.text).toContain("não tem confirmação estruturada");
  expect(performed.clinicalSearch).toBeNull();
  const request = await page.request.post("/api/inteligencia/atividade", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: { filters: { ...reply.clinicalSearch.filters, sql: "select *" } },
  });
  expect(request.status()).toBe(400);
  // Real composer flow on the enabled server; deterministic search performs no provider calls.
  await page.goto(`http://127.0.0.1:3101/?atleta=${initial}`);
  const composer = page.getByPlaceholder(
    "Pergunte sobre um atleta, uma evolução ou um prontuário.",
  );
  await composer.fill(
    "Quais atletas possuem solicitações de exames nos últimos 20 dias?",
  );
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  const liveSearch = page
    .getByRole("region", { name: "Busca clínica transversal" })
    .last();
  await expect(liveSearch.locator(".clinical-search-card")).toHaveCount(5);
  await composer.fill("Desses, mostre somente os da categoria Sub-17.");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Busca clínica transversal" })
      .last()
      .locator(".clinical-search-card"),
  ).toHaveCount(3);
  await expect(
    page.getByRole("heading", {
      name: `Atleta Contexto DEMO ${stamp}`,
      exact: true,
    }),
  ).toBeVisible();
});
