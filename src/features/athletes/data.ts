import "server-only";
import { notFound } from "next/navigation";
import { requireProfile } from "../../lib/profile";
import { supabaseServer } from "../../lib/supabase";

type AthleteSummary = {
  id: string;
  full_name: string;
  social_name: string | null;
  team: string | null;
  category: string | null;
  status: "active" | "inactive";
};

type Athlete = AthleteSummary & {
  birth_date: string | null;
  source: "manual" | "demo";
  external_cbb_id: string | null;
};

type ClinicalRecord = {
  id: string;
  author_name: string;
  specialty: string;
  title: string;
  body: string;
  occurred_at: string;
  status: "draft" | "finalized";
};

export const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export const eventDate = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
});

export async function listAthletes(search = "") {
  await requireProfile();
  const client = await supabaseServer();
  const { data, error } = await client.rpc("athlete_catalog", { search });
  if (error) throw new Error("Falha ao consultar atletas.");
  return data as { can_create: boolean; athletes: AthleteSummary[] };
}

export async function getAthlete(id: string, view: "profile" | "timeline" | "chat") {
  await requireProfile();
  if (!uuidPattern.test(id)) notFound();
  const client = await supabaseServer();
  const { data, error } = await client.rpc("athlete_workspace", { target: id, view_name: view });
  if (error) throw new Error("Falha ao consultar o atleta.");
  if (!data) notFound();
  return data as { athlete: Athlete; can_read_records: boolean; records: ClinicalRecord[] | null };
}
