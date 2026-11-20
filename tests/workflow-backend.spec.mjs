import { execFileSync } from "node:child_process";
import { localSupabase } from "../scripts/local-supabase.mjs";
import { test, expect } from "./fixtures.mjs";
import { randomUUID } from "node:crypto";
import {
  workflowFixture,
  workflowSql as sql,
  workflowAdmin as admin,
} from "./helpers/workflow-fixtures.mjs";
import {
  reconcileDeliveries,
  simulatedDeliveryAdapter,
  deliveryEnvironmentAllowed,
} from "../src/features/delivery/engine.ts";
let f;
const env = { CBB_SIGNING_MODE: "demo", CBB_DEPLOYMENT_ENV: "test" };
test.beforeAll(async () => {
  f = await workflowFixture();
});
test.afterAll(async () => {
  if (f) await f.cleanup();
});
async function finished(
  kind = "prescription",
  delivery = false,
  scenario = "success",
  opts = {},
) {
  const review = await f.prepare(kind, opts);
  const signed = await f.sign(review, {
    delivery_requested: delivery,
    delivery_scenario: scenario,
  });
  expect(signed.error).toBeUndefined();
  const status = await f.status(signed.attempt.id);
  expect(status.error, JSON.stringify(status)).toBeUndefined();
  expect(status.attempt.state).toBe("simulated_success");
  expect(
    sql(
      `select exists(select 1 from clinical.document_finalizations where document_id='${review.document_id}')`,
    ),
  ).toBe("t");
  return { review, signed, ...(await f.detail(review.document_id)) };
}
async function pump(id, count = 1) {
  for (let n = 0; n < count; n++) {
    sql(
      `update clinical.document_delivery_jobs set available_at=clock_timestamp()-interval '1 second' where request_id in(select id from clinical.document_delivery_requests where document_id='${id}')`,
    );
    await reconcileDeliveries(admin, env, { documentId: id, limit: 1 });
  }
}
for (const kind of ["prescription", "surgical_order", "exam_request"])
  test(`${kind}: finalização imutável, autoria/hash e derivação independente`, async () => {
    const x = await finished(kind);
    expect(x.workflow.lifecycle).toBe("finalized");
    expect(x.workflow.signature.provenance).toBe("simulated");
    expect(x.workflow.signature.cryptographicallyVerified).toBe(false);
    expect(x.workflow.deliveries).toHaveLength(0);
    expect(() =>
      sql(
        `update clinical.document_signature_operations set state='failed' where id='${x.workflow.signature.id}'`,
      ),
    ).toThrow();
    const id = x.review.document_id;
    const before = sql(
      `select row_to_json(d)::text from clinical.documents d where id='${id}'`,
    );
    const save = await f.rpc("document_save", {
      target: f.athlete,
      document_id: id,
      expected_version: 1,
      kind,
      payload: x.review.material.content,
      intent: "save",
    });
    expect(save.error).toBe("finalized");
    expect(
      (
        await f.rpc("document_review_command", {
          action: "open",
          payload: {
            athlete_id: f.athlete,
            document_id: id,
            version: 1,
            kind,
            content: x.review.material.content,
            idempotency_key: randomUUID(),
          },
        })
      ).error,
    ).toBe("finalized");
    expect(() =>
      sql(`update clinical.documents set version=version+1 where id='${id}'`),
    ).toThrow();
    expect(() =>
      sql(`delete from clinical.documents where id='${id}'`),
    ).toThrow();
    expect(
      sql(
        `select row_to_json(d)::text from clinical.documents d where id='${id}'`,
      ),
    ).toBe(before);
    expect(
      (
        await f.owner.client.rpc("document_save_before_workflow", {
          target: f.athlete,
          document_id: id,
          expected_version: 1,
          kind,
          payload: x.review.material.content,
          intent: "save",
        })
      ).error,
    ).not.toBeNull();
    const key = randomUUID();
    const derived = await f.rpc("document_workflow_action", {
      action: "derive",
      payload: { document_id: id, idempotency_key: key },
    });
    expect(derived.error).toBeUndefined();
    expect(
      (
        await f.rpc("document_workflow_action", {
          action: "derive",
          payload: { document_id: id, idempotency_key: key },
        })
      ).documentId,
    ).toBe(derived.documentId);
    const opened = await f.rpc("document_open", {
      target: f.athlete,
      document_id: derived.documentId,
    });
    expect(opened.content).toEqual(x.review.material.content);
    expect(opened.workflow.lifecycle).toBe("draft");
    expect(opened.workflow.derivedFrom.documentId).toBe(id);
    expect(opened.author_name).toBe("Profissional Ciclo DEMO");
    expect(
      sql(
        `select count(*) from clinical.document_finalizations where document_id='${id}'`,
      ),
    ).toBe("1");
    expect(
      sql(
        `select count(*) from clinical.signature_snapshots where document_id='${id}'`,
      ),
    ).toBe("1");
  });
test("em andamento bloqueia gravação; cancelamento libera edição sem reaproveitar autorização", async () => {
  const rv = await f.prepare();
  const a = await f.sign(rv, { scenario: "delayed" });
  const save = await f.rpc("document_save", {
    target: f.athlete,
    document_id: rv.document_id,
    expected_version: 1,
    kind: "prescription",
    payload: rv.material.content,
    intent: "save",
  });
  expect(save.error).toBe("in_progress");
  await f.rpc("signing_demo_command", {
    action: "cancel",
    payload: { attempt_id: a.attempt.id },
  });
  expect((await f.detail(rv.document_id)).workflow.locked).toBe(false);
  const edited = await f.rpc("document_save", {
    target: f.athlete,
    document_id: rv.document_id,
    expected_version: 1,
    kind: "prescription",
    payload: { ...rv.material.content, notes: "Correção posterior DEMO" },
    intent: "save",
  });
  expect(edited.version).toBe(2);
  expect((await f.status(a.attempt.id)).error).toBe("stale");
});
for (const scenario of ["denied", "expired", "failed"])
  test(`${scenario}: não finaliza nem despacha entrega`, async () => {
    const rv = await f.prepare();
    const a = await f.sign(rv, { scenario, delivery_requested: true });
    await f.status(a.attempt.id);
    const detail = await f.detail(rv.document_id);
    expect(detail.workflow.lifecycle).toBe("draft");
    expect(detail.workflow.deliveries[0].state).toBe("cancelled");
    expect(
      sql(
        `select count(*) from clinical.document_delivery_jobs where request_id='${detail.workflow.deliveries[0].id}'`,
      ),
    ).toBe("0");
  });
test("tentativas históricas não são promovidas e callbacks tardios não duplicam finalização", async () => {
  const rv = await f.prepare();
  const a = await f.sign(rv);
  sql(
    `delete from clinical.document_signature_operations where legacy_attempt_id='${a.attempt.id}'`,
  );
  await f.status(a.attempt.id);
  expect((await f.detail(rv.document_id)).workflow.lifecycle).toBe("draft");
  const current = await finished();
  await Promise.all([
    f.status(current.signed.attempt.id),
    f.status(current.signed.attempt.id),
  ]);
  expect(
    sql(
      `select count(*) from clinical.document_finalizations where document_id='${current.review.document_id}'`,
    ),
  ).toBe("1");
});
for (const scenario of ["success", "duplicate", "delayed", "timeout"])
  test(`entrega ${scenario}: persistência, aceitação e conclusão simulada`, async () => {
    const x = await finished("prescription", true, scenario);
    const id = x.review.document_id;
    expect(x.workflow.deliveries[0].state).toBe("queued");
    for (let i = 0; i < 5; i++) await pump(id);
    const result = await f.detail(id);
    expect(result.workflow.deliveries[0].state).toBe("delivered");
    expect(result.workflow.deliveries[0].provenance).toBe("simulated");
    expect(result.workflow.deliveries[0].attempts).toBe(1);
    expect(result.workflow.signature.cryptographicallyVerified).toBe(false);
    expect(
      sql(
        `select count(*) from clinical.signature_artifacts where attempt_id='${x.signed.attempt.id}'`,
      ),
    ).toBe("0");
    const events = sql(
      `select jsonb_agg(safe_metadata)::text from clinical.audit_events where resource_id='${result.workflow.deliveries[0].id}'`,
    );
    expect(events).not.toContain("11999990001");
    expect(events).not.toContain("Medicamento");
  });
test("falha recuperável, retry idempotente e reenvio não geram assinatura", async () => {
  const x = await finished("prescription", true, "temporary_failure"),
    id = x.review.document_id;
  await expect
    .poll(
      async () => {
        await pump(id);
        return (await f.detail(id)).workflow.deliveries[0].state;
      },
      { timeout: 5000, intervals: [100, 200, 400] },
    )
    .toBe("failed");
  let d = (await f.detail(id)).workflow.deliveries[0];
  expect(d.failureKind).toBe("retryable");
  const key = randomUUID(),
    payload = {
      request_id: d.id,
      idempotency_key: key,
      justification: "Repetir tentativa fictícia",
      confirmed: true,
    };
  expect(
    (await f.rpc("document_workflow_action", { action: "retry", payload }))
      .error,
  ).toBeUndefined();
  expect(
    (await f.rpc("document_workflow_action", { action: "retry", payload }))
      .duplicate,
  ).toBe(true);
  await pump(id, 4);
  d = (await f.detail(id)).workflow.deliveries[0];
  expect(d.state).toBe("delivered");
  expect(d.attempts).toBe(2);
  const resent = await f.rpc("document_workflow_action", {
    action: "resend",
    payload: {
      ...payload,
      idempotency_key: randomUUID(),
      justification: "Reenvio demonstrativo confirmado",
    },
  });
  expect(resent.requestId).not.toBe(d.id);
  await pump(id, 4);
  expect(
    sql(
      `select count(*) from clinical.document_signature_operations where document_id='${id}'`,
    ),
  ).toBe("1");
  expect(
    sql(
      `select count(*) from clinical.document_finalizations where document_id='${id}'`,
    ),
  ).toBe("1");
});
test("falha definitiva e cancelamento preservam a finalização", async () => {
  const bad = await finished("prescription", true, "permanent_failure");
  await pump(bad.review.document_id);
  const d = (await f.detail(bad.review.document_id)).workflow.deliveries[0];
  expect(d.state).toBe("failed");
  expect(
    (
      await f.rpc("document_workflow_action", {
        action: "retry",
        payload: {
          request_id: d.id,
          idempotency_key: randomUUID(),
          justification: "Não repetir falha definitiva",
          confirmed: true,
        },
      })
    ).error,
  ).toBe("conflict");
  const active = await finished("prescription", true, "delayed");
  await pump(active.review.document_id);
  const req = (await f.detail(active.review.document_id)).workflow
    .deliveries[0];
  await f.rpc("document_workflow_action", {
    action: "cancel",
    payload: { request_id: req.id },
  });
  await pump(active.review.document_id);
  expect(
    (await f.detail(active.review.document_id)).workflow.deliveries[0].state,
  ).toBe("cancelled");
  expect((await f.detail(active.review.document_id)).workflow.lifecycle).toBe(
    "finalized",
  );
});
test("leases retomam a mesma tentativa; evento duplicado/fora de ordem não sobrescreve retry", async () => {
  const x = await finished("prescription", true, "temporary_failure"),
    id = x.review.document_id;
  const claim = await admin.rpc("claim_document_delivery_job", { target: id });
  const first = claim.data.job;
  expect(first.dispatchKind).toBe("submit");
  sql(
    `update clinical.document_delivery_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where request_id='${first.requestId}'`,
  );
  const recovered = (
    await admin.rpc("claim_document_delivery_job", { target: id })
  ).data.job;
  expect(recovered.attemptId).toBe(first.attemptId);
  expect(recovered.dispatchKind).toBe("reconcile");
  const adapter = simulatedDeliveryAdapter();
  const obs = await adapter.reconcile(recovered);
  const args = {
    request_id: recovered.requestId,
    attempt_id: recovered.attemptId,
    lease_token: recovered.leaseToken,
    observation: obs,
  };
  expect(
    (await admin.rpc("complete_document_delivery_job", args)).data.ok,
  ).toBe(true);
  expect(
    (await admin.rpc("complete_document_delivery_job", args)).data.duplicate,
  ).toBe(true);
  await f.rpc("document_workflow_action", {
    action: "retry",
    payload: {
      request_id: recovered.requestId,
      idempotency_key: randomUUID(),
      justification: "Retentativa com correlação própria",
      confirmed: true,
    },
  });
  await pump(id);
  const stale = await admin.rpc("complete_document_delivery_job", {
    ...args,
    observation: { ...obs, eventId: randomUUID(), state: "delivered" },
  });
  expect(stale.data.ignored).toBe(true);
  expect((await f.detail(id)).workflow.deliveries[0].state).toBe("processing");
});
for (const target of ["minor", "absent"])
  test(`política fictícia ${target} e autorização por recurso`, async () => {
    const x = await finished("prescription", true, "success", {
      athlete_id: f[target],
    });
    expect(x.workflow.deliveries[0].state).toBe(
      target === "minor" ? "queued" : "blocked",
    );
    if (target === "minor") {
      expect(x.workflow.deliveries[0].recipient.category).toBe("guardian");
      expect(JSON.stringify(x.workflow.deliveries)).not.toContain(
        "11999990002",
      );
    }
    expect((await f.detail(x.review.document_id, f.other)).error).toBe(
      "unavailable",
    );
    expect(
      (
        await f.rpc("document_workflow_action", {
          action: "retry",
          payload: {
            request_id: x.workflow.deliveries[0].id,
            recipient_id: randomUUID(),
          },
        })
      ).error,
    ).toBe("invalid");
  });
test("revogação antes do despacho ou durante lease bloqueia envio sem desfazer assinatura", async () => {
  const x = await finished("prescription", true),
    id = x.review.document_id;
  const claim = (await admin.rpc("claim_document_delivery_job", { target: id }))
    .data.job;
  sql(
    `update clinical.athlete_access set can_edit=false where athlete_id='${f.athlete}' and professional_id='${f.owner.id}'`,
  );
  try {
    const obs = await simulatedDeliveryAdapter().submit(claim);
    const completed = await admin.rpc("complete_document_delivery_job", {
      request_id: claim.requestId,
      attempt_id: claim.attemptId,
      lease_token: claim.leaseToken,
      observation: obs,
    });
    expect(completed.data.error).toBe("authorization_revoked");
    const d = await f.detail(id);
    expect(d.workflow.deliveries[0].state).toBe("blocked");
    expect(d.workflow.deliveries[0].recipient).toBeNull();
    expect(d.workflow.lifecycle).toBe("finalized");
  } finally {
    sql(
      `update clinical.athlete_access set can_edit=true where athlete_id='${f.athlete}' and professional_id='${f.owner.id}'`,
    );
  }
});
test("gates, privacidade e procedência não aceitam simulação como produção", async () => {
  const immutableReview = await f.prepare();
  const immutableSigned = await f.sign(immutableReview, {
    delivery_requested: true,
  });
  expect(() =>
    sql(
      `update clinical.document_delivery_requests set execution_mode='production',provenance='verified' where signature_operation_id in(select id from clinical.document_signature_operations where legacy_attempt_id='${immutableSigned.attempt.id}')`,
    ),
  ).toThrow();

  expect(
    deliveryEnvironmentAllowed({
      CBB_SIGNING_MODE: "demo",
      CBB_DEPLOYMENT_ENV: "operational",
    }),
  ).toBe(false);
  expect((await reconcileDeliveries(admin, {}, {})).available).toBe(false);
  expect(
    (await f.owner.client.rpc("claim_document_delivery_job", { target: null }))
      .error,
  ).not.toBeNull();
  expect(
    (
      await f.owner.client.rpc("complete_document_delivery_job", {
        request_id: randomUUID(),
        attempt_id: randomUUID(),
        lease_token: randomUUID(),
        observation: { state: "delivered" },
      })
    ).error,
  ).not.toBeNull();
  const x = await finished("prescription", true),
    id = x.review.document_id;
  const j = (await admin.rpc("claim_document_delivery_job", { target: id }))
    .data.job;
  const forged = await admin.rpc("complete_document_delivery_job", {
    request_id: j.requestId,
    attempt_id: j.attemptId,
    lease_token: j.leaseToken,
    observation: {
      eventId: randomUUID(),
      state: "delivered",
      executionMode: "production",
      provenance: "verified",
    },
  });
  expect(forged.data.error).toBe("mode_mismatch");
  await admin.rpc("configure_document_delivery_demo", { enabled: false });
  try {
    expect(
      (await admin.rpc("claim_document_delivery_job", { target: id })).data.job,
    ).toBeNull();
  } finally {
    await admin.rpc("configure_document_delivery_demo", { enabled: true });
  }
});

test("finalização concorrente rejeita a gravação e mantém uma única versão", async () => {
  const rv = await f.prepare();
  const signed = await f.sign(rv);
  const [completion, write] = await Promise.all([
    f.status(signed.attempt.id),
    f.rpc("document_save", {
      target: f.athlete,
      document_id: rv.document_id,
      expected_version: 1,
      kind: "prescription",
      payload: { ...rv.material.content, notes: "Alteração concorrente" },
      intent: "save",
    }),
  ]);
  expect(completion.error).toBeUndefined();
  expect(["in_progress", "finalized"]).toContain(write.error);
  expect(
    sql(
      `select count(*) from clinical.document_finalizations where document_id='${rv.document_id}'`,
    ),
  ).toBe("1");
  expect(
    sql(`select version from clinical.documents where id='${rv.document_id}'`),
  ).toBe("1");
});
test("processo novo retoma lease vencido sem criar segunda tentativa", async () => {
  const x = await finished("prescription", true),
    id = x.review.document_id;
  const claimed = (
    await admin.rpc("claim_document_delivery_job", { target: id })
  ).data.job;
  sql(
    `update clinical.document_delivery_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where request_id='${claimed.requestId}'`,
  );
  const output = execFileSync(
    "node",
    ["scripts/reconcile-deliveries.mjs", `--document=${id}`],
    {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        ...env,
        NEXT_PUBLIC_SUPABASE_URL: localSupabase.url,
        SUPABASE_SERVICE_ROLE_KEY: localSupabase.adminKey,
      },
    },
  );
  expect(JSON.parse(output.trim()).processed).toBe(1);
  expect((await f.detail(id)).workflow.deliveries[0].attempts).toBe(1);
  await pump(id, 3);
  expect((await f.detail(id)).workflow.deliveries[0].state).toBe("delivered");
});
for (const mode of ["manual_contact", "minor_without_guardian"])
  test(`contato não é autorização: ${mode}`, async () => {
    const target = mode === "manual_contact" ? f.athlete : f.minor;
    if (mode === "manual_contact")
      sql(`update clinical.athletes set source='manual' where id='${target}'`);
    else
      sql(
        `update clinical.athlete_contacts set guardian_name=null where athlete_id='${target}'`,
      );
    try {
      const x = await finished("prescription", true, "success", {
        athlete_id: target,
      });
      expect(x.workflow.deliveries[0].state).toBe("blocked");
      expect(x.workflow.lifecycle).toBe("finalized");
    } finally {
      if (mode === "manual_contact")
        sql(`update clinical.athletes set source='demo' where id='${target}'`);
      else
        sql(
          `update clinical.athlete_contacts set guardian_name='Responsável Ciclo DEMO' where athlete_id='${target}'`,
        );
    }
  });
