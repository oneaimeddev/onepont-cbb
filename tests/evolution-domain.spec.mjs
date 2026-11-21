import {test,expect} from "@playwright/test";
import {randomUUID} from "node:crypto";
import {evolutionFixture,sql} from "./helpers/evolution-fixture.mjs";
let f;
test.beforeEach(async()=>{f=await evolutionFixture();});
test.afterEach(async()=>{await f?.cleanup();});
async function read(user,id){return f.rpc(user,"evolution_read",{target:f.athlete,record_id:id});}
async function timeline(user){return f.rpc(user,"athlete_workspace",{target:f.athlete,view_name:"timeline"});}
test("ordinary finalized content is shared; unrelated users get no metadata",async()=>{
 const r=await f.save(f.doctor);await f.finalize(f.doctor,r);
 expect((await read(f.peer,r.id)).body).toBe("MARCADOR-CONFIDENCIAL-DEMO");
 expect((await timeline(f.outsider))).toBeNull();expect(await read(f.outsider,r.id)).toEqual({error:"denied"});
});
test("restricted encounter remains in timeline with an allowlist of metadata only",async()=>{
 const r=await f.save(f.doctor,{restricted:true});await f.finalize(f.doctor,r);
 const other=await timeline(f.peer);expect(other.counts.evolutions).toBe(1);
 expect(other.records).toEqual([{id:r.id,occurred_at:expect.any(String),author_name:"Médico Sigilo DEMO",title:"Conteúdo restrito",content_restricted:true,is_restricted:true,can_edit:false}]);
 const profile=await f.rpc(f.peer,"athlete_workspace",{target:f.athlete,view_name:"profile"});
 expect(JSON.stringify(profile)).not.toContain("MARCADOR-CONFIDENCIAL");expect(JSON.stringify(profile)).not.toContain("Título sigiloso");
 expect((await read(f.doctor,r.id)).body).toBe("MARCADOR-CONFIDENCIAL-DEMO");
 expect(await read(f.peer,r.id)).toEqual({error:"denied"});
 expect(sql(`select count(*) from clinical.audit_events where actor_user_id='${f.peer.id}' and operation='clinical_record.content.read' and outcome='denied'`)).toBe("1");
});
test("psychology is mandatory via payload and cannot be demoted by changing profession",async()=>{
 const r=await f.save(f.psych,{restricted:false});expect(sql(`select visibility from clinical.records where id='${r.id}'`)).toBe("author_only");
 const update=await f.save(f.psych,{record_id:r.id,expected_version:r.version,restricted:false});expect(update.version).toBe(2);
 const profile=await f.rpc(f.psych,"professional_profile_command",{action:"save",payload:{display_name:"Psicólogo Sigilo DEMO",profession:"Medicina"}});expect(profile.error).toBeUndefined();
 const next=await f.save(f.psych,{restricted:false});expect(sql(`select visibility from clinical.records where id='${next.id}'`)).toBe("author_only");
 await f.finalize(f.psych,update);expect(await read(f.doctor,r.id)).toEqual({error:"denied"});
 expect((await timeline(f.doctor)).records).toHaveLength(2);
});
test("AI approval/commit obey the same domain restriction and confirmation",async()=>{
 const request=randomUUID(),args={target:f.athlete,request_id:request,entry_title:"IA Psicologia DEMO",entry_body:"SEGREDO-IA-DEMO",occurred_on:null,restricted:false};
 const approval=await f.rpc(f.psych,"clinical_draft_approve",args);expect(approval.ok).toBe(true);
 const {request_id,...commit}=args;void request_id;
 const saved=await f.rpc(f.psych,"clinical_draft_commit",{...commit,approval_id:approval.approvalId});expect(saved.ok).toBe(true);
 expect(sql(`select visibility from clinical.records where id='${saved.id}'`)).toBe("author_only");
 expect(await read(f.doctor,saved.id)).toEqual({error:"denied"});
});
test("search, history, attachment references and direct table APIs cannot expose psychology",async()=>{
 const r=await f.save(f.psych);await f.finalize(f.psych,r);
 for(const name of ["agent_history_page","chat_history_page"]){const result=await f.rpc(f.doctor,name,{target:f.athlete,filters:{}});expect(result.records).toEqual([]);expect(result.total).toBe(0);}
 for(const name of ["agent_athlete_workspace","athlete_workspace"]){const result=await f.rpc(f.doctor,name,{target:f.athlete,view_name:"timeline"});expect(JSON.stringify(result)).not.toContain("MARCADOR-CONFIDENCIAL");expect(JSON.stringify(result)).not.toContain("Título sigiloso");}
 expect(sql(`select clinical.attachment_reference('${f.doctor.id}','${f.athlete}','${r.id}',null)`)).toBe("f");
 const options=await f.rpc(f.doctor,"attachment_options",{target:f.athlete});expect(options.references).toEqual([]);
 const search=await f.rpc(f.doctor,"search_clinical_activity",{filters:{q:"MARCADOR-CONFIDENCIAL"}});expect(JSON.stringify(search)).not.toContain(r.id);
 expect((await f.doctor.client.schema("clinical").from("records").select("*")).error).toBeTruthy();
});
test("specific content grants require athlete scope and never confer correction implicitly",async()=>{
 const r=await f.save(f.psych);await f.finalize(f.psych,r);
 sql(`insert into clinical.record_permissions(record_id,professional_id,can_read) values('${r.id}','${f.doctor.id}',true),('${r.id}','${f.outsider.id}',true);`);
 expect((await read(f.doctor,r.id)).body).toBe("MARCADOR-CONFIDENCIAL-DEMO");expect((await read(f.doctor,r.id)).can_edit).toBe(false);
 expect(await read(f.outsider,r.id)).toEqual({error:"denied"});
});
