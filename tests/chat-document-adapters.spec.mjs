import { test, expect } from "./fixtures.mjs";
import { randomUUID } from "node:crypto";
import { updateDocumentTurn } from "../src/features/chat/transcript.ts";
import { readFileSync } from "node:fs";
import {
  workflowFixture,
  workflowSql as sql,
} from "./helpers/workflow-fixtures.mjs";
import {
  resolveProposalEdit,
  proposalIntent,
} from "../src/features/chat/operations/document-intent.ts";
import {
  presentedDocument,
  storedDocument,
  displayedDocumentProposals,
} from "../src/features/chat/document-draft.ts";

const migration =
  sql(
    "select to_regprocedure('public.chat_document_card(uuid,integer,text,text,jsonb,uuid,text)') is not null",
  ) === "t"
    ? ""
    : readFileSync(
        new URL(
          "../supabase/migrations/20261120000800_chat_document_adapters.sql",
          import.meta.url,
        ),
        "utf8",
      );
const quote = (v) => `'${String(v).replaceAll("'", "''")}'`;
const json = (v) => `${quote(JSON.stringify(v))}::jsonb`;
const result = (v) => `select 'RESULT:'||(${v})::text;`;
let f, session;
const docs = {};
function run(body, user = f.owner.id) {
  return sql(
    `begin;${migration}select set_config('request.jwt.claim.sub','${user}',true);${body}rollback;`,
  )
    .split("\n")
    .filter((s) => s.startsWith("RESULT:"))
    .map((s) => JSON.parse(s.slice(7)));
}
test.beforeAll(async () => {
  f = await workflowFixture();
  session = (await f.rpc("conversation_start", {})).session.id;
  await f.rpc("conversation_set_context", { context_athlete: f.athlete });
  for (const kind of ["prescription", "exam_request", "surgical_order"]) {
    const r = await f.prepare(kind);
    const p = { id: r.document_id, kind, content: r.material.content };
    expect(
      (
        await f.rpc("clinical_document_proposal_register", {
          target: f.athlete,
          request_id: p.id,
          kind,
          payload: p.content,
        })
      ).ok,
    ).toBe(true);
    p.hash = sql(
      `select content_hash from clinical.document_proposals where request_id='${p.id}'`,
    );
    docs[kind] = p;
  }
});
test.afterAll(async () => {
  await f?.cleanup();
});
function card(
  p,
  content,
  intent = "save",
  key = randomUUID(),
  version = 1,
  hash = p.hash,
) {
  return `public.chat_document_card('${p.id}',${version},'${hash}','${p.kind}',${json(content)},'${key}','${intent}')`;
}
for (const kind of ["prescription", "exam_request", "surgical_order"])
  test(`${kind}: human card edits, reviews and saves the same persisted source`, () => {
    const p = docs[kind],
      key = randomUUID();
    const content = {
      ...p.content,
      [kind === "prescription" ? "notes" : "additional"]:
        "Texto humano EXATO DEMO",
    };
    const [saved, replay, counts, stale] = run(
      result(card(p, content, "save", key)) +
        result(card(p, content, "save", key)) +
        result(
          `(select jsonb_build_object('documents',(select count(*) from clinical.documents where id='${p.id}'),'version',(select version from clinical.document_proposals where request_id='${p.id}'),'events',(select count(*) from clinical.audit_events where resource_id='${p.id}' and operation='document.draft_created'),'attempts',(select count(*) from clinical.signature_attempts where professional_id=auth.uid())) )`,
        ) +
        result(card(p, p.content)),
    );
    expect(saved.error, JSON.stringify(saved)).toBeUndefined();
    expect(replay).toEqual(saved);
    expect(saved.document.content).toEqual(content);
    expect(saved.document.state).toBe("saved");
    expect(saved.document.version).toBe(2);
    expect(counts).toEqual({
      documents: 1,
      version: 2,
      events: 1,
      attempts: 0,
    });
    expect(stale.error).toBe("conflict");
  });
test("review persists local edits and returns the shared material without clinical save", () => {
  const p = docs.prescription,
    content = { ...p.content, notes: "Revisão humana DEMO" },
    key = randomUUID();
  const [reviewed, again, counts, provenance] = run(
    result(card(p, content, "review", key)) +
      result(card(p, content, "review", key)) +
      result(`(select count(*) from clinical.documents where id='${p.id}')`) +
      result(
        `(select jsonb_agg(jsonb_build_object('channel',origin_channel,'method',execution_method)) from clinical.audit_events where operation='document_review.opened' and resource_id=(select id from clinical.document_reviews where idempotency_key='${key}' and professional_id=auth.uid()))`,
      ),
  );
  expect(reviewed.error, JSON.stringify(reviewed)).toBeUndefined();
  expect(again).toEqual(reviewed);
  expect(reviewed.review.material.content).toEqual(content);
  expect(reviewed.document.content).toEqual(content);
  expect(counts).toBe(0);
  expect(provenance).toEqual([{ channel: "ai_chat", method: "human_ui" }]);
});
test("CAS verifies displayed hash, not only version", () => {
  const p = docs.prescription;
  const [r] = run(
    result(card(p, p.content, "save", randomUUID(), 1, "0".repeat(32))),
  );
  expect(r.error).toBe("conflict");
});
for (const intent of ["sign", "finalize", "deliver"])
  test(`card cannot ${intent}`, () => {
    const p = docs.prescription;
    expect(run(result(card(p, p.content, intent)))[0].error).toBe("invalid");
  });
test("conversation stores thin references and rehydrates latest authorized proposal", () => {
  const p = docs.prescription;
  const transcript = [
    {
      id: "draft-ref",
      role: "assistant",
      text: "Proposta DEMO",
      document: {
        requestId: p.id,
        athleteId: f.athlete,
        kind: p.kind,
        state: "proposal",
      },
    },
  ];
  const changes = [
    { operation: "set_field", field: "notes", value: "Versão nova EXATA DEMO" },
  ];
  const [saved, thin, edited, current, revoked] = run(
    result(
      `public.conversation_save('${session}','${f.athlete}',${json(transcript)})`,
    ) +
      result(
        `(select document from clinical.conversation_messages where session_id='${session}' and client_id='draft-ref')`,
      ) +
      result(
        `public.chat_document_proposal_patch('${p.id}',1,'${p.hash}',${json(changes)},'${randomUUID()}')`,
      ) +
      result("public.conversation_current()") +
      `update clinical.athlete_access set can_read_records=false where athlete_id='${f.athlete}' and professional_id=auth.uid();` +
      result("public.conversation_current()"),
  );
  expect(saved.ok).toBe(true);
  expect(thin.requestId).toBe(p.id);
  expect(thin.content).toBeUndefined();
  expect(thin.contentHash).toBeUndefined();
  expect(edited.document.version).toBe(2);
  expect(current.messages[0].document.content.notes).toBe(
    "Versão nova EXATA DEMO",
  );
  expect(current.messages[0].document.version).toBe(2);
  expect(revoked.ok).toBe(false);
  expect(revoked.messages).toEqual([]);
});
test("read and card do not reveal another professional's proposal", () => {
  const p = docs.prescription;
  const [read, write] = run(
    result(`public.chat_document_proposal_read('${p.id}',null)`) +
      result(card(p, p.content)),
    f.other.id,
  );
  expect(read.document).toBeUndefined();
  expect(write.error).toBe("denied");
});
test("thin serializer omits clinical content for pending and saved proposals", () => {
  const p = docs.prescription;
  const d = presentedDocument({
    requestId: p.id,
    athleteId: f.athlete,
    kind: p.kind,
    state: "proposal",
    content: p.content,
    athleteName: "Atleta DEMO",
    professionalName: "Médico DEMO",
    contentHash: p.hash,
    version: 1,
  });
  expect(storedDocument(d).content).toBeUndefined();
  expect(storedDocument(d).requestId).toBe(p.id);
});
function sample(items = 3) {
  return {
    kind: "prescription",
    content: {
      notes: "Geral DEMO",
      items: Array.from({ length: items }, (_, n) => ({
        id: randomUUID(),
        name: `Medicamento DEMO ${n + 1}`,
        dose: "Original",
        instructions: "Original",
      })),
    },
  };
}
test("natural edits preserve literal spelling and target UUIDs rather than array offsets", () => {
  const d = sample();
  const r = resolveProposalEdit(
    "Altere a dose do segundo medicamento para Grafia EXATA µg/mL e acrescente a orientação do terceiro medicamento: não realizar ATIVIDADE DEMO",
    d,
  );
  expect(r.changes).toEqual([
    {
      operation: "set_field",
      field: "dose",
      itemId: d.content.items[1].id,
      value: "Grafia EXATA µg/mL",
    },
    {
      operation: "append_field",
      field: "instructions",
      itemId: d.content.items[2].id,
      value: "não realizar ATIVIDADE DEMO",
    },
  ]);
});
for (const message of [
  "Altere a dose do segundo medicamento",
  "Altere a dose para VALOR DEMO",
  "Se estiver certo, altere a dose do segundo medicamento para DEMO",
  "Altere a dose do primeiro e segundo medicamento para DEMO",
  "Altere a dose do décimo terceiro medicamento para DEMO",
  "Não altere a dose do segundo medicamento para DEMO",
  "Pode alterar a dose do segundo medicamento para DEMO?",
  "Altere dose e via do segundo medicamento para DEMO",
  "Remova o primeiro medicamento e altere a dose do segundo medicamento para DEMO",
  "Altere a dose do segundo medicamento do João DEMO para VALOR DEMO",
  "Remova o segundo medicamento do atleta João DEMO",
  "Altere a dose da segunda prescrição para VALOR DEMO",
])
  test(`ambiguous or incomplete input asks: ${message}`, () => {
    expect(resolveProposalEdit(message, sample()).clarification).toBeTruthy();
  });
test("single-item drafts still reject nonexistent names and removing a field is not removing a medication", () => {
  expect(
    resolveProposalEdit(
      "Altere a dose do medicamento inexistente para DEMO",
      sample(1),
    ).clarification,
  ).toBeTruthy();
  expect(
    resolveProposalEdit("Remova a observação", sample(1)).clarification,
  ).toBeTruthy();
});
test("adding names has stable supplied UUIDs and does not fill other clinical fields", () => {
  const id = randomUUID();
  expect(
    resolveProposalEdit(
      "Adicione um medicamento chamado Nome CIENTÍFICO DEMO",
      sample(),
      () => id,
    ).changes,
  ).toEqual([
    { operation: "add_item", item: { id, name: "Nome CIENTÍFICO DEMO" } },
  ]);
  expect(proposalIntent("Altere a evolução para texto DEMO")).toBeNull();
  expect(proposalIntent("Mostre a prescrição do João DEMO")).toBeNull();
});
test("explicit selection keeps an older card even beyond the twelve-document request limit", () => {
  const turns = Array.from({ length: 15 }, () => ({
    document: {
      ...sample(),
      requestId: randomUUID(),
      athleteId: f.athlete,
      version: 1,
      contentHash: "1".repeat(32),
      state: "proposal",
    },
  }));
  expect(displayedDocumentProposals(turns, null)).toHaveLength(12);
  expect(
    displayedDocumentProposals(turns, turns[0].document.requestId).map(
      (p) => p.requestId,
    ),
  ).toEqual([turns[0].document.requestId]);
});
test("a discarded selected card never falls back to modifying another document", () => {
  const p = {
    ...sample(),
    requestId: randomUUID(),
    athleteId: f.athlete,
    version: 1,
    contentHash: "1".repeat(32),
    state: "discarded",
  };
  expect(
    displayedDocumentProposals(
      [
        { document: p },
        { document: { ...p, requestId: randomUUID(), state: "proposal" } },
      ],
      p.requestId,
    ),
  ).toEqual([]);
});
test("late card callbacks cannot resurrect an old card or replace a newer revision", () => {
  const p = { ...sample(), requestId: randomUUID(), version: 2 };
  const turns = [
    { id: "old", document: null },
    { id: "current", document: p },
  ];
  expect(updateDocumentTurn(turns, "old", { ...p, version: 1 }, null)).toBe(
    turns,
  );
  expect(updateDocumentTurn(turns, "current", { ...p, version: 1 }, null)).toBe(
    turns,
  );
  expect(
    updateDocumentTurn(turns, "current", { ...p, version: 3 }, null)[1].document
      .version,
  ).toBe(3);
});
test("natural dose changes do not concatenate a new unit with the existing unit", () => {
  const d = sample(1);
  d.content.items[0].dose = "1";
  d.content.items[0].dose_unit = "UNIDADE DEMO";
  expect(
    resolveProposalEdit("Altere a dose para 2%", d).clarification,
  ).toBeTruthy();
  expect(
    resolveProposalEdit("Altere a dose para 2 OUTRA UNIDADE DEMO", d)
      .clarification,
  ).toBeTruthy();
  expect(
    resolveProposalEdit("Acrescente a dose: 2", d).clarification,
  ).toBeTruthy();
  expect(resolveProposalEdit("Altere a dose para 2", d).changes).toEqual([
    {
      operation: "set_field",
      field: "dose",
      value: "2",
      itemId: d.content.items[0].id,
    },
  ]);
});
test("general prescription guidance uses notes and item observations use instructions", () => {
  const d = sample();
  expect(
    resolveProposalEdit("Acrescente a orientação geral: Texto EXATO DEMO", d)
      .changes,
  ).toEqual([
    { operation: "append_field", field: "notes", value: "Texto EXATO DEMO" },
  ]);
  expect(
    resolveProposalEdit(
      "Altere a observação do segundo medicamento para Texto EXATO DEMO",
      d,
    ).changes,
  ).toEqual([
    {
      operation: "set_field",
      field: "instructions",
      itemId: d.content.items[1].id,
      value: "Texto EXATO DEMO",
    },
  ]);
});
