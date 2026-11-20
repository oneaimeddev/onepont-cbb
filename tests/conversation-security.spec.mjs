import { test, expect } from "./fixtures.mjs";
import {
  workflowFixture,
  workflowSql as sql,
} from "./helpers/workflow-fixtures.mjs";
import { randomUUID } from "node:crypto";
let f;
const secret = "Conteúdo clínico fictício protegido CORTE A";
const content = {
  notes: secret,
  items: [
    {
      id: randomUUID(),
      name: "Medicamento fictício DEMO",
      presentation: "",
      dose: "",
      dose_unit: "",
      route: "",
      schedule: "",
      duration: "",
      quantity: "",
      instructions: "",
    },
  ],
};
test.beforeAll(async () => {
  f = await workflowFixture();
  sql(
    `update clinical.athlete_access set can_write=true,can_finalize=true where professional_id='${f.owner.id}'`,
  );
});
test.afterAll(async () => {
  if (!f) return;
  const ids = f.users.map((x) => `'${x}'`).join(",");
  sql(
    `delete from clinical.draft_proposals where actor_id in(${ids});delete from clinical.document_proposals where actor_id in(${ids});delete from clinical.evolution_approvals where actor_id in(${ids});delete from clinical.record_revisions where record_id in(select id from clinical.records where author_id in(${ids}));delete from clinical.records where author_id in(${ids});delete from clinical.encounters where athlete_id in('${f.athlete}','${f.minor}','${f.absent}');delete from clinical.conversation_sessions where professional_id in(${ids});`,
  );
  await f.cleanup();
});
async function call(name, args = {}, u = f.owner) {
  const x = await u.client.rpc(name, args);
  expect(x.error).toBeNull();
  return x.data;
}
async function session(u = f.owner) {
  return (await call("conversation_start", {}, u)).session.id;
}
async function store(s, u = f.owner) {
  return call(
    "conversation_save",
    {
      target: s,
      context_athlete: f.athlete,
      transcript: [
        {
          id: randomUUID(),
          role: "assistant",
          text: secret,
          athletes: [
            { id: f.athlete, name: "Atleta Ciclo DEMO", facts: [secret] },
          ],
          navigation: { athleteId: f.athlete, view: "profile" },
          search: null,
        },
      ],
    },
    u,
  );
}
async function proposal(s, kind = "prescription") {
  const id = randomUUID();
  const payload =
    kind === "prescription"
      ? content
      : kind === "surgical_order"
        ? { procedure: "Procedimento DEMO", justification: secret }
        : {
            occurred_at: "2026-11-20",
            items: [
              {
                id: randomUUID(),
                name: "Exame DEMO",
                exam_type: "laboratory",
                region: "",
                laterality: "",
                technical_details: "",
                notes: "",
              },
            ],
            justification: secret,
          };
  const x = await call("clinical_document_proposal_register", {
    target: f.athlete,
    request_id: id,
    kind,
    payload,
  });
  expect(x.ok).toBe(true);
  expect(x.sessionId).toBe(s);
  return { id, payload };
}
for (const state of ["closed", "archived"])
  test(`P0-1 ${state}: resume não reativa; consulta histórica é somente leitura e isolada`, async () => {
    const s = await session();
    await store(s);
    sql(
      `update clinical.conversation_sessions set status='${state}' where id='${s}'`,
    );
    const active = await session();
    expect((await call("conversation_resume", { target: s })).ok).toBe(false);
    expect(Number(sql(`select count(*) from clinical.audit_events where actor_user_id='${f.owner.id}' and operation='conversation.resume' and outcome='denied'`))).toBeGreaterThan(0);
    expect(
      sql(`select status from clinical.conversation_sessions where id='${s}'`),
    ).toBe(state);
    expect((await call("conversation_current")).session.id).toBe(active);
    const history = await call("conversation_history_read", { target: s });
    expect(history.readOnly).toBe(true);
    expect(JSON.stringify(history)).toContain(secret);
    expect(
      (await call("conversation_history_read", { target: s }, f.other)).ok,
    ).toBe(false);
  });
for (const state of ["closed", "archived"])
  for (const kind of ["prescription", "surgical_order", "exam_request"])
    test(`P0-2 ${state}/${kind}: card e fala não confirmam proposta`, async () => {
      const s = await session();
      const p = await proposal(s, kind);
      sql(
        `update clinical.conversation_sessions set status='${state}' where id='${s}'`,
      );
      expect(
        (
          await call("clinical_document_confirm_card", {
            request_id: p.id,
            kind,
            payload: p.payload,
          })
        ).ok,
      ).toBe(false);
      expect(
        (
          await call("clinical_document_confirm_utterance", {
            utterance: "Pode confirmar e salvar.",
            request_id: p.id,
            kind,
            payload: p.payload,
            input_mode: "voice",
          })
        ).ok,
      ).toBe(false);
      expect(
        sql(
          `select document_id is null from clinical.document_proposals where request_id='${p.id}'`,
        ),
      ).toBe("t");
    });
for (const state of ["closed", "archived"])
  test(`P0-2 ${state}: evolução não aprova nem faz commit`, async () => {
    await session();
    const id = randomUUID();
    const args = {
      target: f.athlete,
      request_id: id,
      entry_title: "Evolução DEMO",
      entry_body: secret,
      occurred_on: "2026-11-20",
      restricted: true,
    };
    const p = await call("clinical_draft_proposal_register", args);
    expect(p.ok).toBe(true);
    const approved = await call("clinical_draft_approve", args);
    expect(approved.ok).toBe(true);
    sql(
      `update clinical.conversation_sessions set status='${state}' where id='${p.sessionId}'`,
    );
    expect((await call("clinical_draft_approve", args)).ok).toBe(false);
    expect(
      (
        await call("clinical_draft_commit", {
          approval_id: approved.approvalId,
          target: f.athlete,
          entry_title: args.entry_title,
          entry_body: args.entry_body,
          occurred_on: args.occurred_on,
          restricted: true,
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await call("clinical_draft_confirm_utterance", {
          utterance: "Pode confirmar e salvar.",
          request_id: id,
          entry_title: args.entry_title,
          entry_body: args.entry_body,
          occurred_on: args.occurred_on,
          restricted: true,
          input_mode: "text",
        })
      ).ok,
    ).toBe(false);
  });
test("P0-3 vínculo transacional, attach qualificado e replay idempotente", async () => {
  await session();
  const id = randomUUID(),
    args = {
      target: f.athlete,
      request_id: id,
      entry_title: "Evolução vínculo DEMO",
      entry_body: secret,
      occurred_on: "2026-11-20",
      restricted: true,
    };
  expect((await call("clinical_draft_proposal_register", args)).ok).toBe(true);
  const approved = await call("clinical_draft_approve", args);
  const commit = {
    approval_id: approved.approvalId,
    target: f.athlete,
    entry_title: args.entry_title,
    entry_body: args.entry_body,
    occurred_on: args.occurred_on,
    restricted: true,
  };
  const saved = await call("clinical_draft_commit", commit);
  expect(saved.ok).toBe(true);
  expect(
    sql(
      `select record_id from clinical.draft_proposals where request_id='${id}'`,
    ),
  ).toBe(saved.id);
  expect(
    (
      await call("clinical_draft_proposal_attach", {
        request_id: id,
        saved_id: saved.id,
      })
    ).ok,
  ).toBe(true);
  expect((await call("clinical_draft_commit", commit)).id).toBe(saved.id);
  expect(
    (
      await call("clinical_draft_proposal_attach", {
        request_id: id,
        saved_id: randomUUID(),
      })
    ).ok,
  ).toBe(false);
  expect(
    (
      await call(
        "clinical_draft_proposal_attach",
        { request_id: id, saved_id: saved.id },
        f.other,
      )
    ).ok,
  ).toBe(false);
});
test("P0-4 revogação oculta texto, prévia e cards; regrant não revive histórico", async () => {
  const s = await session();
  await store(s);
  const p = await proposal(s);
  sql(
    `update clinical.athlete_access set can_read_records=false where professional_id='${f.owner.id}' and athlete_id='${f.athlete}'`,
  );
  try {
    for (const [name, args] of [
      ["conversation_current", {}],
      ["conversation_history_read", { target: s }],
      ["conversation_resume", { target: s }],
      ["conversation_recent", {}],
    ]) {
      const x = await call(name, args);
      expect(JSON.stringify(x)).not.toContain(secret);
      expect(JSON.stringify(x)).not.toContain("Atleta Ciclo DEMO");
    }
    expect(
      (
        await call("clinical_document_confirm_card", {
          request_id: p.id,
          kind: "prescription",
          payload: p.payload,
        })
      ).ok,
    ).toBe(false);
    expect((await store(s)).ok).toBe(false);
  } finally {
    sql(
      `update clinical.athlete_access set can_read_records=true where professional_id='${f.owner.id}' and athlete_id='${f.athlete}'`,
    );
  }
  expect((await call("conversation_history_read", { target: s })).ok).toBe(
    false,
  );
  const fresh = await session();
  expect((await store(fresh)).ok).toBe(true);
});
test("P0-4 perda de contato/autoria invalida sessão e legado é preservado sem replay", async () => {
  const s = await session();
  await store(s);
  sql(
    `update clinical.athlete_access set can_edit=false where professional_id='${f.owner.id}' and athlete_id='${f.athlete}'`,
  );
  try {
    expect((await call("conversation_history_read", { target: s })).ok).toBe(
      false,
    );
  } finally {
    sql(
      `update clinical.athlete_access set can_edit=true where professional_id='${f.owner.id}' and athlete_id='${f.athlete}'`,
    );
  }
  const legacy = await session();
  await store(legacy);
  sql(
    `update clinical.conversation_sessions set security_epoch=null where id='${legacy}'`,
  );
  expect((await call("conversation_history_read", { target: legacy })).ok).toBe(
    false,
  );
  expect(
    sql(
      `select count(*) from clinical.conversation_messages where session_id='${legacy}'`,
    ),
  ).toBe("1");
  const current = await session();
  await store(current);
  sql(
    `update clinical.medical_authors set enabled=false where professional_id='${f.owner.id}'`,
  );
  try {
    expect(
      (await call("conversation_history_read", { target: current })).ok,
    ).toBe(false);
  } finally {
    sql(
      `update clinical.medical_authors set enabled=true where professional_id='${f.owner.id}'`,
    );
  }
  const bypass = await f.owner.client.rpc(
    "clinical_document_confirm_card_before_b3",
    { request_id: randomUUID(), kind: "prescription", payload: content },
  );
  expect(bypass.error).toBeTruthy();
});

test("confirmação antiga não alcança proposta de uma nova sessão", async () => {
  const oldSession = await session();
  const old = await proposal(oldSession);
  sql(
    `update clinical.conversation_sessions set status='archived' where id='${oldSession}'`,
  );
  const current = await session();
  const fresh = await proposal(current);
  const rejected = await call("clinical_document_confirm_utterance", {
    utterance: "Pode confirmar e salvar.",
    request_id: old.id,
    kind: "prescription",
    payload: old.payload,
    input_mode: "text",
  });
  expect(rejected.ok).toBe(false);
  expect(
    sql(
      `select document_id is null from clinical.document_proposals where request_id='${fresh.id}'`,
    ),
  ).toBe("t");
});

test("restrição assistencial invalida a cópia textual de outros profissionais", async () => {
  await session();
  const request = randomUUID();
  const data = {
    target: f.athlete,
    request_id: request,
    entry_title: "Registro de acesso DEMO",
    entry_body: secret,
    occurred_on: "2026-11-20",
    restricted: false,
  };
  expect((await call("clinical_draft_proposal_register", data)).ok).toBe(true);
  const approval = await call("clinical_draft_approve", data);
  const saved = await call("clinical_draft_commit", {
    approval_id: approval.approvalId,
    target: f.athlete,
    entry_title: data.entry_title,
    entry_body: data.entry_body,
    occurred_on: data.occurred_on,
    restricted: false,
  });
  expect(saved.ok).toBe(true);
  const otherSession = await session(f.other);
  await store(otherSession, f.other);
  sql(
    `update clinical.records set visibility='author_only' where id='${saved.id}'`,
  );
  const read = await call(
    "conversation_history_read",
    { target: otherSession },
    f.other,
  );
  expect(read.ok).toBe(false);
  expect(JSON.stringify(read)).not.toContain(secret);
  expect(
    sql(
      `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','clinical') and p.proname like '%_before_b3' and has_function_privilege('authenticated',p.oid,'EXECUTE')`,
    ),
  ).toBe("0");
});
