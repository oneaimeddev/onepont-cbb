import { test, expect } from "./fixtures.mjs";
import {
  workflowFixture,
  workflowSql as sql,
} from "./helpers/workflow-fixtures.mjs";
import { randomUUID } from "node:crypto";
let f;
test.beforeAll(async () => {
  f = await workflowFixture();
});
test.afterAll(async () => {
  await f?.cleanup();
});
async function login(page) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(f.owner.email);
  await page.getByLabel("Senha", { exact: true }).fill(f.owner.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
}
async function send(page, data, base = "http://127.0.0.1:3100") {
  return page.request.post(base + "/api/inteligencia/operacoes", {
    headers: { Origin: base },
    data,
  });
}
async function prepare(page) {
  const sessionId = (await f.rpc("conversation_start", {})).session.id;
  await f.rpc("conversation_set_context", { context_athlete: f.athlete });
  const review = await f.prepare();
  const bind = await send(page, {
    action: "bind",
    sessionId,
    reviewId: review.id,
    revision: 0,
    key: randomUUID(),
  });
  expect(bind.status()).toBe(200);
  let state = await bind.json();
  const selected = await send(page, {
    action: "identity",
    workspaceId: state.workspace.id,
    revision: state.workspace.revision,
    identityId: f.inventory.identities[0].id,
  });
  expect(selected.status()).toBe(200);
  state = await selected.json();
  const challenge = await send(page, {
    action: "prepare",
    workspaceId: state.workspace.id,
    revision: state.workspace.revision,
    key: randomUUID(),
  });
  expect(challenge.status()).toBe(200);
  return {
    sessionId,
    review,
    workspace: state.workspace,
    challenge: (await challenge.json()).challenge,
  };
}
test("HTTP captura autoria real, exige apresentação, repete sem duplicar e não executa assinatura", async ({
  page,
}) => {
  await login(page);
  const x = await prepare(page),
    c = x.challenge;
  const payload = {
    action: "confirm",
    sessionId: x.sessionId,
    challengeId: c.id,
    nonce: c.nonce,
    messageId: randomUUID(),
    message: "Sim",
  };
  const injected = await send(page, {
    ...payload,
    actor: f.other.id,
    confirmed: true,
    executionMode: "production",
  });
  expect(injected.status()).toBe(400);
  const early = await send(page, payload);
  expect(early.status()).toBe(409);
  expect((await early.json()).error).toBe("not_presented");
  const shown = await send(page, {
    action: "present",
    sessionId: x.sessionId,
    challengeId: c.id,
    nonce: c.nonce,
    summaryHash: c.summaryHash,
  });
  expect(shown.status()).toBe(200);
  const final = { ...payload, messageId: randomUUID() };
  const reply = await send(page, final);
  expect(reply.status()).toBe(200);
  const receipt = await reply.json();
  expect(receipt.executionEnabled).toBe(false);
  expect(receipt.effect).toBe("authorization_recorded");
  const retry = await send(page, final);
  expect((await retry.json()).authorizationId).toBe(receipt.authorizationId);
  expect(
    sql(
      `select professional_id from clinical.chat_operation_authorizations where id='${receipt.authorizationId}'`,
    ),
  ).toBe(f.owner.id);
  expect(
    sql(
      `select count(*) from clinical.documents where id='${x.review.document_id}'`,
    ),
  ).toBe("0");
  expect(
    sql(
      `select count(*) from clinical.audit_events where resource_id='${c.id}' and operation='chat_operation.confirmed' and origin_channel='ai_chat' and execution_method='human_message'`,
    ),
  ).toBe("1");
  const voice = await send(page, {
    ...final,
    messageId: randomUUID(),
    inputMode: "voice",
  });
  expect(voice.status()).toBe(409);
  expect((await voice.json()).error).toBe("voice_confirmation_unavailable");
  const arbitrary = await send(page, {
    action: "execute",
    sql: "update clinical.documents set status=finalized",
  });
  expect(arbitrary.status()).toBe(400);
  const cross = await page.request.post("/api/inteligencia/operacoes", {
    headers: { Origin: "https://invalid.example" },
    data: { action: "state", sessionId: x.sessionId },
  });
  expect(cross.status()).toBe(403);
});
test("servidor operacional recusa simulação apesar do gate local; escopo revogado não confirma", async ({
  page,
}) => {
  await login(page);
  const x = await prepare(page),
    c = x.challenge;
  const operational = await send(
    page,
    {
      action: "prepare",
      workspaceId: x.workspace.id,
      revision: x.workspace.revision,
      key: randomUUID(),
    },
    "http://127.0.0.1:3101",
  );
  expect(operational.status()).toBe(409);
  expect((await operational.json()).error).toBe("mode_unavailable");
  const shown = await send(page, {
    action: "present",
    sessionId: x.sessionId,
    challengeId: c.id,
    nonce: c.nonce,
    summaryHash: c.summaryHash,
  });
  expect(shown.status()).toBe(200);
  sql(
    `update clinical.athlete_access set can_read_records=false where athlete_id='${f.athlete}' and professional_id='${f.owner.id}'`,
  );
  try {
    const denied = await send(page, {
      action: "confirm",
      sessionId: x.sessionId,
      challengeId: c.id,
      nonce: c.nonce,
      messageId: randomUUID(),
      message: "Sim",
    });
    expect(denied.status()).toBe(409);
    expect((await denied.json()).error).toBe("denied");
  } finally {
    sql(
      `update clinical.athlete_access set can_read_records=true where athlete_id='${f.athlete}' and professional_id='${f.owner.id}'`,
    );
  }
  expect(
    sql(
      `select count(*) from clinical.chat_operation_authorizations where challenge_id='${c.id}'`,
    ),
  ).toBe("0");
});
