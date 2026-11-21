import type { PreviewDocument } from "./preview";
import type {
  DeliveryState,
  ExecutionMode,
  Provenance,
} from "../delivery/contracts";
export type WorkflowSummary = {
  lifecycle: "draft" | "ready_for_review" | "finalized";
  locked: boolean;
  finalization: null | {
    id: string;
    at: string;
    version: number;
    executionMode: ExecutionMode;
    provenance: Provenance;
    snapshotId: string;
    hash: string;
  };
  signature: null | {
    id: string;
    attemptId: string;
    state: string;
    identityId: string;
    identityLabel: string;
    adapter: string;
    executionMode: ExecutionMode;
    provenance: Provenance;
    cryptographicallyVerified: boolean;
    at: string;
  };
  deliveries: {
    id: string;
    state: DeliveryState;
    failureKind: string | null;
    executionMode: ExecutionMode;
    provenance: Provenance;
    attempts: number;
    hasDemoAttachment?: boolean;
    createdAt: string;
    updatedAt: string;
    recipient: null | {
      name: string;
      relation: string;
      category: string;
      phone_masked: string;
    };
  }[];
  derivedFrom: null | { documentId: string; version: number };
};
export type WorkflowDetail = {
  workflow: WorkflowSummary;
  material: (PreviewDocument & { athlete_name: string }) | null;
  history: {
    kind: string;
    state: string;
    at: string;
    provenance: Provenance;
    requestId?: string;
    attemptNumber?: number;
  }[];
};
export function deliveryLabel(state: DeliveryState, provenance: Provenance) {
  const simulated = provenance === "simulated";
  return {
    waiting_signature: "Aguardando assinatura",
    blocked: "Entrega bloqueada",
    queued: simulated ? "Entrega simulada na fila" : "Aguardando envio",
    processing: simulated
      ? "Processando entrega simulada"
      : "Processando envio",
    accepted_by_provider: simulated
      ? "Envio simulado aceito pelo adaptador"
      : "Aceito pelo provedor",
    delivered: simulated ? "Entrega simulada concluída" : "Entregue",
    failed: simulated ? "Falha na entrega simulada" : "Falha no envio",
    cancelled: simulated ? "Entrega simulada cancelada" : "Entrega cancelada",
    uncertain: "Resultado incerto — conciliando, sem reenviar",
  }[state];
}

export function signatureLabel(
  signature: NonNullable<WorkflowSummary["signature"]>,
) {
  const simulated = signature.provenance === "simulated";
  const prefix = simulated ? "Assinatura simulada" : "Assinatura";
  if (signature.state === "succeeded")
    return simulated
      ? prefix
      : signature.cryptographicallyVerified
        ? "Assinatura validada"
        : "Validação pendente";
  return `${prefix} ${({ authorizing: "aguardando autorização", processing: "em andamento", denied: "negada", expired: "expirada", failed: "com falha", cancelled: "cancelada", stale: "desatualizada" } as Record<string, string>)[signature.state] ?? "pendente"}`;
}

/** Terminal attempts require a fresh review and human authorization, never replay. */
export function signatureNeedsNewReview(
  signature: WorkflowSummary["signature"] | undefined,
) {
  return (
    !!signature &&
    ["denied", "expired", "failed", "cancelled", "stale"].includes(
      signature.state,
    )
  );
}
