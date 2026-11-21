import { z } from "zod";
import { displayedProposalSchema } from "./document-intent";

const id = z.string().uuid();
const revision = z.number().int().min(0).max(2147483647);
const kind = z.enum(["prescription", "surgical_order", "exam_request"]);
const workspace = z.object({ workspaceId: id, revision }).strict();
const session = z.object({ sessionId: id }).strict();
const proposal = displayedProposalSchema.omit({ dirty: true });
const humanCommand = proposal.extend({
  messageId: id,
  message: z.string().min(1).max(800),
  inputMode: z.literal("text"),
});
const boundedText = z.string().min(1).max(4000);
const clinicalField = z.enum([
  "name",
  "presentation",
  "dose",
  "dose_unit",
  "route",
  "schedule",
  "duration",
  "quantity",
  "instructions",
  "notes",
  "exam_type",
  "region",
  "laterality",
  "technical_details",
  "procedure",
  "indication",
  "diagnosis",
  "justification",
  "priority",
  "materials",
  "additional",
  "occurred_at",
]);
const patch = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("set_field"),
      itemId: id.optional(),
      field: clinicalField,
      value: z.string().max(20000),
    })
    .strict(),
  z.object({ operation: z.literal("remove_item"), itemId: id }).strict(),
  z
    .object({
      operation: z.literal("reorder_items"),
      itemIds: z
        .array(id)
        .min(1)
        .max(50)
        .refine((ids) => new Set(ids).size === ids.length),
    })
    .strict(),
]);

export const operationGatewayInput = z.discriminatedUnion("action", [
  session.extend({ action: z.literal("state") }),
  session.extend({
    action: z.literal("bind"),
    reviewId: id,
    revision,
    key: id,
  }),
  workspace.extend({
    action: z.literal("identity"),
    identityId: id.nullable(),
  }),
  workspace.extend({ action: z.literal("delivery"), requested: z.boolean() }),
  workspace.extend({ action: z.literal("prepare"), key: id }),
  session.extend({
    action: z.literal("present"),
    challengeId: id,
    nonce: id,
    summaryHash: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  session.extend({
    action: z.literal("confirm"),
    challengeId: id,
    nonce: id,
    messageId: id,
    message: z.string().min(1).max(400),
    inputMode: z.enum(["text", "voice"]).default("text"),
  }),
  session.extend({ action: z.literal("cancel"), challengeId: id }),
  session.extend({ action: z.literal("execute"), authorizationId: id }),
  z
    .object({
      action: z.literal("inspect"),
      requestId: id,
      athleteId: id,
      kind,
      version: revision,
      contentHash: z.string().regex(/^[a-f0-9]{32}$/),
    })
    .strict(),
]);
export type OperationGatewayInput = z.infer<typeof operationGatewayInput>;

type CapabilityDefinition = {
  description: string;
  schema: z.ZodType;
  permission: "athlete_scope" | "clinical_read" | "medical_author";
  confirmation: "none" | "proposal" | "challenge";
  service: string;
  audit: string;
  implementation: "existing" | "infrastructure" | "reserved";
  exposedToModel: false;
  result:
    | "athletes"
    | "context"
    | "proposal"
    | "workspace"
    | "authorization"
    | "workflow";
};
function capability(
  description: string,
  schema: z.ZodType,
  service: string,
  result: CapabilityDefinition["result"],
  confirmation: CapabilityDefinition["confirmation"] = "none",
  implementation: CapabilityDefinition["implementation"] = "existing",
  permission: CapabilityDefinition["permission"] = "medical_author",
): CapabilityDefinition {
  return {
    description,
    schema,
    service,
    result,
    confirmation,
    implementation,
    permission,
    audit: "ai_chat:references_only",
    exposedToModel: false,
  };
}

/** Catalog registration is not tool activation. New model tools remain disabled until their complete cuts are validated. */
export const clinicalCapabilities = {
  "athlete.identify": capability(
    "Resolver atleta autorizado e pedir desambiguação",
    z.object({ query: z.string().min(1).max(160) }).strict(),
    "athlete_search",
    "athletes",
    "none",
    "existing",
    "athlete_scope",
  ),
  "context.read": capability(
    "Consultar contexto clínico autorizado",
    z.object({ athleteId: id }).strict(),
    "athlete_profile",
    "context",
    "none",
    "existing",
    "clinical_read",
  ),
  "document.proposal.create": capability(
    "Preparar proposta sem inventar dados ausentes",
    z.object({ athleteId: id, kind, clinicianText: boundedText }).strict(),
    "chat_document_proposal_create",
    "proposal",
    "none",
    "existing",
  ),
  "document.proposal.read": capability(
    "Consultar proposta ativa autorizada",
    proposal,
    "chat_document_proposal_read",
    "proposal",
    "none",
    "existing",
  ),
  "document.proposal.patch": capability(
    "Alterar apenas campos/itens explicitamente identificados",
    proposal.extend({ changes: z.array(patch).min(1).max(40), messageId: id }),
    "chat_document_proposal_patch",
    "proposal",
  ),
  "document.proposal.item.add": capability(
    "Adicionar item com campos clínicos explícitos",
    proposal.extend({
      messageId: id,
      itemId: id,
      fields: z
        .array(
          z
            .object({ field: clinicalField, value: z.string().max(20000) })
            .strict(),
        )
        .min(1)
        .max(15),
    }),
    "chat_document_proposal_patch",
    "proposal",
  ),
  "document.proposal.item.remove": capability(
    "Remover item por identificador estável",
    proposal.extend({ itemId: id, messageId: id }),
    "chat_document_proposal_patch",
    "proposal",
  ),
  "document.proposal.items.reorder": capability(
    "Reordenar identificadores sem perder campos",
    proposal.extend({
      messageId: id,
      itemIds: z
        .array(id)
        .min(1)
        .max(50)
        .refine((ids) => new Set(ids).size === ids.length),
    }),
    "chat_document_proposal_patch",
    "proposal",
  ),
  "document.review": capability(
    "Vincular revisão exata ao contexto persistente",
    operationGatewayInput.options[1],
    "chat_document_bind",
    "workspace",
    "none",
    "infrastructure",
  ),
  "document.save": capability(
    "Salvar revisão sem assinar",
    proposal.extend({
      messageId: id,
      message: z.string().min(1).max(240),
      inputMode: z.enum(["text", "voice"]),
    }),
    "chat_document_save_message",
    "workflow",
    "proposal",
  ),
  "signing.identity.select": capability(
    "Selecionar identidade própria, sem seleção silenciosa",
    operationGatewayInput.options[2],
    "chat_document_select_identity",
    "workspace",
    "none",
    "infrastructure",
  ),
  "delivery.recipient.select": capability(
    "Escolher entrega somente pela política de destinatário",
    operationGatewayInput.options[3],
    "chat_document_select_delivery",
    "workspace",
    "none",
    "infrastructure",
  ),
  "operation.prepare": capability(
    "Preparar desafio vinculado à versão e efeitos",
    operationGatewayInput.options[4],
    "chat_operation_prepare",
    "authorization",
    "none",
    "infrastructure",
  ),
  "operation.confirm": capability(
    "Validar entrada humana original vinculada ao desafio; executor clínico separado",
    operationGatewayInput.options[6],
    "chat_operation_confirm_execute",
    "authorization",
    "challenge",
    "infrastructure",
  ),
  "signing.status": capability(
    "Consultar resultado efetivo da assinatura",
    proposal,
    "document_workflow_get",
    "workflow",
  ),
  "document.finalization.read": capability(
    "Consultar finalização e imutabilidade",
    proposal,
    "document_workflow_get",
    "workflow",
  ),
  "delivery.status": capability(
    "Consultar entrega sem alegar envio real",
    proposal,
    "document_workflow_get",
    "workflow",
  ),
  "delivery.retry": capability(
    "Retentar falha recuperável com justificativa",
    humanCommand,
    "document_workflow_action:retry",
    "workflow",
    "challenge",
  ),
  "delivery.resend": capability(
    "Solicitar reenvio sem outra assinatura",
    humanCommand,
    "document_workflow_action:resend",
    "workflow",
    "challenge",
  ),
  "document.derive": capability(
    "Criar outro documento preservando a origem",
    humanCommand,
    "document_workflow_action:derive",
    "workspace",
    "challenge",
  ),
  "document.history": capability(
    "Consultar histórico autorizado",
    proposal,
    "document_workflow_get",
    "workflow",
  ),
} as const;

export function validateClinicalCapability(name: string, payload: unknown) {
  if (!Object.hasOwn(clinicalCapabilities, name))
    return { success: false as const };
  return clinicalCapabilities[
    name as keyof typeof clinicalCapabilities
  ].schema.safeParse(payload);
}
