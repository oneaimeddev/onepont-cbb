import "server-only";
import { createHash } from "node:crypto";
import { supabaseServer } from "../../../lib/supabase";
import type { DocumentContent, DocumentKind } from "../../documents/content";
import { spokenPatientMatches } from "./document-creation";
import { presentedDocument } from "../document-draft";
import {
  proposalIntent,
  proposalSaveIntent,
  resolveProposalEdit,
  resolveSpokenEdit,
  type DisplayedProposal,
  type ProposalPatch,
} from "./document-intent";

const spokenDocument: Record<DocumentKind, string> = {
  prescription: "a prescrição",
  exam_request: "o pedido de exames",
  surgical_order: "o pedido cirúrgico",
  certificate: "o atestado",
  referral: "o encaminhamento",
};

export async function resumeDocumentProposal(athleteId: string | null, proposals: DisplayedProposal[], kind?: DocumentKind) {
  if (!athleteId) return { text: "Para retomar o cartão, me diga de qual atleta ele é." };
  const shown = proposals.filter(p => p.athleteId === athleteId && (!kind || p.kind === kind));
  if (shown.length > 1) return { text: "Encontrei mais de um cartão em andamento. Qual deles você quer retomar?" };
  if (shown[0]?.dirty) return { text: "Esse cartão está com alterações em andamento. É só continuar nele para não perder o que você já fez." };
  const client = await supabaseServer();
  const read = await client.rpc("chat_document_proposal_read", { request_id: shown[0]?.requestId ?? null, kind: kind ?? null });
  const document = presentedDocument(read.data?.document);
  if (read.data?.error === "ambiguous") return { text: "Há mais de uma proposta em andamento. Qual delas você quer retomar?" };
  if (read.error || !document || document.athleteId !== athleteId)
    return { text: "Não encontrei essa proposta nesta conversa do atleta. Quer que eu abra uma nova?" };
  return { document, text: document.state === "saved" ? "Aqui está o cartão do rascunho salvo." : "Aqui está o cartão com os dados que você já ditou." };
}

export async function documentConversation(input: {
  message: string;
  previousReply?: string;
  athleteId: string | null;
  proposals: DisplayedProposal[];
  messageId?: string;
  inputMode?: "text" | "voice";
  spokenEdit?: { kind: DocumentKind; edits: Parameters<typeof resolveSpokenEdit>[2] };
  initialContent?: { kind: DocumentKind; content: DocumentContent; reply: string };
}) {
  const doseFollowUp = input.previousReply === "Anotei o medicamento no cartão. Qual é a dose?"
    && /^\s*\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|mL|miligramas?|gramas?|microgramas?|mililitros?)\.?\s*$/iu.test(input.message);
  const message = doseFollowUp ? "A dose é de " + input.message.trim() : input.message;
  let intent =
    input.spokenEdit ? { action: "edit" as const, kind: input.spokenEdit.kind, mixed: false } : input.initialContent ? { action: "edit" as const, kind: input.initialContent.kind, mixed: false }
      : proposalSaveIntent(message) ?? proposalIntent(message);
  let deferredKind: DocumentKind | null = null;
  if ((!intent || intent.action === "save") && input.proposals.length && /\b(?:salvar|salve|gravar|grave)\b/iu.test(message)) {
    const client = await supabaseServer();
    const turn = await client.rpc("chat_document_save_turn", { utterance: message });
    if (typeof turn.data?.directive === "string") {
      intent = proposalSaveIntent(turn.data.directive);
      const next = turn.data.deferredKind;
      if (next === "surgical_order" || next === "exam_request" || next === "prescription") deferredKind = next;
    }
  }
  if (!intent) return null;
  const save = intent.action === "save";
  if (!input.proposals.length && intent.action === "review") return null;
  const answer = (
    text: string,
    document: ReturnType<typeof presentedDocument> = null,
  ) => ({ text, document });
  if (intent.mixed)
    return answer(
      "Qual documento deseja alterar: prescrição, solicitação de exames ou pedido cirúrgico?",
    );
  const candidates = input.proposals.filter(
    (p) =>
      p.athleteId === input.athleteId &&
      (!intent.kind || p.kind === intent.kind),
  );
  const distinct = [
    ...new Map(candidates.map((p) => [p.requestId, p])).values(),
  ];
  if (save && intent.kind && !distinct.length && input.proposals.length === 1) {
    const selected = input.proposals[0];
    if (selected.athleteId === input.athleteId && selected.kind !== intent.kind) {
      const active = await resumeDocumentProposal(input.athleteId, input.proposals, selected.kind);
      return answer("Você mencionou " + spokenDocument[intent.kind] + ", mas o cartão selecionado é " + spokenDocument[selected.kind] + ". Para salvar este cartão, diga “Pode confirmar e salvar " + spokenDocument[selected.kind] + "”.", active.document);
    }
  }
  if (distinct.length !== 1)
    return answer(
      distinct.length > 1
        ? "Há mais de uma proposta compatível nesta conversa. Indique o documento desejado no cartão antes de alterá-lo."
        : "Abra a proposta e confirme o atleta em contexto antes de solicitar a alteração.",
    );
  const shown = distinct[0];
  if (shown.dirty)
    return answer(
      "Há alterações locais no cartão. Revise ou salve essas alterações antes de pedir outra mudança pelo chat.",
    );
  const client = await supabaseServer();
  const current = await client.rpc("chat_document_proposal_read", {
    request_id: shown.requestId,
    kind: shown.kind,
  });
  const document = presentedDocument(current.data?.document);
  if (current.error || !document)
    return answer(
      "Esta proposta não está disponível na conversa atual. Confira o contexto e seu acesso.",
    );
  if (document.athleteId !== input.athleteId)
    return answer("Confirme o atleta em contexto antes de continuar.");
  if (input.spokenEdit && !spokenPatientMatches(message, document.athleteName)) return answer("Confirme o atleta do cartão que deseja corrigir.");
  if (document.readOnlyReason)
    return answer(
      document.readOnlyReason === "finalized"
        ? "Esta versão foi finalizada e não pode ser alterada. Para criar um novo rascunho vinculado à origem, diga “Confirmo criar um documento derivado” neste chat. O original será preservado."
        : "Este documento está somente para consulta. Acompanhe o processamento e o histórico no cartão desta conversa.",
      document,
    );
  if (
    document.version !== shown.version ||
    document.contentHash !== shown.contentHash
  )
    return answer(
      "A proposta mudou desde a versão exibida. Atualizei o cartão; confira a versão atual e repita a alteração.",
      document,
    );
  if (save) {
    const r = await client.rpc("chat_document_save_message", {
      request_id: shown.requestId,
      expected_version: shown.version,
      expected_hash: shown.contentHash,
      message_key: input.messageId ?? crypto.randomUUID(),
      utterance: input.message,
      input_mode: input.inputMode ?? "text",
    });
    if (r.error || r.data?.error)
      return answer(
        r.data?.error === "conflict"
          ? "A versão mudou. Confira a proposta atual antes de confirmar novamente."
          : r.data?.error === "ambiguous"
            ? "A confirmação ficou ambígua. O cartão continua aqui. Para gravar este rascunho, diga “Pode confirmar e salvar " + spokenDocument[document.kind] + "”."
              : r.data?.error === "unapproved"
              ? "O cartão continua aqui. Se quiser gravar este rascunho agora, pode dizer “Pode salvar”."
              : "Não consegui salvar este rascunho. O cartão continua disponível para revisão.",
        document,
      );
    return answer(
      deferredKind
        ? "Salvei " + spokenDocument[document.kind] + " como rascunho. Quando quiser, podemos abrir " + spokenDocument[deferredKind] + "."
        : "Salvei esta versão como rascunho. O documento não foi assinado nem emitido.",
      presentedDocument(r.data?.document),
    );
  }
  const key = input.messageId ?? crypto.randomUUID();
  if (intent.action === "review") {
    const r = await client.rpc("chat_document_proposal_review", {
      request_id: shown.requestId,
      expected_version: shown.version,
      expected_hash: shown.contentHash,
      idempotency_key: key,
    });
    if (r.error || r.data?.error)
      return answer(
        r.data?.error === "incomplete"
          ? "Faltam campos obrigatórios para preparar a revisão documental. Confira os campos indicados no cartão."
          : "Não foi possível preparar esta revisão. Confira a versão atual da proposta.",
        document,
      );
    return answer(
      "Preparei a revisão documental desta versão. Confira o conteúdo apresentado; ele continua sem assinatura e sem emissão.",
      presentedDocument({
        ...r.data.document,
        preview: r.data.review?.material,
      }),
    );
  }
  let itemNumber = 0;
  const initial = input.initialContent?.content;
  const currentContent = document.content;
  let initialChanges: ProposalPatch[] | undefined;
  if (initial) {
    const blank = currentContent && Object.values(currentContent).every(value => Array.isArray(value) ? !value.length : !value);
    if (!blank) return answer("Esse cartão já tem dados. Diga o que você quer corrigir ou peça um novo cartão.", document);
    initialChanges = Object.entries(initial).flatMap<ProposalPatch>(([field, value]) =>
      field === "items" || !value ? [] : [{ operation: "set_field", field, value }]);
    if ("items" in initial) initialChanges.push(...initial.items.map(item => ({ operation: "add_item" as const, item })));
  }
  const resolved = input.spokenEdit ? resolveSpokenEdit(message, document, input.spokenEdit.edits) : initialChanges ? { changes: initialChanges } : resolveProposalEdit(message, document, () => {
    const hash = createHash("sha256")
      .update(`${shown.requestId}:${key}:${itemNumber++}`)
      .digest("hex");
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  });
  if ("clarification" in resolved) return answer(resolved.clarification);
  const patched = await client.rpc("chat_document_proposal_patch", {
    request_id: shown.requestId,
    expected_version: shown.version,
    expected_hash: shown.contentHash,
    changes: resolved.changes,
    idempotency_key: key,
  });
  const next = presentedDocument({
    ...patched.data?.document,
    preview: patched.data?.review?.material,
  });
  if (patched.error || !next)
    return answer(
      patched.data?.error === "conflict"
        ? "A proposta foi alterada em outra requisição. Reabra o cartão e repita a alteração sobre a versão atual."
        : "Não foi possível aplicar a alteração. Confira o item, o campo e os limites do documento.",
    );
  return answer(
    input.initialContent?.reply ?? (doseFollowUp ? "Anotei a dose. Qual é a via de administração?" : "Atualizei a proposta e preservei os campos não mencionados. Confira o cartão antes de salvar. O documento não foi assinado nem emitido."),
    next,
  );
}
