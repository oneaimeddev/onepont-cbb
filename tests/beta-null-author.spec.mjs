import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { evolutionFixture, sql } from "./helpers/evolution-fixture.mjs";
import { randomUUID } from "node:crypto";
test("historical authorless psychology denies content instead of returning SQL NULL",async()=>{
  const f=await evolutionFixture();
  try {
    const record={id:randomUUID()};
    const migration=readFileSync("supabase/migrations/20261121000800_record_content_null_guard.sql","utf8");
    const output=sql(`begin;
      insert into clinical.records(id,athlete_id,author_name,specialty,title,body,occurred_at,status,visibility)
      values('${record.id}','${f.athlete}','Psicólogo sintético DEMO','Psicologia DEMO','Histórico fictício','Texto restrito fictício',now(),'finalized','author_only');
      ${migration}
      select set_config('request.jwt.claim.sub','${f.peer.id}',true);
      select 'RESULT:'||jsonb_build_object('allowed',(select clinical.record_content_allowed('${f.peer.id}',r) from clinical.records r where id='${record.id}'),
        'read',public.evolution_read('${f.athlete}','${record.id}'))::text;
      insert into clinical.record_permissions(record_id,professional_id,can_read) values('${record.id}','${f.peer.id}',true);
      select 'GRANT:'||(select clinical.record_content_allowed('${f.peer.id}',r) from clinical.records r where id='${record.id}')::text;
      rollback;`);
    const result=JSON.parse(output.split("\n").find(s=>s.startsWith("RESULT:")).slice(7));
    expect(result.allowed).toBe(false);expect(result.read).toEqual({error:"denied"});
    expect(output.split("\n")).toContain("GRANT:true");
  } finally {await f.cleanup();}
});
