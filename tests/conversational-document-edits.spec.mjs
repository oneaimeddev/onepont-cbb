import { test, expect } from "./fixtures.mjs";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import {
  workflowFixture,
  workflowSql as sql,
} from "./helpers/workflow-fixtures.mjs";

// Each scenario rolls back its mutations. Before local installation, the private
// migration itself also runs in that transaction. Real concurrency uses the
// installed private schema and fixtures cleaned through workflowFixture.
const installed =
  sql(
    "select to_regprocedure('clinical.chat_document_proposal_patch(uuid,integer,jsonb,uuid)') is not null",
  ) === "t";
const migration = installed
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

function review(p, version = 1, key = randomUUID()) {
  return `clinical.chat_document_proposal_review('${p.id}',${version},'${key}')`;
}
function save(p, version = 1, key = randomUUID()) {
  return `clinical.chat_document_proposal_save('${p.id}',${version},'${key}')`;
}
function complete(p) {
  // Surgery alone needs a justification to open the shared review. The value is
  // supplied explicitly by the fictitious professional, never inferred.
  return p === proposals.surgical_order
    ? `select ${patch(p, [{ operation: "set_field", field: "justification", value: "Justificativa explícita DEMO" }])};`
    : "";
}
for (const kind of ["prescription", "exam_request", "surgical_order"]) {
  test(`${kind}: exact shared review is persistent, idempotent and not a clinical save`, () => {
    const p = proposals[kind],
      version = kind === "surgical_order" ? 2 : 1,
      key = randomUUID();
    const [first, again, count, source] = run(
      complete(p) +
        result(review(p, version, key)) +
        result(review(p, version, key)) +
        result(`(select count(*) from clinical.documents where id='${p.id}')`) +
        result(
          `(select source_proposal_version from clinical.chat_document_workspaces where document_id='${p.id}')`,
        ),
    );
    expect(first.error, JSON.stringify(first)).toBeUndefined();
    expect(again).toEqual(first);
    expect(first.review.material.content).toEqual(first.document.content);
    expect(first.review.document_id).toBe(p.id);
    expect(source).toBe(version);
    expect(count).toBe(0);
  });
  test(`${kind}: shared save is linked, replayable, unsigned and editable afterwards`, () => {
    const p = proposals[kind],
      version = kind === "surgical_order" ? 2 : 1,
      key = randomUUID();
    const [first, again, details, edited, savedAgain] = run(
      complete(p) +
        result(save(p, version, key)) +
        result(save(p, version, key)) +
        result(
          `(select jsonb_build_object('version',d.version,'content',d.content,'linked_version',p.saved_document_version,'attempts',(select count(*) from clinical.signature_attempts a where a.professional_id=auth.uid())) from clinical.documents d join clinical.document_proposals p on p.document_id=d.id where d.id='${p.id}')`,
        ) +
        result(
          patch(
            p,
            [
              {
                operation: "set_field",
                field:
                  kind === "surgical_order"
                    ? "additional"
                    : kind === "exam_request"
                      ? "additional"
                      : "notes",
                value: "Edição posterior DEMO",
              },
            ],
            version,
          ),
        ) +
        result(save(p, version + 1)),
    );
    expect(first.error, JSON.stringify(first)).toBeUndefined();
    expect(again).toEqual(first);
    expect(first.document.state).toBe("saved");
    expect(first.document.documentId).toBe(p.id);
    expect(first.effect).toBe("saved_without_signature");
    expect(details.version).toBe(1);
    expect(details.linked_version).toBe(1);
    expect(details.attempts).toBe(0);
    expect(edited.document.state).toBe("proposal");
    expect(savedAgain.document.state).toBe("saved");
    expect(savedAgain.document.version).toBe(version + 1);
  });
}
test("incomplete surgery stays a draft without inventing justification", () => {
  const p = proposals.surgical_order;
  const [blocked, saved, counts] = run(
    result(review(p)) +
      result(save(p)) +
      result(
        `(select jsonb_build_object('reviews',(select count(*) from clinical.document_reviews where document_id='${p.id}'),'content',content,'status',status) from clinical.documents where id='${p.id}')`,
      ),
  );
  expect(blocked.error).toBe("incomplete");
  expect(saved.document.state).toBe("saved");
  expect(counts.content.justification).toBe("");
  expect(counts.status).toBe("draft");
  expect(counts.reviews).toBe(0);
});
test("edit invalidates an already confirmed authorization; review rebinding restores only a fresh workspace", () => {
  const p = proposals.prescription;
  const prefix = `create temporary table prepared as select ${review(p)} as data;
    select public.chat_document_select_identity((select (data->'workspace'->>'id')::uuid from prepared),1,'${f.inventory.identities[0].id}');
    create temporary table challenge as select public.chat_operation_prepare((select (data->'workspace'->>'id')::uuid from prepared),2,'${randomUUID()}') as data;
    select public.chat_operation_present('${f.owner.id}','${session}',(select (data->'challenge'->>'id')::uuid from challenge),(select (data->'challenge'->>'nonce')::uuid from challenge),(select data->'challenge'->>'summaryHash' from challenge));
    create temporary table human as select public.chat_capture_human_input('${f.owner.id}','${session}',(select (data->'challenge'->>'id')::uuid from challenge),'${randomUUID()}','Sim','text') as data;`;
  const [confirmed, edit, current, state, rebound, oldReceipt] = run(
    prefix +
      result(
        `public.chat_operation_confirm('${session}',(select (data->'challenge'->>'id')::uuid from challenge),(select (data->'challenge'->>'nonce')::uuid from challenge),(select (data->>'inputId')::uuid from human))`,
      ) +
      result(
        patch(p, [
          { operation: "set_field", field: "notes", value: "Versão nova DEMO" },
        ]),
      ) +
      result(
        `(select clinical.chat_challenge_current(c) from clinical.chat_operation_challenges c where c.id=(select (data->'challenge'->>'id')::uuid from challenge))`,
      ) +
      result(`public.chat_document_state('${session}')`) +
      result(review(p, 2)) +
      result(
        `(select count(*) from clinical.chat_operation_authorizations where session_id='${session}')`,
      ),
  );
  expect(confirmed.effect, JSON.stringify(confirmed)).toBe(
    "authorization_recorded",
  );
  expect(edit.document.version).toBe(2);
  expect(current).toBe(false);
  expect(state.error).toBe("stale");
  expect(rebound.workspace.identityId).toBeNull();
  expect(rebound.workspace.deliveryRequested).toBe(false);
  expect(rebound.authorization).toBeNull();
  expect(oldReceipt).toBe(1);
});
test("shared review audit records actual chat provenance; traditional defaults remain unchanged", () => {
  const p = proposals.prescription;
  const [saved, provenance, traditional] = run(
    result(save(p)) +
      result(
        `(select jsonb_agg(jsonb_build_object('channel',origin_channel,'method',execution_method)) from clinical.audit_events where actor_user_id=auth.uid() and operation='document_review.saved_without_signature')`,
      ) +
      `select set_config('cbb.origin_channel','',true);select set_config('cbb.execution_method','',true);select clinical.review_audit('fixture.traditional','${randomUUID()}');` +
      result(
        `(select jsonb_build_object('channel',origin_channel,'method',execution_method) from clinical.audit_events where actor_user_id=auth.uid() and operation='fixture.traditional')`,
      ),
  );
  expect(saved.error).toBeUndefined();
  expect(provenance).toEqual([{ channel: "ai_chat", method: "agent_tool" }]);
  expect(traditional).toEqual({
    channel: "traditional_ui",
    method: "human_ui",
  });
});
test("review and save helpers remain inaccessible to application roles", () => {
  const [grants] = run(
    result(
      `(select jsonb_agg(has_function_privilege(r,f,'EXECUTE')) from unnest(array['anon','authenticated','service_role']) r cross join unnest(array['clinical.chat_document_proposal_review(uuid,integer,uuid)','clinical.chat_document_proposal_save(uuid,integer,uuid)']) f)`,
    ),
  );
  expect(grants.every((x) => x === false)).toBe(true);
});
test("a superseded review cannot be rebound to the workspace", () => {
  const p = proposals.prescription;
  expect(() =>
    run(
      `create temporary table prepared as select ${review(p)} as data;` +
        `select ${patch(p, [{ operation: "set_field", field: "notes", value: "Nova versão DEMO" }])};` +
        result(
          `public.chat_document_bind('${session}',(select (data->'review'->>'id')::uuid from prepared),1,'${randomUUID()}')`,
        ),
    ),
  ).toThrow(/proposal_review_mismatch/);
});
test("incomplete draft can be completed and saved through the shared review", () => {
  const p = proposals.surgical_order;
  const [first, edited, reviewed, saved, clinical] = run(
    result(save(p)) +
      result(
        patch(p, [
          {
            operation: "set_field",
            field: "justification",
            value: "Justificativa explícita DEMO",
          },
        ]),
      ) +
      result(review(p, 2)) +
      result(save(p, 2)) +
      result(
        `(select jsonb_build_object('version',version,'content',content) from clinical.documents where id='${p.id}')`,
      ),
  );
  expect(first.document.state).toBe("saved");
  expect(edited.document.version).toBe(2);
  expect(reviewed.review.expected_version).toBe(1);
  expect(saved.error).toBeUndefined();
  expect(clinical.version).toBe(2);
  expect(clinical.content.justification).toBe("Justificativa explícita DEMO");
});
test("a document with signing in progress rejects editing and another save", () => {
  const p = proposals.prescription;
  const [signed, edit, saved] = run(
    `create temporary table prepared as select ${review(p)} as data;` +
      result(
        `public.document_review_command('sign',jsonb_build_object('review_id',(select data->'review'->>'id' from prepared),'review_hash',(select data->'review'->>'content_hash' from prepared),'identity_id','${f.inventory.identities[0].id}','idempotency_key','${randomUUID()}','confirmed',true,'scenario','delayed','delivery_requested',false))`,
      ) +
      result(
        patch(p, [
          { operation: "set_field", field: "notes", value: "Não aplicar DEMO" },
        ]),
      ) +
      result(save(p)),
  );
  expect(signed.error, JSON.stringify(signed)).toBeUndefined();
  expect(edit.error).toBe("locked");
  expect(saved.error).toBe("locked");
});

function concurrentSql(input) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "docker",
      [
        "exec",
        "-i",
        "supabase_db_prontuario-cbb",
        "psql",
        "-X",
        "-U",
        "postgres",
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { encoding: "utf8" },
      (error, stdout) => {
        if (error) reject(error);
        else
          resolve(
            JSON.parse(
              stdout
                .split("\n")
                .find((s) => s.startsWith("RESULT:"))
                .slice(7),
            ),
          );
      },
    );
    child.stdin.end(input);
  });
}
for (const sameKey of [false, true])
  test(`real concurrent edits: ${sameKey ? "same key is idempotent" : "stale revision loses"}`, async () => {
    test.skip(
      !installed,
      "Real concurrency requires the private migration installed in the local test database.",
    );
    const p = { id: randomUUID(), content: proposals.prescription.content },
      key = randomUUID();
    expect(
      (
        await f.rpc("clinical_document_proposal_register", {
          target: f.athlete,
          request_id: p.id,
          kind: "prescription",
          payload: p.content,
        })
      ).ok,
    ).toBe(true);
    const changes = [
      { operation: "set_field", field: "notes", value: "Concorrência DEMO" },
    ];
    const jobs = [0, 1].map(
      (n) =>
        `begin;select set_config('request.jwt.claim.sub','${f.owner.id}',true);select pg_advisory_xact_lock(hashtextextended('${f.owner.id}',0));select pg_sleep(0.15);${result(patch(p, changes, 1, sameKey ? key : n ? randomUUID() : key))}commit;`,
    );
    const replies = await Promise.all(jobs.map(concurrentSql));
    if (sameKey) expect(replies[0]).toEqual(replies[1]);
    else {
      expect(replies.filter((x) => x.document?.version === 2)).toHaveLength(1);
      expect(replies.filter((x) => x.error === "conflict")).toHaveLength(1);
    }
    const counts = JSON.parse(
      sql(
        `select jsonb_build_object('version',(select version from clinical.document_proposals where request_id='${p.id}'),'changes',(select count(*) from clinical.chat_proposal_changes where proposal_id='${p.id}'),'audit',(select count(*) from clinical.audit_events where resource_id='${p.id}' and operation='document.proposal_patched'))`,
      ),
    );
    expect(counts).toEqual({ version: 2, changes: 1, audit: 1 });
  });
