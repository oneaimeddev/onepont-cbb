import { test, expect } from "./fixtures.mjs";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import {
  workflowFixture,
  workflowSql as sql,
} from "./helpers/workflow-fixtures.mjs";

// The operational test server enables the composer with an offline key. All
// document requests below use the bounded backend adapter, never a paid model.
let f;
test.beforeAll(async () => {
  f = await workflowFixture();
});
test.afterAll(async () => {
  await f?.cleanup();
});
async function login(page, user = f.owner) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
}
async function seed(kind) {
  const session = (await f.rpc("conversation_start", {})).session.id;
  await f.rpc("conversation_set_context", { context_athlete: f.athlete });
  const r = await f.prepare(kind),
    id = r.document_id;
  const content = r.material.content;
  if (content.items)
    content.items = [1, 2, 3].map((n) => ({
      ...content.items[0],
      id: randomUUID(),
      name: `${kind === "prescription" ? "Medicamento" : "Exame"} DEMO ${n}`,
    }));
  const registered = await f.rpc("clinical_document_proposal_register", {
    target: f.athlete,
    request_id: id,
    kind,
    payload: content,
  });
  expect(registered.ok).toBe(true);
  const document = {
    requestId: id,
    athleteId: f.athlete,
    kind,
    state: "proposal",
    version: registered.version,
    contentHash: registered.contentHash,
  };
  expect(
    (
      await f.rpc("conversation_save", {
        target: session,
        context_athlete: f.athlete,
        transcript: [
          {
            id: `pending-${kind}`,
            role: "assistant",
            text: "Proposta fictícia para revisão DEMO",
            document,
          },
        ],
      })
    ).ok,
  ).toBe(true);
  return { document, content, session };
}
function scope(p) {
  return {
    requestId: p.requestId,
    athleteId: p.athleteId,
    kind: p.kind,
    version: p.version,
    contentHash: p.contentHash,
  };
}
async function request(page, seeded, message, overrides = {}) {
  const response = await page.request.post("/api/inteligencia", {
    headers: { Origin: "http://127.0.0.1:3101" },
    data: {
      messages: [{ role: "user", content: message }],
      contextAthleteId: f.athlete,
      inputMode: "text",
      displayedProposals: [scope(seeded.document)],
      messageId: randomUUID(),
      ...overrides,
    },
  });
  expect(response.status(), (await response.text()).slice(0, 200)).toBe(200);
  const line = (await response.text())
    .split("\n")
    .find((s) => s.startsWith("data: "));
  return JSON.parse(line.slice(6));
}
for (const [kind, message, field] of [
  [
    "prescription",
    "Altere a dose do segundo medicamento para Grafia EXATA DEMO µg/mL",
    "dose",
  ],
  [
    "exam_request",
    "Altere a observação do segundo exame para Grafia EXATA DEMO µg/mL",
    "notes",
  ],
  [
    "surgical_order",
    "Altere a justificativa do pedido cirúrgico para Grafia EXATA DEMO µg/mL",
    "justification",
  ],
])
  test(`HTTP ${kind}: exact sparse change, recovery and stale refusal without provider`, async ({
    page,
  }) => {
    await login(page);
    const x = await seed(kind);
    const r = await request(page, x, message);
    expect(r.document.requestId).toBe(x.document.requestId);
    const content = r.document.content;
    expect(content.items ? content.items[1][field] : content[field]).toBe(
      "Grafia EXATA DEMO µg/mL",
    );
    if (content.items) {
      expect(content.items[0]).toEqual(x.content.items[0]);
      expect(content.items[2]).toEqual(x.content.items[2]);
      expect(content.items[1].id).toBe(x.content.items[1].id);
    }
    expect(r.document.version).toBe(2);
    expect(r.document.preview.content).toEqual(content);
    const stale = await request(page, x, message);
    expect(stale.text).toContain("mudou desde");
    expect(stale.document.version).toBe(2);
    expect(
      sql(
        `select version from clinical.document_proposals where request_id='${x.document.requestId}'`,
      ),
    ).toBe("2");
  });
test("HTTP ambiguous item, dirty editor and foreign references do not mutate", async ({
  page,
}) => {
  await login(page);
  const x = await seed("prescription");
  expect((await request(page, x, "Altere a dose para DEMO")).text).toContain(
    "Qual item",
  );
  expect(
    (
      await request(page, x, "Altere a dose do segundo medicamento para DEMO", {
        displayedProposals: [{ ...scope(x.document), dirty: true }],
      })
    ).text,
  ).toContain("alterações locais");
  expect(
    (
      await request(page, x, "Altere a dose do segundo medicamento para DEMO", {
        inputMode: "voice",
      })
    ).text,
  ).toContain("por texto");
  await login(page, f.other);
  await f.rpc("conversation_start", {}, f.other);
  await f.rpc(
    "conversation_set_context",
    { context_athlete: f.athlete },
    f.other,
  );
  expect(
    (await request(page, x, "Altere a dose do segundo medicamento para DEMO"))
      .document,
  ).toBeNull();
  expect(
    sql(
      `select version from clinical.document_proposals where request_id='${x.document.requestId}'`,
    ),
  ).toBe("1");
});
test("desktop: one card updates, shared review saves, reload recovers exact persisted source", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const x = await seed("prescription");
  await page.goto(`/?atleta=${f.athlete}`);
  const card = page.locator(".ia-draft");
  await expect(card).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "Mensagem", exact: true })
    .fill("Altere a dose do segundo medicamento para Grafia EXATA DEMO µg/mL");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(
    card.getByText("Dose: Grafia EXATA DEMO µg/mL", { exact: true }),
  ).toBeVisible();
  await expect(card).toHaveCount(1);
  await expect(
    card.getByRole("article", { name: "Pré-visualização do rascunho" }),
  ).toBeVisible();
  mkdirSync("docs/visual/handoff-007-10-6b-3", { recursive: true });
  await card
    .getByText("Dose: Grafia EXATA DEMO µg/mL", { exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    card.getByText("Dose: Grafia EXATA DEMO µg/mL", { exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: "docs/visual/handoff-007-10-6b-3/document-chat-desktop.png",
  });
  await card
    .getByRole("button", { name: "Confirmar e salvar", exact: true })
    .click();
  await expect(card.getByText("Rascunho salvo", { exact: true })).toBeVisible();
  expect(
    sql(
      `select count(*) from clinical.documents where id='${x.document.requestId}'`,
    ),
  ).toBe("1");
  await page.reload();
  await expect(page.locator(".ia-draft")).toHaveCount(1);
  await expect(
    card.getByText("Dose: Grafia EXATA DEMO µg/mL", { exact: true }),
  ).toBeVisible();
  await expect(card.getByText("Rascunho salvo", { exact: true })).toBeVisible();
  const thin = JSON.parse(
    sql(
      `select document from clinical.conversation_messages where session_id='${x.session}' and document is not null limit 1`,
    ),
  );
  expect(thin.content).toBeUndefined();
});
test("mobile: exam review stays in the chat without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await seed("exam_request");
  await page.goto(`/?atleta=${f.athlete}`);
  await page
    .getByRole("textbox", { name: "Mensagem", exact: true })
    .fill("Altere a observação do segundo exame para Orientação EXATA DEMO");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  const card = page.locator(".ia-draft");
  await expect(
    card.getByText("Observações: Orientação EXATA DEMO", { exact: true }),
  ).toBeVisible();
  await expect(card).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  mkdirSync("docs/visual/handoff-007-10-6b-3", { recursive: true });
  await card
    .getByText("Observações: Orientação EXATA DEMO", { exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    card.getByText("Observações: Orientação EXATA DEMO", { exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: "docs/visual/handoff-007-10-6b-3/document-chat-mobile.png",
  });
});
