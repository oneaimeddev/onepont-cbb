import { test, expect } from "./fixtures.mjs";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  workflowFixture,
  workflowSql as sql,
} from "./helpers/workflow-fixtures.mjs";

// Exercise the future migration in a rollback transaction. It is not applied to
// the local baseline while review/save/UI integration of corte C is pending.
const migration =
  sql(
    "select to_regprocedure('clinical.chat_document_proposal_patch(uuid,integer,jsonb,uuid)') is not null",
  ) === "t"
    ? ""
    : readFileSync(
        new URL(
          "../supabase/migrations/20261120000700_conversational_document_edits.sql",
          import.meta.url,
        ),
        "utf8",
      );
let f, session;
const proposals = {};
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${quote(JSON.stringify(value))}::jsonb`;
function run(body, actor = f.owner.id) {
  const output = sql(`begin;${migration}
    select set_config('request.jwt.claim.sub',${quote(actor)},true);
    ${body}
    rollback;`);
  return output
    .split("\n")
    .filter((line) => line.startsWith("RESULT:"))
    .map((line) => JSON.parse(line.slice(7)));
}
const result = (expression) => `select 'RESULT:'||(${expression})::text;`;
function patch(p, changes, version = 1, key = randomUUID()) {
  return `clinical.chat_document_proposal_patch('${p.id}',${version},${json(changes)},'${key}')`;
}
test.beforeAll(async () => {
  f = await workflowFixture();
  session = (await f.rpc("conversation_start", {})).session.id;
  await f.rpc("conversation_set_context", { context_athlete: f.athlete });
  for (const kind of ["prescription", "exam_request", "surgical_order"]) {
    const id = randomUUID();
    const content =
      kind === "surgical_order"
        ? {
            procedure: "Procedimento DEMO",
            indication: "Indicação fictícia",
            priority: "elective",
          }
        : {
            items: [1, 2, 3].map((n) => ({
              id: randomUUID(),
              name: `Item DEMO ${n}`,
              ...(kind === "prescription"
                ? {
                    dose: "Valor original DEMO",
                    instructions: "Orientação fictícia",
                  }
                : { exam_type: "laboratory", notes: "Nota fictícia" }),
            })),
            ...(kind === "prescription"
              ? { notes: "Observações DEMO" }
              : { justification: "Justificativa DEMO", priority: "elective" }),
          };
    const registered = await f.rpc("clinical_document_proposal_register", {
      target: f.athlete,
      request_id: id,
      kind,
      payload: content,
    });
    expect(registered.ok).toBe(true);
    const stored = JSON.parse(
      sql(
        `select content from clinical.document_proposals where request_id='${id}'`,
      ),
    );
    proposals[kind] = { id, content: stored };
  }
});
test.afterAll(async () => {
  await f?.cleanup();
});

for (const kind of ["prescription", "exam_request"]) {
  test(`${kind}: sparse changes preserve other items and spelling`, () => {
    const p = proposals[kind];
    const field = kind === "prescription" ? "dose" : "notes";
    const changes = [
      {
        operation: "set_field",
        itemId: p.content.items[1].id,
        field,
        value: "Grafia EXATA DEMO µg/mL",
      },
    ];
    const [r] = run(result(patch(p, changes)));
    expect(r.document.version).toBe(2);
    expect(r.document.content.items[1][field]).toBe("Grafia EXATA DEMO µg/mL");
    expect(r.document.content.items[0]).toEqual(p.content.items[0]);
    expect(r.document.content.items[2]).toEqual(p.content.items[2]);
    expect(r.document.documentId).toBeNull();
  });
  test(`${kind}: remove, add and reorder use stable UUIDs`, () => {
    const p = proposals[kind],
      added = { id: randomUUID(), name: "Novo item DEMO" };
    const ids = [added.id, p.content.items[2].id, p.content.items[0].id];
    const [r] = run(
      result(
        patch(p, [
          { operation: "remove_item", itemId: p.content.items[1].id },
          { operation: "add_item", item: added },
          { operation: "reorder_items", itemIds: ids },
        ]),
      ),
    );
    expect(r.document.content.items.map((x) => x.id)).toEqual(ids);
    expect(r.document.content.items[1]).toEqual(p.content.items[2]);
  });
}
test("surgical order edits preserve unrelated fields and do not create clinical records", () => {
  const p = proposals.surgical_order;
  const [r, count] = run(
    result(
      patch(p, [
        {
          operation: "set_field",
          field: "procedure",
          value: "Procedimento exato DEMO",
        },
      ]),
    ) + result(`(select count(*) from clinical.documents where id='${p.id}')`),
  );
  expect(r.document.content).toEqual({
    ...p.content,
    procedure: "Procedimento exato DEMO",
  });
  expect(count).toBe(0);
});
test("CAS rejects stale edits; exact replay has one audit event", () => {
  const p = proposals.prescription,
    key = randomUUID();
  const op = [
    { operation: "set_field", field: "notes", value: "Alteração DEMO" },
  ];
  const [first, replay, stale, changedKey, ledger, audit] = run(
    result(patch(p, op, 1, key)) +
      result(patch(p, op, 1, key)) +
      result(patch(p, op)) +
      result(patch(p, op, 2, key)) +
      result(
        `(select count(*) from clinical.chat_proposal_changes where proposal_id='${p.id}')`,
      ) +
      result(
        `(select count(*) from clinical.audit_events where resource_id='${p.id}' and operation='document.proposal_patched')`,
      ),
  );
  expect(replay).toEqual(first);
  expect(stale.error).toBe("conflict");
  expect(changedKey.error).toBe("conflict");
  expect(ledger).toBe(1);
  expect(audit).toBe(1);
});
test("invalid second operation rolls back the entire edit", () => {
  const p = proposals.prescription;
  const [r, current] = run(
    result(
      patch(p, [
        { operation: "set_field", field: "notes", value: "Não persistir DEMO" },
        { operation: "remove_item", itemId: randomUUID() },
      ]),
    ) +
      result(
        `(select jsonb_build_object('content',content,'version',version) from clinical.document_proposals where request_id='${p.id}')`,
      ),
  );
  expect(r.error).toBe("item_not_found");
  expect(current).toEqual({ content: p.content, version: 1 });
});
for (const [label, ops] of [
  ["unknown operation", [{ operation: "execute_sql", value: "select 1" }]],
  [
    "clinical ownership field",
    [{ operation: "set_field", field: "athlete_id", value: randomUUID() }],
  ],
  [
    "oversized root field",
    [{ operation: "set_field", field: "notes", value: "x".repeat(2001) }],
  ],
  ["non array", {}],
  ["empty list", []],
  ["null value", [{ operation: "set_field", field: "notes", value: null }]],
  ["non object operation", [null]],
  ["non object item", [{ operation: "add_item", item: "invalid" }]],
  [
    "missing item UUID",
    [{ operation: "add_item", item: { name: "Item DEMO" } }],
  ],
  [
    "oversized item",
    [
      {
        operation: "add_item",
        item: { id: randomUUID(), name: "x".repeat(161) },
      },
    ],
  ],
])
  test(`rejects ${label}`, () => {
    expect(run(result(patch(proposals.prescription, ops)))[0].error).toBe(
      "invalid",
    );
  });
test("append validates the combined length without clipping", () => {
  const p = proposals.prescription;
  expect(
    run(
      result(
        patch(p, [
          {
            operation: "append_field",
            field: "notes",
            value: "x".repeat(1990),
          },
        ]),
      ),
    )[0].error,
  ).toBe("invalid");
});
test("another professional cannot read or edit the proposal", () => {
  const p = proposals.prescription;
  const [edit, read] = run(
    result(
      patch(p, [{ operation: "set_field", field: "notes", value: "DEMO" }]),
    ) + result(`clinical.chat_document_proposal_read('${p.id}',null)`),
    f.other.id,
  );
  expect(edit.error).toBe("denied");
  expect(read.error).toBeDefined();
});
for (const status of ["closed", "archived"])
  test(`${status} sessions cannot mutate`, () => {
    const p = proposals.prescription;
    const [r] = run(
      `update clinical.conversation_sessions set status='${status}' where id='${session}';` +
        result(
          patch(p, [{ operation: "set_field", field: "notes", value: "DEMO" }]),
        ),
    );
    expect(r.error).toBe("denied");
  });
test("switching athlete or revoking clinical access prevents edits", () => {
  const p = proposals.prescription,
    changes = [{ operation: "set_field", field: "notes", value: "DEMO" }];
  expect(
    run(
      `update clinical.conversation_sessions set athlete_id='${f.minor}' where id='${session}';` +
        result(patch(p, changes)),
    )[0].error,
  ).toBe("denied");
  expect(
    run(
      `update clinical.athlete_access set can_read_records=false where athlete_id='${f.athlete}' and professional_id='${f.owner.id}';` +
        result(patch(p, changes)),
    )[0].error,
  ).toBe("denied");
});
test("read requires an explicit document when several proposals exist", () => {
  const [ambiguous, explicit] = run(
    result("clinical.chat_document_proposal_read(null,null)") +
      result(
        `clinical.chat_document_proposal_read('${proposals.prescription.id}',null)`,
      ),
  );
  expect(ambiguous.error).toBe("ambiguous");
  expect(explicit.document.requestId).toBe(proposals.prescription.id);
});
test("new functions are not exposed to API roles or public schema", () => {
  const [grants] = run(
    result(
      `(select jsonb_agg(jsonb_build_object('role',r,'call',has_function_privilege(r,'clinical.chat_document_proposal_patch(uuid,integer,jsonb,uuid)','EXECUTE'),'write',has_table_privilege(r,'clinical.chat_proposal_changes','INSERT'))) from unnest(array['anon','authenticated','service_role']) r)`,
    ),
  );
  expect(grants.every((r) => r.call === false && r.write === false)).toBe(true);
});
test("a saved document changed outside the proposal is not overwritten", () => {
  const p = proposals.prescription;
  const [saved, changed, denied, read] = run(
    result(
      `public.document_save('${f.athlete}','${p.id}',0,'prescription',${json(p.content)},'save')`,
    ) +
      `update clinical.document_proposals set document_id='${p.id}',saved_document_version=1 where request_id='${p.id}';` +
      result(
        `public.document_save('${f.athlete}','${p.id}',1,'prescription',${json({ ...p.content, notes: "Outra interface DEMO" })},'save')`,
      ) +
      result(
        patch(p, [{ operation: "set_field", field: "notes", value: "DEMO" }]),
      ) +
      result(`clinical.chat_document_proposal_read('${p.id}',null)`),
  );
  expect(saved.id).toBe(p.id);
  expect(changed.version).toBe(2);
  expect(denied.error).toBe("denied");
  expect(read.error).toBe("denied");
});
