import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { localSupabase } from "./local-supabase.mjs";

if (process.env.NODE_ENV === "production" || localSupabase.url !== "http://127.0.0.1:54321") throw new Error("Disponível somente no Supabase local.");
const [command = "500", seed = "cbb-qa-1", email] = process.argv.slice(2);
if (!["500", "5000", "reset"].includes(command)) throw new Error("Escolha 500, 5000 ou reset.");
if (!/^[\w.-]{1,40}$/.test(seed)) throw new Error("Seed inválida.");
if (email && !/^[a-zA-Z0-9._+-]+@example\.com$/.test(email)) throw new Error("Use uma conta sintética @example.com.");
const batch = "qa004:" + seed;
const uuid = (kind, index) => {
  const hex = createHash("sha256").update(batch + ":" + kind + ":" + index).digest("hex").slice(0,32);
  return hex.slice(0,8)+"-"+hex.slice(8,12)+"-"+hex.slice(12,16)+"-"+hex.slice(16,20)+"-"+hex.slice(20);
};
function sql(statement) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_prontuario-cbb", "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8", maxBuffer: 1024*1024 });
}
if (command === "reset") {
  sql(`begin;
    delete from clinical.record_revisions where record_id in(select id from clinical.records where athlete_id in(select id from clinical.athletes where qa_batch='${batch}'));
    delete from clinical.records where athlete_id in(select id from clinical.athletes where qa_batch='${batch}');
    delete from clinical.encounters where athlete_id in(select id from clinical.athletes where qa_batch='${batch}');
    delete from clinical.athletes where qa_batch='${batch}';
    commit;`);
  console.log("Massa da seed removida. Auditoria preservada.");
  process.exit(0);
}
const count = Number(command);
const categories = ["Sub-15","Sub-17","Sub-19","Sub-21","Sub-23","Adulto"];
const photo = await sharp({ create: { width: 128, height: 128, channels: 3, background: "#102849" } }).webp().toBuffer();
const statements = ["begin;"];
for (let i=0;i<24;i++) {
  for (const season of [2025, 2026]) statements.push(`insert into clinical.sport_options(category,modality,division,season) values('${categories[Math.floor(i/4)]}','${i%2?"3x3":"5x5"}','${Math.floor(i/2)%2?"Feminino":"Masculino"}',${season}) on conflict do nothing;`);
}
const names=["Álvaro DEMO","Érica DEMO","João DEMO","Ana Clara de Oliveira Horizonte DEMO","Homônimo DEMO"];
for(let i=0;i<count;i++) {
  const id=uuid("athlete",i), option=i%24;
  const year=1995+i%18;
  statements.push(`insert into clinical.athletes(id,full_name,birth_date,status,source,external_cbb_id,qa_batch,photo,photo_version)
  values('${id}','${names[i%names.length]}','${year}-${String(1+i%12).padStart(2,"0")}-${String(1+i%28).padStart(2,"0")}','${i%11===0?"inactive":"active"}','demo',${i%3===0?"null":"'DEMO-"+seed+"-"+i+"'"},'${batch}',${i%4===0?"decode('"+photo.toString("hex")+"','hex')":"null"},${i%4===0?"'"+uuid("photo",i)+"'":"null"}) on conflict(id) do nothing;
  insert into clinical.sport_links(athlete_id,option_id,club,starts_on)
  select '${id}',id,${i%9===0?"null":"'Clube fictício "+(i%8)+"'"} ,'2026-01-01'
  from clinical.sport_options where category='${categories[Math.floor(option/4)]}' and modality='${option%2?"3x3":"5x5"}' and division='${Math.floor(option/2)%2?"Feminino":"Masculino"}' and season=2026 on conflict do nothing;`);
  if(i%10===0) statements.push(`insert into clinical.sport_links(athlete_id,option_id,club,starts_on,ends_on)
  select '${id}',id,'Equipe histórica DEMO','2025-01-01','2025-12-31' from clinical.sport_options where season=2025 order by category,modality,division limit 1 on conflict do nothing;`);
}
if(email) {
  statements.push(`do $$ declare actor uuid; begin
  select u.id into strict actor from auth.users u join public.profiles p on p.id=u.id where email='${email}';
  update public.profiles set can_read_audit=true where id=actor;
  insert into clinical.athlete_creators(professional_id,can_write_created,can_finalize_created) values(actor,true,true) on conflict(professional_id) do update set can_write_created=true,can_finalize_created=true;
  insert into clinical.athlete_access(athlete_id,professional_id,can_read_records,can_edit,can_write,can_finalize)
  select id,actor,true,true,true,true from clinical.athletes where qa_batch='${batch}'
  on conflict(athlete_id,professional_id) do update set can_read_records=true,can_edit=true,can_write=true,can_finalize=true;
  insert into clinical.audit_events(actor_user_id,resource_type,operation,outcome,origin_channel,execution_method)
  values(actor,'permission','qa.permissions.provisioned','success','system','system');
  end $$;`);
  for (let i=0;i<12;i++) {
    const finalized=i%2===0;
    statements.push(`insert into clinical.encounters(id,athlete_id,author_id,specialty,occurred_at,status)
    select '${uuid("encounter",i)}','${uuid("athlete",i)}',p.id,p.profession,'2026-11-${String(1+i).padStart(2,"0")}T12:00:00Z','${finalized?"closed":"open"}'
    from public.profiles p join auth.users u on u.id=p.id where u.email='${email}' on conflict(id) do nothing;
    insert into clinical.records(id,athlete_id,author_id,author_name,specialty,title,body,occurred_at,status,visibility,encounter_id)
    select '${uuid("record",i)}',e.athlete_id,e.author_id,'Profissional DEMO',e.specialty,'Evolução fictícia de homologação',
    'Registro inteiramente sintético para validar o histórico. Não corresponde a atendimento real.',e.occurred_at,
    '${finalized?"finalized":"draft"}','${i%3===0?"author_only":"care_team"}',e.id
    from clinical.encounters e where e.id='${uuid("encounter",i)}' on conflict(id) do nothing;`);
  }
}
statements.push("commit;");
sql(statements.join("\n"));
console.log(`Massa determinística de ${count} atletas disponível. Seed ${seed}.`);
