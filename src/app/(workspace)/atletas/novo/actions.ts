"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "../../../../lib/profile";
import { supabaseServer } from "../../../../lib/supabase";
import { uuidPattern } from "../../../../features/athletes/data";

export async function createAthlete(form: FormData) {
  await requireProfile();
  const creationId = form.get("creation_id");
  const name = String(form.get("name") ?? "").trim();
  const social = String(form.get("social") ?? "").trim();
  const birth = String(form.get("birth") ?? "");
  const club = String(form.get("club") ?? "").trim();
  const category = String(form.get("category") ?? "").trim();
  if (typeof creationId !== "string" || !uuidPattern.test(creationId) ||
      !name || name.length > 160 || social.length > 160 || club.length > 120 ||
      category.length > 120 || (birth !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(birth))) {
    redirect("/atletas/novo?erro=1");
  }
  const client = await supabaseServer();
  const { data, error } = await client.rpc("athlete_create", {
    creation_id: creationId, name, social, birth: birth || null, club, sport_category: category,
  });
  if (error) redirect("/atletas/novo?erro=1");
  if (!data) redirect("/atletas/novo?erro=acesso");
  redirect(`/atletas/${data}`);
}
