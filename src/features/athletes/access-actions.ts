"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "../../lib/profile";
import { supabaseServer } from "../../lib/supabase";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function changeAccess(form: FormData, operation: "grant" | "revoke") {
  await requireProfile();
  const athlete = String(form.get("athlete") ?? "");
  const professional = String(form.get("professional") ?? "");
  if (!uuidPattern.test(athlete) || !uuidPattern.test(professional)) redirect("/atletas");
  const client = await supabaseServer();
  const { data, error } = await client.rpc(operation === "grant" ? "athlete_access_grant" : "athlete_access_revoke", { target: athlete, professional });
  if (error || !data || data.error) redirect(`/atletas/${athlete}?aba=acesso&erro=1`);
  if (data.status === "exists") redirect(`/atletas/${athlete}?aba=acesso&aviso=existe`);
  redirect(`/atletas/${athlete}?aba=acesso&salvo=${operation === "grant" ? "concedido" : "revogado"}`);
}

export async function openAthleteAccess(form: FormData) {
  const profile = await requireProfile();
  const athlete = String(form.get("athlete") ?? "").trim();
  if (!profile.can_manage_access || !uuidPattern.test(athlete)) redirect("/atletas");
  redirect(`/atletas/${athlete}?aba=acesso`);
}

export async function grantAccess(form: FormData) {
  await changeAccess(form, "grant");
}

export async function revokeAccess(form: FormData) {
  await changeAccess(form, "revoke");
}
