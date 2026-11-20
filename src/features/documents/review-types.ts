import type { DocumentContent, DocumentKind, DocumentStatus } from "./content";
export type ReviewMaterial = {
  id: string;
  athlete_id: string;
  athlete_name: string;
  version: number;
  document_type: DocumentKind;
  status: DocumentStatus;
  author_name: string;
  credential_label: string | null;
  created_at: string;
  updated_at: string;
  content: DocumentContent;
};
export type DemoRecipient = {
  name: string | null;
  relation: string;
  category: "athlete" | "guardian" | "unavailable";
  minor: boolean | null;
  phone_masked: string | null;
  available: boolean;
  authorized: false;
  reason: string;
};
export type DocumentReviewRecord = {
  id: string;
  document_id: string;
  athlete_id: string;
  expected_version: number;
  saved_version: number | null;
  content_hash: string;
  material: ReviewMaterial;
  recipient: DemoRecipient;
  template_version: string;
  expires_at: string;
};
export type DemoDelivery = {
  requested: boolean;
  state: "not_requested" | "demo_intent_no_send";
  eligible_for_real: false;
};
