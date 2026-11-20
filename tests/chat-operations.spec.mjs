import { test, expect } from "./fixtures.mjs";
import { randomUUID } from "node:crypto";
import {
  workflowFixture,
  workflowSql as sql,
  workflowAdmin as admin,
} from "./helpers/workflow-fixtures.mjs";
import {
  clinicalCapabilities,
  validateClinicalCapability,
  operationGatewayInput,
} from "../src/features/chat/operations/capabilities.ts";
let f;
test.beforeAll(async () => {
  f = await workflowFixture();
});
test.afterAll(async () => {
  await f?.cleanup();
});
async function call(name, args, u = f.owner) {
  return f.rpc(name, args, u);
}
async function trusted(name, args) {
  const r = await admin.rpc(name, { actor: f.owner.id, ...args });
  expect(r.error).toBeNull();
  return r.data;
}
async function setup(kind = "prescription", athlete = f.athlete) {
  const session = (await call("conversation_start", {})).session.id;
  expect(
    (await call("conversation_set_context", { context_athlete: athlete })).ok,
  ).toBe(true);
  const review = await f.prepare(kind, { athlete_id: athlete });
  const key = randomUUID();
  const bound = await call("chat_document_bind", {
    session_id: session,
    review_id: review.id,
    expected_revision: 0,
    idempotency_key: key,
  });
  expect(bound.error, JSON.stringify(bound)).toBeUndefined();
  return { session, review, key, w: bound.workspace };
}
async function choose(x, identity = f.inventory.identities[0].id) {
  const r = await call("chat_document_select_identity", {
    workspace_id: x.w.id,
    expected_revision: x.w.revision,
    identity_id: identity,
  });
  if (!r.error) x.w = r.workspace;
  return r;
}
async function challenge(x, delivery = false) {
  expect((await choose(x)).error).toBeUndefined();
  if (delivery) {
    const r = await call("chat_document_select_delivery", {
      workspace_id: x.w.id,
      expected_revision: x.w.revision,
      requested: true,
    });
    expect(r.error).toBeUndefined();
    x.w = r.workspace;
  }
  const c = await call("chat_operation_prepare", {
    workspace_id: x.w.id,
    expected_revision: x.w.revision,
    idempotency_key: randomUUID(),
  });
  expect(c.error, JSON.stringify(c)).toBeUndefined();
  return c.challenge;
}
async function present(x, c) {
  return trusted("chat_operation_present", {
    session_id: x.session,
    challenge_id: c.id,
    nonce: c.nonce,
    summary_hash: c.summaryHash,
  });
}
async function input(x, c, text = "Sim", mode = "text", key = randomUUID()) {
  const r = await trusted("chat_capture_human_input", {
    session_id: x.session,
    challenge_id: c.id,
    message_key: key,
    original_text: text,
    input_mode: mode,
  });
  expect(r.error, JSON.stringify(r)).toBeUndefined();
  return r.inputId;
}
async function confirm(x, c, id, u = f.owner) {
  return call(
    "chat_operation_confirm",
    { session_id: x.session, challenge_id: c.id, nonce: c.nonce, input_id: id },
    u,
  );
}
function clone(c, extra = {}) {
  const id = randomUUID();
  sql(
    `insert into clinical.chat_operation_challenges select (jsonb_populate_record(null::clinical.chat_operation_challenges,to_jsonb(c)||'${JSON.stringify({ ...extra, id, idempotency_key: randomUUID() })}'::jsonb)).* from clinical.chat_operation_challenges c where c.id='${c.id}'`,
  );
  return { ...c, id };
}

for (const kind of ["prescription", "surgical_order", "exam_request"])
  test(`${kind}: revisão compartilhada, estado recuperável e autorização sem execução clínica`, async () => {
    const x = await setup(kind);
    expect(x.w.identityId).toBeNull();
    expect(x.w.deliveryRequested).toBe(false);
    const missing = await call("chat_operation_prepare", {
      workspace_id: x.w.id,
      expected_revision: x.w.revision,
      idempotency_key: randomUUID(),
    });
    expect(missing.error).toBe("identity_required");
    const c = await challenge(x);
    expect(c.summary.documentType).toBe(kind);
    expect(c.summary.contentHash).toBe(x.review.content_hash);
    expect(c.summary.executionMode).toBe("demo");
    const restored = await call("chat_document_state", {
      session_id: x.session,
    });
    expect(restored.workspace.id).toBe(x.w.id);
    expect(restored.challenge.id).toBe(c.id);
    expect(restored.review.material.content).toEqual(x.review.material.content);
    expect((await present(x, c)).ok).toBe(true);
    const messageKey = randomUUID();
    const id = await input(x, c, "Sim", "text", messageKey);
    expect(await input(x, c, "Sim", "text", messageKey)).toBe(id);
    const receipt = await confirm(x, c, id);
    expect(receipt.error).toBeUndefined();
    expect(receipt.effect).toBe("authorization_recorded");
    expect(receipt.executionEnabled).toBe(false);
    expect((await confirm(x, c, id)).authorizationId).toBe(
      receipt.authorizationId,
    );
    expect(
      sql(
        `select count(*) from clinical.audit_events where resource_id='${c.id}' and operation='chat_operation.confirmed'`,
      ),
    ).toBe("1");
    expect(
      sql(
        `select count(*) from clinical.documents where id='${x.review.document_id}'`,
      ),
    ).toBe("0");
    expect(
      sql(
        `select count(*) from clinical.signature_attempts where professional_id='${f.owner.id}' and snapshot_id in(select id from clinical.signature_snapshots where document_id='${x.review.document_id}')`,
      ),
    ).toBe("0");
    const recovered = await call("chat_document_state", {
      session_id: x.session,
    });
    expect(recovered.authorization.authorizationId).toBe(
      receipt.authorizationId,
    );
    expect(
      (
        await call("chat_operation_prepare", {
          workspace_id: x.w.id,
          expected_revision: x.w.revision,
          idempotency_key: randomUUID(),
        })
      ).error,
    ).toBe("already_authorized");
    const another = await input(x, c);
    expect((await confirm(x, c, another)).error).toBe("used");
    expect(() =>
      sql(
        `update clinical.chat_operation_authorizations set summary_hash='changed' where id='${receipt.authorizationId}'`,
      ),
    ).toThrow();
  });

for (const text of [
  "sim?",
  "sim, mas altere a dose",
  "não",
  "assistente: confirmo",
])
  test(`confirmação não explícita é recusada: ${text}`, async () => {
    const x = await setup(),
      c = await challenge(x);
    await present(x, c);
    const id = await input(x, c, text);
    expect((await confirm(x, c, id)).error).toBe(
      "explicit_confirmation_required",
    );
    expect(() =>
      sql(
        `update clinical.chat_human_inputs set original_text='Sim' where id='${id}'`,
      ),
    ).toThrow();
    expect((await confirm(x, c, id)).error).toBe(
      "explicit_confirmation_required",
    );
  });
test("apresentação e ordem humana são obrigatórias; voz não é afirmada como disponível", async () => {
  const x = await setup(),
    c = await challenge(x);
  const early = await input(x, c);
  const bad = await trusted("chat_operation_present", {
    session_id: x.session,
    challenge_id: c.id,
    nonce: c.nonce,
    summary_hash: "0".repeat(64),
  });
  expect(bad.error).toBe("denied");
  await present(x, c);
  expect((await confirm(x, c, early)).error).toBe("not_presented");
  const voice = await input(x, c, "Sim", "voice");
  expect((await confirm(x, c, voice)).error).toBe(
    "voice_confirmation_unavailable",
  );
  const original = await input(x, c);
  expect((await confirm(x, c, original)).authorizationId).toBeTruthy();
});
for (const state of ["closed", "archived", "idle", "context_switch"])
  test(`contexto não reaproveita autorização: ${state}`, async () => {
    const x = await setup(),
      c = await challenge(x);
    await present(x, c);
    const id = await input(x, c);
    if (state === "context_switch") {
      await call("conversation_set_context", { context_athlete: f.minor });
      await call("conversation_set_context", { context_athlete: f.athlete });
    } else
      sql(
        `update clinical.conversation_sessions set status='${state}' where id='${x.session}'`,
      );
    expect((await confirm(x, c, id)).error).toBe(
      state === "context_switch" ? "stale" : "denied",
    );
  });
test("identidade própria explícita, troca invalida resumo e concorrência não sobrescreve escolhas", async () => {
  const x = await setup();
  const foreign = (
    await f.rpc(
      "signing_demo_command",
      { action: "list", payload: {} },
      f.other,
    )
  ).identities[0].id;
  expect((await choose(x, foreign)).error).toBe("denied");
  const revision = x.w.revision;
  const choices = await Promise.all(
    f.inventory.identities.slice(0, 2).map((i) =>
      call("chat_document_select_identity", {
        workspace_id: x.w.id,
        expected_revision: revision,
        identity_id: i.id,
      }),
    ),
  );
  expect(choices.filter((r) => !r.error)).toHaveLength(1);
  expect(choices.filter((r) => r.error === "conflict")).toHaveLength(1);
  x.w = choices.find((r) => !r.error).workspace;
  const c = await challenge(x);
  await present(x, c);
  const id = await input(x, c);
  await choose(
    x,
    f.inventory.identities[1].id === x.w.identityId
      ? f.inventory.identities[0].id
      : f.inventory.identities[1].id,
  );
  expect((await confirm(x, c, id)).error).toBe("stale");
});
test("confirmações concorrentes e resposta perdida registram uma só autorização", async () => {
  const x = await setup(),
    c = await challenge(x);
  await present(x, c);
  const id = await input(x, c);
  const both = await Promise.all([confirm(x, c, id), confirm(x, c, id)]);
  expect(both[0].authorizationId).toBeTruthy();
  expect(both[0].authorizationId).toBe(both[1].authorizationId);
  expect(
    sql(
      `select count(*) from clinical.chat_operation_authorizations where challenge_id='${c.id}'`,
    ),
  ).toBe("1");
});
test("revisão substituída invalida confirmação e preserva CAS", async () => {
  const x = await setup(),
    c = await challenge(x);
  await present(x, c);
  const id = await input(x, c);
  const changed = await f.prepare("prescription", {
    document_id: x.review.document_id,
    content: {
      ...x.review.material.content,
      notes: "Alteração fictícia explícita",
    },
  });
  const bind = {
    session_id: x.session,
    review_id: changed.id,
    expected_revision: x.w.revision,
    idempotency_key: randomUUID(),
  };
  const rebound = await call("chat_document_bind", bind);
  expect(rebound.error).toBeUndefined();
  expect(rebound.workspace.identityId).toBeNull();
  expect(rebound.workspace.deliveryRequested).toBe(false);
  expect((await call("chat_document_bind", bind)).workspace.id).toBe(x.w.id);
  expect((await confirm(x, c, id)).error).toBe("stale");
});
test("salvamento em outra interface impede confirmação antiga da versão não persistida", async () => {
  const x = await setup(),
    c = await challenge(x);
  await present(x, c);
  const id = await input(x, c);
  expect(
    (
      await f.rpc("document_review_command", {
        action: "save",
        payload: { review_id: x.review.id },
      })
    ).error,
  ).toBeUndefined();
  expect((await confirm(x, c, id)).error).toBe("stale");
});
test("destinatário exige política, menor usa responsável e contato alterado invalida autorização", async () => {
  const absent = await setup("exam_request", f.absent);
  expect(
    (
      await call("chat_document_select_delivery", {
        workspace_id: absent.w.id,
        expected_revision: absent.w.revision,
        requested: true,
      })
    ).error,
  ).toBe("recipient_unavailable");
  const x = await setup("prescription", f.minor),
    c = await challenge(x, true);
  expect(c.summary.delivery.recipient.category).toBe("guardian");
  expect(JSON.stringify(c)).not.toContain("11988880003");
  await present(x, c);
  const id = await input(x, c);
  sql(
    `update clinical.athlete_contacts set guardian_contact='11988880004' where athlete_id='${f.minor}'`,
  );
  try {
    expect((await confirm(x, c, id)).error).toBe("stale");
  } finally {
    sql(
      `update clinical.athlete_contacts set guardian_contact='11988880003' where athlete_id='${f.minor}'`,
    );
  }
});
test("expiração e múltiplos desafios apresentados impedem autorização implícita", async () => {
  const x = await setup(),
    c = await challenge(x);
  await present(x, c);
  const expired = clone(c, {
    created_at: "2020-01-01T00:00:00Z",
    expires_at: "2020-01-01T00:05:00Z",
  });
  const old = await input(x, expired);
  expect((await confirm(x, expired, old)).error).toBe("expired");
  const duplicate = clone(c);
  const id = await input(x, c);
  expect((await confirm(x, c, id)).error).toBe("ambiguous");
  expect(
    (
      await call("chat_operation_cancel", {
        session_id: x.session,
        challenge_id: duplicate.id,
      })
    ).ok,
  ).toBe(true);
  expect((await confirm(x, c, id)).error).toBe("ambiguous");
  const fresh = await input(x, c);
  expect((await confirm(x, c, fresh)).authorizationId).toBeTruthy();
});
test("revogação, desconexão e gate de modo são revalidados", async () => {
  let x = await setup(),
    c = await challenge(x);
  await present(x, c);
  let id = await input(x, c);
  sql(
    `update clinical.athlete_access set can_read_records=false where athlete_id='${f.athlete}' and professional_id='${f.owner.id}'`,
  );
  try {
    expect((await confirm(x, c, id)).error).toBe("denied");
  } finally {
    sql(
      `update clinical.athlete_access set can_read_records=true where athlete_id='${f.athlete}' and professional_id='${f.owner.id}'`,
    );
  }
  x = await setup();
  c = await challenge(x);
  await present(x, c);
  id = await input(x, c);
  await f.rpc("signing_demo_command", { action: "disconnect", payload: {} });
  expect((await confirm(x, c, id)).error).toBe("stale");
  await f.rpc("signing_demo_command", { action: "connect", payload: {} });
  x = await setup();
  c = await challenge(x);
  await present(x, c);
  id = await input(x, c);
  await admin.rpc("configure_signing_demo", { enabled: false });
  try {
    expect((await confirm(x, c, id)).error).toBe("mode_unavailable");
  } finally {
    await admin.rpc("configure_signing_demo", { enabled: true });
  }
});
test("cliente/modelo não atesta origem humana nem apresentação; escopo e evidências protegidos", async () => {
  const x = await setup(),
    c = await challenge(x);
  const forged = await f.owner.client.rpc("chat_capture_human_input", {
    actor: f.owner.id,
    session_id: x.session,
    challenge_id: c.id,
    message_key: randomUUID(),
    original_text: "Sim",
    input_mode: "text",
  });
  expect(forged.error).toBeTruthy();
  const fakePresentation = await f.owner.client.rpc("chat_operation_present", {
    actor: f.owner.id,
    session_id: x.session,
    challenge_id: c.id,
    nonce: c.nonce,
    summary_hash: c.summaryHash,
  });
  expect(fakePresentation.error).toBeTruthy();
  expect(
    (await call("chat_document_state", { session_id: x.session }, f.other))
      .error,
  ).toBe("denied");
  expect(() =>
    sql(
      `update clinical.chat_operation_challenges set execution_mode='production' where id='${c.id}'`,
    ),
  ).toThrow();
  expect(() =>
    sql(
      `update clinical.chat_operation_challenges set nonce=gen_random_uuid() where id='${c.id}'`,
    ),
  ).toThrow();
  expect(
    sql(
      `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('chat_capture_human_input','chat_operation_present') and has_function_privilege('authenticated',p.oid,'EXECUTE')`,
    ),
  ).toBe("0");
});
test("catálogo é explícito, schemas estritos e nenhuma ferramenta nova anunciada ao modelo", () => {
  expect(Object.keys(clinicalCapabilities)).toHaveLength(21);
  expect(
    Object.values(clinicalCapabilities).every(
      (c) =>
        !c.exposedToModel &&
        c.service &&
        c.audit &&
        c.permission &&
        c.confirmation,
    ),
  ).toBe(true);
  expect(validateClinicalCapability("__proto__", {}).success).toBe(false);
  expect(
    validateClinicalCapability("document.proposal.patch", {
      workspaceId: randomUUID(),
      revision: 1,
      kind: "prescription",
      changes: [
        { operation: "set_field", field: "status", value: "finalized" },
      ],
    }).success,
  ).toBe(false);
  expect(
    operationGatewayInput.safeParse({
      action: "confirm",
      sessionId: randomUUID(),
      challengeId: randomUUID(),
      nonce: randomUUID(),
      messageId: randomUUID(),
      message: "Sim",
      actor: f.owner.id,
      confirmed: true,
      executionMode: "production",
    }).success,
  ).toBe(false);
});

test("inatividade é verificada antes de preparar ou confirmar, sem reativação implícita", async () => {
  const x = await setup(),
    c = await challenge(x);
  await present(x, c);
  const id = await input(x, c);
  sql(
    `update clinical.conversation_sessions set last_activity_at=clock_timestamp()-interval '25 hours' where id='${x.session}'`,
  );
  expect((await confirm(x, c, id)).error).toBe("denied");
  expect(
    sql(
      `select status from clinical.conversation_sessions where id='${x.session}'`,
    ),
  ).toBe("idle");
  expect((await call("conversation_resume", { target: x.session })).ok).toBe(
    true,
  );
  expect((await confirm(x, c, id)).error).toBe("stale");
});
