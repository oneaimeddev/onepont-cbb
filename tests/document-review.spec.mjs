import { cleanupWorkflow } from "./helpers/workflow-fixtures.mjs";
import { test, expect } from "./fixtures.mjs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { localSupabase } from "../scripts/local-supabase.mjs";
const require = createRequire(import.meta.url);
const admin = createClient(localSupabase.url, localSupabase.adminKey, {
  auth: { persistSession: false },
});
const users = [];
const adult = randomUUID(),
  minor = randomUUID(),
  absent = randomUUID(),
  minorAbsent = randomUUID();
const athletes = [adult, minor, absent, minorAbsent];
const shots = "docs/visual/handoff-007-10-6b-1";
let owner, other, limited, readonly, priorGate, priorDeliveryPolicy;
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
    { input: s, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}
async function account(name, medical, edit = true) {
  const email = `review-${randomUUID()}@example.com`,
    password = randomUUID();
  const r = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (r.error) throw r.error;
  const id = r.data.user.id;
  users.push(id);
  const pr = await admin
    .from("profiles")
    .insert({
      id,
      display_name: name,
      profession: medical ? "Medicina DEMO" : "Psicologia DEMO",
    });
  if (pr.error) throw pr.error;
  const client = createClient(localSupabase.url, localSupabase.publishableKey, {
    auth: { persistSession: false },
  });
  await client.auth.signInWithPassword({ email, password });
  return { id, email, password, client, medical, edit };
}
const kinds = ["prescription", "surgical_order", "exam_request"];
const slugs = {
  prescription: "prescricao",
  surgical_order: "cirurgia",
  exam_request: "exames",
};
function content(kind) {
  return kind === "prescription"
    ? {
        notes: "Orientação fictícia preservada",
        items: [
          {
            id: randomUUID(),
            name: "Medicamento REVISÃO DEMO",
            presentation: "Apresentação DEMO",
            dose: "2",
            dose_unit: "mg",
            route: "Oral",
            schedule: "Posologia fictícia — revisar",
            duration: "DEMO",
            quantity: "1",
            instructions: "Não utilizar clinicamente",
          },
        ],
      }
    : kind === "surgical_order"
      ? {
          procedure: "Procedimento REVISÃO DEMO",
          region: "Joelho",
          laterality: "left",
          indication: "Indicação DEMO",
          diagnosis: "Hipótese DEMO",
          justification: "Justificativa fictícia preservada",
          priority: "elective",
          materials: "Materiais DEMO",
          additional: "Orientações DEMO",
        }
      : {
          occurred_at: "2026-11-20",
          items: [
            {
              id: randomUUID(),
              name: "Exame REVISÃO DEMO",
              exam_type: "laboratory",
              region: "Região DEMO",
              laterality: "not_applicable",
              technical_details: "Detalhes DEMO",
              notes: "Observações DEMO",
            },
          ],
          indication: "Indicação DEMO",
          justification: "Justificativa fictícia preservada",
          diagnosis: "Hipótese DEMO",
          priority: "elective",
          additional: "Orientações DEMO",
        };
}
async function rpc(action, payload, u = owner) {
  const r = await u.client.rpc("document_review_command", { action, payload });
  expect(r.error).toBeNull();
  return r.data;
}
async function open(kind = "prescription", options = {}, u = owner) {
  return rpc(
    "open",
    {
      athlete_id: adult,
      document_id: randomUUID(),
      version: 0,
      kind,
      content: content(kind),
      idempotency_key: randomUUID(),
      ...options,
    },
    u,
  );
}
async function identities(u = owner) {
  return (
    await u.client.rpc("signing_demo_command", {
      action: "connect",
      payload: {},
    })
  ).data.identities;
}
async function sign(rv, extra = {}, u = owner) {
  return rpc(
    "sign",
    {
      review_id: rv.id,
      review_hash: rv.content_hash,
      identity_id: (
        await u.client.rpc("signing_demo_command", {
          action: "list",
          payload: {},
        })
      ).data.identities?.[0]?.id,
      idempotency_key: randomUUID(),
      scenario: "success",
      confirmed: true,
      delivery_requested: false,
      ...extra,
    },
    u,
  );
}
async function login(page, u = owner) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(u.email);
  await page.getByLabel("Senha", { exact: true }).fill(u.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
}
async function screenshot(page, name, width = 1440) {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: `${shots}/${name}-${width}.png`,
    fullPage: true,
  });
}
async function fields(page, kind, suffix = "") {
  if (kind === "prescription") {
    await page
      .getByLabel("Nome do medicamento", { exact: true })
      .fill("Medicamento REVISÃO DEMO" + suffix);
    await page
      .getByLabel("Observações gerais")
      .fill("Orientação não salva DEMO");
    await page.getByLabel("Apresentação ou concentração").fill("Comprimido DEMO");
    await page.getByLabel("Dose",{exact:true}).fill("1");
    await page.getByLabel("Unidade",{exact:true}).fill("mg");
    await page.getByLabel("Via de administração").fill("Oral");
    await page.getByLabel("Frequência").fill("Posologia fictícia sob revisão");
    await page.getByLabel("Duração").fill("DEMO");
    await page.getByLabel("Quantidade").fill("1");
    await page.getByLabel("Instruções complementares").fill("Demonstração: não utilizar clinicamente.");

  } else if (kind === "surgical_order") {
    await page
      .getByLabel("Procedimento proposto", { exact: true })
      .fill("Procedimento REVISÃO DEMO" + suffix);
    await page
      .getByLabel("Justificativa médica")
      .fill("Justificativa não salva DEMO");
  } else {
    await page
      .getByLabel("Nome do exame", { exact: true })
      .fill("Exame REVISÃO DEMO" + suffix);
    await page.getByLabel("Justificativa").fill("Justificativa não salva DEMO");
  }
}
async function consent(page, label = "Identidade DEMO A") {
  const id = (
    await owner.client.rpc("signing_demo_command", {
      action: "list",
      payload: {},
    })
  ).data.identities.find((i) => i.label === label).id;
  await page
    .getByRole("combobox", {
      name: "Identidade para este documento",
      exact: true,
    })
    .selectOption(id);
  await page.getByLabel("Revisei este conteúdo").check();
}
test.beforeAll(async () => {
  priorGate = sql("select demo_enabled from clinical.signing_environment");
  priorDeliveryPolicy = sql("select fixture_policy_enabled from clinical.document_delivery_environment");
  await admin.rpc("configure_document_delivery_demo", { enabled: false });
  await admin.rpc("configure_signing_demo", { enabled: true });
  owner = await account("Profissional Revisão DEMO", true);
  other = await account("Outro Profissional Revisão DEMO", true);
  limited = await account("Sem Autoria DEMO", false, false);
  readonly = await account("Médico Sem Cadastro DEMO", true, false);
  sql(
    `insert into clinical.athletes(id,full_name,birth_date,source) values('${adult}','Atleta Adulto Revisão DEMO','1995-01-01','demo'),('${minor}','Atleta Menor Revisão DEMO','2012-08-01','demo'),('${absent}','Atleta Sem Contato DEMO','1990-01-01','demo'),('${minorAbsent}','Atleta Menor Sem Responsável DEMO','2015-01-01','demo');insert into clinical.athlete_contacts(athlete_id,phone,guardian_name,guardian_relation,guardian_contact) values('${adult}','11999990001',null,null,null),('${minor}','11999990002','Responsável Fictício DEMO','Responsável legal declarado','11988880003');insert into clinical.athlete_access(athlete_id,professional_id,can_read_records,can_edit) values ${[owner, other, limited, readonly].flatMap((u) => athletes.map((a) => `('${a}','${u.id}',true,${u.edit})`)).join(",")};insert into clinical.medical_authors(professional_id,enabled) values('${owner.id}',true),('${other.id}',true),('${readonly.id}',true);`,
  );
  await identities(owner);
  await identities(other);
  mkdirSync(shots, { recursive: true });
});
test.afterAll(async () => {
  if (users.length) {
    const ids = users.map((x) => `'${x}'`).join(",");
    cleanupWorkflow(sql, users);
    sql(
      `delete from clinical.signature_demo_delivery_intents where professional_id in(${ids});delete from clinical.document_reviews where professional_id in(${ids});delete from clinical.signature_results where attempt_id in(select id from clinical.signature_attempts where professional_id in(${ids}));delete from clinical.signature_transitions where professional_id in(${ids});delete from clinical.signature_attempts where professional_id in(${ids});delete from clinical.signature_snapshots where professional_id in(${ids});delete from clinical.signature_preferences where professional_id in(${ids});delete from clinical.signing_identities where professional_id in(${ids});delete from clinical.signature_connections where professional_id in(${ids});delete from clinical.athletes where id in(${athletes.map((x) => `'${x}'`).join(",")});delete from clinical.medical_authors where professional_id in(${ids});`,
    );
    for (const id of users) await admin.auth.admin.deleteUser(id);
  }
  await admin.rpc("configure_signing_demo", { enabled: priorGate === "t" });
  await admin.rpc("configure_document_delivery_demo", { enabled: priorDeliveryPolicy === "t" });
});
for (const kind of kinds)
  test(`revisão ${kind} não persiste documento nem inicia assinatura; salvar é idempotente`, async () => {
    const did = randomUUID(),
      key = randomUUID(),
      c = content(kind);
    const first = await open(kind, {
      document_id: did,
      content: c,
      idempotency_key: key,
    });
    expect(first.error).toBeUndefined();
    const again = await open(kind, {
      document_id: did,
      content: c,
      idempotency_key: key,
    });
    expect(again.review.id).toBe(first.review.id);
    expect(first.review.material.content).toEqual(c);
    expect(
      sql(`select count(*) from clinical.documents where id='${did}'`),
    ).toBe("0");
    expect(
      sql(
        `select count(*) from clinical.signature_snapshots where document_id='${did}'`,
      ),
    ).toBe("0");
    const saved = await rpc("save", { review_id: first.review.id });
    expect(saved.review.saved_version).toBe(1);
    expect(
      (await rpc("save", { review_id: first.review.id })).review.saved_version,
    ).toBe(1);
    expect(
      sql(
        `select count(*) from clinical.document_revisions where document_id='${did}'`,
      ),
    ).toBe("0");
    expect(saved.attempt).toBeNull();
  });
for (const kind of kinds)
  test(`editor ${kind}: revisar sem salvar, voltar, modificar e salvar sem assinar`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await login(page);
    const did = randomUUID();
    await page.goto(
      `/atletas/${adult}/documentos/nova?tipo=${slugs[kind]}&documento=${did}`,
    );
    await fields(page, kind);
    await screenshot(page, `editor-${kind}`, 1440);
    await page
      .getByRole("button", { name: "Revisar e assinar", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Revisar documento", exact: true }),
    ).toBeFocused();
    expect(
      sql(`select count(*) from clinical.documents where id='${did}'`),
    ).toBe("0");
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      expect(
        await page.evaluate(async () =>
          (
            await window.axe.run(document, {
              runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
              },
            })
          ).violations.map((x) => ({
            id: x.id,
            nodes: x.nodes.map((n) => n.target),
          })),
        ),
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await screenshot(page, `revisao-${kind}`, width);
    }
    await page
      .getByRole("button", { name: "Voltar e editar", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Revisar e assinar", exact: true }),
    ).toBeFocused();
    await fields(page, kind, " ALTERADO");
    await page
      .getByRole("button", { name: "Revisar e assinar", exact: true })
      .click();
    await expect(page.locator(".document-sheet")).toContainText("ALTERADO");
    await page
      .getByRole("button", { name: "Salvar sem assinar", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Documento salvo sem assinatura.",
    );
    await screenshot(page, `salvo-sem-assinar-${kind}`, 390);
    await page.getByRole("link", { name: "Voltar ao documento salvo" }).click();
    await expect(
      page.getByRole("button", { name: "Revisar e assinar", exact: true }),
    ).toBeVisible();
    expect(sql(`select status from clinical.documents where id='${did}'`)).toBe(
      "draft",
    );
    expect(
      sql(
        `select count(*) from clinical.signature_snapshots where document_id='${did}'`,
      ),
    ).toBe("0");
  });
test("validação e falha de persistência preservam preenchimento e identificador", async ({
  page,
}) => {
  await login(page);
  const did = randomUUID();
  await page.goto(
    `/atletas/${adult}/documentos/nova?tipo=prescricao&documento=${did}`,
  );
  await page.getByLabel("Observações gerais").fill("PRESERVAR DEMO");
  await page
    .getByRole("button", { name: "Revisar e assinar", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "campos essenciais",
  );
  await expect(page.getByLabel("Observações gerais")).toHaveValue(
    "PRESERVAR DEMO",
  );
  await screenshot(page, "erro-validacao", 390);
  await fields(page, "prescription");
  let failed = false;
  await page.route("**/api/documents/review", async (route) => {
    if (!failed && route.request().postDataJSON().action === "draft") {
      failed = true;
      return route.fulfill({ status: 503, json: { error: "unavailable" } });
    }
    return route.continue();
  });
  await page
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "preservado",
  );
  await expect(
    page.getByLabel("Nome do medicamento", { exact: true }),
  ).toHaveValue("Medicamento REVISÃO DEMO");
  await screenshot(page, "erro-persistencia", 1440);
  await page
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  await page.waitForURL(new RegExp(`/documentos/${did}`));
  expect(sql(`select count(*) from clinical.documents where id='${did}'`)).toBe(
    "1",
  );
});
test("revisão de alterações não salvas preserva histórico, autoria e detecta versão obsoleta", async () => {
  const opened = await open();
  await rpc("save", { review_id: opened.review.id });
  const did = opened.review.document_id,
    c = content("prescription");
  const changed = await open("prescription", {
    document_id: did,
    version: 1,
    content: c,
  });
  expect(changed.review.material.version).toBe(2);
  expect(
    sql(
      `select count(*) from clinical.document_revisions where document_id='${did}'`,
    ),
  ).toBe("0");
  await rpc("save", { review_id: changed.review.id });
  expect(
    sql(
      `select count(*) from clinical.document_revisions where document_id='${did}'`,
    ),
  ).toBe("1");
  const stale = await open("prescription", { document_id: did, version: 1 });
  expect(stale.error).toBe("stale");
  const current = await open("prescription", {
    document_id: did,
    version: 2,
    content: c,
  });
  await owner.client.rpc("document_save", {
    target: adult,
    document_id: did,
    expected_version: 2,
    kind: "prescription",
    payload: { ...c, notes: "ALTERAÇÃO CONCORRENTE" },
    intent: "save",
  });
  expect((await sign(current.review)).error).toBe("stale");
  expect(
    sql(
      `select count(*) from clinical.signature_snapshots where document_id='${did}'`,
    ),
  ).toBe("0");
});
test("certificado alheio e falta de autorização não deixam persistência parcial", async () => {
  const rv = (await open()).review;
  expect((await rpc("get", { review_id: rv.id }, other)).error).toBe(
    "unavailable",
  );
  expect((await open("prescription", {}, limited)).error).toBe("unavailable");
  const foreign = (await identities(other))[0];
  expect((await sign(rv, { identity_id: foreign.id })).error).toBe(
    "unavailable",
  );
  expect(
    sql(`select count(*) from clinical.documents where id='${rv.document_id}'`),
  ).toBe("0");
  expect(
    sql(
      `select count(*) from clinical.signature_snapshots where document_id='${rv.document_id}'`,
    ),
  ).toBe("0");
  await admin.rpc("configure_signing_demo", { enabled: false });
  try {
    expect((await sign(rv)).error).toBe("unavailable");
    expect(
      sql(
        `select count(*) from clinical.documents where id='${rv.document_id}'`,
      ),
    ).toBe("0");
  } finally {
    await admin.rpc("configure_signing_demo", { enabled: true });
  }
});
test("seleção é explícita, preferência é indicação e retorno preserva seleção sem consentimento antigo", async ({
  page,
}) => {
  const inv = await identities(owner);
  await owner.client.rpc("signing_demo_command", {
    action: "prefer",
    payload: { identity_id: inv[1].id },
  });
  await login(page);
  await page.goto(
    `/atletas/${adult}/documentos/nova?tipo=prescricao&documento=${randomUUID()}`,
  );
  await fields(page, "prescription");
  await page
    .getByRole("button", { name: "Revisar e assinar", exact: true })
    .click();
  const select = page.getByRole("combobox", {
    name: "Identidade para este documento",
    exact: true,
  });
  await expect(select).toHaveValue("");
  await expect(select.locator("option:checked")).toHaveText(
    "Selecione explicitamente",
  );
  expect(await select.locator("option").allTextContents()).toContain(
    "Identidade DEMO B — Simulador CBB (preferencial) — fictícia",
  );
  await select.selectOption(inv[0].id);
  await page.getByLabel("Revisei este conteúdo").check();
  await select.selectOption(inv[1].id);
  await expect(page.getByLabel("Revisei este conteúdo")).not.toBeChecked();
  await page
    .getByRole("button", { name: "Voltar e editar", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Revisar e assinar", exact: true })
    .click();
  await expect(select).toHaveValue(inv[1].id);
  await expect(page.getByLabel("Revisei este conteúdo")).not.toBeChecked();
  await page.getByLabel("Enviar ao atleta por WhatsApp").check();
  await expect(page.locator(".document-recipient")).toContainText("•••• 0001");
  await expect(page.locator(".document-recipient")).not.toContainText(
    "11999990001",
  );
  await screenshot(page, "identidade-envio-demonstrativo", 1440);
});
test("simulação com intenção, resposta perdida e repetição são idempotentes sem egress", async ({
  page,
}) => {
  test.setTimeout(60000);
  await login(page);
  let failed = false;
  const external = [];
  await page.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (
      ["http:", "https:"].includes(u.protocol) &&
      !["localhost", "127.0.0.1"].includes(u.hostname)
    ) {
      external.push(u.origin);
      return route.abort();
    }
    if (
      u.pathname === "/api/documents/review" &&
      route.request().postDataJSON().action === "sign" &&
      !failed
    ) {
      failed = true;
      await route.fetch();
      return route.fulfill({ status: 503, json: { error: "unavailable" } });
    }
    return route.continue();
  });
  const did = randomUUID();
  await page.goto(
    `/atletas/${adult}/documentos/nova?tipo=prescricao&documento=${did}`,
  );
  await fields(page, "prescription");
  await page
    .getByRole("button", { name: "Revisar e assinar", exact: true })
    .click();
  await expect(
    page.getByLabel("Enviar ao atleta por WhatsApp"),
  ).not.toBeChecked();
  await page.getByLabel("Enviar ao atleta por WhatsApp").check();
  await consent(page);
  await page
    .getByRole("button", { name: "Simular assinatura", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "preservado",
  );
  await screenshot(page, "erro-resposta-perdida", 390);
  await page
    .getByRole("button", { name: "Simular assinatura", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Documento finalizado", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    page.getByRole("heading", { name: "Entrega bloqueada",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    sql(
      `select count(*) from clinical.signature_attempts a join clinical.signature_snapshots s on s.id=a.snapshot_id where s.document_id='${did}'`,
    ),
  ).toBe("1");
  expect(
    sql(
      `select count(*) from clinical.signature_snapshots where document_id='${did}'`,
    ),
  ).toBe("1");
  expect(
    sql(
      `select provenance||':'||eligible_for_real||':'||state from clinical.signature_demo_delivery_intents where professional_id='${owner.id}' and review_id in(select id from clinical.document_reviews where document_id='${did}')`,
    ),
  ).toBe("demo:false:demo_intent_no_send");
  expect(
    sql(
      `select count(*) from clinical.document_revisions where document_id='${did}'`,
    ),
  ).toBe("0");
  expect(external).toEqual([]);
  for (const w of [1440, 390, 320])
    await screenshot(page, "resultado-envio-indisponivel", w);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Entrega bloqueada",
      exact: true,
    }),
  ).toBeVisible();
});
for (const [target, label] of [
  [absent, "Contato ausente"],
  [minor, "menor de idade"],
  [minorAbsent, "Responsável e contato ausentes"],
])
  test(`destinatário demonstrativo: ${label}`, async ({ page }) => {
    await login(page);
    await page.goto(
      `/atletas/${target}/documentos/nova?tipo=exames&documento=${randomUUID()}`,
    );
    await fields(page, "exam_request");
    await page
      .getByRole("button", { name: "Revisar e assinar", exact: true })
      .click();
    await page.getByLabel("Enviar ao atleta por WhatsApp").check();
    await expect(page.locator(".document-recipient")).toContainText(label);
    await expect(page.locator(".document-recipient")).toContainText(
      "Nenhuma autorização elegível",
    );
    if (target === minor) {
      await expect(page.locator(".document-recipient")).toContainText(
        "Responsável Fictício DEMO",
      );
      await expect(page.locator(".document-recipient")).toContainText(
        "•••• 0003",
      );
    }
    await screenshot(
      page,
      `destinatario-${target === minor ? "menor" : target === minorAbsent ? "menor-sem-responsavel" : "ausente"}`,
      390,
    );
  });
test("contato cadastral restrito não expõe metadados e entrega nunca altera assinatura", async () => {
  const r = await open("prescription", {}, readonly);
  expect(r.review.recipient.name).toBeNull();
  expect(r.review.recipient.phone_masked).toBeNull();
  const own = await open();
  const signed = await sign(own.review, { delivery_requested: true });
  expect(signed.delivery.eligible_for_real).toBe(false);
  const aid = signed.attempt.id;
  await owner.client.rpc("signing_demo_command", {
    action: "status",
    payload: { attempt_id: aid },
  });
  expect(
    (await owner.client.rpc("document_demo_delivery", { attempt: aid })).data
      .state,
  ).toBe("demo_intent_no_send");
  expect(
    (await other.client.rpc("document_demo_delivery", { attempt: aid })).data
      .error,
  ).toBe("unavailable");
  expect(() =>
    sql(
      `update clinical.signature_demo_delivery_intents set state='sent',eligible_for_real=true where attempt_id='${aid}'`,
    ),
  ).toThrow();
  expect(
    sql(
      `select state||':'||cryptographically_signed from clinical.signature_attempts where id='${aid}'`,
    ),
  ).toBe("simulated_success:false");
});
test("confirmação obrigatória e duas chamadas concorrentes reutilizam a tentativa", async () => {
  const r = (await open()).review;
  expect((await sign(r, { confirmed: false })).error).toBe(
    "confirmation_required",
  );
  const id = (await identities())[0].id,
    key = randomUUID(),
    payload = { identity_id: id, idempotency_key: key, scenario: "delayed" };
  const [a, b] = await Promise.all([sign(r, payload), sign(r, payload)]);
  expect(a.attempt.id).toBe(b.attempt.id);
  expect(
    (await sign(r, { ...payload, idempotency_key: randomUUID() })).error,
  ).toBe("conflict");
  await owner.client.rpc("signing_demo_command", {
    action: "cancel",
    payload: { attempt_id: a.attempt.id },
  });
});
test("modo operacional permite revisão e salvamento, mas bloqueia simulação e envio", async ({
  page,
}) => {
  await login(page);
  const rv = (await open()).review;
  const base = "http://127.0.0.1:3101";
  const headers = { Origin: base };
  const result = await page.request.post(base + "/api/documents/review", {
    headers,
    data: { action: "get", payload: { review_id: rv.id } },
  });
  expect(result.ok()).toBe(true);
  expect((await result.json()).demo_enabled).toBe(false);
  const fail = await page.request.post(base + "/api/documents/review", {
    headers,
    data: {
      action: "sign",
      payload: { review_id: rv.id, confirmed: true, delivery_requested: true },
    },
  });
  expect(fail.status()).toBe(409);
  expect(
    sql(`select count(*) from clinical.documents where id='${rv.document_id}'`),
  ).toBe("0");
});

for (const scenario of ["denied","expired","failed"]) test(`orquestração ${scenario} mantém rascunho e resultado independentes`,async()=>{
 const rv=(await open()).review;
 const result=await sign(rv,{scenario,delivery_requested:true});
 expect(result.error).toBeUndefined();
 const final=await owner.client.rpc("signing_demo_command",{action:"status",payload:{attempt_id:result.attempt.id}});
 expect(final.data.attempt.state).toBe(scenario);
 expect(final.data.attempt.cryptographically_signed).toBe(false);
 expect(sql(`select status||':'||version from clinical.documents where id='${rv.document_id}'`)).toBe("draft:1");
 expect((await owner.client.rpc("document_demo_delivery",{attempt:result.attempt.id})).data.state).toBe("demo_intent_no_send");
});

test("revogação cadastral oculta destinatário de uma revisão já existente",async()=>{
 const rv=(await open()).review;
 expect(rv.recipient.phone_masked).toBe("•••• 0001");
 sql(`update clinical.athlete_access set can_edit=false where athlete_id='${adult}' and professional_id='${owner.id}'`);
 try {
  const loaded=await rpc("get",{review_id:rv.id});
  expect(loaded.review.recipient.name).toBeNull();
  expect(loaded.review.recipient.phone_masked).toBeNull();
  expect((await sign(rv,{delivery_requested:true})).error).toBe("stale");
  expect(sql(`select count(*) from clinical.documents where id='${rv.document_id}'`)).toBe("0");
 } finally {sql(`update clinical.athlete_access set can_edit=true where athlete_id='${adult}' and professional_id='${owner.id}'`);}
});

test("nome do atleta e identificação revisados coincidem com o snapshot",async()=>{
 sql(`update clinical.athletes set social_name='Nome Social DEMO' where id='${adult}'`);
 try {
  const rv=(await open()).review;
  const result=await sign(rv);
  expect(result.error).toBeUndefined();
  expect(result.snapshot.material.athlete_name).toBe(rv.material.athlete_name);
  expect(result.snapshot.material.author_name).toBe(rv.material.author_name);
  expect(result.snapshot.material.credential_label).toBe(rv.material.credential_label);
  expect(result.snapshot.material.content).toEqual(rv.material.content);
 } finally {sql(`update clinical.athletes set social_name=null where id='${adult}'`);}
});
