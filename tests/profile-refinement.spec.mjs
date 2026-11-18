import {mkdirSync} from "node:fs";
import {expect,test} from "@playwright/test";
import {createProfileFixture,cleanupProfileFixture,loginProfile} from "./fixtures/profile.mjs";
let f;
const shots="docs/visual/handoff-007-9b/stage-1";
test.beforeAll(async()=>{test.setTimeout(90000);f=await createProfileFixture();mkdirSync(shots,{recursive:true});});
test.afterAll(async()=>{await cleanupProfileFixture();});
test("evolução recente abre, recebe foco e aceita o link legado",async({page})=>{
 await loginProfile(page,f.owner);await page.goto(`/atletas/${f.rich}`);
 await page.locator('.recent-evolutions a').first().click();await page.waitForURL(u=>u.searchParams.get('aba')==='timeline');
 const row=page.locator(`#registro-${f.recent[0]}`);
 await expect(row.locator('details')).toHaveAttribute('open','');await expect(row.locator('summary')).toBeFocused();
 await page.screenshot({path:`${shots}/timeline-target.png`,fullPage:false});
 await page.goto(`/atletas/${f.rich}?aba=timeline#registro-${f.recent[2]}`);await expect(page.locator(`#registro-${f.recent[2]} details`)).toHaveAttribute('open','');
 await page.goto(`/atletas/${f.rich}?aba=timeline&registro=${f.privateId}`);await expect(page.locator(`#registro-${f.privateId}`)).toHaveCount(0);expect(await page.content()).not.toContain('Conteúdo PRIVADO DEMO');
});
test("aba ativa visível, todas as seções disponíveis e teclado em 320/390px",async({page})=>{
 await loginProfile(page,f.owner);
 for(const width of [320,390]){
  await page.setViewportSize({width,height:844});await page.goto(`/atletas/${f.rich}?aba=documentos`);
  const selected=page.getByRole('navigation',{name:'Seções do atleta'}).getByRole('link',{name:'Documentos médicos',exact:true});
  await expect.poll(()=>selected.evaluate(x=>{const a=x.getBoundingClientRect(),b=x.parentElement.getBoundingClientRect();return a.left>=b.left-1&&a.right<=b.right+1;})).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`${shots}/tabs-${width}.png`,fullPage:false});
  await selected.focus();await page.keyboard.press('Shift+Tab');await expect(page.getByRole('link',{name:'Anexos clínicos',exact:true})).toBeFocused();
 }
});
test("cadastro protege saída, recarga e descarte; salvar usa confirmação do servidor",async({page})=>{
 await loginProfile(page,f.owner);await page.goto(`/atletas/${f.rich}?aba=cadastro`);
 const name=page.getByLabel('Nome completo',{exact:true});await name.fill('Marina alteração DEMO');
 page.once('dialog',d=>d.dismiss());await page.getByRole('link',{name:'Linha do tempo',exact:true}).click();await expect(name).toHaveValue('Marina alteração DEMO');
 const reloadDialog=page.waitForEvent('dialog');await page.evaluate(()=>{setTimeout(()=>location.reload(),0);});const warning=await reloadDialog;expect(warning.type()).toBe('beforeunload');await warning.dismiss();await expect(name).toHaveValue('Marina alteração DEMO');
 page.once('dialog',d=>d.accept());await page.getByRole('link',{name:'Linha do tempo',exact:true}).click();await page.waitForURL(u=>u.searchParams.get('aba')==='timeline');
 await page.goto(`/atletas/${f.rich}?aba=cadastro`);await expect(name).toHaveValue('Marina Perfil DEMO');
 await name.fill('Marina Perfil Atualizada DEMO');await page.getByRole('button',{name:'Salvar cadastro',exact:true}).click();await page.waitForURL(u=>u.searchParams.has('salvo'));await expect(page.getByRole('status').filter({hasText:'Cadastro salvo.'})).toContainText('Cadastro salvo.');
 await name.fill('Marina Perfil DEMO');await page.getByRole('button',{name:'Salvar cadastro',exact:true}).click();await page.waitForURL(u=>u.searchParams.has('salvo'));await expect(page.locator('h1')).toHaveText('Marina Perfil DEMO');
});
test("restrição só na autora e documentos/anexos seguem autorizados",async({page})=>{
 await loginProfile(page,f.psych);await page.goto(`/atletas/${f.rich}?aba=timeline`);
 await expect(page.locator(`#registro-${f.privateId}`).getByText('· Restrito ao autor',{exact:false})).toBeVisible();
 await page.screenshot({path:`${shots}/own-restriction.png`,fullPage:false});
 const denied=await page.goto(`/atletas/${f.rich}/documentos/${f.docs[0]}`);expect(denied.status()).toBe(404);
 await page.context().clearCookies();await loginProfile(page,f.physio);await page.goto(`/atletas/${f.rich}?aba=timeline`);expect(await page.content()).not.toContain(f.privateId);expect(await page.content()).not.toContain('Conteúdo PRIVADO DEMO');
 await page.goto(`/atletas/${f.rich}?aba=anexos`);await expect(page.getByRole('heading',{name:'Anexos clínicos',exact:true})).toBeVisible();await expect(page.getByText('Resultado laboratorial DEMO',{exact:true})).toHaveCount(0);
 await page.context().clearCookies();await loginProfile(page,f.registry);await page.goto(`/atletas/${f.rich}`);await expect(page.getByRole('link',{name:'Linha do tempo',exact:true})).toHaveCount(0);await expect(page.getByRole('link',{name:'Nova evolução',exact:true})).toHaveCount(0);
});
