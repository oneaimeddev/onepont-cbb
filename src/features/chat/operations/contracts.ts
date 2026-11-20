import type { DocumentReviewRecord } from "../../documents/review-types";

export type DocumentWorkspace = {
  id: string;
  sessionId: string;
  athleteId: string;
  documentId: string;
  reviewId: string;
  revision: number;
  identityId: string | null;
  deliveryRequested: boolean;
  phase: "reviewed" | "authorization_pending" | "authorized";
};
export type OperationChallenge = {
  id: string;
  workspaceId: string;
  revision: number;
  nonce: string;
  phase: "pending" | "confirmed" | "cancelled" | "invalidated";
  summaryHash: string;
  expiresAt: string;
  presentedAt: string | null;
  executionEnabled: false;
  summary: {
    operation: "sign_review";
    executionMode: "demo";
    provenance: "simulated";
    sessionId: string;
    athleteId: string;
    documentId: string;
    documentType: DocumentReviewRecord["material"]["document_type"];
    version: number;
    reviewId: string;
    contentHash: string;
    materialHash: string;
    identity: { id: string; label: string; provider: string };
    delivery: {
      requested: boolean;
      recipient: null | {
        name: string;
        relation: string;
        category: "athlete" | "guardian";
        phone_masked: string;
      };
    };
    effects: ("finalize_demo_document" | "simulate_delivery" | "no_delivery")[];
  };
};
export type DocumentWorkspaceState = {
  workspace: DocumentWorkspace;
  review: DocumentReviewRecord;
  challenge: OperationChallenge | null;
  authorization: OperationAuthorization | null;
  executionEnabled: false;
};
/** Immutable proof of an authorization, not a signature result or permission to skip fresh domain checks. */
export type OperationAuthorization = {
  authorizationId: string;
  effect: "authorization_recorded";
  executionEnabled: false;
};
