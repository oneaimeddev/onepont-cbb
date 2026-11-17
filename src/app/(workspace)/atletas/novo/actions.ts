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

export type RegisterResult = { ok: boolean; error?: string; field?: string; id?: string; name?: string };

function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

export async function createCategory(label: string): Promise<RegisterResult> {
  await requireProfile();
  const client = await supabaseServer();
  const { data, error } = await client.rpc("catalog_create_category", { label });
  if (error || !data) return { ok: false, error: "invalid" };
  return data as RegisterResult;
}

export async function createOrganization(label: string, orgKind: "club" | "national_team"): Promise<RegisterResult> {
  await requireProfile();
  const client = await supabaseServer();
  const { data, error } = await client.rpc("catalog_create_organization", { label, org_kind: orgKind });
  if (error || !data) return { ok: false, error: "invalid" };
  return data as RegisterResult;
}

export async function registerAthlete(form: FormData): Promise<RegisterResult> {
  await requireProfile();
  const creationId = text(form, "creation_id");
  if (!uuidPattern.test(creationId)) return { ok: false, error: "invalid", field: "name" };
  const payload = {
    name: text(form, "name"),
    social: text(form, "social"),
    birth: text(form, "birth"),
    gender_identity: text(form, "gender_identity"),
    document: text(form, "document"),
    phone: text(form, "phone"),
    email: text(form, "email"),
    guardian_name: text(form, "guardian_name"),
    guardian_relation: text(form, "guardian_relation"),
    guardian_contact: text(form, "guardian_contact"),
    emergency_contact: text(form, "emergency_contact"),
    category_id: text(form, "category_id"),
    division: text(form, "division"),
    modality: text(form, "modality"),
    position: text(form, "position"),
    club_id: text(form, "club_id"),
    shirt: text(form, "shirt"),
  };
  const client = await supabaseServer();
  const { data, error } = await client.rpc("athlete_register", { creation_id: creationId, payload });
  if (error || !data) return { ok: false, error: "invalid", field: "name" };
  return data as RegisterResult;
}

export async function addSportLink(form: FormData) {
  await requireProfile();
  const target = text(form, "athlete_id");
  if (!uuidPattern.test(target)) redirect("/atletas");
  const client = await supabaseServer();
  const { data, error } = await client.rpc("sport_link_open", {
    target,
    payload: {
      category_id: text(form, "category_id"),
      division: text(form, "division"),
      modality: text(form, "modality"),
      position: text(form, "position"),
      club_id: text(form, "club_id"),
      shirt: text(form, "shirt"),
    },
  });
  const failed = error || !data?.ok;
  redirect(`/atletas/${target}?aba=cadastro${failed ? "&erro=1" : "&salvo=1"}`);
}
