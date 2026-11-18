import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { localSupabase } from "../../scripts/local-supabase.mjs";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(localSupabase.url, localSupabase.adminKey, opts);
const users = [],
  athletes = [],
  options = [];
const stamp = randomUUID().slice(0, 8);
export function profileSql(input) {
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
      "-d",
      "postgres",
      "-tA",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input, stdio: ["pipe", "pipe", "pipe"] },
  )
    .toString()
    .trim();
}
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
async function account(medical = true) {
  const email = `clinical-search-${randomUUID()}@example.com`,
    password = randomUUID();
  const user = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (user.error) throw user.error;
  const id = user.data.user.id;
  users.push(id);
  const profile = await admin.from("profiles").insert({
    id,
    display_name: "Busca Clínica DEMO",
    profession: medical ? "Medicina" : "Fisioterapia",
    can_read_audit: false,
  });
  if (profile.error) throw profile.error;
  profileSql(
    `insert into clinical.athlete_creators(professional_id) values('${id}');${medical ? `insert into clinical.medical_authors(professional_id,credential_label) values('${id}','Credencial fictícia');` : ""}`,
  );
  const client = createClient(
    localSupabase.url,
    localSupabase.publishableKey,
    opts,
  );
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id, email, password, client };
}
async function rpc(client, name, args = {}) {
  const { data, error } = await client.rpc(name, args);
  expect(error).toBeNull();
  return data;
}
function athlete(user, name, read = true) {
  const id = randomUUID();
  athletes.push(id);
  profileSql(
    `insert into clinical.athletes(id,full_name,source) values('${id}',${quote(name)},'demo');${user ? `insert into clinical.athlete_access(athlete_id,professional_id,can_read_records,can_write,can_edit) values('${id}','${user.id}',${read},true,true);` : ""}`,
  );
  return id;
}
function evolution(owner, target, when, extra = {}) {
  const id = randomUUID();
  profileSql(
    `insert into clinical.records(id,athlete_id,author_id,author_name,specialty,title,body,occurred_at,status,visibility) values('${id}','${target}','${owner.id}','Autor DEMO',${quote(extra.specialty ?? "Fisioterapia")},${quote(extra.title ?? "Evolução DEMO")},'Conteúdo fictício não enviado ao modelo',${quote(when)}::timestamptz,${quote(extra.status ?? "finalized")},${quote(extra.visibility ?? "care_team")});`,
  );
  return id;
}
function document(
  owner,
  target,
  kind,
  created,
  clinical = "",
  title = "Exame DEMO",
) {
  const id = randomUUID();
  let content =
    kind === "exam_request"
      ? {
          occurred_at: clinical,
          items: [
            {
              id: randomUUID(),
              name: title,
              exam_type: "laboratory",
              region: "",
              laterality: "",
              technical_details: "",
              notes: "",
            },
          ],
          indication: "",
          justification: "Fictício",
          diagnosis: "",
          priority: "",
          additional: "",
        }
      : kind === "prescription"
        ? {
            notes: "",
            items: [
              {
                id: randomUUID(),
                name: "Medicamento DEMO",
                dose: "500",
                dose_unit: "mg",
                presentation: "",
                route: "",
                schedule: "",
                duration: "",
                quantity: "",
                instructions: "",
              },
            ],
          }
        : {
            procedure: "Procedimento DEMO",
            region: "",
            laterality: "",
            indication: "",
            diagnosis: "",
            justification: "",
            priority: "",
            additional: "",
            materials: "",
          };
  profileSql(
    `insert into clinical.documents(id,athlete_id,author_id,author_name,document_type,status,content,version,created_at,updated_at) values('${id}','${target}','${owner.id}','Autor DEMO','${kind}','draft',${quote(JSON.stringify(content))}::jsonb,1,${quote(created)}::timestamptz,${quote(created)}::timestamptz);`,
  );
  return id;
}
async function sport(
  owner,
  target,
  category = "Sub-19",
  division = "Masculino",
) {
  const org = await rpc(owner.client, "catalog_create_organization", {
    label: `Clube Transversal DEMO ${stamp}`,
    org_kind: "club",
  });
  const cat = await rpc(owner.client, "catalog_create_category", {
    label: category,
  });
  const inserted = profileSql(
    `insert into clinical.sport_options(category,modality,division,season) values('${category}','5x5','${division}',extract(year from current_date)::integer) on conflict do nothing returning id`,
  );
  const id = profileSql(
    `select id from clinical.sport_options where category='${category}' and modality='5x5' and division='${division}' and season=extract(year from current_date)::integer`,
  );
  if (inserted && /^[a-f0-9-]{36}$/.test(inserted)) options.push(id);
  profileSql(
    `insert into clinical.sport_links(athlete_id,option_id,club,club_id,starts_on) values('${target}','${id}',${quote(org.name)},'${org.id}',current_date-100);update clinical.athletes set category='${category}',team=${quote(org.name)} where id='${target}'`,
  );
  return { club: org.name, category: cat.name };
}
async function attachment(owner, target, date = null) {
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText(`LAUDO FICTICIO ${randomUUID()}`);
  const bytes = Buffer.from(await pdf.save());
  const id = randomUUID();
  const { createHash } = await import("node:crypto");
  const begin = await rpc(owner.client, "attachment_begin", {
    target,
    attachment_key: id,
    payload: {
      title: "Resultado laboratorial DEMO",
      category: "laboratory",
      document_date: date ?? "",
      original_filename: "resultado.pdf",
      mime_type: "application/pdf",
      size_bytes: bytes.length,
      checksum: createHash("sha256").update(bytes).digest("hex"),
    },
  });
  const stored = await admin.storage
    .from("clinical-attachments")
    .upload(begin.path, bytes, { contentType: "application/pdf" });
  if (stored.error) throw stored.error;
  expect(
    await rpc(owner.client, "attachment_finish", {
      attachment_key: id,
      attempt: begin.token,
      success: true,
    }),
  ).toMatchObject({ status: "ready" });
  return id;
}
export async function loginProfile(page, user) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
}

export async function cleanupProfileFixture() {
  if (!users.length) return;
  const ids = users.map(quote).join(",");
  const targets = athletes.map(quote).join(",") || "null";
  const paths = JSON.parse(
    profileSql(
      `select coalesce(json_agg(u.storage_path),'[]') from clinical.attachment_uploads u join clinical.attachments a on a.id=u.attachment_id where a.uploaded_by in(${ids})`,
    ),
  );
  if (paths.length) {
    const r = await admin.storage.from("clinical-attachments").remove(paths);
    if (r.error) throw r.error;
  }
  profileSql(
    `delete from clinical.attachment_uploads where attachment_id in(select id from clinical.attachments where uploaded_by in(${ids}));delete from clinical.attachments where uploaded_by in(${ids});delete from clinical.document_proposals where actor_id in(${ids});delete from clinical.conversation_sessions where professional_id in(${ids});delete from clinical.audit_events where actor_user_id in(${ids});delete from clinical.documents where author_id in(${ids});delete from clinical.records where author_id in(${ids});delete from clinical.athletes where id in(${targets});delete from clinical.sport_options where id in(${options.map(quote).join(",") || "null"});delete from clinical.categories where created_by in(${ids});delete from clinical.organizations where created_by in(${ids});`,
  );
  for (const id of users) {
    const r = await admin.auth.admin.deleteUser(id);
    if (r.error) throw r.error;
  }
}

export async function createProfileFixture() {
 const owner=await account(),physio=await account(false),psych=await account(false),registry=await account(false);
 const rich=athlete(owner,"Marina Perfil DEMO"),fresh=athlete(owner,"Lucas Cadastro DEMO"),multi=athlete(owner,"Gabriela Vínculos DEMO");
 profileSql(`update clinical.athletes set birth_date='2007-04-12',gender_identity='feminino',document_id='DEMO-PERFIL' where id='${rich}';insert into clinical.athlete_contacts(athlete_id,phone,email,guardian_name,guardian_relation,guardian_contact,emergency_contact) values('${rich}','(11) 0000-0000','atleta.demo@example.com','Responsável DEMO','Mãe','(11) 0000-0001','Contato DEMO');`);
 for(const user of [physio,psych,registry]) for(const id of [rich,fresh,multi]) profileSql(`insert into clinical.athlete_access(athlete_id,professional_id,can_read_records,can_write,can_edit) values('${id}','${user.id}',${user!==registry},${user!==registry},false)`);
 for(const id of [rich,multi]) {await sport(owner,id,"Sub-19","Feminino");await sport(owner,id,"Adulto","Feminino");}
 const recent=[];
 for(let i=0;i<65;i++) {
  const date=new Date('2026-11-17T12:00:00-03:00');date.setUTCDate(date.getUTCDate()-i*4);
  recent.push(evolution(i%3===0?owner:physio,rich,date.toISOString(),{title:`Acompanhamento ${String(i).padStart(2,"0")} DEMO`,specialty:i%3===0?"Medicina":"Fisioterapia",status:i===0||i===1?"draft":"finalized"}));
 }
 const privateId=evolution(psych,rich,'2026-11-18T11:00:00-03',{title:'Conteúdo PRIVADO DEMO',specialty:'Psicologia',visibility:'author_only'});
 const docs=['prescription','surgical_order','exam_request','prescription','exam_request'].map((kind,i)=>document(owner,rich,kind,`2026-11-${String(17-i).padStart(2,"0")}T12:00:00-03`,'2026-11-15'));
 profileSql(`update clinical.documents set status='ready_for_review',version=2 where id='${docs[1]}'`);
 const file=await attachment(owner,rich,'2026-11-15');
 return {owner,physio,psych,registry,rich,fresh,multi,recent,privateId,docs,file};
}
