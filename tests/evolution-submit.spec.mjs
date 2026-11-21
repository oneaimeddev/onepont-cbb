import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { evolutionFixture, sql } from "./helpers/evolution-fixture.mjs";
let f;
test.beforeEach(async () => {
  f = await evolutionFixture();
});
test.afterEach(async () => {
  await f?.cleanup();
});
const args = (options = {}) => ({
  target: f.athlete,
  request_id: randomUUID(),
  record_id: null,
  expected_version: 0,
  entry_title: "Evolução direta DEMO",
  entry_body: "Conteúdo fictício\npara finalização direta.",
  restricted: false,
  intent: "finalize",
  ...options,
});
const submit = (user, input) => f.rpc(user, "evolution_submit", input);
const count = () =>
  Number(
    sql(
      `select count(*) from clinical.records where athlete_id='${f.athlete}'`,
    ),
  );
for (const role of ["doctor", "psych"])
  test(`direct ${role} finalization is one authenticated, audited encounter`, async () => {
    const input = args(),
      r = await submit(f[role], input);
    expect(r.status).toBe("finalized");
    expect(count()).toBe(1);
    expect(
      sql(
        `select count(*) from clinical.encounters where athlete_id='${f.athlete}' and status='closed'`,
      ),
    ).toBe("1");
    const read = await f.rpc(f[role], "evolution_read", {
      target: f.athlete,
      record_id: r.id,
    });
    expect(read.body).toBe(input.entry_body);
    expect(read.author_name).toBe(
      role === "psych" ? "Psicólogo Sigilo DEMO" : "Médico Sigilo DEMO",
    );
    expect(read.is_restricted).toBe(role === "psych");
    expect(
      sql(
        `select count(*) from clinical.audit_events where resource_id='${r.id}' and operation='clinical_record.finalized' and approved_by_user_id='${f[role].id}'`,
      ),
    ).toBe("1");
    const audit = sql(
      `select safe_metadata::text from clinical.audit_events where resource_id='${r.id}' and operation='clinical_record.traditional_submitted'`,
    );
    expect(audit).not.toContain("Conteúdo");
    expect(audit).not.toContain("hash");
    if (role === "psych")
      expect(
        await f.rpc(f.doctor, "evolution_read", {
          target: f.athlete,
          record_id: r.id,
        }),
      ).toEqual({ error: "denied" });
  });
test("draft is optional, editable and finalized with current unsaved form fields on the same id", async () => {
  const r = await submit(f.doctor, args({ intent: "draft" }));
  expect(r.status).toBe("draft");
  const input = args({
    record_id: r.id,
    expected_version: r.version,
    entry_body: "Texto atual ainda não salvo",
  });
  const final = await submit(f.doctor, input);
  expect(final.id).toBe(r.id);
  expect(final.status).toBe("finalized");
  expect(count()).toBe(1);
  expect(sql(`select body from clinical.records where id='${r.id}'`)).toBe(
    input.entry_body,
  );
  expect(
    (
      await f.rpc(f.doctor, "evolution_history", {
        target: f.athlete,
        record_id: r.id,
      })
    ).versions[0].body,
  ).toBe("Conteúdo fictício\npara finalização direta.");
});
test("required fields and unaffiliated users cannot persist or finalize", async () => {
  for (const patch of [
    { entry_title: " " },
    { entry_body: " " },
    { expected_version: -1 },
    { intent: "other" },
  ])
    expect(await submit(f.doctor, args(patch))).toEqual({ error: "invalid" });
  expect(await submit(f.outsider, args())).toEqual({ error: "denied" });
  expect(count()).toBe(0);
});
test("missing finalization permission never leaves a new draft or changes an existing one", async () => {
  const r = await f.save(f.doctor);
  const original = sql(
    `select to_jsonb(r)::text from clinical.records r where id='${r.id}'`,
  );
  sql(
    `update clinical.athlete_access set can_finalize=false where athlete_id='${f.athlete}' and professional_id='${f.doctor.id}'`,
  );
  expect(await submit(f.doctor, args())).toEqual({ error: "denied" });
  expect(
    await submit(
      f.doctor,
      args({
        record_id: r.id,
        expected_version: r.version,
        entry_body: "Não persistir",
      }),
    ),
  ).toEqual({ error: "denied" });
  expect(count()).toBe(1);
  expect(
    sql(`select to_jsonb(r)::text from clinical.records r where id='${r.id}'`),
  ).toBe(original);
});
test("concurrent double request and lost-response retry return a single committed result", async () => {
  const input = args(),
    [a, b] = await Promise.all([
      submit(f.doctor, input),
      submit(f.doctor, input),
    ]);
  expect(a.id).toBe(b.id);
  expect(a.version).toBe(b.version);
  expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
  const retry = await submit(f.doctor, input);
  expect(retry).toMatchObject({
    id: a.id,
    status: "finalized",
    replayed: true,
  });
  expect(count()).toBe(1);
  expect(
    sql(
      `select count(*) from clinical.audit_events where resource_id='${a.id}' and operation='clinical_record.finalized'`,
    ),
  ).toBe("1");
  expect(
    sql(
      `select count(*) from clinical.audit_events where resource_id='${a.id}' and operation='clinical_record.traditional_submitted'`,
    ),
  ).toBe("1");
});
async function fault() {
  const key = "qa_direct_" + randomUUID().replaceAll("-", "");
  sql(
    `create function clinical.${key}() returns trigger language plpgsql as $$begin if new.athlete_id='${f.athlete}' and new.status='finalized' then raise exception 'Synthetic finalization failure';end if;return new;end $$;create trigger ${key} before update on clinical.records for each row execute function clinical.${key}();`,
  );
  return () =>
    sql(
      `drop trigger if exists ${key} on clinical.records;drop function if exists clinical.${key}();`,
    );
}
test("failure after persistence rolls back record, encounter, revisions and success audit", async () => {
  const input = args(),
    release = await fault();
  try {
    expect(await submit(f.doctor, input)).toEqual({ error: "unavailable" });
    expect(count()).toBe(0);
    expect(
      sql(
        `select count(*) from clinical.encounters where athlete_id='${f.athlete}'`,
      ),
    ).toBe("0");
    expect(
      sql(
        `select count(*) from clinical.audit_events where athlete_id='${f.athlete}' and outcome='success'`,
      ),
    ).toBe("0");
  } finally {
    release();
  }
  expect((await submit(f.doctor, input)).status).toBe("finalized");
  expect(count()).toBe(1);
});
test("failed draft finalization preserves its previous fields/version and safely retries", async () => {
  const r = await f.save(f.doctor),
    input = args({
      record_id: r.id,
      expected_version: r.version,
      entry_body: "Atualização atômica DEMO",
    }),
    original = sql(
      `select to_jsonb(r)::text from clinical.records r where id='${r.id}'`,
    );
  const release = await fault();
  try {
    expect(await submit(f.doctor, input)).toEqual({ error: "unavailable" });
    expect(
      sql(
        `select to_jsonb(r)::text from clinical.records r where id='${r.id}'`,
      ),
    ).toBe(original);
    expect(
      sql(
        `select count(*) from clinical.record_revisions where record_id='${r.id}'`,
      ),
    ).toBe("0");
  } finally {
    release();
  }
  expect((await submit(f.doctor, input)).status).toBe("finalized");
  expect(count()).toBe(1);
});
test("a consumed key cannot submit different text or overwrite a published evolution", async () => {
  const input = args(),
    r = await submit(f.doctor, input);
  expect(
    await submit(f.doctor, { ...input, entry_body: "Outro texto" }),
  ).toEqual({ error: "reused" });
  expect(
    await submit(
      f.doctor,
      args({ record_id: r.id, expected_version: r.version }),
    ),
  ).toEqual({ error: "conflict" });
  expect(count()).toBe(1);
});
test("stale draft submissions are rejected without changing current contents", async () => {
  const r = await f.save(f.doctor);
  await f.save(f.doctor, {
    record_id: r.id,
    expected_version: r.version,
    entry_body: "Versão de outra sessão",
  });
  expect(
    await submit(
      f.doctor,
      args({ record_id: r.id, expected_version: r.version }),
    ),
  ).toEqual({ error: "conflict" });
  expect(
    sql(`select body||'|'||status from clinical.records where id='${r.id}'`),
  ).toBe("Versão de outra sessão|draft");
});
test("retry of a prior draft receipt does not overwrite later edits", async () => {
  const input = args({ intent: "draft" }),
    r = await submit(f.doctor, input);
  await f.save(f.doctor, {
    record_id: r.id,
    expected_version: r.version,
    entry_body: "Edição posterior",
  });
  expect(await submit(f.doctor, input)).toMatchObject({
    id: r.id,
    replayed: true,
  });
  expect(count()).toBe(1);
  expect(sql(`select body from clinical.records where id='${r.id}'`)).toBe(
    "Edição posterior",
  );
});
