import { test, expect } from "./fixtures.mjs";
import { randomUUID } from "node:crypto";
import {
  workflowFixture,
  workflowSql as sql,
} from "./helpers/workflow-fixtures.mjs";
let f;
test.beforeEach(async ({ page }) => {
  f = await workflowFixture();
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(f.owner.email);
  await page.getByLabel("Senha", { exact: true }).fill(f.owner.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
});
test.afterEach(async () => {
  await f?.cleanup();
});
async function seed(kind) {
  const session = (await f.rpc("conversation_start", {})).session.id;
  await f.rpc("conversation_set_context", { context_athlete: f.athlete });
  const review = await f.prepare(kind);
  const created = await f.rpc("chat_document_proposal_create", {
    target: f.athlete,
    kind,
    payload: review.material.content,
    message_key: randomUUID(),
  });
  return { document: created.document, session };
}
const scope = (d) => ({
  requestId: d.requestId,
  athleteId: d.athleteId,
  kind: d.kind,
  version: d.version,
  contentHash: d.contentHash,
});
async function command(page, body) {
  const origin = new URL(page.url()).origin;
  const response = await page.request.post("/api/inteligencia/operacoes", {
    headers: { Origin: origin },
    data: body,
  });
  return response.json();
}
async function say(page, x, message, more = {}) {
  const origin = new URL(page.url()).origin;
  const response = await page.request.post("/api/inteligencia", {
    headers: { Origin: origin },
    data: {
      messages: [{ role: "user", content: message }],
      displayedProposals: [scope(x.document)],
      contextAthleteId: f.athlete,
      messageId: randomUUID(),
      inputMode: "text",
      ...more,
    },
  });
  expect(response.status()).toBe(200);
  return (await response.text())
    .split("\n")
    .filter((s) => s.startsWith("data: "))
    .map((s) => JSON.parse(s.slice(6)))
    .at(-1);
}
for (const kind of ["prescription", "exam_request", "surgical_order"])
  test(`HTTP ${kind}: identity, presented summary, exact confirmation and status without model`, async ({
    page,
  }) => {
    const x = await seed(kind);
    const prompt = await say(
      page,
      x,
      kind === "exam_request" ? "Assine e envie" : "Assine este documento",
    );
    expect(prompt.text).toContain("Escolha a identidade");
    const identity = f.inventory.identities[0];
    await say(page, x, `Use a identidade ${identity.label}`);
    const before = await say(page, x, "Sim");
    expect(before.text).toContain("Não há uma operação pendente apresentada");
    const view = await command(page, {
      action: "inspect",
      ...scope(x.document),
    });
    expect(view.error, JSON.stringify(view)).toBeUndefined();
    const c = view.state.challenge;
    expect(c.summary.delivery.requested).toBe(kind === "exam_request");
    expect(
      (
        await command(page, {
          action: "present",
          sessionId: x.session,
          challengeId: c.id,
          nonce: c.nonce,
          summaryHash: c.summaryHash,
        })
      ).ok,
    ).toBe(true);
    const voice = await say(page, x, "Confirmo esta versão e a assinatura", {
      inputMode: "voice",
    });
    expect(voice.text).toContain("por texto");
    expect(
      sql(
        `select count(*) from clinical.signature_attempts where professional_id='${f.owner.id}'`,
      ),
    ).toBe("0");
    const signed = await say(page, x, "Confirmo esta versão e a assinatura");
    expect(signed.text).toContain("Autorização humana validada");
    const status = await say(page, x, "Qual o status da assinatura?");
    expect(status.text).toContain("simulada");
    const recovered = await command(page, {
      action: "inspect",
      ...scope(x.document),
    });
    expect(recovered.workflow.workflow.lifecycle).toBe("finalized");
    expect(recovered.document.readOnlyReason).toBe("finalized");
    expect(
      sql(
        `select count(*) from clinical.signature_attempts where professional_id='${f.owner.id}'`,
      ),
    ).toBe("1");
    const retry = await command(page, {
      action: "execute",
      sessionId: x.session,
      authorizationId: sql(
        `select authorization_id from clinical.chat_operation_executions where professional_id='${f.owner.id}'`,
      ),
    });
    expect(retry.duplicate).toBe(true);
  });
