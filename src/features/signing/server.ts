import "server-only";
import { supabaseServer } from "../../lib/supabase";
import { demoEnvironmentAllowed } from "./environment";
import type { SigningConnector } from "./contracts";
// NODE_ENV=production also applies to local Next builds. The deployment boundary is explicit,
// default-off, and independent from client parameters and the separate database gate.
export function signingDemoEnabled() {
  return demoEnvironmentAllowed(process.env);
}
export async function signingCommand(
  action: string,
  payload: Record<string, unknown> = {},
) {
  if (!signingDemoEnabled()) return { error: "unavailable" };
  const client = await supabaseServer();
  const { data, error } = await client.rpc("signing_demo_command", {
    action,
    payload,
  });
  if (error)
    throw new Error(
      "Não foi possível processar a demonstração. Tente consultar novamente.",
    );
  return data;
}
export function demoConnector(): SigningConnector {
  return {
    describeCapabilities: () => ({
      identities: true,
      authorization: true,
      polling: true,
      cancel: true,
      callbacks: false,
      cryptographicValidation: false,
    }),
    checkAvailability: async () => signingDemoEnabled(),
    beginConnection: () => signingCommand("connect"),
    listCertificates: () => signingCommand("list"),
    beginAuthorization: (intent) => signingCommand("confirm", intent),
    requestSignature: (intent) => signingCommand("confirm", intent),
    getStatus: (attemptId) =>
      signingCommand("status", { attempt_id: attemptId }),
    obtainResult: (attemptId) =>
      signingCommand("status", { attempt_id: attemptId }),
    cancel: (attemptId) => signingCommand("cancel", { attempt_id: attemptId }),
    disconnect: () => signingCommand("disconnect"),
  };
}
export async function dispatchSigning(
  action: string,
  payload: Record<string, unknown>,
) {
  const adapter = demoConnector();
  if (!(await adapter.checkAvailability())) return { error: "unavailable" };
  switch (action) {
    case "connect":
      return adapter.beginConnection!();
    case "disconnect":
      return adapter.disconnect!();
    case "list":
      return adapter.listCertificates!();
    case "confirm":
      return adapter.requestSignature(payload);
    case "status":
      return adapter.getStatus!(String(payload.attempt_id));
    case "cancel":
      return adapter.cancel!(String(payload.attempt_id));
    default:
      return signingCommand(action, payload);
  }
}
