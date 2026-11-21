import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { users, keys, client, query, remoteUrl, authConfig, batch } from "./remote.mjs";
const base = "https://prontuario-cbb-beta.vercel.app";
const sessions = JSON.parse(readFileSync(join(homedir(), ".config/prontuario-cbb/beta-sessions.json"), "utf8"));
const { publishable } = keys();
const id = key => {
  const h = createHash("sha256").update(`${batch}:${key}`).digest("hex").slice(0,32).split("");
  h[12]="4";h[16]="8";const s=h.join("");return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
};
const checks=[];
function checked(label) { checks.push(label); console.log(`OK: ${label}`); }
const anon = client(publishable);
const anonData = await anon.rpc("athlete_catalog", { search: "DEMO" });
assert(anonData.error || anonData.data === null);
assert.equal((await fetch(`${base}/api/documents/simulation?document=${id("document:2")}`)).status,401);
assert.equal((await fetch(`${base}/login`)).status,200);
checked("URL pública HTTPS e ausência de dados clínicos anônimos");
assert.equal((await authConfig()).disable_signup,true);
checked("Cadastro público desabilitado");
for (const u of users) {
  const session=sessions.find(s=>s.email===u.email);
  assert(session);u.id=session.id;u.session=session.session;u.client=client(publishable);
  assert.equal((await u.client.auth.setSession(session.session)).error,null);
  assert.equal((await u.client.auth.getUser()).data.user.id,u.id);
  const profile=(await u.client.from("profiles").select("*").single()).data;
  assert.equal(profile.profession,u.profession);assert.equal(profile.can_manage_access,!!u.admin);
  const workspace=(await u.client.rpc("athlete_workspace",{target:id("athlete:1"),view_name:"timeline"})).data;
  assert.equal(workspace.can_read_records,u.clinical);
  if (!u.clinical) assert(!workspace.records || workspace.records.length===0);
  const medical=(await u.client.rpc("medical_profile")).data;
  assert.equal(medical.enabled,!!u.medical);
  const raw=await u.client.from("records").select("*");assert(raw.error || !raw.data?.length);
  checked(`Login/permissões backend: ${u.email}`);
}
const doctor=users[1], admin=users[6], athlete=id("athlete:1");
const psych=(await doctor.client.rpc("evolution_read",{target:id("athlete:17"),record_id:id("record:17:0")})).data;
assert(!psych?.body && !psych?.record?.body);
checked("Conteúdo de Psicologia não exposto ao médico");
const final=await doctor.client.rpc("evolution_submit",{target:athlete,request_id:id("smoke-evolution"),record_id:null,expected_version:0,
 entry_title:"Validação do Beta · DEMO",entry_body:"Registro fictício de smoke test do ambiente Beta, sem finalidade clínica.",restricted:false,intent:"finalize"});
assert(!final.error && !final.data?.error,JSON.stringify(final.data));
checked("Criação/finalização direta de evolução com recibo idempotente");
const roster=await admin.client.rpc("athlete_access_manage",{target:athlete});assert(roster.data?.links?.length===7);
const audit=await admin.client.rpc("athlete_audit");assert(!audit.error && audit.data);
checked("OnePront: gestão de vínculos e auditoria, sem leitura clínica");
const browser=await chromium.launch({headless:true});
try {
  async function context(u) {
    let stored=[];
    const ssr=createServerClient(remoteUrl,publishable,{cookies:{getAll:()=>stored,setAll:values=>{stored=values;}}});
    assert.equal((await ssr.auth.setSession(u.session)).error,null);
    const ctx=await browser.newContext();
    await ctx.addCookies(stored.map(c=>({name:c.name,value:c.value,url:base,httpOnly:false,secure:true,sameSite:"Lax"})));
    return ctx;
  }
  const ctx=await context(doctor),page=await ctx.newPage();
  await page.goto(`${base}/atletas`,{waitUntil:"networkidle"});
  assert(!page.url().includes("login"));assert((await page.locator("body").innerText()).includes("Atleta DEMO"));
  await page.goto(`${base}/atletas/${athlete}`,{waitUntil:"networkidle"});
  assert((await page.locator("body").innerText()).includes("Atleta DEMO"));
  checked("Listagem e prontuário acessíveis na aplicação publicada");
  await page.goto(`${base}/atletas/${id("athlete:2")}/documentos/${id("document:2")}/conversa-simulada`,{waitUntil:"networkidle"});
  assert((await page.locator("body").innerText()).includes("Simulação — nenhum WhatsApp foi enviado"));
  const link=page.getByRole("link",{name:"Visualizar PDF"});
  const pdf=await ctx.request.get(new URL(await link.getAttribute("href"),base).href);
  assert.equal(pdf.status(),200);assert.equal((await pdf.body()).subarray(0,5).toString(),"%PDF-");
  const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const parsed=await pdfjs.getDocument({data:new Uint8Array(await pdf.body()),useSystemFonts:true}).promise;
  const text=(await (await parsed.getPage(1)).getTextContent()).items.map(i=>i.str).join(" ");
  assert(text.includes("PRÉVIA NÃO ASSINADA — SEM VALIDADE PARA DISPENSAÇÃO"));
  checked("Conversa simulada e PDF real com aviso, obtidos da Vercel");
  const adminCtx=await context(admin),adminPage=await adminCtx.newPage();
  await adminPage.goto(`${base}/atletas/${athlete}?aba=acesso`,{waitUntil:"networkidle"});
  assert((await adminPage.locator("body").innerText()).includes("Profissionais vinculados"));
  checked("Interface administrativa existente acessível ao OnePront");
  await ctx.close();await adminCtx.close();
} finally {await browser.close();}
const counts=query("select (select count(*) from clinical.athletes)::int athletes,(select count(*) from clinical.records)::int evolutions,(select count(*) from clinical.documents)::int documents,(select count(*) from clinical.document_delivery_requests where state='delivered')::int deliveries,(select count(*) from clinical.audit_events where operation like 'delivery.%')::int delivery_audit_events",true)[0];
assert.equal(counts.athletes,180);assert.equal(counts.deliveries,6);assert(counts.delivery_audit_events>0);
checked("Auditoria persistida e seis entregas exclusivamente simuladas");
writeFileSync("/tmp/cbb-008b-smoke.json",JSON.stringify({base,checks,counts},null,2));
console.log(JSON.stringify({counts,checks:checks.length},null,2));
