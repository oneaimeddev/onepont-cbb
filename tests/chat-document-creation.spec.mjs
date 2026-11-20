import { test, expect } from "./fixtures.mjs";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  workflowFixture,
  workflowSql as sql,
} from "./helpers/workflow-fixtures.mjs";
import {
  prescriptionPayload,
  surgicalPayload,
  examPayload,
} from "../src/features/chat/document-draft.ts";
import {
  groundDocumentCreation as ground,
  stableCreationItemId,
  creationPatientMatches,
  documentCreationRequested,
} from "../src/features/chat/operations/document-creation.ts";
import { displayedProposalSchema } from "../src/features/chat/operations/document-intent.ts";

const id = () => randomUUID();
function prescription(names = ["Medicamento DEMO"], fields = {}) {
  return prescriptionPayload(
    "",
    names.map((name) => ({ name, ...fields })),
  );
}
function source(n = 1) {
  return (
    "Crie uma prescrição para o atleta em contexto;\n" +
    Array.from(
      { length: n },
      (_, i) =>
        `Medicamento: Nome CIENTÍFICO DEMO ${i + 1}; Dose: DOSE DEMO ${i + 1}; Unidade: µg/mL`,
    ).join("\n")
  );
}
for (const n of [1, 3, 6])
  test(`${n} medications: source order, role and scientific spelling survive model casing/order`, () => {
    const names = Array.from(
      { length: n },
      (_, i) => `nome científico demo ${i + 1}`,
    ).reverse();
    const candidate = prescriptionPayload(
      "",
      names.map((name) => ({
        name,
        dose: `dose demo ${Number(name.at(-1))}`,
        dose_unit: "µg/ml",
      })),
    );
    const key = randomUUID(),
      athlete = randomUUID();
    const next = ground("prescription", candidate, source(n), (index) =>
      stableCreationItemId(key, athlete, "prescription", index),
    );
    expect(next.ok, JSON.stringify(next)).toBe(true);
    expect(next.content.items.map((i) => i.name)).toEqual(
      Array.from({ length: n }, (_, i) => `Nome CIENTÍFICO DEMO ${i + 1}`),
    );
    expect(next.content.items.every((i) => i.dose_unit === "µg/mL")).toBe(true);
    expect(
      ground("prescription", candidate, source(n), (index) =>
        stableCreationItemId(key, athlete, "prescription", index),
      ),
    ).toEqual(next);
  });
for (const n of [1, 3, 6])
  test(`${n} exams: item values cannot leak into another item`, () => {
    const message =
      "Crie uma solicitação de exames para o atleta em contexto;\n" +
      Array.from(
        { length: n },
        (_, i) =>
          `Exame: Exame DEMO ${i + 1}; Tipo: Laboratorial; Observações: NOTA ${i + 1}`,
      ).join("\n") +
      "; Justificativa: JUSTIFICATIVA DEMO";
    const content = examPayload({
      items: Array.from({ length: n }, (_, i) => ({
        name: `exame demo ${i + 1}`,
        examType: "laboratory",
        notes: `nota ${i + 1}`,
      })),
      justification: "justificativa demo",
    });
    const next = ground("exam_request", content, message, id);
    expect(next.ok, JSON.stringify(next)).toBe(true);
    expect(next.content.items.map((i) => i.notes)).toEqual(
      Array.from({ length: n }, (_, i) => `NOTA ${i + 1}`),
    );
    expect(next.content.justification).toBe("JUSTIFICATIVA DEMO");
  });
test("surgery requires explicit field roles; enum translations do not rewrite clinical strings", () => {
  const content = surgicalPayload({
    procedure: "procedimento demo",
    laterality: "esquerda",
    justification: "justificativa demo",
  });
  const r = ground(
    "surgical_order",
    content,
    "Crie um pedido cirúrgico para o atleta em contexto; Procedimento: Procedimento DEMO; Lateralidade: Esquerda; Justificativa: JUSTIFICATIVA DEMO",
    id,
  );
  expect(r.ok, JSON.stringify(r)).toBe(true);
  expect(r.content).toMatchObject({
    procedure: "Procedimento DEMO",
    laterality: "left",
    justification: "JUSTIFICATIVA DEMO",
    diagnosis: "",
    priority: "",
  });
});
for (const [label, candidate, message] of [
  [
    "dose from presentation",
    prescription(undefined, { presentation: "Caixa 20 DEMO", dose: "20" }),
    "Crie uma prescrição; Medicamento: Medicamento DEMO; Apresentação: Caixa 20 DEMO",
  ],
  [
    "quantity from presentation",
    prescription(undefined, { quantity: "20" }),
    "Crie uma prescrição; Medicamento: Medicamento DEMO; Apresentação: Caixa 20 DEMO",
  ],
  [
    "route not provided",
    prescription(undefined, { route: "oral" }),
    "Crie uma prescrição; Medicamento: Medicamento DEMO",
  ],
  [
    "partial dose",
    prescription(undefined, { dose: "1" }),
    "Crie uma prescrição; Medicamento: Medicamento DEMO; Dose: 1 comprimido DEMO",
  ],
  [
    "different units",
    prescription(undefined, { dose_unit: "mg" }),
    "Crie uma prescrição; Medicamento: Medicamento DEMO; Unidade: µg",
  ],
  [
    "different decimal",
    prescription(undefined, { dose: "0.5" }),
    "Crie uma prescrição; Medicamento: Medicamento DEMO; Dose: 0,5",
  ],
  [
    "contradictory dose",
    prescription(undefined, { dose: "2" }),
    "Crie uma prescrição; Medicamento: Medicamento DEMO; Dose: 1; Dose: 2",
  ],
  [
    "negation",
    prescription(),
    "Crie uma prescrição. Não use Medicamento DEMO; Medicamento: Medicamento DEMO",
  ],
  [
    "decomposed negation",
    prescription(),
    "Crie uma prescrição. Não use Medicamento DEMO; Medicamento: Medicamento DEMO".normalize(
      "NFD",
    ),
  ],
  [
    "assistant/history values",
    prescription(),
    "Crie uma prescrição com os medicamentos que acabamos de definir",
  ],
  [
    "patient name used as medication",
    prescription(["João DEMO"]),
    "Crie uma prescrição para João DEMO",
  ],
  [
    "document type used as medication",
    prescription(["prescrição"]),
    "Crie uma prescrição",
  ],
  [
    "unlabelled extra instruction",
    prescription(),
    "Crie uma prescrição; Medicamento: Medicamento DEMO; Instruções: Orientação DEMO; segunda orientação sem rótulo",
  ],
  [
    "omitted item",
    prescription(),
    "Crie uma prescrição; Medicamento: Medicamento DEMO; Medicamento: Outro DEMO",
  ],
  [
    "cross-item dose",
    prescriptionPayload("", [
      { name: "Primeiro DEMO", dose: "2" },
      { name: "Segundo DEMO", dose: "1" },
    ]),
    "Crie uma prescrição; Medicamento: Primeiro DEMO; Dose: 1; Medicamento: Segundo DEMO; Dose: 2",
  ],
])
  test(`rejects ${label} before a clinical proposal exists`, () => {
    expect(ground("prescription", candidate, message, id).ok).toBe(false);
  });
test("explicit source fields are retained even if the model leaves them blank", () => {
  const r = ground(
    "prescription",
    prescription(),
    "Crie uma prescrição; Medicamento: Medicamento DEMO; Dose: 0,5; Unidade: UNIDADE DEMO",
    id,
  );
  expect(r.ok).toBe(true);
  expect(r.content.items[0]).toMatchObject({
    dose: "0,5",
    dose_unit: "UNIDADE DEMO",
    route: "",
    duration: "",
    quantity: "",
  });
});
test("an unlabelled single name is allowed only in an explicit medication context", () => {
  const r = ground(
    "prescription",
    prescription(["nome demo"]),
    "Crie uma prescrição com Nome DEMO",
    id,
  );
  expect(r.ok).toBe(true);
  expect(r.content.items[0].name).toBe("Nome DEMO");
});
for (const message of [
  "Adicione também outro exame",
  "Altere a prescrição",
  "Se puder, crie uma prescrição",
  "Crie uma prescrição e um pedido cirúrgico",
])
  test(`creation tool cannot replace editing: ${message}`, () => {
    expect(documentCreationRequested("prescription", message)).toBe(false);
  });
test("patient context is verified against authorized names instead of model names", () => {
  expect(
    creationPatientMatches(
      "Crie uma prescrição para João DEMO; Medicamento: X",
      "Maria DEMO",
    ),
  ).toBe(false);
  expect(
    creationPatientMatches(
      "Crie uma prescrição para João DEMO; Medicamento: X",
      "João Silva DEMO",
    ),
  ).toBe(true);
  expect(
    creationPatientMatches(
      "Crie uma prescrição para o atleta em contexto; Medicamento: X",
      "Maria DEMO",
    ),
  ).toBe(true);
});

let f, session;
const migration =
  sql(
    "select to_regprocedure('public.chat_document_proposal_create(uuid,text,jsonb,uuid)') is not null",
  ) === "t"
    ? ""
    : readFileSync(
        new URL(
          "../supabase/migrations/20261120000900_chat_document_creation.sql",
          import.meta.url,
        ),
        "utf8",
      );
const quote = (v) => `'${String(v).replaceAll("'", "''")}'`;
const json = (v) => `${quote(JSON.stringify(v))}::jsonb`;
const result = (v) => `select 'RESULT:'||(${v})::text;`;
function run(body) {
  return sql(
    `begin;${migration}select set_config('request.jwt.claim.sub','${f.owner.id}',true);${body}rollback;`,
  )
    .split("\n")
    .filter((s) => s.startsWith("RESULT:"))
    .map((s) => JSON.parse(s.slice(7)));
}
function create(kind, content, key, athlete = f.athlete) {
  return `public.chat_document_proposal_create('${athlete}','${kind}',${json(content)},'${key}')`;
}
test.beforeAll(async () => {
  f = await workflowFixture();
  session = (await f.rpc("conversation_start", {})).session.id;
  await f.rpc("conversation_set_context", { context_athlete: f.athlete });
});
test.afterAll(async () => {
  await f?.cleanup();
});
for (const kind of ["prescription", "exam_request", "surgical_order"])
  test(`SQL ${kind}: stable creation never performs a full replacement or clinical save`, async () => {
    const content = (await f.prepare(kind)).material.content,
      key = randomUUID();
    const [first, replay, conflict, counts] = run(
      result(create(kind, content, key)) +
        result(create(kind, content, key)) +
        result(
          create(
            kind,
            {
              ...content,
              [kind === "prescription" ? "notes" : "additional"]:
                "Novo texto DEMO",
            },
            key,
          ),
        ) +
        result(
          `(select jsonb_build_object('proposals',(select count(*) from clinical.document_proposals where actor_id=auth.uid()),'clinical',(select count(*) from clinical.documents where author_id=auth.uid()),'events',(select count(*) from clinical.audit_events where actor_user_id=auth.uid() and operation='document.proposal_prepared' and outcome='success')))`,
        ),
    );
    expect(first.error, JSON.stringify(first)).toBeUndefined();
    expect(replay).toEqual(first);
    expect(conflict.error).toBe("conflict");
    expect(
      displayedProposalSchema.safeParse({
        requestId: first.document.requestId,
        athleteId: f.athlete,
        kind,
        version: 1,
        contentHash: first.document.contentHash,
      }).success,
    ).toBe(true);
    expect(counts).toEqual({ proposals: 1, clinical: 0, events: 1 });
  });
test("SQL creation cannot overwrite a proposal already edited with CAS", () => {
  const content = prescription(),
    key = randomUUID();
  const [edited, replay, current] = run(
    `create temporary table created as select ${create("prescription", content, key)} as data;` +
      result(
        `public.chat_document_proposal_patch((select (data->'document'->>'requestId')::uuid from created),1,(select data->'document'->>'contentHash' from created),${json([{ operation: "set_field", field: "notes", value: "Edição posterior DEMO" }])},'${randomUUID()}')`,
      ) +
      result(create("prescription", content, key)) +
      result(
        `(select to_jsonb(content->>'notes') from clinical.document_proposals where actor_id=auth.uid())`,
      ),
  );
  expect(edited.document.version).toBe(2);
  expect(replay.error).toBe("conflict");
  expect(current).toBe("Edição posterior DEMO");
});
test("SQL creation requires current context and current clinical authorization", () => {
  const content = prescription(),
    key = randomUUID();
  expect(
    run(result(create("prescription", content, key, f.minor)))[0].error,
  ).toBe("context_required");
  expect(
    run(
      `update clinical.medical_authors set enabled=false where professional_id=auth.uid();` +
        result(create("prescription", content, key)),
    )[0].error,
  ).toBe("denied");
  expect(
    run(
      `update clinical.conversation_sessions set status='archived' where id='${session}';` +
        result(create("prescription", content, key)),
    )[0].error,
  ).toBe("context_required");
});
test("SQL retries cannot resurrect a discarded proposal and rejection audit has no clinical text", () => {
  const content = prescription(),
    key = randomUUID();
  const [discarded, replay, audit] = run(
    `create temporary table created as select ${create("prescription", content, key)} as data;` +
      result(
        `public.clinical_document_proposal_discard((select (data->'document'->>'requestId')::uuid from created))`,
      ) +
      result(create("prescription", content, key)) +
      result(
        `(select jsonb_agg(safe_metadata) from clinical.audit_events where actor_user_id=auth.uid() and operation='document.creation_rejected')`,
      ),
  );
  expect(discarded.ok).toBe(true);
  expect(replay.error).toBe("conflict");
  expect(JSON.stringify(audit)).not.toContain("Medicamento");
  expect(audit[0].reason).toBe("conflict");
});

for (const directive of ["Não crie", "Por favor não crie", "Eu não quero"])
  test(`negated creation directive: ${directive}`, () => {
    const message = `${directive} uma prescrição; Medicamento: Medicamento DEMO`;
    expect(documentCreationRequested("prescription", message)).toBe(false);
    expect(ground("prescription", prescription(), message, id).ok).toBe(false);
  });
