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
async function seed(kind, itemCount = 3) {
  const session = (await f.rpc("conversation_start", {})).session.id;
  await f.rpc("conversation_set_context", { context_athlete: f.athlete });
  const r = await f.prepare(kind),
    id = r.document_id;
  const content = r.material.content;
  if (content.items)
    content.items = Array.from({ length: itemCount }, (_, index) => index + 1).map((n) => ({
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
test("ditado de receita usa o atleta em contexto e preserva somente os dados falados", async ({ page }) => {
  const dictation = await workflowFixture();
  try {
    await login(page, dictation.owner);
    const session = (await dictation.rpc("conversation_start", {})).session.id;
    await dictation.rpc("conversation_set_context", { context_athlete: dictation.athlete });
    const send = (text, options = {}) => request(page, { document: {} }, text, {
      contextAthleteId: dictation.athlete,
      displayedProposals: [],
      inputMode: "voice",
      ...options,
    });
    const opening = await send("Tá bom, perfeito. Vamos abrir, fazer uma uma receita então para o atleta.");
    expect(opening.text).toBe("O que você quer prescrever para Atleta Ciclo DEMO? Pode ditar normalmente.");
    await dictation.rpc("conversation_save", {
      target: session,
      context_athlete: dictation.athlete,
      transcript: [{ id: randomUUID(), role: "assistant", text: opening.text }],
    });
    for (const text of [
      "Vamos receitar dipirona, 500 mg, para tomar de 8 em 8 horas durante 10 dias.",
      "Tá bom, vamos abrir então uma receita com esses valores: dipirona de 500 mg para tomar de 8 em 8 horas durante 10 dias.",
      "O nome do medicamento é dipirona com posologia de 500 mg para tomar de 8 em 8 horas durante 10 dias.",
    ]) {
      const result = await send(text);
      expect(result.document).toMatchObject({ athleteId: dictation.athlete, state: "proposal" });
      expect(result.document.content.items).toEqual([expect.objectContaining({
        name: "dipirona", dose: "500", dose_unit: "mg", schedule: "de 8 em 8 horas",
        duration: "10 dias", route: "", quantity: "", presentation: "",
      })]);
      expect(result.text).toContain("Qual é a via");
      if (text.startsWith("O nome")) {
        const route = await send("Via oral.", { displayedProposals: [scope(result.document)] });
        expect(route.document.content.items[0]).toMatchObject({ route: "oral", dose: "500" });
      }
    }
    const wrongAthlete = await send("Vamos receitar dipirona, 500 mg.", { contextAthleteId: dictation.minor });
    expect(wrongAthlete.document).toBeUndefined();
    const ambiguous = await send("Vamos receitar dipirona ou outro medicamento, 500 mg.");
    expect(ambiguous.document).toBeUndefined();
  } finally {
    await dictation.cleanup();
  }
});

test("voz abre o cartão e completa a mesma proposta nos três fluxos", async ({ page }) => {
  const fixture = await workflowFixture();
  try {
    await login(page, fixture.owner);
    await page.route("**/api/inteligencia", (route) => route.continue({
      postData: { ...route.request().postDataJSON(), inputMode: "voice" },
    }));
    for (const [opening, detail, label, expected] of [
      ["Receita", "dipirona", "Proposta de prescrição", "dipirona"],
      ["Abre um pedido de exames.", "Ressonância do joelho direito.", "Proposta de solicitação de exames", "Ressonância do joelho direito"],
      ["Abre um pedido cirúrgico.", "Artroscopia do joelho.", "Proposta de pedido cirúrgico", "Artroscopia do joelho"],
    ]) {
      await fixture.rpc("conversation_start", {});
      await fixture.rpc("conversation_set_context", { context_athlete: fixture.athlete });
      await page.goto("/?atleta=" + fixture.athlete);
      const message = page.getByRole("textbox", { name: "Mensagem", exact: true });
      const send = page.getByRole("button", { name: "Enviar", exact: true });
      await message.fill(opening);
      await send.click();
      const card = page.getByRole("region", { name: label, exact: true });
      await expect(card).toBeVisible();
      await message.fill(detail);
      await send.click();
      await expect(card).toContainText(expected);
      await expect(card).toHaveCount(1);
      if (opening === "Receita") {
        await message.fill("500 mg");
        await send.click();
        await expect(card).toContainText("500");
        await expect(card).toHaveCount(1);
      }
    }
    await fixture.rpc("conversation_start", {});
    await fixture.rpc("conversation_set_context", { context_athlete: fixture.athlete });
    await page.goto("/?atleta=" + fixture.athlete);
    await page.getByRole("textbox", { name: "Mensagem", exact: true }).fill(
      "Perfeito, vamos fazer uma receita para ele de dipirona 500 mg de 8 em 8 horas por 10 dias.",
    );
    await page.getByRole("button", { name: "Enviar", exact: true }).click();
    const card = page.getByRole("region", { name: "Proposta de prescrição", exact: true });
    await expect(card).toContainText("dipirona");
    await expect(card).toContainText("10 dias");
  } finally {
    await fixture.cleanup();
  }
});

test("voz entende a fala inteira da receita e mostra os dados no cartão", async ({ page }) => {
  const fixture = await workflowFixture();
  try {
    await login(page, fixture.owner);
    await page.route("**/api/inteligencia", (route) => route.continue({
      postData: { ...route.request().postDataJSON(), inputMode: "voice" },
    }));
    for (const [speech, interval, duration] of [
      ["Tá, perfeito. Vamos fazer uma receita para ele. Colocar dipirona 500 mg por via oral de 8 em 8 horas por 10 dias. Deixa no cartão para eu conferir.", "de 8 em 8 horas", "10 dias"],
      ["Tá, vamos fazer uma receita pra ele. Coloca dipirona, 500 miligramas, por via oral, de oito em oito horas por dez dias. Deixa no cartão pra eu conferir.", "de oito em oito horas", "dez dias"],
    ]) {
      await fixture.rpc("conversation_start", {});
      await fixture.rpc("conversation_set_context", { context_athlete: fixture.athlete });
      await page.goto("/?atleta=" + fixture.athlete);
      await page.getByRole("textbox", { name: "Mensagem", exact: true }).fill(speech);
      await page.getByRole("button", { name: "Enviar", exact: true }).click();
      const card = page.getByRole("region", { name: "Proposta de prescrição", exact: true });
      for (const value of ["dipirona", "500", "mg", "oral", interval, duration]) {
        await expect(card).toContainText(value);
      }
      await expect(page.getByText("Deixei a proposta no cartão para você conferir.", { exact: true })).toBeVisible();
      await expect(card).toHaveCount(1);
    }
    const field = page.getByRole("textbox", { name: "Mensagem", exact: true });
    const send = page.getByRole("button", { name: "Enviar", exact: true });
    await field.fill("Vamos criar outro documento.");
    await send.click();
    await expect(page.getByText(/Qual documento você quer abrir/)).toBeVisible();
    await field.fill("Agora para esse atleta eu quero pedir uma ressonância do joelho direito. Coloca também um hemograma no mesmo pedido. Quero conferir os dois antes de salvar.");
    await send.click();
    const exams = page.getByRole("region", { name: "Proposta de solicitação de exames", exact: true });
    await expect(exams).toContainText(/ressonância do joelho direito/i);
    await expect(exams).toContainText(/hemograma/i);
    await expect(exams).toHaveCount(1);
    await expect(exams).toHaveAttribute("data-draft-state", "proposal");
    const prescription = page.getByRole("region", { name: "Proposta de prescrição", exact: true });
    await expect(prescription).toContainText("dipirona");
    await expect(prescription).toHaveAttribute("data-draft-state", "proposal");
    await field.fill("Pode confirmar e salvar o pedido cirúrgico.");
    await send.click();
    await expect(page.getByText(/o cartão selecionado é o pedido de exames/)).toBeVisible();
    await expect(exams).toHaveCount(1);
    await field.fill("Pode confirmar e salvar o pedido.");
    await send.click();
    await expect(exams).toHaveAttribute("data-draft-state", "saved");
    await page.reload();
    await expect(exams).toHaveCount(1);
    await expect(exams).toHaveAttribute("data-draft-state", "saved");
    await expect(exams).toContainText(/ressonância do joelho direito/i);
    await expect(exams).toContainText(/hemograma/i);
    await expect(prescription).toHaveAttribute("data-draft-state", "proposal");
  } finally {
    await fixture.cleanup();
  }
});

test("voz corrige dose e lateralidade com valores explícitos na proposta em contexto", async ({ page }) => {
  await login(page);
  const prescription = await seed("prescription", 1);
  const dose = await request(page, prescription, "Não, a dose era de 250 miligramas.", { inputMode: "voice" });
  expect(dose.document.content.items[0]).toEqual({
    ...prescription.content.items[0],
    dose: "250",
    dose_unit: "mg",
  });
  const ambiguous = await seed("prescription");
  const clarification = await request(page, ambiguous, "Não, a dose era de 250 miligramas.", { inputMode: "voice" });
  expect(clarification.text).toContain("Indique o documento e o item");
  const exams = await seed("exam_request", 1);
  const side = await request(page, exams, "Não, era do lado esquerdo.", { inputMode: "voice" });
  expect(side.document.content.items[0]).toEqual({ ...exams.content.items[0], laterality: "left" });
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
  ).toContain("Atualizei a proposta");
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
  ).toBe("2");
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
    card.locator(".rx-directions", { hasText: "Grafia EXATA DEMO µg/mL" }).first(),
  ).toBeVisible();
  await expect(card).toHaveCount(1);
  await expect(
    card.getByRole("article", { name: "Pré-visualização do rascunho" }),
  ).toBeVisible();
  mkdirSync("docs/visual/handoff-007-10-6b-3", { recursive: true });
  await card
    .locator(".rx-directions", { hasText: "Grafia EXATA DEMO µg/mL" })
    .first()
    .scrollIntoViewIfNeeded();
  await expect(
    card.locator(".rx-directions", { hasText: "Grafia EXATA DEMO µg/mL" }).first(),
  ).toBeInViewport();
  await page.screenshot({
    path: "docs/visual/handoff-007-10-6b-3/document-chat-desktop.png",
  });
  await page
    .getByRole("textbox", { name: "Mensagem", exact: true })
    .fill("Pode confirmar e salvar a prescrição.");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(card.getByText("Rascunho salvo", { exact: true })).toBeVisible();
  expect(
    sql(
      `select count(*) from clinical.documents where id='${x.document.requestId}'`,
    ),
  ).toBe("1");
  await page.reload();
  await expect(page.locator(".ia-draft")).toHaveCount(1);
  await expect(
    card.locator(".rx-directions", { hasText: "Grafia EXATA DEMO µg/mL" }).first(),
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

test("voz salva a versão selecionada após duas expressões de concordância", async ({ page }) => {
  const fixture = await workflowFixture();
  try {
    await login(page, fixture.owner);
    await fixture.rpc("conversation_start", {});
    await fixture.rpc("conversation_set_context", { context_athlete: fixture.athlete });
    await page.goto("/?atleta=" + fixture.athlete);
    await page.route("**/api/inteligencia", route => route.continue({
      postData: { ...route.request().postDataJSON(), inputMode: "voice" },
    }));
    const card = page.getByRole("region", { name: "Proposta de prescrição", exact: true });
    async function speak(message) {
      await page.getByRole("textbox", { name: "Mensagem", exact: true }).fill(message);
      const response = page.waitForResponse(r => r.url().endsWith("/api/inteligencia"));
      await page.getByRole("button", { name: "Enviar", exact: true }).click();
      const line = (await (await response).text()).split("\n").filter(s => s.startsWith("data: ")).at(-1);
      return JSON.parse(line.slice(6)).document;
    }
    const first = await speak("Vamos receitar dipirona, 500 mg por via oral de 8 em 8 horas por 10 dias.");
    await expect(card).toContainText("dipirona");
    const edited = await speak("A dose é de 800 mg.");
    expect(edited.requestId).toBe(first.requestId);
    await expect(card).toContainText("800");
    const saved = await speak("Tá bom, perfeito. Pode confirmar e salvar. E aí depois a gente vai abrir um pedido cirúrgico.");
    await expect(page.getByText("Salvei a prescrição como rascunho. Quando quiser, podemos abrir o pedido cirúrgico.", { exact: true })).toBeVisible();
    await expect(page.locator(".ia-draft")).toHaveCount(1);
    expect(saved).toMatchObject({ requestId: edited.requestId, state: "saved", content: edited.content });
    await expect(card).toHaveAttribute("data-draft-state", "saved");
    await page.reload();
    await expect(card).toHaveCount(1);
    await expect(card).toHaveAttribute("data-draft-state", "saved");
    await expect(card).toContainText("800");
  } finally {
    await fixture.cleanup();
  }
});
