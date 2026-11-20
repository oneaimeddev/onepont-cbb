import sharp from "sharp";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { localSupabase } from "../scripts/local-supabase.mjs";
import { demoEnvironmentAllowed } from "../src/features/signing/environment.ts";
const require = createRequire(import.meta.url);
const admin = createClient(localSupabase.url, localSupabase.adminKey, {
  auth: { persistSession: false },
});
const users = [];
const athlete = randomUUID();
const shots = "docs/visual/handoff-007-10-6b";
let owner, other, limited, priorGate;
function sql(s) {
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
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: s, encoding: "utf8" },
  ).trim();
}
async function account(name, medical) {
  const email = `signing-${randomUUID()}@example.com`,
    password = randomUUID();
  const r = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (r.error) throw r.error;
  const id = r.data.user.id;
  users.push(id);
  const p = await admin
    .from("profiles")
    .insert({
      id,
      display_name: name,
      profession: medical ? "Medicina" : "Psicologia",
    });
  if (p.error) throw p.error;
  const client = createClient(localSupabase.url, localSupabase.publishableKey, {
    auth: { persistSession: false },
  });
  await client.auth.signInWithPassword({ email, password });
  return { id, email, password, client };
}
async function rpc(u, action, payload = {}) {
  const r = await u.client.rpc("signing_demo_command", { action, payload });
  expect(r.error).toBeNull();
  return r.data;
}
async function profile(u, action, payload = {}) {
  const r = await u.client.rpc("professional_profile_command", {
    action,
    payload,
  });
  expect(r.error).toBeNull();
  return r.data;
}
async function document(u = owner, kind = "prescription") {
  const id = randomUUID();
  const content =
    kind === "prescription"
      ? {
          notes: "DEMO — usar exclusivamente para apresentação.",
          items: [
            {
              id: randomUUID(),
              name: "Medicamento DEMO",
              presentation: "Comprimido",
              dose: "1",
              dose_unit: "unidade",
              route: "Oral",
              schedule: "Conforme revisão",
              duration: "DEMO",
              quantity: "1",
              instructions: "Não utilizar clinicamente",
            },
          ],
        }
      : kind === "surgical_order"
        ? {
            procedure: "Procedimento fictício DEMO",
            region: "Joelho",
            laterality: "left",
            indication: "Demonstração",
            diagnosis: "DEMO",
            justification: "Simulação",
            priority: "elective",
            materials: "DEMO",
            additional: "",
          }
        : {
            occurred_at: "2026-11-20",
            items: [
              {
                id: randomUUID(),
                name: "Exame fictício DEMO",
                exam_type: "laboratory",
                region: "",
                laterality: "",
                technical_details: "",
                notes: "",
              },
            ],
            indication: "Demonstração",
            justification: "DEMO",
            diagnosis: "",
            priority: "elective",
            additional: "",
          };
  const r = await u.client.rpc("document_save", {
    target: athlete,
    document_id: id,
    expected_version: 0,
    kind,
    payload: content,
    intent: "save",
  });
  expect(r.error).toBeNull();
  expect(r.data.error).toBeUndefined();
  return { id, content, version: r.data.version, kind };
}
async function prepare(d, u = owner) {
  return (await rpc(u, "prepare", { document_id: d.id, version: d.version }))
    .snapshot;
}
async function confirm(
  s,
  identity,
  scenario = "success",
  key = randomUUID(),
  u = owner,
) {
  return rpc(u, "confirm", {
    snapshot_id: s.id,
    identity_id: identity,
    scenario,
    idempotency_key: key,
    hash: s.content_hash,
    confirmed: true,
  });
}
async function login(page, u = owner) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(u.email);
  await page.getByLabel("Senha", { exact: true }).fill(u.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
}
test.beforeAll(async () => {
  priorGate = sql("select demo_enabled from clinical.signing_environment;");
  await admin.rpc("configure_signing_demo", { enabled: true });
  owner = await account("Profissional Assinatura DEMO", true);
  other = await account("Outro Profissional DEMO", true);
  limited = await account("Psicóloga Assinatura DEMO", false);
  sql(
    `insert into clinical.athletes(id,full_name,source) values('${athlete}','Atleta Assinatura DEMO','demo');insert into clinical.athlete_access(athlete_id,professional_id,can_read_records) values ${users.map((id) => `('${athlete}','${id}',true)`).join(",")};insert into clinical.medical_authors(professional_id,enabled) values('${owner.id}',true),('${other.id}',true);`,
  );
  mkdirSync(shots, { recursive: true });
});
test.beforeEach(async () => {
  await rpc(owner, "connect");
  await rpc(other, "connect");
});
test.afterAll(async () => {
  if (users.length) {
    const ids = users.map((x) => `'${x}'`).join(",");
    sql(
      `delete from clinical.signature_results where attempt_id in(select id from clinical.signature_attempts where professional_id in(${ids}));delete from clinical.signature_transitions where professional_id in(${ids});delete from clinical.signature_attempts where professional_id in(${ids});delete from clinical.signature_snapshots where professional_id in(${ids});delete from clinical.signature_preferences where professional_id in(${ids});delete from clinical.signing_identities where professional_id in(${ids});delete from clinical.signature_connections where professional_id in(${ids});delete from clinical.professional_registrations where professional_id in(${ids});delete from clinical.professional_details where professional_id in(${ids});delete from clinical.athletes where id='${athlete}';delete from clinical.medical_authors where professional_id in(${ids});`,
    );
    for (const id of users) {
      await admin.storage
        .from("professional-photos")
        .remove([`${id}/avatar.png`]);
      await admin.auth.admin.deleteUser(id);
    }
  }
  await admin.rpc("configure_signing_demo", { enabled: priorGate === "t" });
});

test("ambiente operacional rejeita simulação, inclusive RPC direta e tentativa de reconfiguração", async () => {
  for (const env of [
    {},
    { CBB_SIGNING_MODE: "demo" },
    { CBB_SIGNING_MODE: "demo", CBB_DEPLOYMENT_ENV: "operational" },
    {
      CBB_SIGNING_MODE: "demo",
      CBB_DEPLOYMENT_ENV: "local",
      VERCEL_ENV: "production",
    },
  ])
    expect(demoEnvironmentAllowed(env)).toBe(false);
  expect(
    demoEnvironmentAllowed({
      CBB_SIGNING_MODE: "demo",
      CBB_DEPLOYMENT_ENV: "test",
    }),
  ).toBe(true);
  expect(
    (await owner.client.rpc("configure_signing_demo", { enabled: true })).error,
  ).not.toBeNull();
  await admin.rpc("configure_signing_demo", { enabled: false });
  try {
    expect((await rpc(owner, "connect", { demo_enabled: true })).error).toBe(
      "unavailable",
    );
  } finally {
    await admin.rpc("configure_signing_demo", { enabled: true });
  }
});
test("cadastro, múltiplas inscrições e tentativas de elevação não alteram autorização clínica", async () => {
  const input = {
    full_name: "Nome Completo DEMO",
    display_name: "Profissional Assinatura DEMO",
    profession: "Cirurgião",
    contact_email: "contato.demo@example.com",
    phone: "",
    specialties: "Especialidade declarada DEMO",
  };
  expect(
    (await profile(limited, "save", { ...input, can_manage_access: true }))
      .error,
  ).toBe("invalid");
  expect((await profile(limited, "save", { ...input, display_name: {} })).error).toBe("invalid");
  expect((await profile(limited, "save", input)).profile.profession).toBe(
    "Cirurgião",
  );
  for (const jurisdiction of ["SP", "RJ"])
    expect(
      (
        await profile(limited, "registration_add", {
          council: "CRM DEMO",
          registration_number: "FICTICIO",
          jurisdiction,
        })
      ).error,
    ).toBeUndefined();
  const data = await profile(limited, "get");
  expect(data.registrations).toHaveLength(2);
  expect(data.registrations.every((r) => r.verification === "declared")).toBe(
    true,
  );
  expect((await limited.client.rpc("medical_profile")).data.enabled).toBe(
    false,
  );
  expect(
    (
      await profile(owner, "registration_remove", {
        id: data.registrations[0].id,
      })
    ).error,
  ).toBe("unavailable");
  const table = await limited.client
    .schema("clinical")
    .from("professional_registrations")
    .select("*");
  expect(table.error).not.toBeNull();
});
test("múltiplas identidades, preferência própria e desconexão preservam referências", async () => {
  const data = await rpc(owner, "connect");
  expect(data.identities).toHaveLength(2);
  const otherInv = await rpc(other, "connect");
  expect(
    (await rpc(owner, "prefer", { identity_id: otherInv.identities[0].id }))
      .error,
  ).toBe("unavailable");
  expect(
    (await rpc(owner, "prefer", { identity_id: data.identities[1].id }))
      .preferred,
  ).toBe(data.identities[1].id);
  await rpc(owner, "disconnect");
  expect((await rpc(owner, "list")).identities).toHaveLength(0);
  const back = await rpc(owner, "connect");
  expect(back.identities.map((x) => x.id)).toEqual(
    data.identities.map((x) => x.id),
  );
});
test("preparação congela bytes, autor, versão e hash exato sem alterar documento", async () => {
  const d = await document();
  expect((await rpc(owner, "prepare", { document_id: d.id })).error).toBe(
    "stale",
  );
  const before = sql(
    `select row_to_json(d)::text from clinical.documents d where id='${d.id}';`,
  );
  const s = await prepare(d);
  const bytes = sql(
    `select canonical_bytes from clinical.signature_snapshots where id='${s.id}';`,
  );
  expect(createHash("sha256").update(bytes, "utf8").digest("hex")).toBe(
    s.content_hash,
  );
  expect(sql(`begin;set local timezone='America/Sao_Paulo';select encode(extensions.digest(clinical.signing_material(d),'sha256'),'hex')=s.content_hash from clinical.documents d join clinical.signature_snapshots s on s.document_id=d.id where s.id='${s.id}';rollback;`).split("\n")).toContain("t");
  expect(s.material.version).toBe(d.version);
  expect(s.material.author_id).toBe(owner.id);
  expect(
    sql(
      `select row_to_json(d)::text from clinical.documents d where id='${d.id}';`,
    ),
  ).toBe(before);
  expect(() =>
    sql(
      `update clinical.signature_snapshots set version=99 where id='${s.id}';`,
    ),
  ).toThrow();
  expect((await rpc(other, "snapshot", { snapshot_id: s.id })).error).toBe(
    "unavailable",
  );
});
for (const [scenario, state] of [
  ["success", "simulated_success"],
  ["denied", "denied"],
  ["expired", "expired"],
  ["failed", "failed"],
])
  test(`resultado ${scenario} persiste evidência sem assinatura criptográfica`, async () => {
    const d = await document();
    const s = await prepare(d);
    const i = (await rpc(owner, "list")).identities[0];
    const a = await confirm(s, i.id, scenario);
    expect(a.attempt.state).toBe("authorizing");
    const result = await rpc(owner, "status", { attempt_id: a.attempt.id });
    expect(result.attempt.state).toBe(state);
    expect(result.attempt.cryptographically_signed).toBe(false);
    expect(result.attempt.certificate_verified).toBe(false);
    expect(
      sql(
        `select outcome||':'||cryptographically_signed from clinical.signature_results where attempt_id='${a.attempt.id}';`,
      ),
    ).toBe(`${state}:false`);
    expect(
      sql(
        `select status||':'||version from clinical.documents where id='${d.id}';`,
      ),
    ).toBe("draft:1");
    expect(
      sql(
        `select count(*) from clinical.signature_artifacts where attempt_id='${a.attempt.id}';`,
      ),
    ).toBe("0");
  });
test("confirmação humana, hash, propriedade e habilitação são revalidados", async () => {
  const d = await document();
  const s = await prepare(d);
  const own = (await rpc(owner, "list")).identities[0];
  const theirs = (await rpc(other, "list")).identities[0];
  expect(
    (
      await rpc(owner, "confirm", {
        snapshot_id: s.id,
        identity_id: own.id,
        scenario: "success",
        idempotency_key: randomUUID(),
        hash: s.content_hash,
        confirmed: false,
      })
    ).error,
  ).toBe("confirmation_required");
  expect(
    (await confirm({ ...s, content_hash: "0".repeat(64) }, own.id)).error,
  ).toBe("confirmation_required");
  expect((await confirm(s, theirs.id)).error).toBe("unavailable");
  expect(
    (await rpc(limited, "prepare", { document_id: d.id, version: 1 })).error,
  ).toBe("unavailable");
  sql(
    `update clinical.medical_authors set enabled=false where professional_id='${owner.id}';`,
  );
  try {
    expect((await confirm(s, own.id)).error).toBe("unavailable");
  } finally {
    sql(
      `update clinical.medical_authors set enabled=true where professional_id='${owner.id}';`,
    );
  }
});
test("idempotência e duas abas concorrentes não duplicam despacho", async () => {
  const s = await prepare(await document());
  const i = (await rpc(owner, "list")).identities[0];
  const key = randomUUID();
  const [a, b] = await Promise.all([
    confirm(s, i.id, "delayed", key),
    confirm(s, i.id, "delayed", key),
  ]);
  expect(a.attempt.id).toBe(b.attempt.id);
  const secondPreparation = await rpc(owner, "prepare", {document_id:s.document_id,version:s.version});
  expect((await confirm(secondPreparation.snapshot,i.id,"delayed")).error).toBe("in_progress");

  expect((await confirm(s, i.id, "delayed")).error).toBe("in_progress");
  expect(
    (
      await confirm(
        s,
        (await rpc(owner, "list")).identities[1].id,
        "delayed",
        key,
      )
    ).error,
  ).toBe("conflict");
  await rpc(owner, "cancel", { attempt_id: a.attempt.id });
  expect(
    (await rpc(owner, "status", { attempt_id: a.attempt.id })).attempt.state,
  ).toBe("cancelled");
  expect(
    sql(
      `select count(*) from clinical.signature_attempts where snapshot_id='${s.id}';`,
    ),
  ).toBe("1");
});
test("conteúdo editado invalida autorização preparada e resultado atrasado", async () => {
  const d = await document();
  const s = await prepare(d);
  const identity = (await rpc(owner, "list")).identities[0];
  const a = await confirm(s, identity.id, "delayed");
  const save = await owner.client.rpc("document_save", {
    target: athlete,
    document_id: d.id,
    expected_version: d.version,
    kind: d.kind,
    payload: { ...d.content, notes: "Conteúdo alterado DEMO" },
    intent: "save",
  });
  expect(save.data.version).toBe(2);
  expect((await rpc(owner, "status", { attempt_id: a.attempt.id })).error).toBe(
    "stale",
  );
  expect((await confirm(s, identity.id)).error).toBe("stale");
  expect(
    sql(
      `select state from clinical.signature_attempts where id='${a.attempt.id}';`,
    ),
  ).toBe("stale");
  expect(
    sql(
      `select count(*) from clinical.document_revisions where document_id='${d.id}';`,
    ),
  ).toBe("1");
});
test("desconexão invalida autorização sem ressuscitar tentativa", async () => {
  const s = await prepare(await document());
  const identity = (await rpc(owner, "list")).identities[0];
  const a = await confirm(s, identity.id, "delayed");
  await rpc(owner, "disconnect");
  expect(
    (await rpc(owner, "status", { attempt_id: a.attempt.id })).attempt.state,
  ).toBe("cancelled");
  await rpc(owner, "connect");
  expect(
    (await rpc(owner, "status", { attempt_id: a.attempt.id })).attempt.state,
  ).toBe("cancelled");
});
test("resposta atrasada conclui uma vez e conserva evidências mínimas", async () => {
  const d = await document();
  const s = await prepare(d);
  const identity = (await rpc(owner, "list")).identities[0];
  const a = await confirm(s, identity.id, "delayed");
  expect(
    (await rpc(owner, "status", { attempt_id: a.attempt.id })).attempt.state,
  ).toBe("processing");
  await expect
    .poll(
      async () =>
        (await rpc(owner, "status", { attempt_id: a.attempt.id })).attempt
          .state,
      { timeout: 12000 },
    )
    .toBe("simulated_success");
  expect(
    (await rpc(owner, "cancel", { attempt_id: a.attempt.id })).attempt.state,
  ).toBe("simulated_success");
  const events = sql(
    `select jsonb_agg(safe_metadata)::text from clinical.audit_events where resource_id='${a.attempt.id}';`,
  );
  expect(events).not.toContain("Medicamento");
  expect(events).not.toContain("senha");
  expect(events).toContain('"simulated": true');
  expect(
    sql(
      `select count(*) from clinical.signature_results where attempt_id='${a.attempt.id}';`,
    ),
  ).toBe("1");
});
test("jornada real de interface, recuperação e capturas desktop/mobile", async ({
  page,
}) => {
  test.setTimeout(90000);
  const externalRequests=[];
  await page.route("**/*", route=>{
    const url=new URL(route.request().url());
    if (["http:","https:"].includes(url.protocol)&&!["127.0.0.1","localhost"].includes(url.hostname)) {
      externalRequests.push(url.origin);
      return route.abort();
    }
    return route.continue();
  });

  const d = await document();
  await login(page);
  await page.goto("/perfil");
  await expect(
    page.getByRole("heading", { name: "Meu perfil", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Editar dados profissionais", exact: true })
    .click();
  await page
    .getByLabel("Nome completo", { exact: true })
    .fill("Nome Profissional DEMO");
  await page.getByRole("button", { name: "Salvar dados", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Dados declarados salvos",
  );
  await page.getByRole("button", { name: "Adicionar inscrição" }).click();
  await page
    .getByLabel("Conselho profissional", { exact: true })
    .fill("CRM DEMO");
  await page
    .getByLabel("Número de registro", { exact: true })
    .fill("FICTICIO-UI");
  await page.getByLabel("UF ou região", { exact: true }).fill("SP");
  await page.getByRole("button", { name: "Salvar inscrição" }).click();
  await expect(
    page.getByText("Declarado — não verificado", { exact: true }),
  ).toBeVisible();
  await page.getByText("Atualizar fotografia", { exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "avatar-demo.png",
    mimeType: "image/png",
    buffer: await sharp({
      create: { width: 96, height: 96, channels: 4, background: "#102849" },
    })
      .png()
      .toBuffer(),
  });
  await page
    .getByRole("button", { name: "Salvar fotografia", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Fotografia atualizada.");
  await expect(page.getByAltText("Sua fotografia profissional")).toBeVisible();

  await page.getByText("Atualizar fotografia", { exact: true }).click();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: `${shots}/perfil-${width}.png`,
      fullPage: true,
    });
  }
  await page.goto(`/atletas/${athlete}/documentos/${d.id}`);
  await page.getByRole("link", { name: "Revisar assinatura digital" }).click();
  await expect(page.getByText("Revisar conteúdo integral salvo")).toBeVisible();
  await page
    .getByRole("button", { name: "Preparar versão demonstrativa" })
    .click();
  await expect(page.getByText("Hash SHA-256 do conteúdo exato")).toBeVisible();
  await page
    .getByLabel("Identidade para este documento")
    .selectOption(
      (await rpc(owner, "list")).identities.find(
        (i) => i.label === "Identidade DEMO B",
      ).id,
    );
  await page.getByLabel("Revisei o conteúdo integral").check();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const result = await page.evaluate(async () =>
      (
        await window.axe.run(document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
          },
        })
      ).violations.map((x) => ({
        id: x.id,
        target: x.nodes.map((n) => n.target),
      })),
    );
    expect(result).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: `${shots}/preparacao-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: "Confirmar e autorizar simulação" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Simulação concluída", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  const url = page.url();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Simulação concluída", exact: true }),
  ).toBeVisible();
  expect(page.url()).toBe(url);
  await page.goto(`/atletas/${athlete}/documentos/${d.id}/assinatura`);
  await page
    .getByRole("link", { name: /Simulação concluída · Versão/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Simulação concluída", exact: true }),
  ).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: `${shots}/resultado-${width}.png`,
      fullPage: true,
    });
  }
  const operational = await page.request.post("http://127.0.0.1:3101/api/signing", {
    headers: { Origin: "http://127.0.0.1:3101" },
    data: { action: "connect", payload: { CBB_SIGNING_MODE: "demo", demo_enabled: true } },
  });
  expect(operational.status()).toBe(409);
  expect((await operational.json()).error).toBe("unavailable");
  const forbidden = await page.request.post("/api/signing", {
    headers: { Origin: "https://untrusted.invalid" },
    data: { action: "connect", payload: {} },
  });
  expect(forbidden.status()).toBe(403);
  const unsigned = await page.request.post("/api/signing", {
    headers: { Origin: new URL(page.url()).origin },
    data: { action: "mark_signed", payload: { signed: true } },
  });
  expect(unsigned.status()).toBe(400);
  expect(
    (
      await page.request.post("/api/signing/callback", {
        data: { signed: true },
      })
    ).status(),
  ).toBe(404);
  expect(externalRequests).toEqual([]);
});
test("preparação expirada e revogação do vínculo impedem confirmação", async () => {
  const d = await document();
  const s = await prepare(d);
  const expired = randomUUID();
  sql(
    `insert into clinical.signature_snapshots(id,professional_id,document_id,version,canonical_bytes,content_hash,expires_at) select '${expired}',professional_id,document_id,version,canonical_bytes,content_hash,clock_timestamp()-interval '1 second' from clinical.signature_snapshots where id='${s.id}';`,
  );
  const i = (await rpc(owner, "list")).identities[0];
  expect((await confirm({ ...s, id: expired }, i.id)).error).toBe("expired");
  sql(
    `update clinical.athlete_access set can_read_records=false where athlete_id='${athlete}' and professional_id='${owner.id}';`,
  );
  try {
    expect((await confirm(s, i.id)).error).toBe("unavailable");
  } finally {
    sql(
      `update clinical.athlete_access set can_read_records=true where athlete_id='${athlete}' and professional_id='${owner.id}';`,
    );
  }
});
for (const kind of ["surgical_order", "exam_request"])
  test(`jornada preserva editor e snapshot de ${kind}`, async () => {
    const d = await document(owner, kind);
    const s = await prepare(d);
    expect(s.material.document_type).toBe(kind);
    expect(s.material.content).toEqual(d.content);
  });
