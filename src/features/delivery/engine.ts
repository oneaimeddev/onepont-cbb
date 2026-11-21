import type { SupabaseClient } from "@supabase/supabase-js";
import { prescriptionPdf } from "./prescription-pdf.ts";
import type {
  DeliveryAdapter,
  DeliveryJob,
  DeliveryObservation,
} from "./contracts";
export function deliveryEnvironmentAllowed(
  env: Record<string, string | undefined>,
) {
  return (
    env.CBB_SIGNING_MODE === "demo" &&
    ["local", "test", "controlled-demo"].includes(
      env.CBB_DEPLOYMENT_ENV ?? "",
    ) &&
    !["production", "preview"].includes(env.VERCEL_ENV ?? "")
  );
}
export function simulatedDeliveryAdapter(): DeliveryAdapter {
  const observe = async (job: DeliveryJob): Promise<DeliveryObservation> => {
    if (
      job.executionMode !== "demo" ||
      job.provenance !== "simulated" ||
      job.artifact.executionMode !== "demo" ||
      job.artifact.provenance !== "simulated"
    )
      throw new Error("Incompatible provenance");
    let state: DeliveryObservation["state"] = "processing";
    let failureKind: DeliveryObservation["failureKind"];
    if (job.cancelRequested) state = "cancelled";
    else if (job.scenario === "permanent_failure") {
      state = "failed";
      failureKind = "permanent";
    } else if (
      job.scenario === "temporary_failure" &&
      job.attemptNumber === 1
    ) {
      state = "failed";
      failureKind = "retryable";
    } else if (job.scenario === "timeout" && job.observations === 0) {
      state = "uncertain";
      failureKind = "timeout";
    } else if (job.scenario === "delayed") {
      state =
        job.observations < 2
          ? "processing"
          : job.observations === 2
            ? "accepted_by_provider"
            : "delivered";
    } else
      state =
        job.observations === 0
          ? "processing"
          : job.observations === 1
            ? "accepted_by_provider"
            : "delivered";
    return {
      eventId: `${job.attemptId}:${job.observations}:${state}`,
      state,
      failureKind,
      executionMode: "demo",
      provenance: "simulated",
      pollAfterSeconds: job.scenario === "delayed" ? 2 : 0.4,
    };
  };
  return {
    key: "simulated",
    capabilities: {
      reconciliation: true,
      cancellation: true,
      reliableDeliveryConfirmation: true,
    },
    submit: observe,
    reconcile: observe,
    cancel: observe,
  };
}
// Backend-only entry by dependency injection. No supplier I/O, token, phone or clinical payload in this driver.
export async function reconcileDeliveries(
  client: SupabaseClient,
  env: Record<string, string | undefined>,
  options: { documentId?: string; limit?: number } = {},
) {
  if (!deliveryEnvironmentAllowed(env))
    return { processed: 0, available: false };
  const adapter = simulatedDeliveryAdapter();
  let processed = 0;
  for (let i = 0; i < Math.min(options.limit ?? 1, 20); i++) {
    const claimed = await client.rpc("claim_document_delivery_job", {
      target: options.documentId ?? null,
    });
    if (claimed.error) throw new Error("Delivery reconciliation unavailable");
    const job = claimed.data?.job as DeliveryJob | null;
    if (!job) break;
    if (job.adapter !== adapter.key) throw new Error("Incompatible adapter");
    const attachmentArgs = { request_id: job.requestId, lease_token: job.leaseToken };
    const attachment = await client.rpc("demo_delivery_attachment", attachmentArgs);
    if (attachment.error || attachment.data?.error)
      throw new Error("Demo attachment unavailable; lease will be retried");
    if (attachment.data?.required && !attachment.data.stored) {
      const pdf = await prescriptionPdf(attachment.data.material, job.artifact.snapshotId);
      const stored = await client.rpc("demo_delivery_attachment", { ...attachmentArgs, pdf_base64: pdf });
      if (stored.error || stored.data?.error || !stored.data?.stored)
        throw new Error("Demo attachment could not be persisted; lease will be retried");
    }
    // A reclaimed lease always reconciles the same operation; it never blindly resubmits an uncertain message.
    const method = job.cancelRequested
      ? adapter.cancel
      : job.dispatchKind === "reconcile"
        ? adapter.reconcile
        : adapter.submit;
    if (!method) break;
    const observation = await method(job);
    const args = {
      request_id: job.requestId,
      attempt_id: job.attemptId,
      lease_token: job.leaseToken,
      observation,
    };
    const result = await client.rpc("complete_document_delivery_job", args);
    if (result.error)
      throw new Error("Delivery observation could not be persisted");
    if (result.data?.error) break;
    if (job.scenario === "duplicate")
      await client.rpc("complete_document_delivery_job", args);
    processed++;
  }
  return { processed, available: true };
}
