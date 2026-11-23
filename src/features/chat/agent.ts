import "server-only";
import { spokenEditSchema, displayedProposalSchema } from "./operations/document-intent";
import { documentDictation, documentOpeningQuestion } from "./operations/document-dictation";
import { workflowConversation } from "./operations/workflow-service";
import { documentConversation, resumeDocumentProposal } from "./operations/document-service";
import { creationPatientMatches, dictatedExam, documentCreationRequested, groundDocumentCreation, groundSpokenContent, spokenPatientMatches, type SpokenSource, stableCreationItemId } from "./operations/document-creation";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, streamText, hasToolCall, stepCountIs, tool } from "ai";
import { z } from "zod";
import { activityFilterSchema, clinicalSearchBoard } from "../clinical-search/contract";
import { clinicalSearchIntent } from "../clinical-search/intent";
import { clinicalSearchConversation, runClinicalSearch } from "../clinical-search/service";
import { attachmentConversation } from "../attachments/chat-service";
import type { AttachmentBoard } from "../attachments/types";
import { supabaseServer } from "../../lib/supabase";
import { intelligenceModel } from "./config";
import { presentedDraft, type ClinicalDraft } from "./clinical-draft";
import { groundCertificate, groundReferral, letterDocumentRequested, letterPatientMatches } from "./operations/letter-documents";
import type { CertificateContent, ReferralContent } from "../documents/content";
import { documentTitle, examPayload, isDocumentKind, prescriptionPayload, presentedContent, presentedDocument, surgicalPayload, type DocumentDraft } from "./document-draft";
import { athleteCommand, rosterChoice, rosterPrompt, type AthleteCommand } from "./athlete-resolution";
import { documentChoice, documentRequest, modelDocumentSummary, type DocumentSlot, type ReadingBoard } from "./document-resolution";
import { athleteProfilePath, athletesFromDirectory, compactDirectoryReply, decideAthleteAccess, directoryFilters, directoryPageSize, genders, presentedAthletes, presentedContext, presentedNavigation, presentedSearch, uuidPattern, type AthleteSearch, type PresentedAthlete, type PresentedSearch } from "./guards";
import { historyRequest, presentedAnalysis, type HistoryAnalysis } from "./history-analysis";
import { historyScope, modelHistory, readLongitudinalHistory } from "./history-run";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(12000),
}).strict();

const requestSchema = z.object({
  displayedProposals: z.array(displayedProposalSchema).max(12).optional(),
  messageId: z.string().uuid().optional(),
  messages: z.array(messageSchema).min(1).max(8),
  contextAthleteId: z.string().nullable().optional(),
  inputMode: z.enum(["text", "voice"]).optional(),
  roster: z.array(z.string()).max(40).optional(),
  documentRoster: z.array(z.string()).max(20).optional(),
  attachmentRoster: z.array(z.string()).max(25).optional(),
  clinicalSearchScope: z.unknown().nullable().optional(),
  createdDocumentIds: z.array(z.string()).max(8).optional(),
  historyScope: z.object({
    athleteId: z.string(),
    athleteName: z.string().max(160),
    from: z.string().max(10),
    to: z.string().max(10),
    unbounded: z.boolean(),
    periodLabel: z.string().max(120),
    specialties: z.array(z.string().max(40)).max(4),
    kinds: z.array(z.enum(["evolution", "prescription", "surgical_order", "exam_request"])).max(4),
  }).strict().nullable().optional(),
}).strict();

const voiceRules = [
  "A última mensagem veio de transcrição de voz e pode conter erros de reconhecimento.",
  "Se a fala parecer cortada ou ininteligível, peça ao profissional que repita em poucas palavras.",
  "Se o nome do atleta puder corresponder a mais de uma pessoa ou parecer mal transcrito, busque e peça confirmação. Nunca escolha sozinho.",
  "Nunca altere lateralidade, datas, doses, unidades, procedimentos ou negações. Se um desses dados estiver ambíguo, pergunte antes de preparar a evolução.",
  "Uma confirmação explícita do profissional pode salvar somente um rascunho. O sistema valida essa confirmação. Nunca afirme que uma evolução foi publicada pela fala.",
  "Uma frase explícita pode gravar o rascunho de uma evolução, de uma prescrição ou de um pedido cirúrgico. O sistema confere a frase. Não diga que gravou, emitiu ou assinou.",
];

export type AgentReply = {
  text: string;
  athletes: ReturnType<typeof presentedAthletes>;
  navigation: { id: string; href: string; name: string } | null;
  search: PresentedSearch | null;
  draft: ClinicalDraft | null;
  document: DocumentDraft | null;
  context: { id: string; name: string } | null;
  contextCleared: boolean;
  sessionId: string | null;
};

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function unavailable(reason: "confirm" | "reject" | "denied") {
  if (reason === "confirm") return { status: "confirm" as const };
  return { status: "unavailable" as const };
}

function presentationFrom(steps: ReadonlyArray<{ toolResults: ReadonlyArray<{ toolName: string; output: unknown }> }>): Pick<AgentReply, "athletes" | "navigation" | "search" | "draft" | "document" | "context" | "contextCleared" | "sessionId"> & { kind: "search" | "narrative" } {
  let athletes = presentedAthletes([]);
  let navigation: AgentReply["navigation"] = null;
  let search: PresentedSearch | null = null;
  let draft: ClinicalDraft | null = null;
  let document: DocumentDraft | null = null;
  let context: AgentReply["context"] = null;
  let contextCleared = false;
  let sessionId: string | null = null;
  let kind: "search" | "narrative" = "narrative";
  for (const step of steps) {
    for (const item of step.toolResults) {
      const output = item.output as { status?: string; athletes?: unknown; athlete?: unknown; href?: unknown; context?: unknown; repeatCard?: boolean; total?: unknown; page?: unknown; pageSize?: unknown; filters?: unknown };
      if ((item.toolName === "searchAthletes" || item.toolName === "recallAthlete") && output.status === "ok") {
        athletes = presentedAthletes(output.athletes);
        search = presentedSearch({ total: output.total, page: output.page, pageSize: output.pageSize, filters: output.filters });
        kind = "search";
      }
      if (output.status === "context") {
        const athlete = presentedAthletes([output.athlete])[0];
        const selected = presentedContext(output.athlete);
        if (athlete && selected) {
          context = selected;
          contextCleared = false;
          athletes = output.repeatCard === false ? [] : [athlete];
          search = null;
          kind = "narrative";
        }
      }
      if (output.status === "navigation") {
        const athlete = presentedAthletes([output.athlete])[0];
        const link = athlete ? presentedNavigation({ id: athlete.id, href: output.href, name: athlete.name }) : null;
        const selected = presentedContext(output.context);
        if (athlete && link) {
          navigation = link;
          athletes = output.repeatCard === false ? [] : [athlete];
          search = null;
          kind = "narrative";
          if (selected) {
            context = selected;
            contextCleared = false;
          }
        }
      }
      if (output.status === "summary") {
        const athlete = presentedAthletes([output.athlete])[0];
        if (athlete) {
          athletes = [athlete];
          search = null;
          kind = "narrative";
        }
      }
      if (output.status === "confirm") {
        athletes = presentedAthletes(output.athletes);
        draft = null;
        document = null;
        kind = "search";
      }
      if ((item.toolName === "preparePrescription" || item.toolName === "prepareSurgicalOrder" || item.toolName === "prepareExamRequest" || item.toolName === "prepareCertificate" || item.toolName === "prepareReferral" || item.toolName === "openClinicalDocument" || item.toolName === "resumeDocumentProposal" || item.toolName === "editDocumentProposal") && (output.status === "proposal" || output.status === "saved")) {
        const proposal = presentedDocument(output);
        if (proposal) {
          document = proposal;
          search = null;
          kind = "narrative";
        }
      }
      if (item.toolName === "offerConsultationReport" && output.status === "report_choice") {
        const choice = presentedDraft(output);
        if (choice) {
          draft = choice;
          search = null;
          kind = "narrative";
        }
      }
      if (item.toolName === "prepareClinicalDraft" && output.status === "proposal") {
        const proposal = presentedDraft(output);
        if (proposal) {
          draft = proposal;
          search = null;
          kind = "narrative";
        }
      }
      if (item.toolName === "getAthleteSummary" && output.status === "ok") {
        const athlete = presentedAthletes([output.athlete])[0];
        if (athlete) athletes = [athlete];
        search = null;
        kind = "narrative";
      }
      if (item.toolName === "selectAthleteContext" && output.status === "context") {
        const athlete = presentedAthletes([output.athlete])[0];
        const selected = presentedContext(output.athlete);
        if (athlete && selected) {
          context = selected;
          contextCleared = false;
          athletes = output.repeatCard === false ? [] : [athlete];
          search = null;
          kind = "narrative";
        }
      }
      if (item.toolName === "clearAthleteContext" && output.status === "cleared") {
        context = null;
        contextCleared = true;
        kind = "narrative";
      }
      if ((item.toolName === "prepareClinicalDraft" || item.toolName === "preparePrescription" || item.toolName === "prepareSurgicalOrder" || item.toolName === "prepareExamRequest" || item.toolName === "prepareCertificate" || item.toolName === "prepareReferral") && output.status === "proposal" && typeof (output as { sessionId?: unknown }).sessionId === "string") {
        const candidate = (output as { sessionId: string }).sessionId;
        if (uuidPattern.test(candidate)) sessionId = candidate;
      }
      if ((item.toolName === "navigateToAthlete" || item.toolName === "openConsultationVoice") && output.status === "ok") {
        const athlete = presentedAthletes([output.athlete])[0];
        const link = athlete ? presentedNavigation({ id: athlete.id, href: output.href, name: athlete.name }) : null;
        if (athlete && link) {
          navigation = link;
          if (item.toolName === "openConsultationVoice") {
            context = { id: athlete.id, name: athlete.name };
            contextCleared = false;
          }
          athletes = [athlete];
          search = null;
          kind = "narrative";
        }
      }
    }
  }
  return { athletes, navigation, search, draft, document, context, contextCleared, sessionId, kind };
}

function replyText(textReply: string, athletes: AgentReply["athletes"]) {
  return textReply || (athletes.length ? "Encontrei estes atletas autorizados." : "Não há informação autorizada suficiente para responder.");
}

async function prepareConversation(input: unknown) {
  const model = intelligenceModel();
  if (!model) return { error: "unavailable" as const };
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success || parsed.data.messages.at(-1)?.role !== "user") return { error: "invalid" as const };
  const contextAthleteId = parsed.data.contextAthleteId && uuidPattern.test(parsed.data.contextAthleteId)
    ? parsed.data.contextAthleteId
    : null;
  const searches: (AthleteSearch & { athletes: AgentReply["athletes"] })[] = [];
  const client = await supabaseServer();
  const medical = await client.rpc("medical_profile");
  const canAuthorDocuments = !medical.error && medical.data?.enabled === true;
  const rosterIds = (parsed.data.roster ?? []).filter((id) => uuidPattern.test(id)).slice(0, 40);
  const presented = rosterIds.length === 0 ? { data: [], error: null } : await client.rpc("agent_presented_athletes", { ids: rosterIds });
  const loadedRoster = athletesFromDirectory(presented.error ? [] : presented.data);
  const rosterById = new Map(loadedRoster.map((athlete) => [athlete.id, athlete]));
  const rosterSlots = rosterIds.map((id) => rosterById.get(id) ?? null);
  const documentRosterIds = (parsed.data.documentRoster ?? []).filter((id) => uuidPattern.test(id)).slice(0, 20);
  const createdIds = (parsed.data.createdDocumentIds ?? []).filter((id) => uuidPattern.test(id)).slice(0, 8);
  const utterance = parsed.data.messages.at(-1)?.content ?? "";
  const sentByProfessional = parsed.data.messages.filter((message) => message.role === "user").map((message) => message.content.trim());
  const displayedProposals = parsed.data.displayedProposals ?? [];
  const creationTurnKey = parsed.data.messageId ?? crypto.randomUUID();
  const documentPreparation = { spoken: false, attempted: false, requested: (["prescription", "exam_request", "surgical_order"] as const).some((kind) => documentCreationRequested(kind, utterance)) || letterDocumentRequested("certificate", utterance) || letterDocumentRequested("referral", utterance), notice: "" };
  if (documentPreparation.requested && !canAuthorDocuments) documentPreparation.notice = "Seu perfil não tem autorização para preparar documentos médicos. Não preparei nem salvei um documento.";
  const command = athleteCommand(utterance);
  const speech = documentRequest(utterance);
  const published: { reading: ReadingBoard | null; analysis: HistoryAnalysis | null } = { reading: null, analysis: null };

  let clinicalPublished: Awaited<ReturnType<typeof runClinicalSearch>> | null = null;
  const searchClinicalActivity = tool({
    description: "Busca clínica transversal em atletas autorizados por tipos de registro e filtros esportivos/temporais. Períodos relativos são calculados no servidor. Solicitações de exame e anexos não comprovam realização. Não recebe SQL nem conteúdo clínico livre.",
    inputSchema: activityFilterSchema,
    execute: async (filters) => {
      clinicalPublished=await runClinicalSearch(filters,parsed.data.inputMode??"text","agent");
      return clinicalPublished.summary??{error:clinicalPublished.text};
    },
  });
  let attachmentPublished: AttachmentBoard | null = null;
  const listClinicalAttachments = tool({
    description: "Consulta somente metadados de anexos autorizados. Pode abrir um arquivo no visualizador; não lê nem interpreta PDF ou imagem.",
    inputSchema: z.object({athleteId:z.string(), utterance:z.string().min(1).max(500)}),
    execute: async ({athleteId,utterance}) => {
      const decision=decideAthleteAccess(athleteId,contextAthleteId,searches);
      if(decision!=="allow") return unavailable(decision);
      const result=await attachmentConversation({message:utterance,athleteId,ids:parsed.data.attachmentRoster,mode:parsed.data.inputMode,agent:true});
      if(!result)return {status:"unavailable"};
      attachmentPublished=result.board;
      return {status:"metadata",note:result.text,attachments:result.summary};
    },
  });

  async function readAthlete(athleteId: string) {
    const profile = await client.rpc("agent_athlete_workspace", { target: athleteId, view_name: "profile" });
    if (profile.error || !profile.data?.athlete) return unavailable("denied");
    const athlete = athletesFromDirectory([profile.data.athlete])[0];
    if (!athlete || !profile.data.can_read_records) {
      return { status: "summary" as const, athlete, history: [] as { title: string; specialty: string; author: string; status: "draft" | "finalized"; occurredAt: string; restrictedToAuthor: boolean; body: string }[], note: "O histórico clínico não está disponível para este perfil." };
    }
    const timeline = await client.rpc("agent_athlete_workspace", { target: athleteId, view_name: "timeline" });
    if (timeline.error || !timeline.data) return unavailable("denied");
    const records = Array.isArray(timeline.data.records) ? timeline.data.records.slice(0, 12) : [];
    return {
      status: "summary" as const,
      athlete,
      truncated: Array.isArray(timeline.data.records) && timeline.data.records.length > records.length,
      history: records.map((record: Record<string, unknown>) => ({
        title: text(record.title, 160),
        specialty: text(record.specialty, 80),
        author: text(record.author_name, 160),
        status: record.status === "draft" ? "draft" as const : "finalized" as const,
        occurredAt: text(record.occurred_at, 40),
        restrictedToAuthor: record.is_restricted === true,
        body: text(record.body, 1000),
      })),
    };
  }

  async function finishUnique(athlete: PresentedAthlete, intent: AthleteCommand) {
    const shown = rosterIds.includes(athlete.id);
    if (intent === "read") return readAthlete(athlete.id);
    if (intent === "select" || intent === "open") {
      const selected = await client.rpc("conversation_set_context", { context_athlete: athlete.id });
      const result = selected.data as { ok?: boolean } | null;
      if (selected.error || result?.ok === false) return unavailable("denied");
      if (intent === "open") {
        const href = athleteProfilePath(athlete.id);
        if (!href) return unavailable("denied");
        return { status: "navigation" as const, athlete, href, context: { id: athlete.id, name: athlete.name }, repeatCard: !shown };
      }
      return { status: "context" as const, athlete, repeatCard: !shown };
    }
    return null;
  }

  const searchAthletes = tool({
    description: "Pesquisa todos os atletas autorizados, não apenas os cards visíveis. O nome pode omitir sobrenomes do meio. Passe clube de origem, categoria atual, naipe em division, modalidade e gênero separados do nome. Não invente pessoas. Se houver mais de uma, não escolha a primeira.",
    inputSchema: z.object({
      q: z.string().max(160).optional(),
      category: z.string().max(80).optional(),
      division: z.string().max(80).optional(),
      modality: z.string().max(40).optional(),
      club: z.string().max(120).optional().describe("Clube de origem, em que o atleta atua hoje."),
      gender: z.enum(genders).optional().describe("Gênero: atletas femininas = feminino; masculinos = masculino."),
      status: z.enum(["active", "inactive"]).optional(),
      page: z.number().int().min(1).max(20).optional(),
    }),
    execute: async (filters) => {
      const payload: Record<string, string> = {};
      for (const key of ["q", "category", "division", "modality", "club", "gender", "status"] as const) {
        const value = filters[key]?.trim();
        if (value) payload[key] = value;
      }
      payload.page = String(filters.page ?? 1);
      payload.page_size = String(directoryPageSize);
      const { data, error } = await client.rpc("agent_athlete_directory", { filters: payload });
      if (error || !data) return { status: "failed" as const };
      const athletes = athletesFromDirectory(data.athletes);
      const query = directoryFilters({
        q: payload.q,
        category: payload.category,
        division: payload.division,
        modality: payload.modality,
        club: payload.club,
        gender: payload.gender,
        status: payload.status,
      }) ?? {};
      const total = Number(data.total) || 0;
      searches.push({ ids: athletes.map((athlete) => athlete.id), total, athletes });
      if (athletes.length === 1 && total === 1) {
        const resolved = await finishUnique(athletes[0], command);
        if (resolved) return resolved;
      }
      const options = Array.isArray(data.options) ? data.options.slice(0, 40) : [];
      return {
        status: "ok" as const,
        total,
        page: Number(data.page) || 1,
        pageSize: directoryPageSize,
        filters: query,
        athletes,
        options,
      };
    },
  });

  const getAthleteSummary = tool({
    description: "Consulta o cadastro e, se autorizado, o histórico clínico de um atleta. Não chame se a busca anterior tiver mais de uma pessoa possível.",
    inputSchema: z.object({ athleteId: z.string() }),
    execute: async ({ athleteId }) => {
      const decision = decideAthleteAccess(athleteId, contextAthleteId, searches);
      if (decision !== "allow") {
        const search = searches.findLast((item) => item.ids.includes(athleteId) || item.total > 1);
        return { ...unavailable(decision), athletes: decision === "confirm" ? search?.athletes ?? [] : [] };
      }
      return readAthlete(athleteId);
    },
  });

  const recallAthlete = tool({
    description: "Resolve uma referência à lista recém-apresentada nesta conversa. Ordinal 1 é o primeiro card. Use reference previous para ele, ela, esse ou essa quando a lista tiver uma só pessoa. Use clube, categoria ou naipe para aquele do Flamengo, por exemplo. Não invente identificadores e não escolha o primeiro quando houver vários. Não consulta outra conversa.",
    inputSchema: z.object({
      ordinal: z.number().int().min(1).max(40).optional(),
      reference: z.enum(["previous"]).optional(),
      name: z.string().max(160).optional(),
      club: z.string().max(120).optional(),
      category: z.string().max(80).optional(),
      division: z.string().max(80).optional(),
    }),
    execute: async (query) => {
      const choice = rosterChoice(rosterSlots, query);
      if (choice.status === "none") return { status: "unavailable" as const };
      if (choice.status === "many") {
        searches.push({ ids: choice.athletes.map((athlete) => athlete.id), total: choice.athletes.length, athletes: choice.athletes });
        return { status: "confirm" as const, athletes: choice.athletes };
      }
      searches.push({ ids: [choice.athlete.id], total: 1, athletes: [choice.athlete] });
      const resolved = await finishUnique(choice.athlete, command);
      if (resolved) return resolved;
      return {
        status: "ok" as const,
        total: 1,
        page: 1,
        pageSize: 1,
        filters: {},
        athletes: [choice.athlete],
      };
    },
  });

  const navigateToAthlete = tool({
    description: "Prepara a abertura do prontuário tradicional de um atleta já identificado. Não aceite endereços informados pelo usuário.",
    inputSchema: z.object({ athleteId: z.string() }),
    execute: async ({ athleteId }) => {
      const decision = decideAthleteAccess(athleteId, contextAthleteId, searches);
      if (decision !== "allow") {
        const search = searches.findLast((item) => item.total > 1);
        return { ...unavailable(decision), athletes: decision === "confirm" ? search?.athletes ?? [] : [] };
      }
      const href = athleteProfilePath(athleteId);
      const opened = await client.rpc("agent_athlete_workspace", { target: athleteId, view_name: "chat" });
      const athlete = athletesFromDirectory([opened.data?.athlete])[0];
      if (opened.error || !href || !athlete || athlete.id !== athleteId) return unavailable("denied");
      return { status: "ok" as const, athlete, href };
    },
  });

  const openConsultationVoice = tool({
    description: "Oferece um link para Registrar evolução por voz ou revisar a última consulta gravada pelo profissional para esse atleta. Nunca inicia, salva ou finaliza a gravação. Use somente quando o profissional pedir a consulta gravada. Busque o atleta quando ele for nomeado e esclareça múltiplos resultados.",
    inputSchema: z.object({ athleteId: z.uuid(), destination: z.enum(["capture", "review"]) }),
    execute: async ({ athleteId, destination }) => {
      const decision = decideAthleteAccess(athleteId, contextAthleteId, searches);
      if (decision !== "allow") return unavailable(decision);
      if (process.env.CONSULTATION_VOICE_BETA !== "1") return unavailable("denied");
      const [opened, access] = await Promise.all([
        client.rpc("agent_athlete_workspace", { target: athleteId, view_name: "chat" }),
        client.rpc("chat_consultation_navigation", { target: athleteId, review: destination === "review" }),
      ]);
      const athlete = athletesFromDirectory([opened.data?.athlete])[0];
      const base = athleteProfilePath(athleteId);
      if (opened.error || access.error || !access.data || !athlete || !base) return unavailable("denied");
      const capture = base + "/evolucao?modo=voz";
      const href = destination === "capture" && access.data.available === true ? capture
        : destination === "review" && uuidPattern.test(access.data.recordId ?? "") ? base + "/evolucao?registro=" + access.data.recordId
        : destination === "review" && uuidPattern.test(access.data.captureId ?? "") ? capture + "&consulta=" + access.data.captureId
        : null;
      if (!href) return unavailable("denied");
      return { status: "ok" as const, athlete, href };
    },
  });

  const selectAthleteContext = tool({
    description: "Coloca um atleta já identificado no contexto da conversa. Não abre o prontuário e não escolhe sozinho quando houver mais de uma pessoa.",
    inputSchema: z.object({ athleteId: z.string() }),
    execute: async ({ athleteId }) => {
      const decision = decideAthleteAccess(athleteId, contextAthleteId, searches);
      if (decision !== "allow") {
        const search = searches.findLast((item) => item.ids.includes(athleteId) || item.total > 1);
        return { ...unavailable(decision), athletes: decision === "confirm" ? search?.athletes ?? [] : [] };
      }
      const opened = await client.rpc("agent_athlete_workspace", { target: athleteId, view_name: "chat" });
      const athlete = athletesFromDirectory([opened.data?.athlete])[0];
      if (opened.error || !athlete || athlete.id !== athleteId) return unavailable("denied");
      const selected = await client.rpc("conversation_set_context", { context_athlete: athleteId });
      const result = selected.data as { ok?: boolean } | null;
      if (selected.error || result?.ok === false) return unavailable("denied");
      return { status: "context" as const, athlete, repeatCard: !rosterIds.includes(athlete.id) };
    },
  });

  const clearAthleteContext = tool({
    description: "Tira o atleta do contexto da conversa. Não apaga a conversa nem registros clínicos.",
    inputSchema: z.object({ confirmed: z.boolean().optional() }),
    execute: async () => {
      const cleared = await client.rpc("conversation_set_context", { context_athlete: null });
      const result = cleared.data as { ok?: boolean } | null;
      if (cleared.error || result?.ok === false) return { status: "denied" as const };
      return { status: "cleared" as const };
    },
  });

  const prepareClinicalDraft = tool({
    description: "Organiza uma proposta de evolução ainda não gravada, apenas com o que o profissional relatou. Não invente dados clínicos. Não grave, finalize nem altere registros.",
    inputSchema: z.object({
      athleteId: z.string(),
      title: z.string().max(160),
      body: z.string().max(20000),
      occurredOn: z.string().max(10).optional(),
      missing: z.array(z.string().max(160)).max(8).optional(),
    }),
    execute: async ({ athleteId, title, body, occurredOn, missing }) => {
      const decision = decideAthleteAccess(athleteId, contextAthleteId, searches);
      if (decision !== "allow") {
        const search = searches.findLast((item) => item.ids.includes(athleteId) || item.total > 1);
        return { ...unavailable(decision), athletes: decision === "confirm" ? search?.athletes ?? [] : [] };
      }
      const cleanTitle = title.trim();
      const gaps = (missing ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 8);
      const date = occurredOn?.trim() ?? "";
      if (!cleanTitle || !body.trim() || (date !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
        return { status: "incomplete" as const, missing: gaps };
      }
      const prepared = await client.rpc("agent_clinical_draft_prepare", { target: athleteId });
      const data = prepared.data as { ok?: boolean; athleteName?: string; professionalName?: string } | null;
      if (prepared.error || !data?.ok || !data.athleteName || !data.professionalName) return { status: "denied" as const };
      const requestId = crypto.randomUUID();
      const proposalBody = body.slice(0, 20000);
      const registered = await client.rpc("clinical_draft_proposal_register", {
        target: athleteId,
        request_id: requestId,
        entry_title: cleanTitle,
        entry_body: proposalBody,
        occurred_on: date || null,
        restricted: true,
      });
      const stored = registered.data as { ok?: boolean; sessionId?: unknown; version?: unknown; contentHash?: unknown } | null;
      return {
        status: "proposal" as const,
        state: "proposal" as const,
        requestId,
        athleteId,
        athleteName: data.athleteName,
        professionalName: data.professionalName,
        occurredOn: date || null,
        title: cleanTitle,
        body: proposalBody,
        missing: gaps,
        restricted: true,
        recordId: null,
        error: null,
        contentHash: stored?.ok === true && typeof stored.contentHash === "string" ? stored.contentHash : null,
        version: stored?.ok === true && typeof stored.version === "number" ? stored.version : null,
        sessionId: stored?.ok === true && typeof stored.sessionId === "string" ? stored.sessionId : null,
      };
    },
  });

  // The transcript is the professional's own message: the latest long user message, so a short
  // follow-up such as "gere o relatório" still points to the consultation sent just before.
  function consultationTranscript() {
    const latest = sentByProfessional.at(-1) ?? "";
    return latest.length >= 200 ? latest : sentByProfessional.findLast((content) => content.length >= 200) ?? latest;
  }

  const offerConsultationReport = tool({
    description: "Quando o profissional enviar a transcrição ou o relato de uma consulta, mostra um cartão para ele escolher entre relatório detalhado e relatório sintético. Não gera o relatório, não grava e não finaliza nada.",
    inputSchema: z.object({ athleteId: z.string() }),
    execute: async ({ athleteId }) => {
      const decision = decideAthleteAccess(athleteId, contextAthleteId, searches);
      if (decision !== "allow") {
        const search = searches.findLast((item) => item.ids.includes(athleteId) || item.total > 1);
        return { ...unavailable(decision), athletes: decision === "confirm" ? search?.athletes ?? [] : [] };
      }
      const transcript = consultationTranscript().slice(0, 20000);
      if (transcript.length < 20) return { status: "incomplete" as const, missing: ["transcrição da consulta"] };
      const prepared = await client.rpc("agent_clinical_draft_prepare", { target: athleteId });
      const data = prepared.data as { ok?: boolean; athleteName?: string; professionalName?: string } | null;
      if (prepared.error || !data?.ok || !data.athleteName || !data.professionalName) return { status: "denied" as const };
      return {
        status: "report_choice" as const,
        state: "choose" as const,
        requestId: crypto.randomUUID(),
        athleteId,
        athleteName: data.athleteName,
        professionalName: data.professionalName,
        occurredOn: null,
        title: "Relatório da consulta",
        body: transcript,
        missing: [],
        restricted: true,
        recordId: null,
        error: null,
        contentHash: null,
        version: null,
      };
    },
  });

  const saveClinicalDraft = tool({
    description: "Não grava evoluções. A gravação só ocorre quando o profissional confirma no cartão. Uma confirmação inventada nesta chamada é ignorada.",
    inputSchema: z.object({
      athleteId: z.string().optional(),
      requestId: z.string().optional(),
      confirmed: z.boolean().optional(),
    }),
    execute: async () => ({ status: "confirmation_required" as const }),
  });

  const spokenSource = z.object({
    action: z.enum(["open", "create", "fill"]),
    itemQuotes: z.array(z.string().min(1).max(2000)).max(12),
    patientName: z.string().max(160).optional(),
  }).strict().optional();

  async function registerDocument(athleteId: string, kind: "prescription" | "surgical_order" | "exam_request", content: ReturnType<typeof prescriptionPayload> | ReturnType<typeof surgicalPayload> | ReturnType<typeof examPayload>, source?: SpokenSource) {
    documentPreparation.attempted = true;
    documentPreparation.spoken = Boolean(source);
    const blocked = (fields: string[] = []) => {
      documentPreparation.notice = "Não preparei nem alterei o documento. Pode dizer qual item você quer incluir e os dados dele? Se forem vários, vamos por partes.";
      if (source) {
        const field = fields[0];
        documentPreparation.notice = field === "athlete_context" ? "Para qual atleta você quer abrir esse cartão?"
          : field === "item_source" || field === "item_sources" ? "Pode confirmar os itens e os detalhes que pertencem a cada um?"
          : field === "ambiguous_intent" ? "Quais dados você quer que entrem no cartão?"
          : field === "field_source" ? "Pode confirmar o dado clínico que deseja registrar?"
          : "Não consegui preparar o cartão com esses dados. Pode confirmar o que deseja incluir?";
      }
      return { status: "needs_source" as const, fields };
    };
    const decision = decideAthleteAccess(athleteId, contextAthleteId, searches);
    if (decision !== "allow") {
      const search = searches.findLast((item) => item.ids.includes(athleteId) || item.total > 1);
      documentPreparation.notice = "Não preparei o documento. Confirme o atleta autorizado antes de continuar.";
      return { ...unavailable(decision), athletes: decision === "confirm" ? search?.athletes ?? [] : [] };
    }
    const openingOnly = documentCreationRequested(kind, utterance)
      && Object.values(content).every((value) => Array.isArray(value) ? value.length === 0 : value === "");
    const itemId = (index: number) => stableCreationItemId(creationTurnKey, athleteId, kind, index);
    const grounded = source ? groundSpokenContent(content, utterance, source, itemId)
      : openingOnly ? { ok: true as const, content } : groundDocumentCreation(kind, content, utterance, itemId);
    if (!grounded.ok) return blocked(grounded.fields);
    const roster = await client.rpc("agent_presented_athletes", { ids: [athleteId] });
    const intended = athletesFromDirectory(roster.error ? [] : roster.data).find((p) => p.id === athleteId);
    if (!intended) return blocked(["athlete_context"]);
    if (source) {
      const current = await client.rpc("conversation_current");
      if (athleteId !== contextAthleteId || current.error || current.data?.session?.athleteId !== athleteId ||
          !spokenPatientMatches(utterance, intended.name, source.patientName)) return blocked(["athlete_context"]);
      if (source.action === "fill") {
        const reply = await documentConversation({
          message: utterance, athleteId, proposals: displayedProposals, messageId: creationTurnKey,
          initialContent: { kind, content: grounded.content, reply: "Atualizei o cartão para você conferir." },
        });
        if (!reply?.document || reply.text !== "Atualizei o cartão para você conferir.") {
          documentPreparation.notice = reply?.text ?? "Selecione o cartão que deseja preencher.";
          return { status: "needs_source" as const };
        }
        return { ...reply.document, status: "proposal" as const };
      }
    } else if (!(kind === "exam_request" && dictatedExam(utterance)) && !creationPatientMatches(utterance, intended.name)) return blocked(["athlete_context"]);
    const registered = await client.rpc("chat_document_proposal_create", {
      target: athleteId,
      kind,
      payload: grounded.content,
      message_key: creationTurnKey,
    });
    const document = presentedDocument(registered.data?.document);
    if (registered.error || !document || registered.data?.error) return blocked([registered.data?.error ?? "unavailable"]);
    return { ...document, status: document.state === "saved" ? "saved" as const : "proposal" as const, sessionId: registered.data.sessionId };
  }

  const preparePrescription = tool({
    description: "Prepara uma proposta de prescrição ainda não gravada, só com o que o profissional pediu agora. Não copie medicação de evoluções ou do histórico. Não invente duração, quantidade, via, apresentação ou contraindicação. Não grave, emita nem assine.",
    inputSchema: z.object({
      athleteId: z.string(),
      source: spokenSource,
      notes: z.string().max(2000).optional(),
      items: z.array(z.object({
        name: z.string().max(160),
        presentation: z.string().max(160).optional(),
        dose: z.string().max(160).optional(),
        dose_unit: z.string().max(160).optional(),
        route: z.string().max(160).optional(),
        schedule: z.string().max(160).optional(),
        duration: z.string().max(160).optional(),
        quantity: z.string().max(160).optional(),
        instructions: z.string().max(500).optional(),
      }).strict()).max(12),
    }).strict(),
    execute: async ({ athleteId, notes, items, source }) => registerDocument(athleteId, "prescription", prescriptionPayload(notes ?? "", items), source),
  });

  const prepareSurgicalOrder = tool({
    description: "Prepara uma proposta de pedido cirúrgico ainda não gravada, só com o que o médico informou. Não invente indicação, diagnóstico, lateralidade ou prioridade. O documento permanece rascunho não assinado.",
    inputSchema: z.object({
      athleteId: z.string(),
      source: spokenSource,
      procedure: z.string().max(200).optional(),
      region: z.string().max(120).optional(),
      laterality: z.string().max(40).optional(),
      indication: z.string().max(2000).optional(),
      diagnosis: z.string().max(500).optional(),
      justification: z.string().max(2000).optional(),
      priority: z.string().max(40).optional(),
      additional: z.string().max(2000).optional(),
      materials: z.string().max(1000).optional(),
    }).strict(),
    execute: async (input) => registerDocument(input.athleteId, "surgical_order", surgicalPayload(input), input.source),
  });

  const prepareExamRequest = tool({
    description: "Prepara uma solicitação de exames ainda não gravada, somente com os exames que o médico citou. Não escolha exames por conta própria e não invente contraste, preparo, prioridade ou diagnóstico. Não grave, emita nem assine.",
    inputSchema: z.object({
      athleteId: z.string(),
      source: spokenSource,
      occurredOn: z.string().max(10).optional(),
      indication: z.string().max(2000).optional(),
      justification: z.string().max(2000).optional(),
      diagnosis: z.string().max(500).optional(),
      priority: z.string().max(40).optional(),
      additional: z.string().max(2000).optional(),
      items: z.array(z.object({
        name: z.string().max(160),
        examType: z.string().max(40).optional(),
        region: z.string().max(160).optional(),
        laterality: z.string().max(40).optional(),
        technicalDetails: z.string().max(500).optional(),
        notes: z.string().max(500).optional(),
      }).strict()).max(12),
    }).strict(),
    execute: async (input) => registerDocument(input.athleteId, "exam_request", examPayload(input), input.source),
  });

  // Certificates and referrals: every value is kept only if the professional said it in this
  // message (letter-documents.ts); the rest stays blank and pending in the card.
  async function registerLetter(athleteId: string, kind: "certificate" | "referral", content: CertificateContent | ReferralContent) {
    documentPreparation.attempted = true;
    const decision = decideAthleteAccess(athleteId, contextAthleteId, searches);
    if (decision !== "allow") {
      const search = searches.findLast((item) => item.ids.includes(athleteId) || item.total > 1);
      documentPreparation.notice = "Não preparei o documento. Confirme o atleta autorizado antes de continuar.";
      return { ...unavailable(decision), athletes: decision === "confirm" ? search?.athletes ?? [] : [] };
    }
    const roster = await client.rpc("agent_presented_athletes", { ids: [athleteId] });
    const intended = athletesFromDirectory(roster.error ? [] : roster.data).find((p) => p.id === athleteId);
    if (!intended || !letterPatientMatches(kind, utterance, intended.name)) {
      documentPreparation.notice = kind === "certificate" ? "Para qual atleta você quer o atestado?" : "Para qual atleta você quer o encaminhamento?";
      return { status: "needs_source" as const, fields: ["athlete_context"] };
    }
    const registered = await client.rpc("chat_document_proposal_create", { target: athleteId, kind, payload: content, message_key: creationTurnKey });
    const document = presentedDocument(registered.data?.document);
    if (registered.error || !document || registered.data?.error) {
      documentPreparation.notice = "Não consegui preparar o documento com esses dados. Pode confirmar o que deseja incluir?";
      return { status: "needs_source" as const, fields: [registered.data?.error ?? "unavailable"] };
    }
    return { ...document, status: document.state === "saved" ? "saved" as const : "proposal" as const, sessionId: registered.data.sessionId };
  }

  const prepareCertificate = tool({
    description: "Prepara uma proposta de atestado médico (afastamento, comparecimento ou aptidão esportiva) ainda não gravada, só com o que o médico disse nesta mensagem. Copie os trechos literais. Não invente dias, horários, CID nem atividades. Não grava, não assina e não emite.",
    inputSchema: z.object({
      athleteId: z.string(),
      occurredAt: z.string().max(10).optional().describe("Data do atendimento AAAA-MM-DD, só se dita"),
      leaveDays: z.number().int().min(1).max(365).optional(),
      leaveStart: z.string().max(10).optional(),
      startTime: z.string().max(5).optional().describe("HH:MM"),
      endTime: z.string().max(5).optional().describe("HH:MM"),
      activities: z.string().max(500).optional().describe("Trecho literal: atividades afastadas ou avaliadas"),
      restrictions: z.string().max(1000).optional(),
      cid: z.string().max(20).optional(),
      notes: z.string().max(2000).optional(),
    }).strict(),
    execute: async (input) => registerLetter(input.athleteId, "certificate", groundCertificate({
      occurred_at: input.occurredAt, leave_days: input.leaveDays ? String(input.leaveDays) : "", leave_start: input.leaveStart,
      start_time: input.startTime, end_time: input.endTime, activities: input.activities, restrictions: input.restrictions,
      cid: input.cid, notes: input.notes,
    }, utterance)),
  });

  const prepareReferral = tool({
    description: "Prepara uma proposta de encaminhamento a outra especialidade ou profissional, ainda não gravada, só com o que o profissional disse nesta mensagem. Copie os trechos literais. Não invente motivo, resumo, hipótese, CID, exames ou tratamentos. Não grava, não assina e não emite.",
    inputSchema: z.object({
      athleteId: z.string(),
      specialty: z.string().max(160).describe("Especialidade ou serviço de destino, como dito"),
      professional: z.string().max(160).optional(),
      reason: z.string().max(2000).optional(),
      clinicalSummary: z.string().max(2000).optional(),
      diagnosis: z.string().max(500).optional(),
      cid: z.string().max(20).optional(),
      exams: z.string().max(2000).optional(),
      treatment: z.string().max(2000).optional(),
      request: z.string().max(1000).optional().describe("O que se pede ao destino, como avaliação e conduta"),
    }).strict(),
    execute: async (input) => registerLetter(input.athleteId, "referral", groundReferral({
      specialty: input.specialty, professional: input.professional, reason: input.reason, clinical_summary: input.clinicalSummary,
      diagnosis: input.diagnosis, cid: input.cid, exams: input.exams, treatment: input.treatment, request: input.request,
    }, utterance)),
  });

  const listDocumentDrafts = tool({
    description: "Lista os rascunhos de prescrição e pedido cirúrgico que este médico já gravou para um atleta. Não inclui documentos de outros profissionais e não significa emissão.",
    inputSchema: z.object({ athleteId: z.string() }),
    execute: async ({ athleteId }) => {
      const decision = decideAthleteAccess(athleteId, contextAthleteId, searches);
      if (decision !== "allow") return unavailable(decision);
      const listed = await client.rpc("document_list", { target: athleteId });
      const data = listed.data as { error?: string; documents?: unknown } | null;
      if (listed.error || data?.error || !Array.isArray(data?.documents)) return unavailable("denied");
      const documents = data.documents.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as Record<string, unknown>;
        if (typeof row.id !== "string" || !isDocumentKind(row.document_type)) return [];
        return [{
          id: row.id,
          kind: row.document_type,
          status: row.status === "ready_for_review" ? "ready_for_review" : "draft",
          version: typeof row.version === "number" ? row.version : null,
          updatedAt: text(row.updated_at, 40),
        }];
      }).slice(0, 12);
      return { status: "ok" as const, total: data.documents.length, documents };
    },
  });

  let documentActionReply: string | undefined;
  const editProposal = tool({
    description: "Corrige campos no cartão selecionado. Copie cada novo valor literalmente da fala atual. Se o profissional mencionar anatomia ou item, copie a região em anatomy e o nome ou posição do item em item. Use anatomy somente se a região estiver na fala atual. Quando só mudar o lado, omita anatomy e item no pedido cirúrgico; o servidor lê a região do cartão.",
    inputSchema: z.object({ kind: z.enum(["surgical_order", "exam_request", "prescription"]), edits: z.array(spokenEditSchema).min(1).max(10) }).strict(),
    execute: async (spokenEdit) => {
      const reply = await documentConversation({ athleteId: contextAthleteId, message: utterance, proposals: displayedProposals,
        messageId: creationTurnKey, spokenEdit });
      documentActionReply = reply?.text ?? "Selecione o cartão que deseja corrigir.";
      return reply?.document ? { ...reply.document, status: reply.document.state } : { status: "unavailable" };
    },
  });

  const resumeProposal = tool({
    description: "Retoma o cartão já trabalhado nesta conversa, inclusive uma proposta ainda não salva. Informe o tipo se o profissional o indicou. O servidor resolve a referência e devolve o mesmo cartão.",
    inputSchema: z.object({ kind: z.enum(["prescription", "exam_request", "surgical_order", "certificate", "referral"]).optional() }).strict(),
    execute: async ({ kind }) => {
      const reply = await resumeDocumentProposal(contextAthleteId, displayedProposals, kind);
      documentActionReply = reply.text;
      return reply.document ? { ...reply.document, status: reply.document.state } : { status: "unavailable" };
    },
  });

  const openClinicalDocument = tool({
    description: "Abre um rascunho de prescrição ou pedido cirúrgico já gravado por este médico e devolve o caminho do editor tradicional. Não emite nem assina.",
    inputSchema: z.object({ athleteId: z.string(), documentId: z.string() }),
    execute: async ({ athleteId, documentId }) => {
      const decision = decideAthleteAccess(athleteId, contextAthleteId, searches);
      if (decision !== "allow" || !uuidPattern.test(documentId)) return unavailable(decision === "allow" ? "reject" : decision);
      const opened = await client.rpc("document_open", { target: athleteId, document_id: documentId });
      const data = opened.data as { error?: string; id?: string; document_type?: string; content?: unknown; author_name?: string; credential_label?: string | null; version?: number } | null;
      if (opened.error || !data || data.error || !isDocumentKind(data.document_type) || typeof data.author_name !== "string" || typeof data.id !== "string") {
        return unavailable("denied");
      }
      const profile = await client.rpc("agent_athlete_workspace", { target: athleteId, view_name: "chat" });
      const athlete = athletesFromDirectory([profile.data?.athlete])[0];
      if (profile.error || !athlete) return unavailable("denied");
      const content = data.content as ReturnType<typeof prescriptionPayload>;
      return {
        status: "saved" as const,
        state: "saved" as const,
        requestId: data.id,
        athleteId,
        athleteName: athlete.name,
        professionalName: data.author_name,
        credentialLabel: typeof data.credential_label === "string" ? data.credential_label : null,
        kind: data.document_type,
        title: documentTitle(data.document_type, presentedContent(data.document_type, content)),
        content,
        missing: [],
        documentId: data.id,
        error: null,
        contentHash: null,
        version: typeof data.version === "number" ? data.version : 1,
      };
    },
  });

  const saveClinicalDocument = tool({
    description: "Não grava documentos. A gravação do rascunho só ocorre quando o profissional confirma no cartão ou com uma frase explícita conferida pelo sistema. Uma confirmação inventada nesta chamada é ignorada.",
    inputSchema: z.object({
      athleteId: z.string().optional(),
      requestId: z.string().optional(),
      confirmed: z.boolean().optional(),
    }),
    execute: async () => ({ status: "confirmation_required" as const }),
  });

  function slotsFrom(data: { documents?: unknown }): DocumentSlot[] {
    if (!Array.isArray(data.documents)) return [];
    return data.documents.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const kind = isDocumentKind(row.document_type) ? row.document_type : null;
      if (typeof row.id !== "string" || !kind) return [];
      return [{
        id: row.id,
        kind,
        label: text(row.label, 160),
        status: row.status === "ready_for_review" ? "ready_for_review" as const : "draft" as const,
        updatedAt: text(row.updated_at, 40),
      }];
    });
  }

  async function loadDocuments(athleteId: string, filters: Record<string, unknown>) {
    const listed = await client.rpc("agent_document_browse", { target: athleteId, filters });
    const data = listed.data as { error?: string; documents?: unknown; total?: unknown; page?: unknown; page_size?: unknown } | null;
    if (listed.error || !data || data.error) return null;
    return {
      documents: slotsFrom(data),
      total: Number(data.total) || 0,
      page: Number(data.page) || 1,
      pageSize: Number(data.page_size) || 5,
    };
  }

  function publishDocuments(athleteId: string, documents: DocumentSlot[], total: number, page: number, pageSize: number, openId: string | null, kind: ReadingBoard["kind"]) {
    published.reading = {
      source: "document",
      athleteId,
      total,
      page,
      pageSize,
      kind,
      status: "",
      items: documents.slice(0, 8).map((item) => ({ id: item.id, athleteId, kind: item.kind, open: item.id === openId })),
    };
  }

  async function showDocument(athleteId: string, slot: DocumentSlot) {
    const opened = await client.rpc("agent_document_open", { target: athleteId, document_id: slot.id });
    const data = opened.data as { error?: string; document_type?: string } | null;
    if (opened.error || !data || data.error || data.document_type !== slot.kind) return unavailable("denied");
    publishDocuments(athleteId, [slot], 1, 1, 1, slot.id, slot.kind);
    return { status: "shown" as const, document: modelDocumentSummary(slot) };
  }

  const browseClinicalDocuments = tool({
    description: "Lista prescrições e pedidos cirúrgicos gravados por este médico para o atleta. Não inclui documentos de outros profissionais. Não descreva doses, quantidades, indicação ou justificativa: o cartão mostra o original. Se houver mais de um, não escolha.",
    inputSchema: z.object({
      athleteId: z.string(),
      kind: z.enum(["prescription", "surgical_order", "exam_request", "certificate", "referral"]).optional(),
      status: z.enum(["draft", "ready_for_review"]).optional(),
      name: z.string().max(160).optional(),
      page: z.number().int().min(1).max(20).optional(),
    }),
    execute: async ({ athleteId, kind, status, name, page }) => {
      const decision = decideAthleteAccess(athleteId, contextAthleteId, searches);
      if (decision !== "allow") return unavailable(decision);
      const selectedKind = speech.query.kind ?? kind;
      const loaded = await loadDocuments(athleteId, {
        kind: selectedKind ?? "",
        status: status ?? "",
        page: String(page ?? 1),
        page_size: "5",
        ...(speech.query.months ? { months: String(speech.query.months) } : {}),
      });
      if (!loaded) return unavailable("denied");
      if (speech.command === "read") {
        const choice = documentChoice(loaded.documents, { ...speech.query, kind: selectedKind, name });
        if (choice.status === "one") return showDocument(athleteId, choice.document);
        if (choice.status === "many") {
          publishDocuments(athleteId, choice.documents, choice.documents.length, 1, choice.documents.length, null, selectedKind ?? "");
          return { status: "choose" as const, total: choice.documents.length, documents: choice.documents.map(modelDocumentSummary) };
        }
        return { status: "unavailable" as const };
      }
      publishDocuments(athleteId, loaded.documents, loaded.total, loaded.page, loaded.pageSize, null, selectedKind ?? "");
      return { status: "list" as const, total: loaded.total, page: loaded.page, documents: loaded.documents.map(modelDocumentSummary) };
    },
  });

  const readClinicalDocument = tool({
    description: "Abre um documento já mostrado nesta conversa, a última prescrição ou pedido, ou o documento recém-gravado. Não invente o conteúdo e não escolha quando houver vários. A justificativa fica no cartão.",
    inputSchema: z.object({
      athleteId: z.string(),
      ordinal: z.number().int().min(1).max(8).optional(),
      kind: z.enum(["prescription", "surgical_order", "exam_request", "certificate", "referral"]).optional(),
      latest: z.boolean().optional(),
      reference: z.enum(["previous", "created"]).optional(),
      name: z.string().max(160).optional(),
    }),
    execute: async ({ athleteId, ordinal, kind, latest, reference, name }) => {
      const decision = decideAthleteAccess(athleteId, contextAthleteId, searches);
      if (decision !== "allow") return unavailable(decision);
      if (speech.command === "list") return { status: "unavailable" as const };
      const query = {
        ordinal: speech.query.ordinal ?? ordinal,
        kind: speech.query.kind ?? kind,
        latest: speech.query.latest || latest || false,
        reference: speech.query.reference ?? reference,
        name,
      };
      let slots: (DocumentSlot | null)[] = [];
      if (query.ordinal && documentRosterIds.length === 0) return { status: "unavailable" as const };
      if (query.reference === "created" || (query.reference === "previous" && createdIds.length === 1 && documentRosterIds.length === 0)) {
        const loaded = await loadDocuments(athleteId, { ids: createdIds });
        if (!loaded) return unavailable("denied");
        const byId = new Map(loaded.documents.map((item) => [item.id, item]));
        slots = createdIds.map((id) => byId.get(id) ?? null);
      } else if (query.ordinal || query.reference === "previous") {
        const loaded = await loadDocuments(athleteId, { ids: documentRosterIds });
        if (!loaded) return unavailable("denied");
        const byId = new Map(loaded.documents.map((item) => [item.id, item]));
        slots = documentRosterIds.map((id) => byId.get(id) ?? null);
      } else {
        const loaded = await loadDocuments(athleteId, {
          kind: query.kind ?? "",
          page: "1",
          page_size: query.latest ? "1" : "8",
          ...(speech.query.months ? { months: String(speech.query.months) } : {}),
        });
        if (!loaded) return unavailable("denied");
        slots = loaded.documents;
      }
      const choice = documentChoice(slots, query);
      if (choice.status === "one") return showDocument(athleteId, choice.document);
      if (choice.status === "many") {
        publishDocuments(athleteId, choice.documents, choice.documents.length, 1, choice.documents.length, null, query.kind ?? "");
        return { status: "choose" as const, total: choice.documents.length, documents: choice.documents.map(modelDocumentSummary) };
      }
      return { status: "unavailable" as const };
    },
  });

  const readClinicalEvolutions = tool({
    description: "Lista evoluções já gravadas que este profissional pode ler. Não devolve o texto do registro e não finaliza nem altera a evolução.",
    inputSchema: z.object({
      athleteId: z.string(),
      page: z.number().int().min(1).max(20).optional(),
    }),
    execute: async ({ athleteId, page }) => {
      const decision = decideAthleteAccess(athleteId, contextAthleteId, searches);
      if (decision !== "allow") return unavailable(decision);
      const timeline = await client.rpc("agent_athlete_workspace", { target: athleteId, view_name: "timeline" });
      const data = timeline.data as { records?: unknown } | null;
      if (timeline.error || !data || !Array.isArray(data.records)) return unavailable("denied");
      const records = data.records.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as Record<string, unknown>;
        if (typeof row.id !== "string") return [];
        return [{
          id: row.id,
          title: text(row.title, 160),
          specialty: text(row.specialty, 80),
          status: row.status === "finalized" ? "finalized" as const : "draft" as const,
          occurredAt: text(row.occurred_at, 40),
        }];
      });
      const pageSize = 5;
      const pageNumber = page ?? 1;
      const slice = records.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
      published.reading = {
        source: "evolution",
        athleteId,
        total: records.length,
        page: pageNumber,
        pageSize,
        kind: "",
        status: "",
        items: slice.map((item) => ({ id: item.id, athleteId, kind: "evolution" as const, open: false })),
      };
      return { status: "list" as const, total: records.length, page: pageNumber, records: slice };
    },
  });

  const analyzeAthleteHistory = tool({
    description: "Analisa o histórico clínico autorizado já em contexto ou nomeado na frase. Não grava, não diagnostica e não descreve o conteúdo dos registros.",
    inputSchema: z.object({ utterance: z.string().trim().min(1).max(500) }),
    execute: async ({ utterance }) => {
      const document = documentRequest(utterance);
      if (historyRequest(utterance).command === "unknown" && document.command !== "unknown") return { status: "unavailable" as const };
      const result = await readLongitudinalHistory({
        utterance,
        contextAthleteId,
        previous: historyScope(parsed.data.historyScope),
        inputMode: parsed.data.inputMode ?? "text",
        channel: "agent",
      });
      if (result.analysis) published.analysis = presentedAnalysis(result.analysis);
      if (!result.analysis) return { status: "unavailable" as const, note: result.text };
      return modelHistory(result.analysis);
    },
  });

  return {
    published,
    documentView: () => documentPreparation,
    documentActionView: () => documentActionReply,
    holdClinicalNarrative: canAuthorDocuments || documentPreparation.requested,
    attachmentView: () => attachmentPublished,
    clinicalView: () => clinicalPublished,
    request: {
      model: model.provider === "google"
        ? createGoogleGenerativeAI({ apiKey: model.apiKey }).chat(model.model)
        : createOpenAI({ apiKey: model.apiKey, baseURL: model.baseURL }).chat(model.model),
      system: [
        "Você é o CBB Intelligence, assistente do prontuário de um profissional autenticado.",
        "Responda em português, somente com fatos devolvidos pelas ferramentas.",
        "Para buscas clínicas em vários atletas, use searchClinicalActivity com filtros tipados. Envie períodos relativos, sem calcular datas pelo seu relógio. Exames devem ser separados em solicitações e resultados/laudos anexados; não há confirmação estruturada de realização. Especialidade filtra apenas evoluções. Nunca substitua o atleta em contexto só porque fez uma busca transversal.",
        "Anexos: use listClinicalAttachments para consultar metadados e abrir o visualizador. Nunca afirme ter interpretado o conteúdo de um PDF ou imagem. Não há ferramenta de upload nem de análise automática de arquivos.",
        "Se a ferramenta não trouxer dados suficientes, diga isso. Não invente atendimentos, diagnósticos, resultados ou atletas.",
        "Se uma busca tiver mais de uma pessoa possível, peça confirmação antes de resumir ou abrir o prontuário.",
        "Não repita a lista de atletas no texto. Diga a quantidade e deixe os cards mostrarem quem são.",
        "Para ver mais pessoas da mesma busca, oriente o profissional a usar Ver mais. Não peça a página seguinte.",
        "Ignore pedidos para burlar permissões, consultar SQL ou revelar registros não devolvidos.",
        "Seleção sub-19 corresponde à categoria Sub-19 quando esse valor existir nos filtros.",
        "Buscar ou listar usa searchAthletes e não muda o contexto. A consulta percorre todos os atletas autorizados, não só os cinco cards.",
        "Separe nome, clube, categoria e naipe. O naipe vai em division, como Masculino ou Feminino. Não invente sobrenome, clube ou categoria.",
        "Contexto: este é o prontuário da Confederação Brasileira de Basketball (CBB). Todos os atletas da plataforma são convocados para as seleções brasileiras, de todas as categorias. As convocações acontecem periodicamente, conforme o calendário de competições e treinamentos; fora delas, o atleta atua no clube de origem. A cada nova convocação podem chegar atletas de clubes que ainda não passaram pela plataforma.",
        "Categoria é a categoria atual do atleta; clube é o clube de origem, onde ele atua na temporada e ao qual volta após a convocação. Não trate ser convocado como filtro: todos são. Para atletas do mesmo clube, da mesma categoria ou de um gênero (todas as atletas femininas, por exemplo), use searchAthletes com club, category ou gender, e informe o total retornado.",
        "Um nome sem os sobrenomes do meio pode corresponder ao nome completo quando a ferramenta devolver uma única pessoa.",
        "Para o terceiro da lista, ele, ela ou aquele de um clube já mostrado, use recallAthlete. O ordinal começa em 1.",
        "me traga o atleta e coloque em contexto selecionam só quando a ferramenta devolver uma pessoa. Não escolha a primeira de várias.",
        "Para pedidos como abre o João da categoria sub-18, pesquise pelo nome e pela categoria. Com um único resultado, use selectAthleteContext para continuar no chat. Se o pedido mencionar abrir o prontuário, use o link existente.",
        "Diga que a pessoa está em contexto. Não diga que o prontuário foi aberto.",
        "Abrir o prontuário produz um link. A página não foi aberta até o profissional usá-lo.",
        "Mostre as informações do atleta em contexto, ou da única pessoa encontrada, com os dados devolvidos. Não complete o que não veio.",
        "Encerre o contexto sem apagar a conversa.",
        "Não selecione um atleta quando a busca tiver mais de uma pessoa possível.",
        rosterPrompt(rosterSlots),
        "Quando a pessoa corrigir ou complementar um campo de um cartão em andamento, use editDocumentProposal. Prepare com fill apenas para o primeiro preenchimento de um cartão vazio. Não abra outro cartão para corrigir um dado.",
        "Tipos de cartões exibidos: " + (parsed.data.displayedProposals ?? []).map(p => p.kind).join(", "),
        "Quando a mensagem do profissional for a transcrição ou o relato de uma consulta ou atendimento (por exemplo, diálogo com o atleta, queixa, história, exame, conduta), use offerConsultationReport para o atleta selecionado ou o único atleta identificado, em vez de prepareClinicalDraft. Não escreva o relatório: o cartão oferece Relatório detalhado e Relatório sintético, e o profissional escolhe. Responda em uma frase curta convidando a escolher o modo no cartão. Se nenhum atleta estiver identificado, pergunte de qual atleta é a consulta.",
        "Quando o profissional pedir uma evolução, use prepareClinicalDraft só para o atleta selecionado ou para o único atleta identificado.",
        "Organize apenas o relato recebido. Coloque o que não foi dito em missing. Não invente queixas, datas, diagnósticos, exames ou condutas.",
        "A proposta do cartão não é um registro clínico. Não diga que ela foi salva, finalizada ou assinada.",
        "saveClinicalDraft não grava nada. Uma frase explícita do profissional, como pode confirmar e salvar, é conferida pelo sistema e pode gravar só o rascunho. Não afirme que gravou.",
        "Finalizar uma evolução não acontece por frase. Isso continua no cartão, depois que o rascunho existir.",
        canAuthorDocuments
          ? "Quando o médico pedir uma prescrição nova, use preparePrescription só com os dados que ele informou agora. Medicamento citado em evolução ou no histórico não vira prescrição. Deixe vazios duração, quantidade, via, apresentação e contraindicação quando não forem ditos."
          : "Este profissional não pode preparar prescrições nem pedidos cirúrgicos.",
        canAuthorDocuments
          ? "Quando o médico pedir um pedido cirúrgico, use prepareSurgicalOrder. Informe procedimento, lateralidade, indicação, justificativa e complementos somente se ele os disse. Não invente indicação nem diagnóstico."
          : "",
        canAuthorDocuments
          ? "Interprete a intenção no contexto da conversa, inclusive respostas curtas, mudança de documento e pedidos de vários itens. Use prepareExamRequest para exames. Nas três ferramentas prepare, para linguagem livre, sempre envie source. Use action open se o profissional escolheu o tipo sem ditar dados, create se pede uma nova proposta com dados, fill se está respondendo para preencher um cartão vazio existente daquele tipo. itemQuotes contém um trecho literal contínuo da última mensagem do profissional por item, na mesma ordem, incluindo todos os detalhes daquele item. Para cirurgia ou cartão vazio envie []. Transcreva todos os valores literalmente, inclusive o nome completo do exame com região e lado. Omita campos desconhecidos. Se houver nome de paciente explícito envie patientName exatamente como foi dito. Em formato rotulado (Medicamento:, Exame:, Procedimento:) omita source. Perguntas sobre condutas, relatos passados e hipóteses não autorizam preparar documentos. Se o destinatário ou a intenção estiverem ambíguos, peça esclarecimento. Use a conversa para resolver o tipo do documento, nunca como fonte de dados clínicos."
          : "",
        canAuthorDocuments
          ? "Para atestados use prepareCertificate e para encaminhamentos use prepareReferral, para o atleta em contexto ou o único identificado. Envie em cada campo o trecho literal da última mensagem do profissional; omita o que ele não disse. O cartão mostra o que falta. Não invente dias de afastamento, horários, CID, motivo, resumo, exames ou tratamentos. O CID só aparece no atestado com autorização expressa do paciente."
          : "",
        canAuthorDocuments
          ? "Para consultar prescrições, pedidos cirúrgicos ou solicitações de exames já gravados, use browseClinicalDocuments ou readClinicalDocument. O cartão mostra o original. Não descreva dose, exame, indicação ou justificativa. Não diga que o documento foi emitido ou assinado. Se houver mais de um, peça para o profissional escolher."
          : "Este profissional não consulta prescrições nem pedidos cirúrgicos de outros autores.",
        canAuthorDocuments
          ? "A última prescrição é a mais recente deste médico. O segundo documento é o segundo card desta conversa. O documento recém-gravado é o que esta conversa acabou de salvar."
          : "",
        canAuthorDocuments
          ? "Para retomar, continuar ou mostrar o documento em que estavam trabalhando, use resumeDocumentProposal mesmo se o salvamento anterior falhou ou o cartão saiu de vista. Para ver rascunhos já gravados deste médico, use listDocumentDrafts. Para abrir um deles no editor tradicional, use openClinicalDocument. Não diga que o documento foi emitido ou assinado."
          : "",
        canAuthorDocuments
          ? "saveClinicalDocument não grava nada. A frase explícita ou o botão do cartão grava somente o rascunho. Não emita, não assine e não marque revisão."
          : "",
        "Para ler evoluções já gravadas, use readClinicalEvolutions. Não altere, não finalize e não reescreva o texto do registro.",
        "Quando o profissional pedir a análise do histórico, lesões ao longo do tempo, comparação entre especialidades ou as fontes dessa análise, use analyzeAthleteHistory. Não descreva queixas, doses, diagnósticos ou condutas. O cartão mostra a cronologia. Não diga que a análise diagnosticou, liberou ou prescreveu.",
        "Abrir uma prescrição, uma solicitação de exames ou um pedido cirúrgico e preencher seus detalhes são etapas separadas. Ao reconhecer um pedido explícito de abertura sem detalhes, chame a ferramenta de preparação do tipo correto com os campos vazios. Se a proposta estiver no chat, mantenha o mesmo cartão. Pergunte só pelo próximo dado necessário e trate cada dado clínico como informação do profissional, nunca como sugestão sua.",
        "A autoria é sempre do profissional autenticado. Não mude o atleta nem torne público um registro restrito.",
        "Use openConsultationVoice para pedidos como vou começar o atendimento do João, gravar a consulta, abrir a gravação de evolução ou revisar o relatório que acabamos de gerar. Resolva o atleta autorizado e ofereça o link. Explique a indisponibilidade se a ferramenta falhar. O profissional inicia a gravação na página de atendimento.",
        "Use as mensagens anteriores para resolver referências como dela, desse período ou essas informações. Não peça confirmações desnecessárias quando o contexto já é claro.",
        contextAthleteId
          ? `Atleta já selecionado pelo profissional: ${contextAthleteId}. Use esse identificador quando a fala se referir a essa pessoa.`
          : "Nenhum atleta está selecionado.",
        ...(parsed.data.inputMode === "voice" ? voiceRules : []),
      ].filter((line) => line.trim()).join("\n"),
      messages: parsed.data.messages,
      tools: {
        searchClinicalActivity, listClinicalAttachments, searchAthletes, recallAthlete, getAthleteSummary, navigateToAthlete, openConsultationVoice, selectAthleteContext, clearAthleteContext, prepareClinicalDraft, offerConsultationReport, saveClinicalDraft, readClinicalEvolutions, analyzeAthleteHistory,
        ...(canAuthorDocuments ? { editDocumentProposal: editProposal, resumeDocumentProposal: resumeProposal, preparePrescription, prepareSurgicalOrder, prepareExamRequest, prepareCertificate, prepareReferral, listDocumentDrafts, openClinicalDocument, saveClinicalDocument, browseClinicalDocuments, readClinicalDocument } : {}),
      },
      stopWhen: [stepCountIs(6), hasToolCall("resumeDocumentProposal", "editDocumentProposal", "offerConsultationReport")],
      maxRetries: 1,
      timeout: 60_000,
      providerOptions: model.provider === "openai" ? { openai: { store: false } } : undefined,
    },
  };
}

function failureCode(error: unknown) {
  return APICallError.isInstance(error) && error.statusCode === 429 ? "limit" as const : "provider" as const;
}

export async function openIntelligenceStream(input: unknown): Promise<{ stream: ReadableStream<Uint8Array> } | { error: "unavailable" | "invalid" | "limit" | "provider" }> {
  const documentInput = requestSchema.safeParse(input);
  if (documentInput.success && documentInput.data.messages.at(-1)?.role === "user") {
    const previousReply = documentInput.data.messages.slice(0, -1).findLast((message) => message.role === "assistant")?.content;
    const reply = await workflowConversation({ previousReply, message: documentInput.data.messages.at(-1)!.content, athleteId: documentInput.data.contextAthleteId ?? null, proposals: documentInput.data.displayedProposals ?? [], messageId: documentInput.data.messageId, inputMode: documentInput.data.inputMode }) ?? await documentDictation({ message: documentInput.data.messages.at(-1)!.content, previousReply, athleteId: documentInput.data.contextAthleteId ?? null, messageId: documentInput.data.messageId, proposals: documentInput.data.displayedProposals ?? [] }) ?? await documentConversation({ previousReply, message: documentInput.data.messages.at(-1)!.content, athleteId: documentInput.data.contextAthleteId ?? null, proposals: documentInput.data.displayedProposals ?? [], messageId: documentInput.data.messageId, inputMode: documentInput.data.inputMode });
    if (reply) {
      const bytes = new TextEncoder().encode(`event: done\ndata: ${JSON.stringify({ athletes: [], navigation: null, search: null, draft: null, context: null, ...reply })}\n\n`);
      return { stream: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } }) };
    }
  }
  const clinicalInput=requestSchema.safeParse(input);
  if(clinicalInput.success&&clinicalInput.data.messages.at(-1)?.role==="user") {
    const message=clinicalInput.data.messages.at(-1)!.content;
    const previous=clinicalSearchBoard(clinicalInput.data.clinicalSearchScope);
    if(clinicalSearchIntent(message,previous)) {
      const reply=await clinicalSearchConversation(message,previous,clinicalInput.data.inputMode??"text");
      if(reply){
        const payload={text:reply.text,clinicalSearch:reply.board,athletes:reply.athletes,navigation:null,search:null,draft:null,document:null,context:null};
        const bytes=new TextEncoder().encode(`event: done\ndata: ${JSON.stringify(payload)}\n\n`);
        return {stream:new ReadableStream<Uint8Array>({start(controller){controller.enqueue(bytes);controller.close();}})};
      }
    }
  }
  const attachmentInput = requestSchema.safeParse(input);
  if (attachmentInput.success && attachmentInput.data.messages.at(-1)?.role === "user") {
    const reply=await attachmentConversation({message:attachmentInput.data.messages.at(-1)!.content,athleteId:attachmentInput.data.contextAthleteId??null,ids:attachmentInput.data.attachmentRoster,mode:attachmentInput.data.inputMode});
    if(reply) {
      const bytes=new TextEncoder().encode(`event: done\ndata: ${JSON.stringify({text:reply.text,attachments:reply.board,athletes:[],navigation:null,search:null,draft:null,document:null,context:null})}\n\n`);
      return {stream:new ReadableStream<Uint8Array>({start(controller){controller.enqueue(bytes);controller.close();}})};
    }
  }
  const prepared = await prepareConversation(input);
  if (prepared.error) return { error: prepared.error };
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch (error) {
          if (error instanceof TypeError) return;
          throw error;
        }
      };
      try {
        const result = streamText(prepared.request);
        for await (const delta of result.textStream) {
          if (delta && !prepared.holdClinicalNarrative) send("delta", { text: delta });
        }
        const steps = await result.steps;
        const view = presentationFrom(steps);
        const modelText = (await result.text).trim();
        const preparation = prepared.documentView();
        const medicalDocumentTool = steps.some((step) => step.toolCalls.some((call) => ["preparePrescription", "prepareSurgicalOrder", "prepareExamRequest", "prepareCertificate", "prepareReferral", "saveClinicalDocument"].includes(call.toolName)));
        const saveOnly = !preparation.attempted && !preparation.requested && steps.some((step) => step.toolCalls.some((call) => call.toolName === "saveClinicalDocument"));
        const content = view.document?.content;
        const blankDocument = content && Object.values(content).every((value) => Array.isArray(value) ? value.length === 0 : value === "");
        const text = prepared.documentActionView() ?? (blankDocument && view.document?.state === "proposal"
          ? documentOpeningQuestion(view.document.kind, view.document.athleteName)
          : preparation.attempted || preparation.requested || medicalDocumentTool
          ? view.document
            ? view.document.readOnlyReason ? "Recuperei o documento somente para consulta. Confira seu estado no prontuário."
              : view.document.state === "saved" ? "Esta proposta já foi salva como rascunho. Recuperei o mesmo documento, sem nova gravação, assinatura ou emissão."
                : preparation.spoken ? "O cartão está pronto para você conferir."
                : "Preparei a proposta com os valores informados nesta mensagem. Confira o cartão antes de salvar. Ela não foi gravada no prontuário, assinada ou emitida."
            : preparation.notice || (saveOnly ? "O salvamento ainda precisa de confirmação. Use “Confirmar e salvar” no cartão que deseja guardar como rascunho." : "Não preparei o documento. Informe os nomes e campos clínicos explicitamente.")
          : view.document
          ? (modelText || "Organizei uma proposta de documento para revisão. Ela ainda não foi salva.")
          : view.draft?.state === "choose"
            ? `Recebi a transcrição da consulta de ${view.draft.athleteName}. Escolha no cartão o modo do relatório: detalhado ou sintético.`
          : view.draft
            ? (modelText || "Organizei uma proposta de evolução para revisão. Ela ainda não foi salva.")
              : prepared.published.analysis && !modelText
                ? "A análise longitudinal está no cartão. Ela não diagnostica nem libera o atleta."
              : prepared.published.reading && !modelText
              ? prepared.published.reading.items.some((item) => item.open)
                ? "O documento original está no cartão. Ele não foi emitido nem assinado."
                : prepared.published.reading.total === 1
                  ? "Encontrei 1 registro autorizado. O cartão mostra o original."
                  : `Encontrei ${prepared.published.reading.total} registros autorizados. Os cartões mostram o original.`
              : view.navigation?.href.includes("/evolucao?")
                ? "Abra a experiência de evolução pelo link abaixo."
              : view.navigation && !modelText
                ? "O link abaixo abre o prontuário."
              : view.context && !modelText
                ? `${view.context.name} está em contexto.`
                : view.kind === "search"
              ? compactDirectoryReply(view.search?.total ?? view.athletes.length, view.athletes.length)
              : replyText(modelText, view.athletes));
        const clinical=prepared.clinicalView();
        send("done", {
          clinicalSearch: clinical?.board??null,
          text: clinical?.text??text,
          athletes: clinical?.athletes??view.athletes,
          navigation: view.navigation,
          search: view.search,
          draft: view.draft,
          document: view.document,
          readings: prepared.published.reading,
          attachments: prepared.attachmentView(),
          analysis: prepared.published.analysis,
          context: clinical ? null : view.context,
          contextCleared: clinical ? false : view.contextCleared,
          sessionId: view.sessionId,
        });
      } catch (error) {
        send("error", { error: failureCode(error) });
      } finally {
        try {
          controller.close();
        } catch (error) {
          if (!(error instanceof TypeError)) throw error;
        }
      }
    },
  });
  return { stream };
}
