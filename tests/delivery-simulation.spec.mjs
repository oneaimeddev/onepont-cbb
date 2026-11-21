import { test, expect } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PDFDocument } from "pdf-lib";
import { workflowFixture, workflowSql as sql, workflowAdmin as admin } from "./helpers/workflow-fixtures.mjs";
import { reconcileDeliveries, deliveryEnvironmentAllowed, simulatedDeliveryAdapter } from "../src/features/delivery/engine.ts";
import { prescriptionPdf, unsignedNotice } from "../src/features/delivery/prescription-pdf.ts";
const require=createRequire(import.meta.url);
const env={CBB_SIGNING_MODE:"demo",CBB_DEPLOYMENT_ENV:"test"};
const shots="docs/visual/handoff-007-10-7a";
let f,priorVirtual;
test.beforeAll(async()=>{
  priorVirtual=sql("select virtual_recipient_enabled from clinical.document_delivery_environment");
  f=await workflowFixture();
  await admin.rpc("configure_virtual_delivery_demo",{enabled:true});
  mkdirSync(shots,{recursive:true});
});
test.afterAll(async()=>{
  await f?.cleanup();
  await admin.rpc("configure_virtual_delivery_demo",{enabled:priorVirtual==="t"});
});
async function finished(scenario="success") {
  const review=await f.prepare("prescription",{athlete_id:f.absent});
  expect(review.recipient.name).toBe("Responsável de demonstração");
  const key=randomUUID();
  const args={delivery_requested:true,delivery_scenario:scenario,idempotency_key:key};
  const signed=await f.sign(review,args);
  expect(signed.error,JSON.stringify(signed)).toBeUndefined();
  const replay=await f.sign(review,args);
  expect(replay.attempt.id).toBe(signed.attempt.id);
  await f.status(signed.attempt.id);
  const detail=await f.detail(review.document_id);
  expect(detail.workflow.lifecycle).toBe("finalized");
  expect(detail.workflow.deliveries).toHaveLength(1);
  return {review,signed,request:detail.workflow.deliveries[0].id};
}
async function pump(id,count=3) {
  for(let i=0;i<count;i++){
    sql(`update clinical.document_delivery_jobs set available_at=clock_timestamp()-interval '1 second' where request_id in(select id from clinical.document_delivery_requests where document_id='${id}')`);
    await reconcileDeliveries(admin,env,{documentId:id});
  }
}
async function read(x,attachment=null,user=f.owner){
  return f.rpc("demo_delivery_conversation",{target:x.review.document_id,attachment},user);
}
test("sem telefone: mensagem e PDF persistidos, snapshot correto, idempotência e imutabilidade",async()=>{
  const x=await finished();
  expect(sql(`select count(*) from clinical.athlete_contacts where athlete_id='${f.absent}'`)).toBe("0");
  await pump(x.review.document_id);
  const data=await read(x,x.request),m=data.messages[0];
  expect(data.messages).toHaveLength(1);
  expect(m.state).toBe("delivered");
  const bytes=Buffer.from(m.pdf,"base64");
  expect(bytes.subarray(0,5).toString()).toBe("%PDF-");
  expect(m.pdfHash).toBe(createHash("sha256").update(bytes).digest("hex"));
  const pdf=await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThan(0);
  const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const parsed=await pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;
  const text=(await (await parsed.getPage(1)).getTextContent()).items.map(i=>i.str).join(" ");
  expect(text).toContain(unsignedNotice);
  expect(text).toContain(x.review.document_id);
  expect(text).toContain("Medicamento DEMO");
  expect(text).toContain("Documento fictício DEMO");
  expect(text).toContain(m.snapshotId);
  expect(m.version).toBe(x.review.material.version);
  writeFileSync(`${shots}/prescricao-demo.pdf`,bytes);
  const before=sql(`select count(*) from clinical.document_delivery_transitions where request_id='${x.request}'`);
  await read(x);await read(x);
  expect(sql(`select count(*) from clinical.document_delivery_transitions where request_id='${x.request}'`)).toBe(before);
  await pump(x.review.document_id,2);
  expect((await read(x,x.request)).messages[0].pdf).toBe(m.pdf);
  expect(()=>sql(`update clinical.document_delivery_requests set demo_pdf_base64='tampered' where id='${x.request}'`)).toThrow();
  expect(()=>sql(`update clinical.document_delivery_requests set snapshot_id=gen_random_uuid() where id='${x.request}'`)).toThrow();
  expect((await f.detail(x.review.document_id)).workflow.deliveries[0].hasDemoAttachment).toBe(true);
});
test("conversa e PDF negados a outro profissional, acesso revogado e ambiente desligado",async()=>{
  const x=await finished();await pump(x.review.document_id);
  expect((await read(x,x.request,f.other)).error).toBe("unavailable");
  expect((await f.owner.client.rpc("demo_delivery_attachment",{request_id:x.request,lease_token:randomUUID()})).error).not.toBeNull();
  expect((await f.owner.client.rpc("configure_virtual_delivery_demo",{enabled:true})).error).not.toBeNull();
  sql(`update clinical.athlete_access set can_edit=false where athlete_id='${f.absent}' and professional_id='${f.owner.id}'`);
  expect((await read(x,x.request)).error).toBe("unavailable");
  sql(`update clinical.athlete_access set can_edit=true where athlete_id='${f.absent}' and professional_id='${f.owner.id}'`);
  await admin.rpc("configure_signing_demo",{enabled:false});
  expect((await read(x)).error).toBe("unavailable");
  await admin.rpc("configure_signing_demo",{enabled:true});
  sql(`update clinical.athletes set source='manual' where id='${f.absent}'`);
  expect((await read(x)).error).toBe("unavailable");
  sql(`update clinical.athletes set source='demo' where id='${f.absent}'`);
  expect((await read(x,randomUUID())).error).toBe("unavailable");
});
test("falha e retentativa reutilizam anexo; reenvio mantém histórico real do motor",async()=>{
  const x=await finished("temporary_failure");await pump(x.review.document_id,1);
  const first=(await read(x,x.request)).messages[0];
  expect(first.state).toBe("failed");
  const retry=await f.rpc("document_workflow_action",{action:"retry",payload:{request_id:x.request,idempotency_key:randomUUID(),justification:"Retentativa fictícia autorizada",confirmed:true}});
  expect(retry.error).toBeUndefined();await pump(x.review.document_id);
  const after=(await read(x,x.request)).messages[0];
  expect(after.state).toBe("delivered");expect(after.pdf).toBe(first.pdf);
  const resend=await f.rpc("document_workflow_action",{action:"resend",payload:{request_id:x.request,idempotency_key:randomUUID(),justification:"Reenvio fictício autorizado",confirmed:true}});
  expect(resend.error).toBeUndefined();await pump(x.review.document_id);
  expect((await read(x)).messages).toHaveLength(2);
});
test("isolamento virtual/real e nenhum transporte externo",async()=>{
  await admin.rpc("configure_virtual_delivery_demo",{enabled:false});
  const rv=await f.prepare("prescription",{athlete_id:f.absent});
  expect(rv.recipient.available).toBe(false);
  await admin.rpc("configure_virtual_delivery_demo",{enabled:true});
  expect(deliveryEnvironmentAllowed({...env,VERCEL_ENV:"production"})).toBe(false);
  expect(deliveryEnvironmentAllowed({...env,CBB_SIGNING_MODE:"off"})).toBe(false);
  const x=await finished();
  const job=(await admin.rpc("claim_document_delivery_job",{target:x.review.document_id})).data.job;
  await expect(simulatedDeliveryAdapter().submit({...job,executionMode:"production"})).rejects.toThrow();
  const oldFetch=globalThis.fetch,external=[];
  globalThis.fetch=(url,init)=>{
    const host=new URL(String(url)).hostname;
    if(!["127.0.0.1","localhost"].includes(host)){external.push(host);throw new Error("External I/O forbidden");}
    return oldFetch(url,init);
  };
  try {
    sql(`update clinical.document_delivery_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where request_id='${x.request}'`);
    await pump(x.review.document_id);
  } finally {globalThis.fetch=oldFetch;}
  expect(external).toEqual([]);
});
test("PDF multipágina preserva textos longos e repete o aviso em todas as páginas",async()=>{
  const rv=await f.prepare();
  const material={...rv.material,document_id:rv.document_id,content:{...rv.material.content,notes:"Orientação fictícia extensa. ".repeat(1200)}};
  const bytes=Buffer.from(await prescriptionPdf(material,randomUUID()),"base64");
  const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const parsed=await pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;
  expect(parsed.numPages).toBeGreaterThan(1);
  for(let i=1;i<=parsed.numPages;i++){
    const text=(await (await parsed.getPage(i)).getTextContent()).items.map(i=>i.str).join(" ");
    expect(text).toContain(unsignedNotice);
  }
});
test("falha ao persistir PDF não confirma envio e lease recuperável gera um único anexo",async()=>{
  const x=await finished();
  const failingClient={rpc:async(name,args)=> name==="demo_delivery_attachment" && args.pdf_base64
    ? {error:{message:"Injected synthetic storage failure"},data:null}
    : admin.rpc(name,args)};
  await expect(reconcileDeliveries(failingClient,env,{documentId:x.review.document_id})).rejects.toThrow("could not be persisted");
  expect((await f.detail(x.review.document_id)).workflow.deliveries[0].state).toBe("processing");
  expect((await read(x)).error).toBe("unavailable");
  sql(`update clinical.document_delivery_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where request_id='${x.request}'`);
  await pump(x.review.document_id);
  const m=(await read(x,x.request)).messages[0];
  expect(m.state).toBe("delivered");expect(m.pdf).toBeTruthy();
  expect((await f.detail(x.review.document_id)).workflow.deliveries[0].attempts).toBe(1);
});
async function login(page,user=f.owner){
  await page.goto("/login");
  await page.getByLabel("E-mail",{exact:true}).fill(user.email);
  await page.getByLabel("Senha",{exact:true}).fill(user.password);
  await page.getByRole("button",{name:"Entrar",exact:true}).click();
  await page.waitForURL("/");
}
test("jornada tradicional real, conversa desktop/mobile, PDF protegido e acessibilidade",async({page,browser})=>{
  test.setTimeout(120000);
  await login(page);
  const did=randomUUID(),base=`/atletas/${f.absent}/documentos/${did}`;
  await page.goto(`/atletas/${f.absent}/documentos/nova?tipo=prescricao&documento=${did}`);
  await page.getByLabel("Nome do medicamento",{exact:true}).fill("Medicamento CONVERSA DEMO");
  await page.getByLabel("Apresentação ou concentração").fill("Comprimido fictício");
  await page.getByLabel("Dose",{exact:true}).fill("1");
  await page.getByLabel("Unidade",{exact:true}).fill("mg");
  await page.getByLabel("Via de administração").fill("Oral");
  await page.getByLabel("Frequência").fill("Posologia fictícia");
  await page.getByLabel("Duração").fill("DEMO");
  await page.getByLabel("Quantidade").fill("1");
  await page.getByRole("button",{name:"Revisar e assinar",exact:true}).click();
  await page.getByRole("combobox",{name:"Identidade para este documento",exact:true}).selectOption(f.inventory.identities[0].id);
  await page.getByLabel("Enviar ao atleta por WhatsApp").check();
  await expect(page.locator(".document-recipient")).toContainText("Responsável de demonstração");
  await page.getByLabel("Revisei este conteúdo").check();
  await page.getByRole("button",{name:"Simular assinatura",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Entrega simulada concluída",exact:true})).toBeVisible({timeout:30000});
  await page.getByRole("link",{name:"Abrir conversa simulada"}).click();
  await expect(page.getByRole("heading",{name:"Conversa simulada"})).toBeVisible();
  await expect(page.getByText("Simulação — nenhum WhatsApp foi enviado",{exact:true})).toBeVisible();
  const pdfLink=page.getByRole("link",{name:"Visualizar PDF"});
  const href=await pdfLink.getAttribute("href");
  const response=await page.request.get(href);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect((await response.body()).subarray(0,5).toString()).toBe("%PDF-");
  const download=await page.request.get(`${href}&download=1`);
  expect(download.headers()["content-disposition"]).toContain("attachment;");
  const anon=await browser.newContext();
  expect((await anon.request.get(new URL(href, page.url()).href)).status()).toBe(401);
  await anon.close();
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:900});
    await page.addScriptTag({path:require.resolve("axe-core/axe.min.js")});
    expect(await page.evaluate(async()=> (await window.axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21aa"]}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`${shots}/conversa-${width}.png`,fullPage:true});
  }
  await page.getByRole("button",{name:"Atualizar conversa"}).click();
  await expect(page.getByRole("button",{name:"Atualizar conversa"})).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("heading",{name:"Prescrição demonstrativa"})).toBeVisible();
  const other=await browser.newContext();const p=await other.newPage();await login(p,f.other);
  expect((await p.request.get(href)).status()).toBe(404);
  const denied=await p.goto(`${base}/conversa-simulada`);expect(denied.status()).toBe(404);
  await other.close();
});
