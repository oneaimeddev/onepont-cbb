import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { localSupabase } from "../../scripts/local-supabase.mjs";
import { workflowSql as sql } from "./workflow-fixtures.mjs";
export { sql };
export async function evolutionFixture() {
  const admin = createClient(localSupabase.url, localSupabase.adminKey, {
      auth: { persistSession: false },
    }),
    users = [],
    athlete = randomUUID();
  async function user(name, profession) {
    const email = `evolution-domain-${randomUUID()}@example.com`,
      password = randomUUID();
    const r = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (r.error) throw r.error;
    users.push(r.data.user.id);
    const id = r.data.user.id;
    const prof = await admin
      .from("profiles")
      .insert({ id, display_name: name, profession });
    if (prof.error) throw prof.error;
    const client = createClient(
      localSupabase.url,
      localSupabase.publishableKey,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error) throw login.error;
    return { id, email, password, client };
  }
  const doctor = await user("Médico Sigilo DEMO", "Medicina"),
    psych = await user("Psicólogo Sigilo DEMO", "Psicologia"),
    peer = await user("Profissional Sigilo DEMO", "Fisioterapia"),
    outsider = await user("Sem vínculo DEMO", "Psicologia");
  sql(
    `insert into clinical.athletes(id,full_name,source) values('${athlete}','Atleta Sigilo DEMO','demo');insert into clinical.athlete_access(athlete_id,professional_id,can_read_records,can_write,can_finalize) values ${[doctor, psych, peer].map((u) => `('${athlete}','${u.id}',true,true,true)`).join(",")};`,
  );
  async function rpc(user, name, args) {
    const r = await user.client.rpc(name, args);
    if (r.error) throw Error(`${name}: ${r.error.message}`);
    return r.data;
  }
  async function save(user, options = {}) {
    return rpc(user, "clinical_save", {
      target: athlete,
      request_id: randomUUID(),
      record_id: null,
      expected_version: 0,
      entry_title: "Título sigiloso DEMO",
      entry_body: "MARCADOR-CONFIDENCIAL-DEMO",
      restricted: false,
      finalize: false,
      ...options,
    });
  }
  async function finalize(user, r) {
    return save(user, {
      record_id: r.id,
      expected_version: r.version,
      finalize: true,
    });
  }
  async function cleanup() {
    sql(
      `delete from clinical.evolution_approvals where athlete_id='${athlete}';delete from clinical.draft_proposals where athlete_id='${athlete}';delete from clinical.attachments where athlete_id='${athlete}';delete from clinical.record_revisions where record_id in(select id from clinical.records where athlete_id='${athlete}');delete from clinical.records where athlete_id='${athlete}';delete from clinical.encounters where athlete_id='${athlete}';delete from clinical.athletes where id='${athlete}';`,
    );
    for (const id of users) {
      sql(`delete from clinical.professional_details where professional_id='${id}';`);
      const removed=await admin.auth.admin.deleteUser(id);
      if(removed.error)throw removed.error;
    }
  }
  return {
    athlete,
    doctor,
    psych,
    peer,
    outsider,
    rpc,
    save,
    finalize,
    cleanup,
  };
}
