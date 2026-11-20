import { test, expect } from "./fixtures.mjs";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  workflowFixture,
  workflowSql as sql,
  workflowAdmin as admin,
} from "./helpers/workflow-fixtures.mjs";
let f, session;
const contents = {};
const migration =
  sql(
    "select to_regprocedure('public.chat_operation_execute(uuid)') is not null",
  ) === "t"
    ? ""
    : readFileSync(
        new URL(
          "../supabase/migrations/20261120001100_chat_workflow_execution.sql",
          import.meta.url,
        ),
        "utf8",
      );
const q = (v) => "'" + String(v).replaceAll("'", "''") + "'";
const out = (v) => `select 'RESULT:'||(${v})::text;`;
const req = "(select (data->'document'->>'requestId')::uuid from created)";
const wid = "(select (data->>'id')::uuid from w)";
const cid = "(select (data->>'id')::uuid from c)";
const aid = "(select (data->>'authorizationId')::uuid from a)";
const execute = `public.chat_operation_execute(${aid})`;
function setup(kind = "prescription", delivery = false) {
  return `create temp table created as select public.chat_document_proposal_create('${f.athlete}','${kind}',${q(JSON.stringify(contents[kind]))}::jsonb,'${randomUUID()}') as data;
create temp table reviewed as select public.chat_document_proposal_review(${req},1,(select data->'document'->>'contentHash' from created),'${randomUUID()}') as data;
create temp table w as select data->'workspace' as data from reviewed;
update w set data=(public.chat_document_select_identity(${wid},(data->>'revision')::int,'${f.inventory.identities[0].id}')->'workspace');
${delivery ? `update w set data=(public.chat_document_select_delivery(${wid},(data->>'revision')::int,true)->'workspace');` : ""}
create temp table c as select public.chat_operation_prepare(${wid},(data->>'revision')::int,'${randomUUID()}')->'challenge' as data from w;
select public.chat_operation_present('${f.owner.id}','${session}',${cid},(data->>'nonce')::uuid,data->>'summaryHash') from c;
create temp table human as select public.chat_capture_human_input('${f.owner.id}','${session}',${cid},'${randomUUID()}','${delivery ? "Confirmo esta versão, a assinatura e o envio para o destinatário apresentado" : "Confirmo esta versão e a assinatura"}','text') as data;
create temp table a as select public.chat_operation_confirm('${session}',${cid},(select (data->>'nonce')::uuid from c),(select (data->>'inputId')::uuid from human)) as data;`;
}
function run(body) {
  return sql(
    `begin;${migration}select set_config('request.jwt.claim.sub','${f.owner.id}',true);${body}rollback;`,
  )
    .split("\n")
    .filter((s) => s.startsWith("RESULT:"))
    .map((s) => JSON.parse(s.slice(7)));
}
test.beforeAll(async () => {
  f = await workflowFixture();
  for (const k of ["prescription", "exam_request", "surgical_order"])
    contents[k] = (await f.prepare(k)).material.content;
});
test.beforeEach(async () => {
  session = (await f.rpc("conversation_start", {})).session.id;
  await f.rpc("conversation_set_context", { context_athlete: f.athlete });
});
test.afterAll(async () => {
  await f?.cleanup();
});
for (const kind of ["prescription", "exam_request", "surgical_order"])
  test(`${kind}: receipt invokes native orchestrator once and locks document`, () => {
    const [receipt, first, again, counts, doc, audit] = run(
      setup(kind, true) +
        out("(select data from a)") +
        out(execute) +
        out(execute) +
        out(
          `(select jsonb_build_object('execution',(select count(*) from clinical.chat_operation_executions where professional_id=auth.uid()),'attempts',(select count(*) from clinical.signature_attempts where professional_id=auth.uid()),'delivery',(select count(*) from clinical.document_delivery_requests where professional_id=auth.uid())))`,
        ) +
        out(
          `public.chat_document_workflow(${req},1,(select data->'document'->>'contentHash' from created))`,
        ) +
        out(
          `(select jsonb_agg(origin_channel) from clinical.audit_events where actor_user_id=auth.uid() and operation='signature.confirmed')`,
        ),
    );
    expect(receipt.error, JSON.stringify(receipt)).toBeUndefined();
    expect(first.error, JSON.stringify(first)).toBeUndefined();
    expect(again.duplicate).toBe(true);
    expect(counts).toEqual({ execution: 1, attempts: 1, delivery: 1 });
    expect(doc.document.documentId).toBeTruthy();
    expect(doc.workflow.signature.provenance).toBe("simulated");
    expect(audit).toEqual(["ai_chat"]);
  });
for (const [name, mutation] of [
  [
    "closed",
    () =>
      `update clinical.conversation_sessions set status='closed' where id='${session}';`,
  ],
  [
    "context changed and returned",
    () =>
      `select public.conversation_set_context('${f.minor}');select public.conversation_set_context('${f.athlete}');`,
  ],
  [
    "revoked",
    () =>
      `update clinical.athlete_access set can_read_records=false where professional_id=auth.uid();`,
  ],
  [
    "identity disconnected",
    () =>
      `update clinical.signature_connections set state='disconnected' where professional_id=auth.uid();`,
  ],
  [
    "contact changed",
    () =>
      `update clinical.athlete_contacts set phone='11911112222' where athlete_id='${f.athlete}';`,
  ],
  [
    "mode disabled",
    () => `update clinical.signing_environment set demo_enabled=false;`,
  ],
  [
    "foreign actor",
    () => `select set_config('request.jwt.claim.sub','${f.other.id}',true);`,
  ],
  [
    "content changed",
    () =>
      `select public.chat_document_proposal_patch(${req},1,(select data->'document'->>'contentHash' from created),'[{"operation":"set_field","field":"notes","value":"Nova nota DEMO"}]','${randomUUID()}');`,
  ],
])
  test(`execution revalidates ${name}`, () => {
    const [result, count] = run(
      setup("prescription", true) +
        mutation() +
        out(execute) +
        out(
          `(select to_jsonb(count(*)) from clinical.chat_operation_executions where professional_id='${f.owner.id}')`,
        ),
    );
    expect(result.error, JSON.stringify(result)).toBeTruthy();
    expect(count).toBe(0);
  });
test("no valid receipt and private evidence permissions", () => {
  const [r, permissions] = run(
    out(`public.chat_operation_execute('${randomUUID()}')`) +
      out(
        `(select to_jsonb(has_table_privilege('authenticated','clinical.chat_operation_executions','INSERT')))`,
      ),
  );
  expect(r.error).toBe("denied");
  expect(permissions).toBe(false);
});

const status = `select public.signing_demo_command('status',jsonb_build_object('attempt_id',(select result->'attempt'->>'id' from clinical.chat_operation_executions where authorization_id=${aid})));`;
const flow = (action, text, key = randomUUID()) =>
  `public.chat_document_workflow(${req},1,(select data->'document'->>'contentHash' from created),'${action}','${key}',${q(text)})`;
test("derived draft is linked, explicit, editable and replay cannot overwrite its edits", () => {
  const key = randomUUID();
  const [blocked, first, again, patched, changed] = run(
    setup() +
      `select ${execute};` +
      status +
      out(flow("derive", "crie um derivado")) +
      `create temp table derived as select ${flow("derive", "Confirmo criar um documento derivado", key)} as data;` +
      out("(select data from derived)") +
      out(flow("derive", "Confirmo criar um documento derivado", key)) +
      out(
        `public.chat_document_proposal_patch((select (data->'document'->>'requestId')::uuid from derived),1,(select data->'document'->>'contentHash' from derived),'[{"operation":"set_field","field":"notes","value":"Edição do derivado DEMO"}]','${randomUUID()}')`,
      ) +
      out(flow("derive", "Confirmo criar um documento derivado", key)),
  );
  expect(blocked.error).toBe("confirmation_required");
  expect(first.error, JSON.stringify(first)).toBeUndefined();
  expect(again.document.requestId).toBe(first.document.requestId);
  expect(patched.document.version).toBe(2);
  expect(changed.document.version).toBe(2);
});
test("retry uses original explicit justification and does not sign again", () => {
  const key = randomUUID();
  const [blocked, ok, again, count] = run(
    setup("prescription", true) +
      `select ${execute};` +
      status +
      `select clinical.delivery_transition(id,'processing') from clinical.document_delivery_requests where professional_id=auth.uid();select clinical.delivery_transition(id,'failed') from clinical.document_delivery_requests where professional_id=auth.uid();update clinical.document_delivery_requests set failure_kind='retryable' where professional_id=auth.uid();` +
      out(flow("retry", "Tente novamente")) +
      out(
        flow(
          "retry",
          "Confirmo tentar novamente a entrega; justificativa: Falha temporária DEMO",
          key,
        ),
      ) +
      out(
        flow(
          "retry",
          "Confirmo tentar novamente a entrega; justificativa: Falha temporária DEMO",
          key,
        ),
      ) +
      out(
        `(select to_jsonb(count(*)) from clinical.signature_attempts where professional_id=auth.uid())`,
      ),
  );
  expect(blocked.error).toBe("confirmation_required");
  expect(ok.error, JSON.stringify(ok)).toBeUndefined();
  expect(again.duplicate).toBe(true);
  expect(count).toBe(1);
});

test("receipt expiry is checked again at execution", () => {
  const [result] = run(
    setup() +
      `set local session_replication_role='replica';update clinical.chat_operation_challenges set expires_at=clock_timestamp()-interval '1 second' where id=${cid};set local session_replication_role='origin';` +
      out(execute),
  );
  expect(result.error).toBe("expired");
});
test("resend is idempotent and does not create a new signature", () => {
  const key = randomUUID();
  const [first, again, count] = run(
    setup("prescription", true) +
      `select ${execute};` +
      status +
      `select clinical.delivery_transition(id,'processing') from clinical.document_delivery_requests where professional_id=auth.uid();select clinical.delivery_transition(id,'accepted_by_provider') from clinical.document_delivery_requests where professional_id=auth.uid();select clinical.delivery_transition(id,'delivered') from clinical.document_delivery_requests where professional_id=auth.uid();` +
      out(
        flow(
          "resend",
          "Confirmo reenviar o documento; justificativa: Nova cópia solicitada DEMO",
          key,
        ),
      ) +
      out(
        flow(
          "resend",
          "Confirmo reenviar o documento; justificativa: Nova cópia solicitada DEMO",
          key,
        ),
      ) +
      out(
        `(select to_jsonb(count(*)) from clinical.signature_attempts where professional_id=auth.uid())`,
      ),
  );
  expect(first.error, JSON.stringify(first)).toBeUndefined();
  expect(again.duplicate).toBe(true);
  expect(count).toBe(1);
});
test("two concurrent consumers of one human receipt produce one native attempt", async () => {
  const rv = await f.prepare("prescription");
  let state = await f.rpc("chat_document_bind", {
    session_id: session,
    review_id: rv.id,
    expected_revision: 0,
    idempotency_key: randomUUID(),
  });
  state = await f.rpc("chat_document_select_identity", {
    workspace_id: state.workspace.id,
    expected_revision: state.workspace.revision,
    identity_id: f.inventory.identities[0].id,
  });
  const c = (
    await f.rpc("chat_operation_prepare", {
      workspace_id: state.workspace.id,
      expected_revision: state.workspace.revision,
      idempotency_key: randomUUID(),
    })
  ).challenge;
  const trusted = async (name, args) => {
    const r = await admin.rpc(name, { actor: f.owner.id, ...args });
    expect(r.error).toBeNull();
    return r.data;
  };
  await trusted("chat_operation_present", {
    session_id: session,
    challenge_id: c.id,
    nonce: c.nonce,
    summary_hash: c.summaryHash,
  });
  const human = await trusted("chat_capture_human_input", {
    session_id: session,
    challenge_id: c.id,
    message_key: randomUUID(),
    original_text: "Confirmo esta versão e a assinatura",
    input_mode: "text",
  });
  const auth = await f.rpc("chat_operation_confirm", {
    session_id: session,
    challenge_id: c.id,
    nonce: c.nonce,
    input_id: human.inputId,
  });
  const results = await Promise.all([
    f.rpc("chat_operation_execute", { authorization_id: auth.authorizationId }),
    f.rpc("chat_operation_execute", { authorization_id: auth.authorizationId }),
  ]);
  expect(
    results.every((r) => !r.error),
    JSON.stringify(results),
  ).toBe(true);
  expect(results.filter((r) => r.duplicate)).toHaveLength(1);
  expect(
    sql(
      `select count(*) from clinical.signature_attempts where professional_id='${f.owner.id}'`,
    ),
  ).toBe("1");
});
