import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { localSupabase } from "../../scripts/local-supabase.mjs";
export const workflowAdmin = createClient(
  localSupabase.url,
  localSupabase.adminKey,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
export function workflowSql(input) {
  return execFileSync(
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
    { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}
export function cleanupWorkflow(sql, ids) {
  if (!ids.length) return;
  for (const id of ids)
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid fixture UUID");
  const owned = ids.map((x) => `'${x}'`).join(",");
  sql(
    `do $$ begin if to_regclass('clinical.chat_proposal_changes') is not null then delete from clinical.chat_proposal_changes where professional_id in(${owned});end if;end $$;`,
  );
  sql(
    `delete from clinical.chat_operation_authorizations where professional_id in(${owned});delete from clinical.chat_human_inputs where professional_id in(${owned});delete from clinical.chat_operation_challenges where professional_id in(${owned});delete from clinical.chat_document_contexts where workspace_id in(select id from clinical.chat_document_workspaces where professional_id in(${owned}));delete from clinical.chat_document_workspaces where professional_id in(${owned});`,
  );
  const req = `select id from clinical.document_delivery_requests where professional_id in(${owned})`;
  sql(
    `update clinical.document_delivery_requests set current_attempt_id=null where professional_id in(${owned});delete from clinical.document_delivery_results where request_id in(${req});delete from clinical.document_delivery_transitions where request_id in(${req});delete from clinical.document_delivery_jobs where request_id in(${req});delete from clinical.document_delivery_actions where professional_id in(${owned});delete from clinical.document_delivery_attempts where request_id in(${req});delete from clinical.document_delivery_requests where professional_id in(${owned});delete from clinical.document_delivery_authorizations where professional_id in(${owned});delete from clinical.document_delivery_choices where professional_id in(${owned});delete from clinical.document_derivations where professional_id in(${owned});delete from clinical.document_finalizations where professional_id in(${owned});update clinical.document_signature_operations set verified_evidence_id=null where professional_id in(${owned});delete from clinical.document_verified_signature_evidence where operation_id in(select id from clinical.document_signature_operations where professional_id in(${owned}));delete from clinical.document_signature_operations where professional_id in(${owned});`,
  );
}
export async function workflowFixture() {
  const users = [],
    athlete = randomUUID(),
    minor = randomUUID(),
    absent = randomUUID();
  const before = workflowSql(
    "select demo_enabled from clinical.signing_environment",
  );
  const policy = workflowSql(
    "select fixture_policy_enabled from clinical.document_delivery_environment",
  );
  await workflowAdmin.rpc("configure_signing_demo", { enabled: true });
  await workflowAdmin.rpc("configure_document_delivery_demo", {
    enabled: true,
  });
  async function user(name) {
    const email = `workflow-${randomUUID()}@example.com`,
      password = randomUUID();
    const r = await workflowAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (r.error) throw r.error;
    const id = r.data.user.id;
    users.push(id);
    const p = await workflowAdmin
      .from("profiles")
      .insert({ id, display_name: name, profession: "Medicina DEMO" });
    if (p.error) throw p.error;
    const client = createClient(
      localSupabase.url,
      localSupabase.publishableKey,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    await client.auth.signInWithPassword({ email, password });
    return { id, email, password, client };
  }
  const owner = await user("Profissional Ciclo DEMO"),
    other = await user("Outro Profissional Ciclo DEMO");
  workflowSql(
    `insert into clinical.athletes(id,full_name,birth_date,source) values('${athlete}','Atleta Ciclo DEMO','1994-01-01','demo'),('${minor}','Atleta Menor Ciclo DEMO','2014-01-01','demo'),('${absent}','Atleta Sem Contato Ciclo DEMO','1994-01-01','demo');insert into clinical.athlete_contacts(athlete_id,phone,guardian_name,guardian_relation,guardian_contact) values('${athlete}','11999990001',null,null,null),('${minor}','11999990002','Responsável Ciclo DEMO','Responsável declarado','11988880003');insert into clinical.medical_authors(professional_id) values('${owner.id}'),('${other.id}');insert into clinical.athlete_access(athlete_id,professional_id,can_read_records,can_edit) values ${[athlete, minor, absent].flatMap((a) => users.map((u) => `('${a}','${u}',true,true)`)).join(",")};`,
  );
  async function rpc(name, args, u = owner) {
    const r = await u.client.rpc(name, args);
    if (r.error) throw new Error(r.error.message);
    return r.data;
  }
  const inventory = await rpc("signing_demo_command", {
    action: "connect",
    payload: {},
  });
  await rpc("signing_demo_command", { action: "connect", payload: {} }, other);
  async function prepare(kind = "prescription", opts = {}) {
    const content =
      kind === "prescription"
        ? {
            notes: "Documento fictício DEMO",
            items: [
              {
                id: randomUUID(),
                name: "Medicamento DEMO",
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
          }
        : kind === "surgical_order"
          ? {
              procedure: "Procedimento DEMO",
              region: "",
              laterality: "",
              indication: "",
              diagnosis: "",
              justification: "Justificativa DEMO",
              priority: "",
              materials: "",
              additional: "",
            }
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
              indication: "",
              justification: "Justificativa DEMO",
              diagnosis: "",
              priority: "",
              additional: "",
            };
    const result = await rpc("document_review_command", {
      action: "open",
      payload: {
        athlete_id: athlete,
        document_id: randomUUID(),
        version: 0,
        kind,
        content,
        idempotency_key: randomUUID(),
        ...opts,
      },
    });
    return result.review;
  }
  async function sign(review, opts = {}) {
    return rpc("document_review_command", {
      action: "sign",
      payload: {
        review_id: review.id,
        review_hash: review.content_hash,
        identity_id: inventory.identities[0].id,
        confirmed: true,
        idempotency_key: randomUUID(),
        scenario: "success",
        delivery_requested: false,
        ...opts,
      },
    });
  }
  async function status(attempt) {
    return rpc("signing_demo_command", {
      action: "status",
      payload: { attempt_id: attempt },
    });
  }
  async function detail(id, u = owner) {
    return rpc("document_workflow_get", { target: id }, u);
  }
  async function cleanup() {
    cleanupWorkflow(workflowSql, users);
    const ids = users.map((x) => `'${x}'`).join(",");
    workflowSql(
      `delete from clinical.signature_demo_delivery_intents where professional_id in(${ids});delete from clinical.document_reviews where professional_id in(${ids});delete from clinical.signature_results where attempt_id in(select id from clinical.signature_attempts where professional_id in(${ids}));delete from clinical.signature_transitions where professional_id in(${ids});delete from clinical.signature_attempts where professional_id in(${ids});delete from clinical.signature_snapshots where professional_id in(${ids});delete from clinical.signature_preferences where professional_id in(${ids});delete from clinical.signing_identities where professional_id in(${ids});delete from clinical.signature_connections where professional_id in(${ids});delete from clinical.athletes where id in('${athlete}','${minor}','${absent}');delete from clinical.medical_authors where professional_id in(${ids});`,
    );
    for (const id of users) await workflowAdmin.auth.admin.deleteUser(id);
    await workflowAdmin.rpc("configure_signing_demo", {
      enabled: before === "t",
    });
    await workflowAdmin.rpc("configure_document_delivery_demo", {
      enabled: policy === "t",
    });
  }
  return {
    owner,
    other,
    athlete,
    minor,
    absent,
    inventory,
    rpc,
    prepare,
    sign,
    status,
    detail,
    cleanup,
    users,
  };
}
