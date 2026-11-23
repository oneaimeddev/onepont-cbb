import { randomBytes, createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import assert from "node:assert/strict";
import { users, keys, client, query, batch, quote as q, projectRef, authConfig, environmentName } from "./remote.mjs";
import { reconcileDeliveries } from "../../src/features/delivery/engine.ts";

// Password arrives only via a hidden terminal prompt piped into stdin, never argv.
let password = (await new Response(process.stdin).text()).replace(/\r?\n$/, "");
if (password.length < 6) throw new Error("Senha não informada ou abaixo do mínimo do Supabase.");
const versions = query("select version from supabase_migrations.schema_migrations order by version", true).map(x => x.version);
const expectedVersions = readdirSync(new URL("../../supabase/migrations/", import.meta.url)).filter(f=>f.endsWith(".sql")).map(f=>f.split("_")[0]).sort();
assert.deepEqual(versions, expectedVersions, "Migrações remotas devem corresponder à baseline atual.");
const existing = query(`select count(*)::int n from clinical.athletes where qa_batch is distinct from ${q(batch)}`, true)[0].n;
assert.equal(existing, 0, "Projeto contém atletas fora deste seed; não misturar massas.");
const { service, publishable } = keys(), admin = client(service);
const dir = join(homedir(), ".config", "prontuario-cbb");
mkdirSync(dir, { recursive: true, mode: 0o700 });
const secretFile = join(dir, `${environmentName}-admin.json`);
let adminPassword = existsSync(secretFile) ? JSON.parse(readFileSync(secretFile, "utf8")).password : randomBytes(32).toString("base64url");
writeFileSync(secretFile, JSON.stringify({ projectRef, email: users[6].email, password: adminPassword }, null, 2), { mode: 0o600 });
const oldUsers = (await admin.auth.admin.listUsers({ perPage: 1000 })).data.users;
for (const u of users) {
  let found = oldUsers.find(x => x.email === u.email);
  if (found && found.app_metadata?.cbb_beta_batch !== batch) throw new Error(`Conta preexistente sem marca beta: ${u.email}`);
  if (!found) {
    const created = await admin.auth.admin.createUser({ email: u.email, password: u.admin ? adminPassword : password,
      email_confirm: true, app_metadata: { cbb_beta_batch: batch } });
    if (created.error) throw new Error(`Falha ao criar ${u.email}; credenciais omitidas.`);
    found = created.data.user;
  }
  u.id = found.id;
  const profile = await admin.from("profiles").upsert({ id: u.id, display_name: u.name, profession: u.profession,
    can_manage_access: !!u.admin, can_read_audit: !!u.admin });
  if (profile.error) throw new Error(`Falha no perfil ${u.email}.`);
  u.client = client(publishable);
  const signed = await u.client.auth.signInWithPassword({ email: u.email, password: u.admin ? adminPassword : password });
  if (signed.error) throw new Error(`Falha no login ${u.email}; use redefinição administrativa se necessário.`);
  u.session = signed.data.session;
}
writeFileSync(secretFile, JSON.stringify({ projectRef, email: users[6].email, password: adminPassword }, null, 2), { mode: 0o600 });
writeFileSync(join(dir, `${environmentName}-sessions.json`), JSON.stringify(users.map(u => ({ email: u.email, id: u.id, session: u.session }))), { mode: 0o600 });
password = ""; adminPassword = "";
const id = key => {
  const h = createHash("sha256").update(`${batch}:${key}`).digest("hex").slice(0, 32).split("");
  h[12] = "4"; h[16] = "8"; const s = h.join("");
  return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
};
const doctor = users[1];
const statements = ["begin;", `select pg_advisory_xact_lock(hashtextextended(${q(batch)},0));`];
const names = ["Aurora", "Horizonte", "Ipê", "Cedro", "Luar", "Jatobá", "Brisa", "Sereno", "Estrela", "Vereda"];
for (let n = 1; n <= 180; n++) {
  const athlete = id(`athlete:${n}`), minor = n % 3 !== 0, category = minor ? (n % 2 ? "Sub-16" : "Sub-18") : "Profissional";
  const birth = `${minor ? 2010 + n % 3 : 1994 + n % 8}-${String(1 + n % 12).padStart(2,"0")}-12`;
  statements.push(`insert into clinical.athletes(id,full_name,birth_date,team,category,source,qa_batch,external_cbb_id,created_by,gender_identity)
    values(${q(athlete)},${q(`Atleta DEMO ${names[n%10]} ${String(n).padStart(3,"0")}`)},${q(birth)},${q(`Equipe fictícia ${names[n%10]}`)},${q(category)},'demo',${q(batch)},${q(`BETA-DEMO-${n}`)},${q(doctor.id)},${q(n%2 ? "feminino" : "masculino")}) on conflict(id) do nothing;`);
  statements.push(`insert into clinical.athlete_contacts(athlete_id,email,guardian_name,guardian_relation)
    values(${q(athlete)},${q(`atleta-${n}@cbb-demo.test`)},${minor ? q(`Responsável fictício DEMO ${n}`) : "null"},${minor ? "'Responsável de demonstração'" : "null"}) on conflict(athlete_id) do nothing;`);
  statements.push(`insert into clinical.sport_options(id,category,modality,division,season) values(${q(id(`sport:${category}:${n%2}`))},${q(category)},'Basquete',${q(n%2 ? "Feminino" : "Masculino")},2026) on conflict do nothing;`);
  statements.push(`insert into clinical.sport_links(id,athlete_id,option_id,club,starts_on) values(${q(id(`sportlink:${n}`))},${q(athlete)},${q(id(`sport:${category}:${n%2}`))},${q(`Equipe fictícia ${names[n%10]}`)},'2026-01-01') on conflict do nothing;`);
  for (const u of users) statements.push(`insert into clinical.athlete_access(athlete_id,professional_id,can_read_records,can_edit,can_write,can_finalize,granted_by,granted_at)
    values(${q(athlete)},${q(u.id)},${!!u.clinical},${!!u.medical},${!!u.clinical},${!!u.clinical},${q(users[6].id)},clock_timestamp()) on conflict(athlete_id,professional_id) do nothing;`);
  if (n % 5 !== 0) for (let j = 0; j < 2; j++) {
    const u = users[(n+j)%5], rid = id(`record:${n}:${j}`), encounter = id(`encounter:${n}:${j}`);
    const psych = n % 17 === 0 && j === 0, restricted = psych || n % 11 === 0, finalized = n % 4 !== 0;
    statements.push(`insert into clinical.encounters(id,athlete_id,author_id,specialty,occurred_at,status)
      values(${q(encounter)},${q(athlete)},${q(u.id)},${q(psych ? "Psicologia DEMO" : u.profession)},${q(`2026-${String(1+n%10).padStart(2,"0")}-15T14:00:00Z`)},${q(finalized ? "closed" : "open")}) on conflict(id) do nothing;`);
    // Historical synthetic psychology has no login/clinical grant to any evaluator.
    statements.push(`insert into clinical.records(id,athlete_id,author_id,author_name,specialty,title,body,occurred_at,status,visibility,encounter_id)
      values(${q(rid)},${q(athlete)},${psych ? "null" : q(u.id)},${q(psych ? "Profissional sintético de Psicologia DEMO" : u.name)},${q(psych ? "Psicologia DEMO" : u.profession)},${q(`${psych ? "Acompanhamento psicológico" : "Avaliação de acompanhamento"} · DEMO ${n}.${j}`)},
      ${q(`Dados exclusivamente fictícios para avaliação do Beta. Atendimento demonstrativo ${n}.${j}. Orientações simuladas de acompanhamento, sem aplicação clínica real.`)},${q(`2026-${String(1+n%10).padStart(2,"0")}-15T14:00:00Z`)},${q(finalized ? "finalized" : "draft")},${q(restricted ? "author_only" : "care_team")},${q(encounter)}) on conflict(id) do nothing;`);
  }
  if (n % 2 === 0) {
    const content = { notes: "Documento fictício do Beta. Sem validade clínica.", items: [{ id: id(`medication:${n}`), name: "Medicamento fictício DEMO", presentation: "Comprimido demonstrativo", dose: "1", dose_unit: "unidade", route: "Oral (simulada)", schedule: "Posologia fictícia", duration: "Demonstração", quantity: "1", instructions: "Não utilizar nem dispensar. Conteúdo exclusivamente sintético." }] };
    statements.push(`insert into clinical.documents(id,athlete_id,author_id,author_name,document_type,status,content,version) values(${q(id(`document:${n}`))},${q(athlete)},${q(doctor.id)},${q(doctor.name)},'prescription','draft',${q(JSON.stringify(content))}::jsonb,1) on conflict(id) do nothing;`);
  }
}
for (const u of users.filter(x => x.clinical)) statements.push(`insert into clinical.athlete_creators(professional_id,can_write_created,can_finalize_created) values(${q(u.id)},true,true) on conflict do nothing;`);
statements.push(`insert into clinical.medical_authors(professional_id,credential_label,granted_by) values(${q(doctor.id)},null,${q(users[6].id)}) on conflict do nothing;`);
statements.push(`update clinical.signing_environment set demo_enabled=true where id; update clinical.document_delivery_environment set fixture_policy_enabled=true,virtual_recipient_enabled=true where id;`);
statements.push(`insert into clinical.audit_events(actor_user_id,resource_type,operation,outcome,origin_channel,execution_method,safe_metadata)
  select ${q(users[6].id)},'beta_seed','beta.seed.completed','success','system','system',jsonb_build_object('batch',${q(batch)},'fictitious',true)
  where not exists(select 1 from clinical.audit_events where operation='beta.seed.completed' and safe_metadata->>'batch'=${q(batch)});`, "commit;");
query(statements.join("\n"));
async function rpc(name,args) {
  const r = await doctor.client.rpc(name,args);
  if (r.error || r.data?.error) throw new Error(`Falha em ${name}: ${r.data?.error ?? r.error?.code ?? "unknown"}`);
  return r.data;
}
const inventory = await rpc("signing_demo_command", { action: "connect", payload: {} });
for (const n of [2,4,6,8,10,12]) {
  const did = id(`document:${n}`), athlete = id(`athlete:${n}`);
  let opened = await rpc("document_open", { target: athlete, document_id: did });
  if (opened.workflow.lifecycle !== "finalized") {
    const review = (await rpc("document_review_command", { action: "open", payload: { athlete_id: athlete, document_id: did, version: opened.version, kind: "prescription", content: opened.content, idempotency_key: id(`review:${n}`) } })).review;
    const signed = await rpc("document_review_command", { action: "sign", payload: { review_id: review.id, review_hash: review.content_hash, identity_id: inventory.identities[0].id, confirmed: true, idempotency_key: id(`sign:${n}`), scenario: "success", delivery_requested: true, delivery_scenario: "success" } });
    await rpc("signing_demo_command", { action: "status", payload: { attempt_id: signed.attempt.id } });
  }
  const env = { CBB_SIGNING_MODE: "demo", CBB_DEPLOYMENT_ENV: "controlled-demo" };
  for (let i = 0; i < 4; i++) { await reconcileDeliveries(admin, env, { documentId: did }); await new Promise(r => setTimeout(r,500)); }
}
const derived = await rpc("document_workflow_action", { action: "derive", payload: { document_id: id("document:2"), idempotency_key: id("derived:2") } });
const corrected = await rpc("document_open", { target: id("athlete:2"), document_id: derived.documentId });
if (corrected.content.notes !== "Correção demonstrativa do Beta. Origem finalizada preservada.")
  await rpc("document_save", { target: id("athlete:2"), document_id: derived.documentId, expected_version: corrected.version,
    kind: "prescription", payload: { ...corrected.content, notes: "Correção demonstrativa do Beta. Origem finalizada preservada." }, intent: "save" });
await rpc("evolution_correct", { target: id("athlete:1"), record_id: id("record:1:0"), expected_version: 1,
  request_id: id("correction:1"), entry_title: "Acompanhamento corrigido · DEMO", entry_body: "Correção sintética de acompanhamento para explorar o histórico do Beta.", reason: "Correção demonstrativa de conteúdo fictício." });
const counts = query(`select (select count(*) from clinical.athletes where qa_batch=${q(batch)})::int athletes,(select count(*) from clinical.records r join clinical.athletes a on a.id=r.athlete_id where a.qa_batch=${q(batch)})::int evolutions,(select count(*) from clinical.documents)::int documents,(select count(*) from clinical.document_delivery_requests where state='delivered')::int deliveries`,true)[0];
await authConfig({ disable_signup: true });
assert.equal(counts.athletes,180); assert.equal(counts.deliveries,6);
console.log(JSON.stringify({ projectRef, batch, users: users.map(u=>u.email), counts, adminCredentialFile: secretFile, passwordsLogged: false },null,2));
