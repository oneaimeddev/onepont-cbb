import { z } from "zod";

const id = z.string().uuid();
const revision = z.number().int().min(0).max(2147483647);
const kind = z.enum(["prescription", "surgical_order", "exam_request"]);
const workspace = z.object({ workspaceId: id, revision }).strict();
const session = z.object({ sessionId: id }).strict();
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
  implementation: CapabilityDefinition["implementation"] = "reserved",
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
    "clinical_document_proposal_register",
    "proposal",
    "none",
    "existing",
  ),
  "document.proposal.read": capability(
    "Consultar proposta ativa autorizada",
    z.object({ athleteId: id, kind }).strict(),
    "clinical_document_proposal_current",
    "proposal",
    "none",
    "existing",
  ),
  "document.proposal.patch": capability(
    "Alterar apenas campos/itens explicitamente identificados",
    workspace.extend({ kind, changes: z.array(patch).min(1).max(40) }),
    "document_review_command",
    "workspace",
  ),
  "document.proposal.item.add": capability(
    "Adicionar item com campos clínicos explícitos",
    workspace.extend({
      kind,
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
    "document_review_command",
    "workspace",
  ),
  "document.proposal.item.remove": capability(
    "Remover item por identificador estável",
    workspace.extend({ itemId: id }),
    "document_review_command",
    "workspace",
  ),
  "document.proposal.items.reorder": capability(
    "Reordenar identificadores sem perder campos",
    workspace.extend({
      itemIds: z
        .array(id)
        .min(1)
        .max(50)
        .refine((ids) => new Set(ids).size === ids.length),
    }),
    "document_review_command",
    "workspace",
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
    workspace,
    "document_review_command:save",
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
    "chat_operation_confirm",
    "authorization",
    "challenge",
    "infrastructure",
  ),
  "signing.status": capability(
    "Consultar resultado efetivo da assinatura",
    z.object({ documentId: id }).strict(),
    "document_workflow_get",
    "workflow",
  ),
  "document.finalization.read": capability(
    "Consultar finalização e imutabilidade",
    z.object({ documentId: id }).strict(),
    "document_workflow_get",
    "workflow",
  ),
  "delivery.status": capability(
    "Consultar entrega sem alegar envio real",
    z.object({ documentId: id }).strict(),
    "document_workflow_get",
    "workflow",
  ),
  "delivery.retry": capability(
    "Retentar falha recuperável com justificativa",
    z
      .object({
        requestId: id,
        justification: z.string().trim().min(8).max(500),
      })
      .strict(),
    "document_workflow_action:retry",
    "workflow",
    "challenge",
  ),
  "delivery.resend": capability(
    "Solicitar reenvio sem outra assinatura",
    z
      .object({
        requestId: id,
        justification: z.string().trim().min(8).max(500),
      })
      .strict(),
    "document_workflow_action:resend",
    "workflow",
    "challenge",
  ),
  "document.derive": capability(
    "Criar outro documento preservando a origem",
    z.object({ documentId: id }).strict(),
    "document_workflow_action:derive",
    "workspace",
    "challenge",
  ),
  "document.history": capability(
    "Consultar histórico autorizado",
    z.object({ documentId: id }).strict(),
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
