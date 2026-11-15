"use server";
import { redirect } from "next/navigation";
import { requireProfile } from "../../../../lib/profile";
import { supabaseServer } from "../../../../lib/supabase";
import { uuidPattern } from "../../../../features/athletes/data";

export async function editAthlete(form: FormData) {
  await requireProfile();
  const target = String(form.get("id"));
  if (!uuidPattern.test(target)) throw new Error("Atleta inválido.");
  const client = await supabaseServer();
  const { data, error } = await client.rpc("athlete_edit", {
    target, name: String(form.get("name") ?? ""), social: String(form.get("social") ?? ""),
    birth: form.get("birth") || null, club: String(form.get("club") ?? ""),
    sport_category: String(form.get("category") ?? ""), registration_status: String(form.get("status")),
  });
  redirect(`/atletas/${target}?aba=cadastro${error || !data ? "&erro=1" : "&salvo=1"}`);
}
