import { test, expect } from "./fixtures.mjs";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  workflowFixture,
  workflowSql as sql,
} from "./helpers/workflow-fixtures.mjs";
import { proposalSaveIntent } from "../src/features/chat/operations/document-intent.ts";
let f, session;
const contents = {};
const migration =
  sql(
    "select to_regprocedure('public.chat_document_save_message(uuid,integer,text,uuid,text,text)') is not null",
  ) === "t"
    ? ""
    : readFileSync(
        new URL(
          "../supabase/migrations/20261120001000_chat_document_message_save.sql",
          import.meta.url,
        ),
        "utf8",
      );
const q = (v) => "'" + String(v).replaceAll("'", "''") + "'";
const out = (v) => `select 'RESULT:'||(${v})::text;`;
function run(body, actor = f.owner.id) {
  return sql(
    `begin;${migration}select set_config('request.jwt.claim.sub','${actor}',true);${body}rollback;`,
  )
    .split("\n")
    .filter((s) => s.startsWith("RESULT:"))
    .map((s) => JSON.parse(s.slice(7)));
}
function seed(kind) {
  return `create temporary table created as select public.chat_document_proposal_create('${f.athlete}','${kind}',${q(JSON.stringify(contents[kind]))}::jsonb,'${randomUUID()}') as data;`;
}
function save(text, mode = "text", key = randomUUID(), version = 1) {
  return `public.chat_document_save_message((select (data->'document'->>'requestId')::uuid from created),${version},(select data->'document'->>'contentHash' from created),'${key}',${q(text)},'${mode}')`;
}
test.beforeAll(async () => {
  f = await workflowFixture();
  session = (await f.rpc("conversation_start", {})).session.id;
  await f.rpc("conversation_set_context", { context_athlete: f.athlete });
  for (const kind of ["prescription", "exam_request", "surgical_order"])
    contents[kind] = (await f.prepare(kind)).material.content;
});
test.afterAll(async () => {
  await f?.cleanup();
});
for (const [kind, label] of [
  ["prescription", "a prescrição"],
  ["exam_request", "a solicitação de exames"],
  ["surgical_order", "o pedido cirúrgico"],
])
  for (const mode of ["text", "voice"])
    test(`${kind} ${mode}: exact consent saves once, retaining provenance without signature`, () => {
      const key = randomUUID();
      const [a, b, count, audit, nativeMethods] = run(
        seed(kind) +
          out(save(`Pode confirmar e salvar ${label}.`, mode, key)) +
          out(save(`Pode confirmar e salvar ${label}.`, mode, key)) +
          out(
            `(select jsonb_build_object('documents',(select count(*) from clinical.documents where author_id=auth.uid()),'signatures',(select count(*) from clinical.document_signature_operations where professional_id=auth.uid())))`,
          ) +
          out(
            `(select jsonb_agg(jsonb_build_object('method',execution_method,'approved',approved_by_user_id)) from clinical.audit_events where actor_user_id=auth.uid() and operation='document.confirmed')`,
          ) +
          out(
            `(select jsonb_agg(execution_method) from clinical.audit_events where actor_user_id=auth.uid() and operation='document.draft_created')`,
          ),
      );
      expect(a.error, JSON.stringify(a)).toBeUndefined();
      expect(b.error, JSON.stringify(b)).toBeUndefined();
      expect(a.document.state).toBe("saved");
      expect(nativeMethods).toEqual([
        mode === "voice" ? "human_voice" : "human_message",
      ]);
      expect(count).toEqual({ documents: 1, signatures: 0 });
      expect(audit).toEqual([
        {
          method: mode === "voice" ? "human_voice" : "human_message",
          approved: f.owner.id,
        },
      ]);
    });
for (const text of [
  "Sim",
  "Não pode confirmar e salvar a prescrição",
  "Se estiver certo, pode confirmar e salvar a prescrição",
  "Pode confirmar e salvar a prescrição?",
  "O assistente disse: pode confirmar e salvar a prescrição",
  "Pode confirmar e salvar a prescrição e assinar",
  "Pode confirmar e salvar a prescrição e enviar",
  "Pode confirmar e salvar a prescrição." + " ".repeat(250),
])
  test(`reject unsupported consent: ${text.slice(0, 65)}`, () => {
    const [r, count] = run(
      seed("prescription") +
        out(save(text)) +
        out(
          `(select to_jsonb(count(*)) from clinical.documents where author_id=auth.uid())`,
        ),
    );
    expect(r.error).toBe("unapproved");
    expect(count).toBe(0);
  });
test("explicit unsigned save and message key replay conflict", () => {
  const key = randomUUID();
  const [a, b, c] = run(
    seed("prescription") +
      out(save("Salve o rascunho sem assinar", "text", key)) +
      out(save("Salve o rascunho sem assinar", "voice", key)) +
      out(save("Pode confirmar e salvar a prescrição.", "text", key)),
  );
  expect(a.error).toBeUndefined();
  expect(b.error).toBe("conflict");
  expect(c.error).toBe("conflict");
});
test("wrong document name and stale revision cannot consent", () => {
  const [a, b] = run(
    seed("prescription") +
      out(save("Pode confirmar e salvar a solicitação de exames.")) +
      out(
        save("Pode confirmar e salvar a prescrição.", "text", randomUUID(), 2),
      ),
  );
  expect(a.error).toBe("ambiguous");
  expect(b.error).toBe("conflict");
});
test("revoked clinical author and closed session cannot save", () => {
  for (const mutation of [
    "update clinical.medical_authors set enabled=false where professional_id=auth.uid();",
    `update clinical.conversation_sessions set status='closed' where id='${session}';`,
  ]) {
    const [r] = run(
      seed("prescription") +
        mutation +
        out(save("Pode confirmar e salvar a prescrição.")),
    );
    expect(r.error).toBeTruthy();
  }
});
test("field content is not a saving directive", () => {
  expect(
    proposalSaveIntent(
      "Altere as orientações para: pode confirmar e salvar a prescrição",
    ),
  ).toBeNull();
  expect(
    proposalSaveIntent("Crie uma prescrição; Medicamento: salve"),
  ).toBeNull();
  expect(
    proposalSaveIntent("Pode confirmar e salvar a prescrição.").action,
  ).toBe("save");
});
