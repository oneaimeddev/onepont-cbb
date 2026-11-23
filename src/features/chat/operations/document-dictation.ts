import "server-only";
import { supabaseServer } from "../../../lib/supabase";
import { foldName } from "../athlete-resolution";
import { examPayload, lateralityFrom, presentedDocument, prescriptionPayload, surgicalPayload } from "../document-draft";
import { athletesFromDirectory, uuidPattern } from "../guards";
import type { DocumentKind } from "../../documents/content";
import { documentConversation } from "./document-service";
import { proposalIntent, proposalSaveIntent, type DisplayedProposal } from "./document-intent";
import { dictatedExam, stableCreationItemId } from "./document-creation";

function readDictation(message: string, continuing: boolean) {
  const spoken = message.trim()
    .replace(/(?:[.!]\s*|,\s*)(?:deixa|deixe|coloca|coloque)\s+(?:a proposta\s+)?no cartão\s+(?:pra|para)\s+(?:eu\s+)?(?:conferir|revisar)[.!]?$/iu, "")
    .replace(/[.!]$/, "")
    .replace(/^(?:(?:tá bom|tá|está bem|perfeito|certo|ok)[,.!\s]+)+/iu, "");
  const directive = spoken.match(/^(?:(?:vamos\s+)?(?:receitar|prescrever|receite|prescreva)\s+|(?:vamos\s+)?(?:abrir|fazer|preparar|criar|abra|faça|prepare|crie)(?:\s+então)?\s+(?:uma\s+)?(?:receita|prescrição)\s+(?:com(?:\s+esses\s+valores\s*:)?|(?:para (?:ele|ela|[oa] atleta)\s+)?de)\s+)/iu);
  const continuation = continuing ? spoken.match(/^(?:o nome do medicamento é|o medicamento é|medicamento:)\s*/iu) : null;
  const conversational = spoken.match(/^(?:vamos\s+)?(?:fazer|faz|faça|abrir|abre|abra|preparar|prepare|criar|crie)\s+(?:uma\s+)?(?:receita|prescrição)(?:\s+(?:pra|para)\s+(?:ele|ela|[oa]\s+atleta))?\s*[.!,:]\s*(?:coloca|colocar|coloque|inclua|adicione|anote)\s+/iu);
  const prefix = directive || conversational || continuation;
  if (!prefix && !continuing) return null;
  const detail = spoken.slice(prefix?.[0].length ?? 0);
  const match = detail.match(/^([\p{L}][\p{L}\p{M} -]{0,159}?)(?:\s*,\s*|\s+(?:de |com (?:dose|posologia) de )?)((?:\d+[,.])?\d+)\s*(mg|g|mcg|mL|miligramas?)\b(?:,?\s+(?:por\s+)?via\s+(oral|intravenosa|intramuscular|subcutânea|tópica))?(?:,?\s+(?:(?:para|pra) tomar )?(de (?:\d{1,2}|uma?|duas|três|quatro|seis|oito|doze|vinte e quatro) em (?:\d{1,2}|uma?|duas|três|quatro|seis|oito|doze|vinte e quatro) horas?))?(?:,?\s+(?:durante|por) ((?:\d{1,3}|um|dois|três|quatro|cinco|seis|sete|oito|nove|dez|quatorze|quinze|trinta) dias?))?$/iu);
  const name = (match?.[1] ?? detail).trim();
  if (!literalName(name, !match || !prefix)) return null;
  if (!match) return { name };
  return {
    name,
    dose: match[2],
    dose_unit: /^miligram/i.test(match[3]) ? "mg" : match[3],
    route: match[4] ?? "",
    schedule: match[5] ?? "",
    duration: match[6] ?? "",
  };
}


function literalName(value: string, singleWord = false) {
  return value.length <= 160
    && (singleWord ? /^[\p{L}\p{M}-]+$/u : /^[\p{L}][\p{L}\p{M} -]*$/u).test(value)
    && !/\b(?:sim|nao|ok|obrigado|certo|perfeito|receita|prescricao|medicamento|salvar|salve|confirme|confirmo|assine|assinar|envie|enviar|mostre|abra|sem|ou|e|se|talvez|para|exceto|evite)\b/.test(foldName(value));
}

const openingTerms: Record<DocumentKind, string> = {
  prescription: "receita|prescricao",
  exam_request: "(?:solicitacao|pedido) de exames?",
  surgical_order: "pedido cirurgico",
  certificate: "atestado",
  referral: "encaminhamento",
};

function openingKind(words: string) {
  const prefix = "(?:(?:ta bom|esta bem|perfeito|certo|ok) )?(?:vamos )?";
  const verb = "(?:(?:abrir|abra|abre|fazer|faca|faz|prepare|preparar|criar|crie|quero(?: abrir| preparar| fazer)?) (?:entao )?(?:(?:um|uma|o|a) )?)?";
  return (Object.keys(openingTerms) as DocumentKind[]).find((kind) => new RegExp(
    "^" + prefix + verb + "(?:" + openingTerms[kind] + ")(?: (?:agora|entao))?(?: para (?:ele|ela|[oa] atleta|[oa] atleta em contexto))?$",
  ).test(words));
}

export function documentOpeningQuestion(kind: DocumentKind, name: string) {
  if (kind === "prescription") return "O que você quer prescrever para " + name + "? Pode ditar normalmente.";
  if (kind === "exam_request") return "Qual exame você quer solicitar para " + name + "?";
  return "Qual procedimento você quer incluir no pedido de " + name + "?";
}

function promptedKind(reply = ""): DocumentKind | undefined {
  if (/^O que você quer prescrever para .+\? Pode ditar normalmente\.$/u.test(reply)) return "prescription";
  if (/^Qual exame você quer solicitar para .+\?$/u.test(reply)) return "exam_request";
  if (/^Qual procedimento você quer incluir no pedido de .+\?$/u.test(reply)) return "surgical_order";
}

function readExams(message: string, continuing: boolean) {
  if (message.includes("?")) return [];
  const clauses = message.trim().split(/\.\s+/u);
  const review = clauses.at(-1);
  if (review && /^(?:quero|vamos|deixe-me)\s+(?:conferir|revisar)(?:\s+(?:os dois|todos|o pedido))?(?:\s+antes de salvar)?\.?$/iu.test(review))
    clauses.pop();
  const first = clauses.shift()?.replace(/^(?:agora[,\s]+)?(?:(?:pra|para)\s+(?:esse|este|essa|esta|o|a)\s+atleta[,\s]+|(?:pra|para)\s+(?:ele|ela)[,\s]+|agora[,\s]+)/iu, "")
    .replace(/^eu\s+(?=quero\b)/iu, "")
    .replace(/^pede\b/iu, "Peça") ?? "";
  const initial = dictatedExam(first) ?? (continuing ? dictatedExam("Solicite " + first) : null);
  if (!initial || clauses.length > 11) return [];
  const names = [initial];
  for (const clause of clauses) {
    const extra = clause.match(/^(?:coloca|coloque|inclua|adicione|acrescente)\s+(?:também\s+)?(.+?)(?:\s+no mesmo pedido)?\.?$/iu);
    const name = extra && dictatedExam("Solicite " + extra[1]);
    if (!name || names.some((seen) => foldName(seen) === foldName(name))) return [];
    names.push(name);
  }
  return names;
}

const documentTypeQuestion = "Qual documento você quer abrir? Pode pedir uma receita, um exame ou um pedido cirúrgico.";

export async function documentDictation(input: {
  message: string;
  previousReply?: string;
  athleteId: string | null;
  messageId?: string;
  proposals: DisplayedProposal[];
}) {
  const words = foldName(input.message);
  if (/^(?:vamos |quero )?(?:criar|fazer|abrir) (?:um )?(?:outro|novo) documento$/.test(words))
    return { text: documentTypeQuestion };
  const opening = !/[?;]/u.test(input.message) && (openingKind(words)
    ?? (input.previousReply === documentTypeQuestion && /^(?:um )?exames?$/.test(words) ? "exam_request" : undefined));
  const continuing = promptedKind(input.previousReply);
  const medication = readDictation(input.message, continuing === "prescription");
  const exams = readExams(input.message, continuing === "exam_request");
  const procedureMatch = input.message.trim().replace(/[.!]$/, "").match(/^(?:(?:vamos )?(?:abrir|fazer|preparar|criar|abra|faça|prepare|crie) (?:um )?pedido cirúrgico (?:de|com) |(?:o procedimento é|procedimento:) )(.+)$/iu);
  const procedureText = procedureMatch?.[1] ?? (continuing === "surgical_order" && !proposalIntent(input.message) && !proposalSaveIntent(input.message) ? input.message.trim().replace(/[.!]$/, "") : "");
  const procedure = !opening && literalName(procedureText) ? procedureText : null;
  const kind = opening || (medication ? "prescription" : exams.length ? "exam_request" : procedure ? "surgical_order" : undefined);
  if (!kind) {
    // Keep earlier spoken openings with fillers and repeated words working.
    if (/^(?:(?:ta bom|perfeito) )*(?:vamos )?abrir fazer uma(?: uma)? receita entao para o atleta$/.test(words))
      return documentDictation({ ...input, message: "Receita" });
    if (/^(?:vamos )?(?:receitar|prescrever|receite|prescreva)\b/.test(words) && /\bou\b/.test(words))
      return { text: "Qual dos medicamentos você quer colocar no cartão?" };
    return null;
  }
  if (!input.athleteId || !uuidPattern.test(input.athleteId))
    // Without an athlete, the assistant guides the professional with the platform guide.
    return null;
  const client = await supabaseServer();
  const [profile, current, roster] = await Promise.all([
    client.rpc("medical_profile"),
    client.rpc("conversation_current"),
    client.rpc("agent_presented_athletes", { ids: [input.athleteId] }),
  ]);
  if (profile.error || current.error || roster.error)
    return { text: "Tive um problema ao abrir a proposta. Pode tentar novamente?" };
  if (profile.data?.enabled !== true)
    return { text: "Esse documento é preparado pelo perfil médico, e o seu perfil ainda não tem essa autorização. Se quiser, posso ajudar com uma evolução." };
  const athlete = athletesFromDirectory(roster.data).find(({ id }) => id === input.athleteId);
  if (!athlete || current.data?.session?.athleteId !== input.athleteId)
    return { text: "Me diga para qual atleta é o documento que eu continuo daqui." };

  const prompt = documentOpeningQuestion(kind, athlete.name);
  if (continuing === kind && input.previousReply !== prompt && !opening)
    return { text: "Percebi que o atleta em contexto mudou. Quer que eu abra o cartão para o atleta selecionado agora?" };

  const key = input.messageId ?? crypto.randomUUID();
  const payload = kind === "prescription" ? prescriptionPayload("", medication && !opening ? [medication] : [])
    : kind === "exam_request" ? examPayload({ items: opening ? [] : exams.map((name) => {
      const side = name.match(/\b(direit[oa]|esquerd[oa]|bilateral)\b/giu);
      return { name, laterality: side?.length === 1 ? lateralityFrom(side[0]) : "" };
    }) })
    : surgicalPayload({ procedure: procedure && !opening ? procedure : undefined });
  if ("items" in payload) payload.items.forEach((item, index) => { item.id = stableCreationItemId(key, athlete.id, kind, index); });

  const filled = "items" in payload ? payload.items.length > 0 : Boolean(payload.procedure);
  const nextQuestion = !filled ? prompt
    : kind === "prescription" && !medication?.dose ? "Anotei o medicamento no cartão. Qual é a dose?"
    : kind === "prescription" && !medication?.route ? "Deixei a proposta no cartão. Qual é a via de administração?"
    : "Deixei a proposta no cartão para você conferir.";

  if (continuing === kind && filled && input.proposals.some((proposal) => proposal.kind === kind && proposal.athleteId === athlete.id)) {
    return documentConversation({
      message: input.message, athleteId: athlete.id, proposals: input.proposals, messageId: key,
      initialContent: { kind, content: payload, reply: nextQuestion },
    });
  }

  const result = await client.rpc("chat_document_proposal_create", {
    target: athlete.id, kind, payload, message_key: key,
  });
  const document = presentedDocument(result.data?.document);
  if (result.error || result.data?.error || !document)
    return { text: "Não consegui abrir a proposta agora. Pode tentar de novo? Se continuar, confira se o atleta certo está em contexto." };
  return { document, text: document.state === "saved" ? "Essa proposta já está salva como rascunho." : nextQuestion };
}
