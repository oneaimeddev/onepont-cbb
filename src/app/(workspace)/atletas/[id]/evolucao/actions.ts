"use server";
import { redirect } from "next/navigation";
import { requireProfile } from "../../../../../lib/profile";
import { supabaseServer } from "../../../../../lib/supabase";
import { uuidPattern } from "../../../../../features/athletes/data";

export async function saveEvolution(form: FormData) {
  await requireProfile();
  const athlete = String(form.get("athlete") ?? "");
  const record = String(form.get("record") ?? "");
  const requestId = String(form.get("request") ?? "");
  if (!uuidPattern.test(athlete) || (record && !uuidPattern.test(record)) || !uuidPattern.test(requestId)) throw new Error("Identificador inválido.");
  const finalize = form.get("action") === "finalize";
  if (finalize && form.get("confirm") !== "yes") throw new Error("Confirme a revisão do registro.");
  const client = await supabaseServer();
  const { data, error } = await client.rpc("clinical_save", {
    target: athlete, request_id: requestId, record_id: record || null,
    expected_version: Number(form.get("version") ?? 0),
    entry_title: String(form.get("title") ?? ""), entry_body: String(form.get("body") ?? ""),
    restricted: form.get("restricted") === "yes", finalize,
  });
  const route = `/atletas/${athlete}/evolucao`;
  if (error || data?.error) redirect(route + "?erro=1" + (record ? "&registro=" + record : ""));
  redirect(finalize ? `/atletas/${athlete}?aba=timeline` : route + "?registro=" + data.id);
}
