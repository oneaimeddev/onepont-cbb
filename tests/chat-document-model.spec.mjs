import { test, expect } from "./fixtures.mjs";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import {
  workflowFixture,
  workflowSql as sql,
} from "./helpers/workflow-fixtures.mjs";
let f, provider, script, session;
const falseClaim = "Documento salvo e assinado!";
test.beforeAll(async () => {
  provider = createServer(async (request, response) => {
    if (request.url !== "/v1/chat/completions" || request.method !== "POST") {
      response.writeHead(404).end();
      return;
    }
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    script.calls++;
    const afterTool = body.messages.at(-1)?.role === "tool";
    if (afterTool) script.toolOutput = body.messages.at(-1).content;
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
    });
    const chunk = (delta, finish_reason = null) =>
      `data: ${JSON.stringify({ id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 0, model: "controlled-fixture", choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
    if (script.noTool)
      response.write(chunk({ role: "assistant", content: falseClaim }, "stop"));
    else if (!afterTool) {
      // Deliberately untrustworthy prose before and after a real SDK tool call.
      response.write(
        chunk({
          role: "assistant",
          content: falseClaim,
          tool_calls: [
            {
              index: 0,
              id: "call_fixture",
              type: "function",
              function: {
                name: script.tool,
                arguments: JSON.stringify(script.args),
              },
            },
          ],
        }),
      );
      response.write(chunk({}, "tool_calls"));
    } else
      response.write(chunk({ role: "assistant", content: falseClaim }, "stop"));
    response.end("data: [DONE]\n\n");
  });
  await new Promise((resolve) => provider.listen(3199, "127.0.0.1", resolve));
});
test.afterAll(async () => {
  provider?.closeAllConnections();
  await new Promise((resolve) => provider.close(resolve));
});
test.afterEach(async () => { await f?.cleanup(); });
test.beforeEach(async ({ page }) => {
  f = await workflowFixture();
  session = (await f.rpc("conversation_start", {})).session.id;
  await f.rpc("conversation_set_context", { context_athlete: f.athlete });
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(f.owner.email);
  await page.getByLabel("Senha", { exact: true }).fill(f.owner.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
});
async function send(
  page,
  message,
  key = randomUUID(),
  displayedProposals = [],
  inputMode = "text",
) {
  const response = await page.request.post("/api/inteligencia", {
    headers: { Origin: "http://127.0.0.1:3102" },
    data: {
      messages: [{ role: "user", content: message }],
      messageId: key,
      contextAthleteId: f.athlete,
      inputMode,
      displayedProposals,
    },
  });
  expect(response.status()).toBe(200);
  const raw = await response.text();
  expect(raw).not.toContain(falseClaim);
  const records = raw
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)));
  return { raw, body: records.at(-1) };
}
function choose(tool, args) {
  script = { tool, args, calls: 0, toolOutput: null };
}
function count() {
  return Number(
    sql(
      `select count(*) from clinical.document_proposals where actor_id='${f.owner.id}' and session_id='${session}'`,
    ),
  );
}
for (const kind of ["prescription", "exam_request", "surgical_order"])
  test(`controlled SDK ${kind}: source values, same proposal on retry and no claimed signature`, async ({
    page,
  }) => {
    const key = randomUUID();
    let message, tool, args;
    if (kind === "prescription") {
      tool = "preparePrescription";
      args = {
        athleteId: f.athlete,
        items: [
          {
            name: "nome científico demo",
            dose: "dose demo",
            dose_unit: "µg/ml",
          },
        ],
      };
      message =
        "Crie uma prescrição para o atleta em contexto; Medicamento: Nome CIENTÍFICO DEMO; Dose: DOSE DEMO; Unidade: µg/mL";
    } else if (kind === "exam_request") {
      tool = "prepareExamRequest";
      args = {
        athleteId: f.athlete,
        items: [{ name: "exame demo", examType: "laboratory" }],
        justification: "justificativa demo",
      };
      message =
        "Crie uma solicitação de exames para o atleta em contexto; Exame: Exame DEMO; Tipo: Laboratorial; Justificativa: JUSTIFICATIVA DEMO";
    } else {
      tool = "prepareSurgicalOrder";
      args = {
        athleteId: f.athlete,
        procedure: "procedimento demo",
        justification: "justificativa demo",
      };
      message =
        "Crie um pedido cirúrgico para o atleta em contexto; Procedimento: Procedimento DEMO; Justificativa: JUSTIFICATIVA DEMO";
    }
    choose(tool, args);
    const first = await send(page, message, key);
    expect(first.body.document, JSON.stringify(first.body)).toBeTruthy();
    expect(first.body.document.kind).toBe(kind);
    expect(first.body.document.state).toBe("proposal");
    expect(first.body.document.documentId).toBeNull();
    expect(script.calls).toBe(2);
    expect(first.body.text).toContain("não foi gravada no prontuário");
    expect(count()).toBe(1);
    if (kind === "prescription")
      expect(first.body.document.content.items[0]).toMatchObject({
        name: "Nome CIENTÍFICO DEMO",
        dose: "DOSE DEMO",
        dose_unit: "µg/mL",
        quantity: "",
        route: "",
      });
    choose(tool, args);
    const again = await send(page, message, key);
    expect(again.body.document).toEqual(first.body.document);
    expect(count()).toBe(1);
    expect(
      sql(
        `select count(*) from clinical.documents where author_id='${f.owner.id}'`,
      ),
    ).toBe("0");
  });
test("controlled SDK hallucinated dose and patient mismatch produce no proposal", async ({
  page,
}) => {
  choose("preparePrescription", {
    athleteId: f.athlete,
    items: [{ name: "Medicamento DEMO", dose: "20" }],
  });
  const denied = await send(
    page,
    "Crie uma prescrição; Medicamento: Medicamento DEMO; Apresentação: Caixa 20 DEMO",
  );
  expect(denied.body.document).toBeNull();
  expect(denied.body.text).toContain("Não preparei");
  expect(count()).toBe(0);
  choose("preparePrescription", {
    athleteId: f.athlete,
    items: [{ name: "Medicamento DEMO" }],
  });
  const wrong = await send(
    page,
    "Crie uma prescrição para Outra Pessoa DEMO; Medicamento: Medicamento DEMO",
  );
  expect(wrong.body.document).toBeNull();
  expect(count()).toBe(0);
});
test("controlled SDK cannot use assistant history as a source", async ({
  page,
}) => {
  await f.rpc("conversation_save", {
    target: session,
    context_athlete: f.athlete,
    transcript: [
      {
        id: "assistant-source",
        role: "assistant",
        text: "Medicamento: Origem ASSISTENTE DEMO; Dose: DADO NÃO CONFIRMADO",
      },
    ],
  });
  choose("preparePrescription", {
    athleteId: f.athlete,
    items: [{ name: "Origem ASSISTENTE DEMO", dose: "DADO NÃO CONFIRMADO" }],
  });
  const r = await send(
    page,
    "Crie uma prescrição com os medicamentos que acabamos de definir",
  );
  expect(r.body.document).toBeNull();
  expect(r.body.text).toContain("Não preparei");
  expect(count()).toBe(0);
});
test("controlled SDK legacy exam follow-up cannot replace the persisted proposal", async ({
  page,
}) => {
  const r = await f.rpc("clinical_document_proposal_register", {
    target: f.athlete,
    request_id: randomUUID(),
    kind: "exam_request",
    payload: {
      items: [{ id: randomUUID(), name: "Original DEMO" }],
      justification: "Original preservado DEMO",
    },
  });
  expect(r.ok).toBe(true);
  const before = sql(
    `select content::text||'|'||version from clinical.document_proposals where actor_id='${f.owner.id}' and session_id='${session}'`,
  );
  choose("prepareExamRequest", {
    athleteId: f.athlete,
    items: [{ name: "Outro DEMO" }],
    justification: "Substituição indevida DEMO",
  });
  const response = await send(page, "Também preciso de outro exame DEMO");
  expect(response.body.document).toBeNull();
  expect(response.body.text).toContain("Não preparei");
  expect(count()).toBe(1);
  expect(
    sql(
      `select content::text||'|'||version from clinical.document_proposals where actor_id='${f.owner.id}' and session_id='${session}'`,
    ),
  ).toBe(before);
});
test("controlled SDK cannot claim success without a tool or with forged tool parameters", async ({
  page,
}) => {
  choose("preparePrescription", {
    athleteId: f.athlete,
    actorId: f.other.id,
    confirmed: true,
    items: [{ name: "Medicamento DEMO" }],
  });
  const r = await send(
    page,
    "Crie uma prescrição; Medicamento: Medicamento DEMO",
  );
  expect(r.body.document ?? null).toBeNull();
  expect(count()).toBe(0);
  choose("preparePrescription", {
    athleteId: f.athlete,
    items: [{ name: "Medicamento DEMO" }],
  });
  script.noTool = true;
  const noTool = await send(
    page,
    "Crie uma prescrição; Medicamento: Medicamento DEMO",
  );
  expect(noTool.body.document).toBeNull();
  expect(noTool.body.text).toContain("Não preparei");
  expect(count()).toBe(0);
});

test("SDK creation then edit and exact save use shared authority without another model call", async ({
  page,
}) => {
  choose("preparePrescription", {
    athleteId: f.athlete,
    items: [{ name: "Medicamento DEMO" }],
  });
  const created = await send(
    page,
    "Crie uma prescrição para o atleta em contexto; Medicamento: Medicamento DEMO",
  );
  const scope = (d) => ({
    requestId: d.requestId,
    athleteId: d.athleteId,
    kind: d.kind,
    version: d.version,
    contentHash: d.contentHash,
  });
  const edited = await send(
    page,
    "Altere a dose do primeiro medicamento para DOSE DEMO",
    randomUUID(),
    [scope(created.body.document)],
  );
  expect(edited.body.document.version).toBe(2);
  expect(edited.body.document.content.items[0].dose).toBe("DOSE DEMO");
  const saved = await send(
    page,
    "Pode confirmar e salvar a prescrição.",
    randomUUID(),
    [scope(edited.body.document)],
  );
  expect(saved.body.document.state).toBe("saved");
  expect(saved.body.document.content).toEqual(edited.body.document.content);
  expect(script.calls).toBe(2);
  expect(
    sql(
      `select count(*) from clinical.documents where author_id='${f.owner.id}'`,
    ),
  ).toBe("1");
  expect(
    sql(
      `select count(*) from clinical.document_signature_operations where professional_id='${f.owner.id}'`,
    ),
  ).toBe("0");
});

test("controlled SDK voice creation uses the same literal source authority", async ({
  page,
}) => {
  choose("preparePrescription", {
    athleteId: f.athlete,
    items: [{ name: "Medicamento DEMO" }],
  });
  const result = await send(
    page,
    "Crie uma prescrição para o atleta em contexto; Medicamento: Medicamento DEMO",
    randomUUID(),
    [],
    "voice",
  );
  expect(result.body.document.state).toBe("proposal");
  expect(result.body.document.content.items[0].name).toBe("Medicamento DEMO");
  expect(result.body.text).toContain("não foi gravada");
});

test("controlled SDK cannot stream a false creation claim for a professional without medical authorship", async ({
  page,
}) => {
  sql(
    `update clinical.medical_authors set enabled=false where professional_id='${f.other.id}'`,
  );
  await f.rpc("conversation_start", {}, f.other);
  await f.rpc(
    "conversation_set_context",
    { context_athlete: f.athlete },
    f.other,
  );
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(f.other.email);
  await page.getByLabel("Senha", { exact: true }).fill(f.other.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
  choose("preparePrescription", {});
  script.noTool = true;
  const result = await send(
    page,
    "Crie uma prescrição para o atleta em contexto; Medicamento: Medicamento DEMO",
  );
  expect(result.body.document).toBeNull();
  expect(result.body.text).toContain("não tem autorização");
  expect(
    sql(
      `select count(*) from clinical.document_proposals where actor_id='${f.other.id}'`,
    ),
  ).toBe("0");
});

test("fonte por item permite ditado livre e impede transferir dose entre medicamentos", async ({ page }) => {
  const items = [{ name: "alfa demo", dose: "10", dose_unit: "mg" }, { name: "beta demo", dose: "25", dose_unit: "mg" }];
  const source = { action: "create", itemQuotes: ["alfa demo 10 mg", "beta demo 25 mg"] };
  const message = "Pro cartão dele eu queria alfa demo 10 mg e depois beta demo 25 mg, tudo junto.";
  choose("preparePrescription", { athleteId: f.athlete, source, items });
  const ok = await send(page, message);
  expect(ok.body.document.content.items).toMatchObject(items);
  choose("preparePrescription", { athleteId: f.athlete, source, items: [{ ...items[0], dose: "25" }, items[1]] });
  expect((await send(page, message)).body.document).toBeNull();
  choose("preparePrescription", { athleteId: f.athlete, source, items });
  expect((await send(page, message + " Isso é para Outra Pessoa.")).body.document).toBeNull();
  choose("preparePrescription", {
    athleteId: f.athlete,
    source: { action: "create", itemQuotes: ["alfa demo 0,5mg"] },
    items: [{ name: "alfa demo", dose: "5", dose_unit: "mg" }],
  });
  expect((await send(page, "Pro cartão dele eu queria alfa demo 0,5mg.")).body.document).toBeNull();
  expect(count()).toBe(1);
});

test("retoma a mesma proposta após confirmação interrompida e salva o pedido selecionado", async ({ page }) => {
  const exam = (await send(page, "Peça uma ressonância do joelho direito. Coloca também um hemograma no mesmo pedido.")).body.document;
  const shown = { requestId: exam.requestId, kind: exam.kind, athleteId: exam.athleteId, contentHash: exam.contentHash, version: exam.version };
  for (const message of ["Perfeito, pode confirmar e salvar, peraí, vou abrir outro depois.", "Pode confirmar e salvar o pedido cirúrgico."]) {
    expect((await send(page, message, randomUUID(), [shown], "voice")).body.document).toEqual(exam);
  }
  choose("resumeDocumentProposal", { kind: "exam_request" });
  const resumed = await send(page, "Abre para mim o pedido de exame que nós estávamos trabalhando.");
  expect(resumed.body.document).toEqual(exam);
  const saved = await send(page, "Perfeito. Pode confirmar e salvar.", randomUUID(), [shown], "voice");
  expect(saved.body.document).toMatchObject({ state: "saved", requestId: exam.requestId, content: exam.content });
  expect(count()).toBe(1);
});

test("corrige a lateralidade no mesmo pedido cirúrgico sem redigitar o procedimento", async ({ page }) => {
  const original = (await send(page, "Vamos abrir um pedido cirúrgico de artroscopia do joelho esquerdo.")).body.document;
  const shown = { requestId: original.requestId, kind: original.kind, athleteId: original.athleteId, contentHash: original.contentHash, version: original.version };
  const message = "Ah, desculpa, vamos corrigir. O joelho é direito.";
  const edit = value => choose("editDocumentProposal", { kind: "surgical_order", edits: [{ field: "lateralidade", value, anatomy: "joelho" }] });
  edit("esquerdo");
  expect((await send(page, message, randomUUID(), [shown], "voice")).body.document).toBeNull();
  edit("direito");
  const corrected = (await send(page, message, randomUUID(), [shown], "voice")).body.document;
  expect(corrected).toMatchObject({
    requestId: original.requestId, version: original.version + 1, state: "proposal",
    content: { ...original.content, procedure: "artroscopia do joelho direito", laterality: "right" },
  });
  expect(count()).toBe(1);
});

test("retoma o cartão e corrige o lado sem repetir a região anatômica", async ({ page }) => {
  const original = (await send(page, "Vamos abrir um pedido cirúrgico de artroscopia do joelho esquerdo.")).body.document;
  choose("resumeDocumentProposal", { kind: "surgical_order" });
  const resumed = (await send(page, "Perfeito, vamos confirmar qual que é o pedido que a gente está trabalhando agora?")).body.document;
  expect(resumed).toEqual(original);
  const shown = { requestId: resumed.requestId, kind: resumed.kind, athleteId: resumed.athleteId, contentHash: resumed.contentHash, version: resumed.version };
  choose("editDocumentProposal", { kind: "surgical_order", edits: [{ field: "lateralidade", value: "direito" }] });
  const corrected = (await send(page, "Isso, e aí vamos alterar a lateralidade para direito do do pedido.", randomUUID(), [shown], "voice")).body.document;
  expect(corrected).toMatchObject({ requestId: original.requestId, version: original.version + 1,
    content: { ...original.content, procedure: "artroscopia do joelho direito", laterality: "right" } });
  expect(count()).toBe(1);
});
