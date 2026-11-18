import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "../scripts/local-supabase.mjs";
const opts={auth:{autoRefreshToken:false,persistSession:false}};
const admin=createClient(localSupabase.url,localSupabase.adminKey,opts);
const accounts=[];
const measurements=[];
function sql(input) { return execFileSync("docker",["exec","-i","supabase_db_prontuario-cbb","psql","-X","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-tA"],{input,stdio:["pipe","pipe","pipe"]}).toString().trim(); }
async function account(creator=true) {
 const email=`csv-${randomUUID()}@example.com`, password=randomUUID();
 const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true}); if(error)throw error;
 const id=data.user.id; accounts.push(id);
 const profile=await admin.from("profiles").insert({id,display_name:"Operador CSV DEMO",profession:"Cadastro",can_read_audit:false}); if(profile.error)throw profile.error;
 if(creator)sql(`insert into clinical.athlete_creators(professional_id) values('${id}');`);
 const client=createClient(localSupabase.url,localSupabase.publishableKey,opts);
 const login=await client.auth.signInWithPassword({email,password});if(login.error)throw login.error;
 return {id,email,password,client};
}
async function rpc(client,name,args) { const {data,error}=await client.rpc(name,args);expect(error).toBeNull();return data; }
const digest=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function start(client,rows) { const id=randomUUID();await rpc(client,"athlete_import_job",{target:id,operation:"start",digest:digest(rows),row_count:rows.length});return id; }
const batch=(client,id,items,execute_rows=false)=>rpc(client,"athlete_import_batch",{target:id,items,execute_rows});
const job=(client,id,operation="status")=>rpc(client,"athlete_import_job",{target:id,operation});

test.afterAll(async()=>{
 if(accounts.length) {
  const ids=accounts.map(id=>`'${id}'`).join(",");
  sql(`delete from clinical.audit_events where actor_user_id in (${ids});
   delete from clinical.athlete_imports where actor_id in (${ids});
   delete from clinical.athletes where created_by in (${ids});
   delete from clinical.categories where created_by in (${ids});
   delete from clinical.organizations where created_by in (${ids});`);
 }
 for(const id of accounts)await admin.auth.admin.deleteUser(id);
 if(measurements.length) {mkdirSync("docs/visual/handoff-007-7",{recursive:true});writeFileSync("docs/visual/handoff-007-7/measurements.json",JSON.stringify(measurements,null,2)+"\n");}
});

test("parser UTF-8, BOM, aspas, delimitadores, zeros e relatório seguro",()=>{
 execFileSync(process.execPath,["--experimental-strip-types","--input-type=module","-e",`
 import assert from 'node:assert/strict';
 import {parseCsv,mappedRows,csvReport,templateCsv} from './src/features/athletes/csv.ts';
 const data=parseCsv('\uFEFFnome_completo;identificador_institucional;clube\\r\\n"Atleta, João";00007;"Clube; DEMO"\\r\\n\\r\\n');
 assert.equal(data.records.length,1); assert.equal(data.records[0][0],'Atleta, João');
 assert.equal(mappedRows(data.records,data.mapping)[0].payload.document,'00007');
 assert.equal(parseCsv('nome_completo,email\\n"DEMO, Ana",ana@example.com').records[0][0],'DEMO, Ana');
 assert.equal(parseCsv('nome_completo\\nDEMO').records.length,1);
 assert.throws(()=>parseCsv('nome_completo;email\\n"aspas abertas;abc'));
 assert.throws(()=>parseCsv('nome_completo;email\\nDEMO'));
 assert.throws(()=>parseCsv('nome_completo;nome_completo\\nA;B'));
 assert.match(csvReport([['=1+1',' +2','@test','-3']]),/['’]=1/);
 assert.equal(parseCsv(templateCsv()).records.length,1);
 const long=parseCsv('nome_completo\\n'+'A'.repeat(300000));
 assert.equal(mappedRows(long.records,long.mapping)[0].payload.name.length,161);
 for(const n of [10,100,1000,5000])assert.equal(parseCsv('nome_completo\\n'+Array.from({length:n},(_,i)=>'DEMO '+i).join('\\n')).records.length,n);
 assert.throws(()=>parseCsv('nome_completo\\n'+Array.from({length:5001},()=> 'DEMO').join('\\n')));
 `],{stdio:"pipe"});
});

test("prévia sem efeitos, catálogos, duplicidade restrita, autorização e reenvio",async()=>{
 const owner=await account(), operator=await account(), denied=await account(false);
 const unique=randomUUID();
 const existing=await rpc(owner.client,"athlete_register",{creation_id:randomUUID(),payload:{name:`Restrito ${unique}`,document:`DEMO-${unique.slice(0,8)}`}});
 const catalog=await rpc(operator.client,"catalog_list",{});
 const rows=[
  {line:2,payload:{name:`CSV Válido ${unique}`,document:"000007",category:catalog.categories[0].name,division:"Feminino",modality:"3x3",club:catalog.clubs[0].name,shirt:"07"}},
  {line:3,payload:{name:`Restrito ${unique}`}},
  {line:4,payload:{name:"DEMO data impossível",birth:"2026-02-30"}},
  {line:5,payload:{name:"DEMO categoria",category:"Categoria desconhecida CSV"}},
  {line:6,payload:{name:"DEMO clube",club:"Clube desconhecido CSV"}},
  {line:7,payload:{name:"DEMO telefone",phone:"123"}},
  {line:8,payload:{name:"DEMO data ambígua",birth:"12/04/2010"}},
 ];
 const id=await start(operator.client,rows);
 const deniedStart=await job(denied.client,id);expect(deniedStart.error).toBe("denied");
 expect((await job(owner.client,id)).error).toBe("unavailable");
 expect((await batch(operator.client,id,rows,true)).error).toBe("state");
 const preview=await batch(operator.client,id,rows);
 expect(preview.rows.map(r=>r.state)).toEqual(["ready","duplicate","invalid","invalid","invalid","invalid","invalid"]);
 expect(preview.rows[1].matches).toEqual([]);expect(JSON.stringify(preview)).not.toContain(existing.id);
 expect(sql(`select count(*) from clinical.athletes where created_by='${operator.id}'`)).toBe("0");
 expect(sql(`select count(*) from clinical.audit_events where actor_user_id='${operator.id}' and operation='athlete.create'`)).toBe("0");
 await job(operator.client,id,"confirm");
 const changed=await batch(operator.client,id,[{...rows[0],payload:{name:"alterado"}}],true);expect(changed.error).toBe("review_mismatch");
 const committed=await batch(operator.client,id,rows,true);
 expect(committed.rows.map(r=>r.state)).toEqual(["created","ignored","rejected","rejected","rejected","rejected","rejected"]);
 const repeated=await batch(operator.client,id,rows,true);expect(repeated.rows.map(r=>r.state)).toEqual(committed.rows.map(r=>r.state));
 const final=await job(operator.client,id);expect(final).toMatchObject({state:"completed",created:1,ignored:1,rejected:5,processed:7,duplicates:1});
 expect((await operator.client.rpc("athlete_import_batch",{target:id,items:rows,execute_rows:null})).error).not.toBeNull();
 const created=final.rows[0].id;
 expect(sql(`select count(*) from clinical.sport_links where athlete_id='${created}' and shirt_number='07'`)).toBe("1");
 expect(sql(`select can_read_records from clinical.athlete_access where athlete_id='${created}' and professional_id='${operator.id}'`)).toBe("f");
 expect(sql(`select count(*) from clinical.athlete_access where athlete_id='${existing.id}' and professional_id='${operator.id}'`)).toBe("0");
 const id2=await start(operator.client,[rows[0]]);expect((await batch(operator.client,id2,[rows[0]])).rows[0].state).toBe("repeat");
 const audit=sql(`select operation||':'||safe_metadata::text from clinical.audit_events where resource_id='${id}'`);
 expect(audit).toContain('athlete.import.completed');expect(audit).toContain('"created": 1');expect(audit).not.toContain("Restrito");
 const anon=createClient(localSupabase.url,localSupabase.publishableKey,opts);
 expect((await anon.rpc("athlete_import_job",{target:id,operation:"status"})).error).not.toBeNull();
});

test("homônimos, repetição no arquivo, concorrência e retomada parcial",async()=>{
 const user=await account();const name=`Homônimo DEMO ${randomUUID()}`;
 const rows=[{line:2,payload:{name,birth:"2010-01-01"}},{line:3,payload:{name,birth:"2011-01-01"}},{line:4,payload:{name,birth:"2010-01-01"}}];
 const id=await start(user.client,rows);
 const p=await batch(user.client,id,rows);expect(p.rows.map(r=>r.state)).toEqual(["ready","duplicate","repeat"]);
 await job(user.client,id,"confirm");
 const both=await Promise.all([batch(user.client,id,[rows[0]],true),batch(user.client,id,[rows[0]],true)]);
 expect(both.map(v=>v.rows[0].state)).toEqual(["created","created"]);
 expect((await job(user.client,id)).processed).toBe(1);
 const rest=await batch(user.client,id,[{...rows[1],decision:"create"},rows[2]],true);
 expect(rest.rows.map(r=>r.state)).toEqual(["created","ignored"]);
 expect((await job(user.client,id))).toMatchObject({created:2,ignored:1,state:"completed"});
});

for(const total of [10,100,1000,5000])test(`carga real com ${total} atletas fictícios`,async()=>{
 test.setTimeout(600_000);
 const user=await account();const stamp=randomUUID();const rows=Array.from({length:total},(_,i)=>({line:i+2,payload:{name:`CSV Carga DEMO ${stamp} ${i}`,document:`${stamp.slice(0,8)}-${String(i).padStart(6,"0")}`}}));
 const id=await start(user.client,rows);const began=performance.now();
 for(let i=0;i<total;i+=25)await batch(user.client,id,rows.slice(i,i+25));
 const previewMs=Math.round(performance.now()-began);
 expect(sql(`select count(*) from clinical.athletes where created_by='${user.id}'`)).toBe("0");
 await job(user.client,id,"confirm");const commitAt=performance.now();
 for(let i=0;i<total;i+=25)await batch(user.client,id,rows.slice(i,i+25),true);
 const commitMs=Math.round(performance.now()-commitAt);
 expect(await job(user.client,id)).toMatchObject({created:total,processed:total,state:"completed",rejected:0});
 measurements.push({total,previewMs,commitMs,batchSize:25});
});

test("fluxo visual, confirmação humana, relatório e recuperação pelo mesmo arquivo",async({page})=>{
 test.setTimeout(120_000);
 const user=await account();const name=`Atleta CSV DEMO ${randomUUID().slice(0,8)}`;
 const content=`\uFEFFnome_completo;data_nascimento;identificador_institucional;coluna_extra\n${name};2010-04-12;0000007;ignorar\nInválido DEMO;2026-02-30;;`;
 const select=async()=>{await page.getByLabel("Arquivo CSV",{exact:true}).setInputFiles({name:"atletas-demo.csv",mimeType:"text/csv",buffer:Buffer.from(content)});await page.getByRole("button",{name:"Continuar para mapeamento"}).click();await page.getByRole("button",{name:"Conferir catálogos"}).click();await page.getByRole("button",{name:"Validar todas as linhas"}).click();};
 await page.goto("/login");await page.getByLabel("E-mail").fill(user.email);await page.getByLabel("Senha").fill(user.password);await page.getByRole("button",{name:"Entrar"}).click();await page.waitForURL(url=>!url.pathname.startsWith("/login"));
 await page.goto("/atletas?q=DEMO&page=1");await page.getByRole("link",{name:"Importar CSV",exact:true}).click();
 await select();await expect(page.getByRole("heading",{name:"Revise antes de importar"})).toBeVisible();
 expect(sql(`select count(*) from clinical.athletes where created_by='${user.id}'`)).toBe("0");
 await expect(page.getByRole("button",{name:"Confirmar importação"})).toBeDisabled();
 mkdirSync("docs/visual/handoff-007-7",{recursive:true});
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:"docs/visual/handoff-007-7/review-desktop.png",fullPage:true});
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:"docs/visual/handoff-007-7/review-mobile.png",fullPage:true});
 await page.getByLabel("Revisei os resultados").check();await page.getByRole("button",{name:"Confirmar importação"}).click();
 await expect(page.getByRole("heading",{name:"Relatório da importação"})).toBeVisible();await expect(page.getByRole("status")).toContainText("1 criados, 0 ignorados e 1 rejeitados");
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:"docs/visual/handoff-007-7/result-desktop.png",fullPage:true});
 const dl=page.waitForEvent("download");await page.getByRole("button",{name:"Baixar relatório CSV"}).click();expect((await dl).suggestedFilename()).toBe("relatorio-importacao.csv");
 await page.reload();await select();await expect(page.getByRole("heading",{name:"Relatório da importação"})).toBeVisible();expect(sql(`select count(*) from clinical.athletes where created_by='${user.id}'`)).toBe("1");
 await page.getByRole("link",{name:"Voltar ao diretório"}).click();await expect(page.getByRole("link",{name,exact:true})).toBeVisible();
});

test("mapeamento manual e revisão de catálogos sobrevivem ao recarregamento",async({page})=>{
 test.setTimeout(120_000);
 page.setDefaultTimeout(15_000);
 const user=await account();const stamp=randomUUID().slice(0,8);
 const catalog=await rpc(user.client,"catalog_list",{});const clubName=`Clube CSV DEMO ${stamp}`;
 const content=`Coluna Nome;categoria;naipe_competitivo;modalidade;clube\nAtleta DEMO Mapeamento ${stamp};Categoria Alias DEMO;Feminino;5x5;${clubName}`;
 const file={name:"mapeamento.csv",mimeType:"text/csv",buffer:Buffer.from(content)};
 await page.goto("/login");await page.getByLabel("E-mail").fill(user.email);await page.getByLabel("Senha").fill(user.password);await page.getByRole("button",{name:"Entrar"}).click();await page.waitForURL(url=>!url.pathname.startsWith("/login"));
 await page.goto("/atletas/importar");await page.getByLabel("Arquivo CSV",{exact:true}).setInputFiles(file);await page.getByRole("button",{name:"Continuar para mapeamento"}).click();
 await page.getByRole("combobox",{name:"Coluna Nome"}).selectOption("name");await page.getByRole("button",{name:"Conferir catálogos"}).click();
 await page.locator(".csv-catalog").filter({hasText:"Categoria desconhecido"}).getByRole("combobox").selectOption({label:catalog.categories[0].name});
 await page.getByRole("button",{name:"Cadastrar clube",exact:true}).click();await expect(page.getByText("Categorias e clubes reconhecidos.")).toBeVisible();
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:"docs/visual/handoff-007-7/mapping-desktop.png",fullPage:true});
 await page.getByRole("button",{name:"Validar todas as linhas"}).click();await expect(page.getByRole("heading",{name:"Revise antes de importar"})).toBeVisible();
 const stored=await page.evaluate(()=>sessionStorage.getItem("cbb-athlete-import"));expect(stored).not.toContain(`Atleta DEMO Mapeamento ${stamp}`);expect(stored).not.toContain("Categoria Alias DEMO");expect(stored).not.toContain(clubName);
 page.once("dialog",dialog=>dialog.accept());await page.reload();await page.getByLabel("Arquivo CSV",{exact:true}).setInputFiles(file);await page.getByRole("button",{name:"Continuar para mapeamento"}).click();
 await expect(page.getByRole("combobox",{name:"Coluna Nome"})).toHaveValue("name");await page.getByRole("button",{name:"Conferir catálogos"}).click();await expect(page.getByText("Categorias e clubes reconhecidos.")).toBeVisible();
 await page.getByRole("button",{name:"Validar todas as linhas"}).click();await expect(page.getByRole("heading",{name:"Revise antes de importar"})).toBeVisible();await page.getByLabel("Revisei os resultados").check();await page.getByRole("button",{name:"Confirmar importação"}).click();await expect(page.getByRole("heading",{name:"Relatório da importação"})).toBeVisible();await expect(page.getByRole("status")).toContainText("1 criados");
 expect(sql(`select count(*) from clinical.sport_links l join clinical.athletes a on a.id=l.athlete_id where a.created_by='${user.id}' and l.club='${clubName}'`)).toBe("1");
});
