import "server-only";
import { notFound } from "next/navigation";
import { requireProfile } from "../../lib/profile";
import { supabaseServer } from "../../lib/supabase";

type AthleteSummary = {
  photo_version: string | null;
  birth_date: string | null;
  sports?: SportLink[];
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

export type SportLink = {
  id: string;
  category: string;
  modality: string;
  division: string;
  club: string | null;
  club_id?: string | null;
  national_team?: string | null;
  position?: string | null;
  shirt_number?: string | null;
  season: number;
  starts_on: string;
  ends_on: string | null;
};

export type CatalogOption = { id: string; name: string };

export type RegistrationCatalog = {
  categories: CatalogOption[];
  clubs: CatalogOption[];
  national_teams: CatalogOption[];
  divisions: string[];
  modalities: string[];
};

export type AthleteRegistration = {
  gender_identity: string | null;
  document_id: string | null;
  phone: string | null;
  email: string | null;
  guardian_name: string | null;
  guardian_relation: string | null;
  guardian_contact: string | null;
  emergency_contact: string | null;
};

type ClinicalRecord = {
  encounter_status: "open" | "closed" | null;
  version?: number;
  content_restricted?: boolean;
  can_edit?: boolean;
  version_count?: number;
  has_signature?: boolean;
  signed_version?: number | null;
  linked_corrections?: {version:number;title:string;body:string;reason:string;actor_name:string;created_at:string}[];
  is_restricted: boolean;
  is_author: boolean;
  encounter_id: string | null;
  id: string;
  author_name: string;
  specialty?: string;
  title: string;
  body?: string;
  occurred_at: string;
  status?: "draft" | "finalized";
};

export const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export const eventDate = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
});

export async function loadCatalog() {
  await requireProfile();
  const client = await supabaseServer();
  const { data, error } = await client.rpc("catalog_list");
  if (error || !data || data.error) return null;
  return data as RegistrationCatalog;
}

export async function loadRegistration(id: string) {
  await requireProfile();
  if (!uuidPattern.test(id)) return null;
  const client = await supabaseServer();
  const { data, error } = await client.rpc("athlete_registration", { target: id });
  if (error) return null;
  return data as AthleteRegistration | null;
}

export async function listAthletes(search = "") {
  await requireProfile();
  const client = await supabaseServer();
  const { data, error } = await client.rpc("athlete_catalog", { search });
  if (error) throw new Error("Falha ao consultar atletas.");
  return data as { can_create: boolean; athletes: AthleteSummary[] };
}

export type AthleteWorkspace = { psychology_required?: boolean; athlete: Athlete; can_read_records: boolean; can_edit: boolean; can_write: boolean; can_finalize: boolean; sports: SportLink[]; counts: { evolutions: number; encounters: number } | null; records: ClinicalRecord[] | null; recent_records: Pick<ClinicalRecord, "id" | "title" | "specialty" | "author_name" | "status" | "occurred_at">[] | null };

export async function loadAthlete(id: string, view: "profile" | "timeline" | "chat") {
  await requireProfile();
  if (!uuidPattern.test(id)) return null;
  const client = await supabaseServer();
  const { data, error } = await client.rpc("athlete_workspace", { target: id, view_name: view });
  if (error) throw new Error("Falha ao consultar o atleta.");
  return data as AthleteWorkspace | null;
}

export async function getAthlete(id: string, view: "profile" | "timeline" | "chat") {
  const data = await loadAthlete(id, view);
  if (!data) notFound();
  return data;
}

export type AccessLink = {
  professional_id: string;
  display_name: string;
  profession: string;
  can_read_records: boolean;
  can_edit: boolean;
  can_write: boolean;
  can_finalize: boolean;
  granted_by_name: string | null;
  granted_at: string | null;
};

export async function accessRoster(athleteId: string) {
  await requireProfile();
  if (!uuidPattern.test(athleteId)) return null;
  const client = await supabaseServer();
  const { data, error } = await client.rpc("athlete_access_manage", { target: athleteId });
  if (error) throw new Error("Falha ao consultar os vínculos.");
  return data as { athlete: { id: string; full_name: string; social_name: string | null }; links: AccessLink[] } | null;
}

export async function searchProfessionals(term: string) {
  await requireProfile();
  const client = await supabaseServer();
  const { data, error } = await client.rpc("professional_search", { term });
  if (error) throw new Error("Falha ao consultar profissionais.");
  return (data ?? []) as { id: string; display_name: string; profession: string }[];
}


export async function directory(filters: Record<string, string>) {
  await requireProfile();
  const client = await supabaseServer();
  const { data, error } = await client.rpc("athlete_directory", { filters });
  if (error) throw new Error("Não foi possível consultar o diretório.");
  return data as { athletes: AthleteSummary[]; can_create: boolean; total: number; page: number; options: SportLink[] };
}
