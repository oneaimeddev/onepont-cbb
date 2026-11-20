import "server-only";
import type {WorkflowSummary} from "./workflow-types";
import { requireProfile } from "../../lib/profile";
import { supabaseServer } from "../../lib/supabase";
import { uuidPattern } from "../athletes/data";
import type { DocumentContent, DocumentKind, DocumentStatus } from "./content";

export type MedicalCapability = { enabled: boolean; credential_label: string | null };

export type DocumentSummary = {
  workflow?: WorkflowSummary;
  author_name?: string;
  id: string;
  document_type: DocumentKind;
  status: DocumentStatus;
  version: number;
  created_at: string;
  updated_at: string;
};

export type ClinicalDocument = DocumentSummary & {
  athlete_id: string;
  content: DocumentContent;
  author_name: string;
  credential_label: string | null;
  pending: string[];
};

export async function medicalCapability(): Promise<MedicalCapability> {
  await requireProfile();
  const client = await supabaseServer();
  const { data, error } = await client.rpc("medical_profile");
  if (error) throw new Error("Falha ao consultar a habilitação médica.");
  return data as MedicalCapability;
}

export async function listDocuments(athleteId: string) {
  await requireProfile();
  if (!uuidPattern.test(athleteId)) return null;
  const client = await supabaseServer();
  const { data, error } = await client.rpc("document_list", { target: athleteId });
  if (error) throw new Error("Falha ao consultar documentos.");
  if (data?.error) return null;
  return data.documents as DocumentSummary[];
}

export async function openDocument(athleteId: string, documentId: string) {
  await requireProfile();
  if (!uuidPattern.test(athleteId) || !uuidPattern.test(documentId)) return null;
  const client = await supabaseServer();
  const { data, error } = await client.rpc("document_open", { target: athleteId, document_id: documentId });
  if (error) throw new Error("Falha ao abrir o documento.");
  if (!data || data.error) return null;
  return data as ClinicalDocument;
}
