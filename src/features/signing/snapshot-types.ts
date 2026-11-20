import type { ClinicalDocument } from "../documents/data";
export type PreparedSnapshot = {
  id: string;
  document_id: string;
  version: number;
  content_hash: string;
  created_at: string;
  expires_at: string;
  material: ClinicalDocument & { athlete_name: string };
};
