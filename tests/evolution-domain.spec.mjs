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
async function read(user, id) {
  return f.rpc(user, "evolution_read", { target: f.athlete, record_id: id });
}
async function timeline(user) {
  return f.rpc(user, "athlete_workspace", {
    target: f.athlete,
    view_name: "timeline",
  });
}
test("ordinary finalized content is shared; unrelated users get no metadata", async () => {
  const r = await f.save(f.doctor);
  await f.finalize(f.doctor, r);
  expect((await read(f.peer, r.id)).body).toBe("MARCADOR-CONFIDENCIAL-DEMO");
  expect(await timeline(f.outsider)).toBeNull();
  expect(await read(f.outsider, r.id)).toEqual({ error: "denied" });
});
test("restricted encounter remains in timeline with an allowlist of metadata only", async () => {
  const r = await f.save(f.doctor, { restricted: true });
  await f.finalize(f.doctor, r);
  const other = await timeline(f.peer);
  expect(other.counts.evolutions).toBe(1);
  expect(other.records).toEqual([
    {
      id: r.id,
      occurred_at: expect.any(String),
      author_name: "Médico Sigilo DEMO",
      title: "Conteúdo restrito",
      content_restricted: true,
      is_restricted: true,
      can_edit: false,
    },
  ]);
  const profile = await f.rpc(f.peer, "athlete_workspace", {
    target: f.athlete,
    view_name: "profile",
  });
  expect(JSON.stringify(profile)).not.toContain("MARCADOR-CONFIDENCIAL");
  expect(JSON.stringify(profile)).not.toContain("Título sigiloso");
  expect((await read(f.doctor, r.id)).body).toBe("MARCADOR-CONFIDENCIAL-DEMO");
  expect(await read(f.peer, r.id)).toEqual({ error: "denied" });
  expect(
    sql(
      `select count(*) from clinical.audit_events where actor_user_id='${f.peer.id}' and operation='clinical_record.content.read' and outcome='denied'`,
    ),
  ).toBe("1");
});
test("psychology is mandatory via payload and cannot be demoted by changing profession", async () => {
  const r = await f.save(f.psych, { restricted: false });
  expect(
    sql(`select visibility from clinical.records where id='${r.id}'`),
  ).toBe("author_only");
  const update = await f.save(f.psych, {
    record_id: r.id,
    expected_version: r.version,
    restricted: false,
  });
  expect(update.version).toBe(2);
  const profile = await f.rpc(f.psych, "professional_profile_command", {
    action: "save",
    payload: { display_name: "Psicólogo Sigilo DEMO", profession: "Medicina" },
  });
  expect(profile.error).toBeUndefined();
  expect(await f.rpc(f.psych,"evolution_policy",{})).toEqual({psychology_required:true});
  const next = await f.save(f.psych, { restricted: false });
  expect(
    sql(`select visibility from clinical.records where id='${next.id}'`),
  ).toBe("author_only");
  await f.finalize(f.psych, update);
  expect(await read(f.doctor, r.id)).toEqual({ error: "denied" });
  expect((await timeline(f.doctor)).records).toHaveLength(2);
});
test("AI approval/commit obey the same domain restriction and confirmation", async () => {
  const request = randomUUID(),
    args = {
      target: f.athlete,
      request_id: request,
      entry_title: "IA Psicologia DEMO",
      entry_body: "SEGREDO-IA-DEMO",
      occurred_on: null,
      restricted: false,
    };
  const approval = await f.rpc(f.psych, "clinical_draft_approve", args);
  expect(approval.ok).toBe(true);
  const { request_id, ...commit } = args;
  void request_id;
  const saved = await f.rpc(f.psych, "clinical_draft_commit", {
    ...commit,
    approval_id: approval.approvalId,
  });
  expect(saved.ok).toBe(true);
  expect(
    sql(`select visibility from clinical.records where id='${saved.id}'`),
  ).toBe("author_only");
  expect(await read(f.doctor, saved.id)).toEqual({ error: "denied" });
});
test("search, history, attachment references and direct table APIs cannot expose psychology", async () => {
  const r = await f.save(f.psych);
  await f.finalize(f.psych, r);
  for (const name of ["agent_history_page", "chat_history_page"]) {
    const result = await f.rpc(f.doctor, name, {
      target: f.athlete,
      filters: {},
    });
    expect(result.records).toEqual([]);
    expect(result.total).toBe(0);
  }
  for (const name of ["agent_athlete_workspace", "athlete_workspace"]) {
    const result = await f.rpc(f.doctor, name, {
      target: f.athlete,
      view_name: "timeline",
    });
    expect(JSON.stringify(result)).not.toContain("MARCADOR-CONFIDENCIAL");
    expect(JSON.stringify(result)).not.toContain("Título sigiloso");
  }
  expect(
    sql(
      `select clinical.attachment_reference('${f.doctor.id}','${f.athlete}','${r.id}',null)`,
    ),
  ).toBe("f");
  const options = await f.rpc(f.doctor, "attachment_options", {
    target: f.athlete,
  });
  expect(options.references).toEqual([]);
  const search = await f.rpc(f.doctor, "search_clinical_activity", {
    filters: { kinds: ["evolution"], period: "all", athlete_id: f.athlete },
  });
  expect(search.error).toBeUndefined();
  expect(search.matched_records).toBe(0);
  expect(search.total).toBe(0);
  expect(JSON.stringify(search)).not.toContain(r.id);
  expect(
    (await f.doctor.client.schema("clinical").from("records").select("*"))
      .error,
  ).toBeTruthy();
});
test("specific content grants require athlete scope and never confer correction implicitly", async () => {
  const r = await f.save(f.psych);
  await f.finalize(f.psych, r);
  sql(
    `insert into clinical.record_permissions(record_id,professional_id,can_read) values('${r.id}','${f.doctor.id}',true),('${r.id}','${f.outsider.id}',true);`,
  );
  expect((await read(f.doctor, r.id)).body).toBe("MARCADOR-CONFIDENCIAL-DEMO");
  expect((await read(f.doctor, r.id)).can_edit).toBe(false);
  expect(await read(f.outsider, r.id)).toEqual({ error: "denied" });
});

async function correct(user, r, options = {}) {
  return f.rpc(user, "evolution_correct", {
    target: f.athlete,
    record_id: r.id,
    expected_version: r.version,
    request_id: randomUUID(),
    entry_title: "Título corrigido DEMO",
    entry_body: "CORRECAO-CONFIDENCIAL-DEMO",
    reason: "Correção de digitação fictícia",
    ...options,
  });
}
test("draft edits archive content, reject stale versions and keep original authorship", async () => {
  const r = await f.save(f.doctor);
  const next = await f.save(f.doctor, {
    record_id: r.id,
    expected_version: r.version,
    entry_title: "Rascunho atualizado",
    entry_body: "Atualizado DEMO",
  });
  expect(next.version).toBe(2);
  expect(
    (await f.save(f.doctor, { record_id: r.id, expected_version: r.version }))
      .error,
  ).toBe("conflict");
  const history = await f.rpc(f.doctor, "evolution_history", {
    target: f.athlete,
    record_id: r.id,
  });
  expect(history.versions).toHaveLength(2);
  expect(history.versions[0].body).toBe("MARCADOR-CONFIDENCIAL-DEMO");
});
test("published correction changes authorized reads, preserves original row and one encounter", async () => {
  const r = await f.finalize(f.doctor, await f.save(f.doctor));
  const original = sql(
    `select to_jsonb(r)::text from clinical.records r where id='${r.id}'`,
  );
  const corrected = await correct(f.doctor, r);
  expect(corrected.version).toBe(r.version + 1);
  expect(
    sql(`select to_jsonb(r)::text from clinical.records r where id='${r.id}'`),
  ).toBe(original);
  const current = await read(f.peer, r.id);
  expect(current.body).toBe("CORRECAO-CONFIDENCIAL-DEMO");
  expect(current.author_name).toBe("Médico Sigilo DEMO");
  expect(current.status).toBe("finalized");
  expect((await timeline(f.peer)).records).toHaveLength(1);
  expect((await timeline(f.peer)).counts.encounters).toBe(1);
  const history = await f.rpc(f.peer, "evolution_history", {
    target: f.athlete,
    record_id: r.id,
  });
  expect(history.versions.at(-1)).toMatchObject({
    reason: "Correção de digitação fictícia",
    actor_name: "Médico Sigilo DEMO",
    kind: "revision",
  });
  expect(history.versions.at(-2).body).toBe("MARCADOR-CONFIDENCIAL-DEMO");
  const sources = await f.rpc(f.peer, "agent_history_page", {
    target: f.athlete,
    filters: {},
  });
  expect(sources.records[0]).toMatchObject({
    title: "Título corrigido DEMO",
    version: corrected.version,
  });
  const search = await f.rpc(f.peer, "search_clinical_activity", {
    filters: { athlete_id: f.athlete, kinds: ["evolution"], period: "all" },
  });
  expect(search.items[0].sources[0].title).toBe("Título corrigido DEMO");
  const audit = sql(
    `select safe_metadata::text from clinical.audit_events where actor_user_id='${f.doctor.id}' and operation='clinical_record.corrected'`,
  );
  expect(audit).toContain('"version"');
  expect(audit).not.toContain("CONFI");
});
test("a delegated corrector needs explicit permission and active finalization scope", async () => {
  const r = await f.finalize(f.doctor, await f.save(f.doctor));
  expect((await correct(f.peer, r)).error).toBe("denied");
  sql(
    `insert into clinical.record_permissions(record_id,professional_id,can_read,can_correct) values('${r.id}','${f.peer.id}',true,true);update clinical.athlete_access set can_finalize=false where athlete_id='${f.athlete}' and professional_id='${f.peer.id}';`,
  );
  expect((await correct(f.peer, r)).error).toBe("denied");
  sql(
    `update clinical.athlete_access set can_finalize=true where athlete_id='${f.athlete}' and professional_id='${f.peer.id}';`,
  );
  expect((await correct(f.peer, r)).version).toBe(r.version + 1);
  expect((await read(f.doctor, r.id)).author_name).toBe("Médico Sigilo DEMO");
  const history = await f.rpc(f.doctor, "evolution_history", {
    target: f.athlete,
    record_id: r.id,
  });
  expect(history.versions.at(-1).actor_name).toBe("Profissional Sigilo DEMO");
});
test("competing corrections serialize, stale writes fail and identical requests are idempotent", async () => {
  const r = await f.finalize(f.doctor, await f.save(f.doctor)),
    request = randomUUID();
  const results = await Promise.all([
    correct(f.doctor, r, { request_id: request }),
    correct(f.doctor, r),
  ]);
  expect(results.filter((x) => x.version === r.version + 1)).toHaveLength(1);
  expect(results.filter((x) => x.error === "conflict")).toHaveLength(1);
  const committedRequest = sql(
    `select request_id from clinical.record_corrections where record_id='${r.id}'`,
  );
  expect(
    await correct(f.doctor, r, { request_id: committedRequest }),
  ).toMatchObject({ version: r.version + 1 });
  expect(
    (
      await correct(f.doctor, r, {
        request_id: committedRequest,
        entry_body: "Conteúdo diferente",
      })
    ).error,
  ).toBe("reused");
  expect(
    sql(
      `select count(*) from clinical.record_corrections where record_id='${r.id}'`,
    ),
  ).toBe("1");
});
test("psychology correction and full history stay confidential in every read path", async () => {
  const r = await f.finalize(f.psych, await f.save(f.psych));
  expect((await correct(f.psych, r)).version).toBe(r.version + 1);
  expect(await read(f.doctor, r.id)).toEqual({ error: "denied" });
  expect(
    await f.rpc(f.doctor, "evolution_history", {
      target: f.athlete,
      record_id: r.id,
    }),
  ).toEqual({ error: "denied" });
  const other = await timeline(f.doctor);
  expect(other.records[0].title).toBe("Conteúdo restrito");
  for (const key of [
    "body",
    "version",
    "version_count",
    "updated_at",
    "linked_corrections",
  ])
    expect(other.records[0]).not.toHaveProperty(key);
  const text = JSON.stringify(other);
  expect(text).not.toContain("CORRECAO");
  expect(text).not.toContain("digitação");
  const owner = await read(f.psych, r.id);
  expect(owner.is_restricted).toBe(true);
  expect(owner.body).toBe("CORRECAO-CONFIDENCIAL-DEMO");
});
test("signed version remains unchanged; correction is a linked addendum", async () => {
  const r = await f.finalize(f.doctor, await f.save(f.doctor));
  sql(
    `insert into clinical.evolution_signature_locks(record_id,signed_version) values('${r.id}',${r.version});`,
  );
  const next = await correct(f.doctor, r);
  expect(next.version).toBe(r.version + 1);
  const current = await read(f.doctor, r.id);
  expect(current.body).toBe("MARCADOR-CONFIDENCIAL-DEMO");
  expect(current.linked_corrections[0].body).toBe("CORRECAO-CONFIDENCIAL-DEMO");
  expect(current.signed_version).toBe(r.version);
  expect(
    (
      await f.save(f.doctor, {
        record_id: r.id,
        expected_version: r.version,
        entry_body: "Sobrescrever",
      })
    ).error,
  ).toBe("conflict");
  expect(
    sql(
      `select kind from clinical.record_corrections where record_id='${r.id}'`,
    ),
  ).toBe("addendum");
});
test("historical psychology keeps its original clinical fields while a policy ledger blocks exposure", async () => {
  const legacy = sql(
    "select count(*) from clinical.record_secrecy_locks l join clinical.records r on r.id=l.record_id where r.visibility='care_team' and r.author_id not in(select id from public.profiles where display_name like '%Sigilo DEMO')",
  );
  expect(Number(legacy)).toBeGreaterThanOrEqual(2);
  const denied = await f.psych.client.rpc("athlete_workspace_before_6d", {
    target: f.athlete,
    view_name: "timeline",
  });
  expect(denied.error).toBeTruthy();
  const r = await f.save(f.psych);
  expect(
    (
      await f.psych.client
        .schema("clinical")
        .from("record_permissions")
        .insert({
          record_id: r.id,
          professional_id: f.doctor.id,
          can_read: true,
        })
    ).error,
  ).toBeTruthy();
});

test("revoking explicit content permission invalidates derived conversations", async () => {
  const r = await f.finalize(f.psych, await f.save(f.psych));
  sql(
    `insert into clinical.record_permissions(record_id,professional_id,can_read) values('${r.id}','${f.doctor.id}',true);`,
  );
  const before = sql(`select clinical.conversation_epoch('${f.doctor.id}')`);
  expect((await read(f.doctor, r.id)).body).toBeTruthy();
  sql(
    `delete from clinical.record_permissions where record_id='${r.id}' and professional_id='${f.doctor.id}'`,
  );
  expect(
    Number(sql(`select clinical.conversation_epoch('${f.doctor.id}')`)),
  ).toBe(Number(before) + 1);
  expect(await read(f.doctor, r.id)).toEqual({ error: "denied" });
});
test("delegated draft edit archives its previous body without changing the clinical author", async () => {
  const r = await f.save(f.doctor, { restricted: true });
  expect(
    (await f.save(f.peer, { record_id: r.id, expected_version: r.version }))
      .error,
  ).toBe("denied");
  sql(
    `insert into clinical.record_permissions(record_id,professional_id,can_read,can_correct) values('${r.id}','${f.peer.id}',true,true);`,
  );
  const update = await f.save(f.peer, {
    record_id: r.id,
    expected_version: r.version,
    entry_body: "Delegação DEMO",
  });
  expect(update.version).toBe(2);
  expect((await read(f.doctor, r.id)).author_name).toBe("Médico Sigilo DEMO");
  expect((await read(f.doctor, r.id)).is_restricted).toBe(true);
});
