/** Provider-neutral contracts. Secrets belong only to a future backend vault. */
export type SigningCapabilities = {
  identities: boolean;
  authorization: boolean;
  polling: boolean;
  cancel: boolean;
  callbacks: boolean;
  cryptographicValidation: boolean;
};
export type SigningIdentity = {
  id: string;
  label: string;
  provider: string;
  simulated: boolean;
  certificate_verified: boolean;
};
export type SigningInventory = {
  connected: boolean;
  preferred: string | null;
  identities: SigningIdentity[];
  simulated: boolean;
};
export type SigningState =
  | "authorizing"
  | "processing"
  | "simulated_success"
  | "denied"
  | "expired"
  | "failed"
  | "cancelled"
  | "stale";
export type SigningAttempt = {
  id: string;
  state: SigningState;
  identity_id: string;
  simulated: true;
  cryptographically_signed: false;
  certificate_verified: false;
  confirmed_at: string;
};
export type SigningConnector = {
  describeCapabilities(): SigningCapabilities;
  checkAvailability(): Promise<boolean>;
  beginConnection?: () => Promise<SigningInventory>;
  listCertificates?: () => Promise<SigningInventory>;
  beginAuthorization?: (intent: Record<string, unknown>) => Promise<unknown>;
  requestSignature: (intent: Record<string, unknown>) => Promise<unknown>;
  getStatus?: (attemptId: string) => Promise<unknown>;
  receiveCallback?: (raw: Uint8Array, headers: Headers) => Promise<unknown>;
  obtainResult?: (attemptId: string) => Promise<unknown>;
  validateArtifact?: (
    bytes: Uint8Array,
  ) => Promise<{ cryptographicallyValid: boolean }>;
  cancel?: (attemptId: string) => Promise<unknown>;
  disconnect?: () => Promise<unknown>;
};
/** Future delivery is separate; simulated outcomes cannot satisfy this type. Z-API is not called here. */
export type VerifiedDeliveryArtifact = {
  provenance: "production";
  cryptographicallyValidated: true;
  artifactId: string;
  validationEvidenceId: string;
};
export type DeliveryState="requested"|"waiting"|"sent"|"failed"|"delivered";
export type VerifiedDeliveryRequest={documentId:string;documentVersion:number;artifact:VerifiedDeliveryArtifact;senderProfessionalId:string;recipientAuthorizationId:string;channel:"whatsapp";explicitConsentId:string;idempotencyKey:string};
export type DeliveryOutcome={requestId:string;state:DeliveryState;auditReference:string;retryable:boolean};
/** A future server must revalidate artifact, recipient and consent; client flags are never authority. */
export interface DocumentDeliveryExtension {deliverExplicitly(request:VerifiedDeliveryRequest):Promise<DeliveryOutcome>;getStatus?(requestId:string):Promise<DeliveryOutcome>;retry?(requestId:string,idempotencyKey:string):Promise<DeliveryOutcome>;}
export const demoNotice = "DEMONSTRAÇÃO — DOCUMENTO NÃO ASSINADO DIGITALMENTE";
export const signingStateLabels: Record<SigningState, string> = {
  authorizing: "Autorização simulada registrada",
  processing: "Simulação em andamento",
  simulated_success: "Simulação concluída",
  denied: "Autorização simulada negada",
  expired: "Autorização simulada expirada",
  failed: "Falha técnica simulada",
  cancelled: "Tentativa cancelada",
  stale: "Conteúdo alterado: prepare novamente",
};
