export type ExecutionMode = "demo" | "production";
export type Provenance = "simulated" | "verified";
export type DeliveryState =
  | "waiting_signature"
  | "blocked"
  | "queued"
  | "processing"
  | "accepted_by_provider"
  | "delivered"
  | "failed"
  | "cancelled"
  | "uncertain";
export type DeliveryScenario =
  | "success"
  | "temporary_failure"
  | "permanent_failure"
  | "timeout"
  | "delayed"
  | "duplicate";
export type DeliveryJob = {
  requestId: string;
  attemptId: string;
  attemptNumber: number;
  observations: number;
  leaseToken: string;
  executionMode: ExecutionMode;
  provenance: Provenance;
  adapter: string;
  scenario: DeliveryScenario;
  state: DeliveryState;
  cancelRequested: boolean;
  correlation: string;
  dispatchKind: "submit" | "reconcile";
  artifact: {
    snapshotId: string;
    hash: string;
    executionMode: ExecutionMode;
    provenance: Provenance;
  };
};
export type DeliveryObservation = {
  eventId: string;
  state:
    | "processing"
    | "accepted_by_provider"
    | "delivered"
    | "failed"
    | "cancelled"
    | "uncertain";
  failureKind?: "retryable" | "permanent" | "timeout";
  executionMode: ExecutionMode;
  provenance: Provenance;
  pollAfterSeconds: number;
};
export interface DeliveryAdapter {
  key: string;
  capabilities: {
    reconciliation: boolean;
    cancellation: boolean;
    reliableDeliveryConfirmation: boolean;
  };
  submit(job: DeliveryJob): Promise<DeliveryObservation>;
  reconcile?: (job: DeliveryJob) => Promise<DeliveryObservation>;
  cancel?: (job: DeliveryJob) => Promise<DeliveryObservation>;
}
