"use client";

import { ClinicalSearchCards } from "../clinical-search/cards";
import { clinicalSearchBoard, previousClinicalSearch, type ActivityResult } from "../clinical-search/contract";
import { AttachmentUpload } from "../attachments/upload";
import { AttachmentCards } from "../attachments/module";
import { attachmentBoard, attachmentCategories } from "../attachments/types";
import { attachmentRoster, uploadRequest, type UploadRequest } from "../attachments/conversation";
import { allowAttachmentContextChange, hasPendingAttachment } from "../attachments/pending";
import Image from "next/image";
import { AccountMenu } from "../../components/account-menu";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Icon, type IconName } from "../../components/icon";
import { conversationFailure, parseConversation, parseHistory, postConversation, sessionIdFrom, type ConversationSummary } from "./conversation";
import { ClinicalDraftCard } from "./clinical-draft-card";
import { draftSaveMessage, presentedDraft } from "./clinical-draft";
import { DocumentDraftCard } from "./document-draft-card";
import { displayedDocumentProposals, isDocumentKind, presentedDocument, type DocumentDraft } from "./document-draft";
import { confirmSpokenDraft, offerConsultationFromAudio } from "./clinical-draft-actions";
import { athleteCardLine, compactDirectoryReply, presentedAthletes, presentedContext, presentedNavigation, presentedSearch, uuidPattern, type PresentedAthlete, type PresentedSearch } from "./guards";
import { HomeGreeting } from "./home-greeting";
import { ProcessingIndicator } from "./processing-indicator";
import { MessageComposer } from "./message-composer";
import { MessageText } from "./message-text";
import { presentedRoster } from "./athlete-resolution";
import { ClinicalReadings } from "./clinical-reading";
import { historyRequest, presentedAnalysis, type HistoryAnalysis } from "./history-analysis";
import { LongitudinalCard } from "./longitudinal-card";
import { createdDocumentIds, presentedDocumentRoster, presentedReadings, type ReadingBoard, type ReadingRef } from "./document-resolution";
import { conversationSnapshot, discardInactiveTranscript, loadScroll, loadTurns, readConversationSnapshot, rememberServerSnapshot, replaceTurns, saveScroll, subscribeTurns, transcriptFollowsServer, turnCarriesContent, turnsFrom, updateDocumentTurn, type ChatTurn } from "./transcript";
import { hasUnsavedClinicalDraft, setUnsavedClinicalDraft } from "../clinical/unsaved";
import { useDictation } from "./voice/use-dictation";
import { DictationButton, DictationStatus } from "./voice/dictation-control";
import { ConsultationAudioButton, ConsultationAudioStatus } from "./voice/consultation-audio-control";
import { useConsultationAudio } from "./voice/use-consultation-audio";
import { joinSegments } from "./voice/transcription";
import "./intelligence.css";

const shortcuts: { href: string; label: string; icon: IconName; audit?: boolean }[] = [
  { href: "/", label: "CBB Intelligence", icon: "chat" },
  { href: "/atletas", label: "Atletas", icon: "athletes" },
  { href: "/auditoria", label: "Auditoria", icon: "audit", audit: true },
];

const historyDate = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function historyWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return historyDate.format(date);
}

const panelsKey = "cbb-intelligence-panels:v1";
const panelsOpen = { history: false, context: false };
type PanelPreference = { history: boolean; context: boolean };
let panelSnapshot: PanelPreference = panelsOpen;
let panelRaw = "";
const panelListeners = new Set<() => void>();

function parsePanels(raw: string): PanelPreference {
  if (!raw) return panelsOpen;
  try {
    const value = JSON.parse(raw) as Partial<PanelPreference>;
    const next = { history: value.history === true, context: value.context === true };
    return next.history || next.context ? next : panelsOpen;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return panelsOpen;
  }
}

function readPanels() {
  const raw = sessionStorage.getItem(panelsKey) ?? "";
  if (raw === panelRaw) return panelSnapshot;
  panelRaw = raw;
  panelSnapshot = parsePanels(raw);
  return panelSnapshot;
}

function subscribePanels(listener: () => void) {
  panelListeners.add(listener);
  return () => panelListeners.delete(listener);
}

function storePanels(next: PanelPreference) {
  const normalized = next.history || next.context ? next : panelsOpen;
  const raw = normalized === panelsOpen ? "" : JSON.stringify(normalized);
  if (raw) sessionStorage.setItem(panelsKey, raw);
  else sessionStorage.removeItem(panelsKey);
  panelRaw = raw;
  panelSnapshot = normalized;
  for (const listener of panelListeners) listener();
}

function revealContextPanel() {
  const current = readPanels();
  if (current.context) storePanels({ history: current.history, context: false });
}

function subscribeNarrow(listener: () => void) {
  const query = window.matchMedia("(max-width: 760px)");
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

function readNarrow() {
  return window.matchMedia("(max-width: 760px)").matches;
}

const replies = {
  unavailable: "O assistente está indisponível no momento. A interface tradicional continua disponível.",
  invalid: "Não foi possível ler essa mensagem.",
  limit: "O limite de uso desta conversa foi atingido. Tente novamente em alguns minutos.",
  provider: "Não foi possível consultar o assistente agora. Tente novamente em alguns instantes.",
} as const;

function replyFor(code: unknown) {
  if (code === "unavailable" || code === "invalid" || code === "limit" || code === "provider") return replies[code];
  return replies.provider;
}

function AthleteResults({
  turn,
  selectedId,
  pending,
  error,
  onSelect,
  onMore,
}: {
  turn: ChatTurn;
  selectedId: string | null;
  pending: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onMore: (id: string) => void;
}) {
  if (turn.athletes.length === 0) return null;
  const total = turn.search?.total ?? turn.athletes.length;
  const canMore = Boolean(turn.search && turn.athletes.length < turn.search.total && turn.search.page < 40);
  return (
    <div className="ia-results">
      <ul className="ia-cards">
        {turn.athletes.map((athlete) => {
          const line = athleteCardLine(athlete);
          return (
            <li key={athlete.id} className="ia-card">
              <button type="button" aria-pressed={selectedId === athlete.id} onClick={() => onSelect(athlete.id)}>
                <strong>{athlete.name}</strong>
                {line ? <span>{line}</span> : null}
              </button>
              <button type="button" className="ia-context-pick" aria-pressed={selectedId === athlete.id} onClick={() => onSelect(athlete.id)}>
                {selectedId === athlete.id ? "Em contexto" : "Colocar em contexto"}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="ia-result-bar">
        <p>{Math.min(turn.athletes.length, total)} de {total}</p>
        {canMore ? (
          <button type="button" className="ia-more" onClick={() => onMore(turn.id)} disabled={pending} aria-busy={pending}>
            {pending ? "Carregando…" : "Ver mais"}
          </button>
        ) : null}
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}

function readEvent(chunk: string) {
  let event = "message";
  const data: string[] = [];
  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  if (data.length === 0) return null;
  return { event, data: JSON.parse(data.join("\n")) as unknown };
}

export function IntelligenceHome({
  fonts,
  greeting,
  landing = false,
  profile,
  context,
  contextAthleteId = null,
  consultationAvailable = false,
  canFinalize = false,
  evolutionRestricted = false,
  initialSessionId = null,
  initialSnapshot = conversationSnapshot([]),
  initialHistory = [],
  signOut,
  enabled,
  voiceEnabled = false,
}: {
  fonts: string;
  greeting: string;
  landing?: boolean;
  profile: { displayName: string; profession: string; initials: string; canReadAudit: boolean };
  context?: ReactNode;
  contextAthleteId?: string | null;
  consultationAvailable?: boolean;
  canFinalize?: boolean;
  evolutionRestricted?: boolean;
  initialSessionId?: string | null;
  initialSnapshot?: string;
  initialHistory?: ConversationSummary[];
  signOut: ReactNode;
  enabled: boolean;
  voiceEnabled?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const landingRef = useRef(landing);
  const contextToggleRef = useRef<HTMLButtonElement>(null);
  const contextPanelRef = useRef<HTMLElement>(null);
  const historyToggleRef = useRef<HTMLButtonElement>(null);
  const historyPanelRef = useRef<HTMLElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const persistQueue = useRef(Promise.resolve());
  const epochRef = useRef(0);
  const sessionRef = useRef<string | null>(initialSessionId);
  const selectedProposalRef = useRef<string | null>(null);
  const [selectedProposal, setSelectedProposal] = useState<string | null>(null);
  const stickRef = useRef(true);
  const pinRef = useRef(false);
  const scrollRestoredRef = useRef(false);
  const [attachmentOpen,setAttachmentOpen]=useState(false);
  const [attachmentPending,setAttachmentPending]=useState(false);
  const [attachmentPrefill,setAttachmentPrefill]=useState<UploadRequest|null>(null);
  const [starting, setStarting] = useState(false);
  const [pending, setPending] = useState(false);
  const [processingTools, setProcessingTools] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [moreTurnId, setMoreTurnId] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<{ id: string; text: string } | null>(null);
  const [contextCleared, setContextCleared] = useState(false);
  const [contextFor, setContextFor] = useState<string | null>(null);
  const [history, setHistory] = useState(initialHistory);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [openSessionId, setOpenSessionId] = useState<string | null>(initialSessionId);
  const [expectedAthlete, setExpectedAthlete] = useState<string | null | undefined>(undefined);
  const [draftMessage, setDraftMessage] = useState("");
  const voiceDraft = useRef(false);
  const contextClearedRef = useRef(false);
  const selectedAthleteRef = useRef<string | null | undefined>(undefined);
  const rawTurns = useSyncExternalStore(
    subscribeTurns,
    () => readConversationSnapshot(initialSnapshot),
    () => initialSnapshot,
  );
  const turns = useMemo(() => turnsFrom(rawTurns), [rawTurns]);
  const live = turns.some((turn) => turn.role === "user" || turnCarriesContent(turn));
  // Dictation records like a voice note and only fills the composer; the professional reviews,
  // edits and sends. The message keeps the voice origin for the agent's transcription rules.
  const dictation = useDictation({
    onText: (text) => {
      voiceDraft.current = true;
      setDraftMessage((current) => joinSegments(current.trim(), text));
      requestAnimationFrame(() => {
        const field = document.getElementById("chat-input");
        if (!(field instanceof HTMLTextAreaElement)) return;
        field.focus();
        field.setSelectionRange(field.value.length, field.value.length);
      });
    },
  });


  // A consultation recorded on another device: transcribed in segments, then offered as the
  // report-mode card for the athlete in context, exactly like a consultation sent as text.
  const audioAthlete = useRef<string | null>(null);
  const consultationAudio = useConsultationAudio({
    onTranscript: async ({ transcript, fileName, duration }) => {
      const athleteId = audioAthlete.current;
      if (!athleteId) throw new Error("Coloque em contexto o atleta da consulta antes de anexar o áudio.");
      const offered = await offerConsultationFromAudio({ athleteId, transcript });
      if (!offered.ok) {
        throw new Error(offered.error === "denied"
          ? "Você não tem permissão para registrar a evolução deste atleta."
          : "Não foi possível preparar o relatório desta gravação.");
      }
      await ensureAttachmentSession(athleteId);
      const empty = { athletes: [], navigation: null, search: null, document: null, readings: null, analysis: null };
      patchTurns((current) => [
        ...current,
        { ...empty, id: crypto.randomUUID(), role: "user", text: `Áudio da consulta anexado: ${fileName} · ${duration}`, draft: null },
        { ...empty, id: crypto.randomUUID(), role: "assistant", text: `Transcrevi o áudio da consulta de ${offered.draft.athleteName}. Escolha no cartão o modo do relatório: detalhado ou sintético.`, draft: offered.draft },
      ]);
      pinRef.current = true;
      queuePersist(athleteId, epochRef.current);
    },
  });

  function attachConsultationAudio(file: File) {
    const athleteId = currentAthlete();
    if (!athleteId) {
      setFailure("Coloque em contexto o atleta da consulta antes de anexar o áudio.");
      return;
    }
    setFailure(null);
    audioAthlete.current = athleteId;
    void consultationAudio.attach(file);
  }

  useLayoutEffect(() => () => abortRef.current?.abort(), []);
  useLayoutEffect(() => {
    rememberServerSnapshot(initialSnapshot);
    if (transcriptFollowsServer()) sessionRef.current = initialSessionId;
  }, [initialSnapshot, initialSessionId]);
  useLayoutEffect(() => {
    if (landingRef.current) { sessionRef.current = null; replaceTurns([]); }
    discardInactiveTranscript();
  }, []);
  useLayoutEffect(() => {
    if (selectedAthleteRef.current === undefined) return;
    if (contextAthleteId === selectedAthleteRef.current) selectedAthleteRef.current = undefined;
  }, [contextAthleteId]);

  useLayoutEffect(() => {
    const node = logRef.current;
    if (!node) return;
    if (!scrollRestoredRef.current) {
      scrollRestoredRef.current = true;
      const saved = loadScroll();
      if (saved !== null && turns.some((turn) => turn.role === "user")) {
        node.scrollTop = saved;
        stickRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64;
        pinRef.current = false;
        return;
      }
    }
    if (!pinRef.current && !stickRef.current) return;
    node.scrollTop = node.scrollHeight;
    pinRef.current = false;
    stickRef.current = true;
  }, [turns]);

  function currentAthlete() {
    if (contextClearedRef.current) return null;
    if (typeof selectedAthleteRef.current === "string") return selectedAthleteRef.current;
    const fromUrl = new URLSearchParams(window.location.search).get("atleta");
    if (fromUrl && uuidPattern.test(fromUrl)) return fromUrl;
    return contextAthleteId;
  }

  async function persist(sessionId: string | null, athleteId: string | null, nextTurns: ChatTurn[], epoch: number) {
    const meaningful = nextTurns.filter((turn) => turnCarriesContent(turn));
    if (meaningful.length === 0) return;
    try {
      const { ok, payload } = await postConversation({ action: "save", sessionId, athleteId, messages: meaningful });
      if (epoch !== epochRef.current) return;
      if (!ok) {
        const code = conversationFailure(payload);
        if (code === "conflict" || code === "closed") return;
        setFailure((current) => current ?? "Não foi possível guardar esta conversa.");
        return;
      }
      const id = sessionIdFrom(payload);
      if (id && sessionRef.current === sessionId) {
        sessionRef.current = id;
        setOpenSessionId(id);
      }
      void refreshHistory(epoch);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      if (epoch === epochRef.current) setFailure((current) => current ?? "Não foi possível guardar esta conversa.");
    }
  }

  function leaveForClinicalPage(href: string) {
    if (pending || starting || attachmentPending) {
      setFailure("Aguarde a conclusão da solicitação antes de sair da conversa.");
      return;
    }
    dictation.cancel();
    consultationAudio.cancel();
    const epoch = epochRef.current;
    queuePersist(currentAthlete(), epoch);
    void persistQueue.current.then(() => {
      if (epoch === epochRef.current) router.push(href);
    });
  }

  function queuePersist(athleteId: string | null, epoch: number) {
    persistQueue.current = persistQueue.current.then(() => persist(sessionRef.current, athleteId, loadTurns(), epoch));
  }

  async function refreshHistory(epoch: number) {
    try {
      const { ok, payload } = await postConversation({ action: "recent" });
      if (epoch !== epochRef.current || !ok) return;
      setHistory(parseHistory(payload));
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      return;
    }
  }

  function selectAthlete(id: string) {
    if(!allowAttachmentContextChange(id))return;
    const previous = currentAthlete();
    if (previous && previous !== id && hasUnsavedClinicalDraft()) {
      const proceed = window.confirm("Há uma proposta clínica ainda não salva para o atleta em contexto. Trocar o contexto não apaga essa proposta, mas as próximas ações passam a valer para outra pessoa. Deseja trocar?");
      if (!proceed) {
        if (sessionRef.current) {
          void postConversation({ action: "context", athleteId: previous, sessionId: sessionRef.current }).catch((error: unknown) => {
            if (!(error instanceof Error)) throw error;
            setFailure((current) => current ?? "Não foi possível manter o atleta em contexto.");
          });
        }
        return;
      }
    }
    contextClearedRef.current = false;
    selectedAthleteRef.current = id;
    setContextCleared(false);
    setExpectedAthlete(id);
    setContextFor(null);
    revealContextPanel();
    const params = new URLSearchParams(window.location.search);
    params.set("atleta", id);
    router.replace(`/?${params.toString()}`);
    const epoch = epochRef.current;
    if (sessionRef.current) {
      void postConversation({ action: "context", athleteId: id, sessionId: sessionRef.current }).catch((error: unknown) => {
        if (!(error instanceof Error)) throw error;
        if (epoch === epochRef.current) setFailure((current) => current ?? "Não foi possível guardar o atleta em contexto.");
      });
      return;
    }
    const current = loadTurns();
    if (current.length > 0) queuePersist(id, epoch);
  }

  function clearSelectedAthlete() {
    if(!allowAttachmentContextChange(null))return;
    contextClearedRef.current = true;
    selectedAthleteRef.current = null;
    setContextCleared(true);
    setExpectedAthlete(null);
    setContextFor(null);
    const params = new URLSearchParams(window.location.search);
    params.delete("atleta");
    const next = params.toString();
    router.replace(next ? `/?${next}` : "/");
    const epoch = epochRef.current;
    if (!sessionRef.current) return;
    void postConversation({ action: "context", athleteId: null, sessionId: sessionRef.current }).catch((error: unknown) => {
      if (!(error instanceof Error)) throw error;
      if (epoch === epochRef.current) setFailure((current) => current ?? "Não foi possível encerrar o contexto.");
    });
  }

  async function startNew() {
    if(!allowAttachmentContextChange(null))return;
    setAttachmentOpen(false);
    if (hasUnsavedClinicalDraft()) {
      const proceed = window.confirm("Há alterações clínicas locais que ainda não foram salvas. A nova conversa não apaga prontuários, rascunhos já gravados nem a auditoria. Deseja iniciar mesmo assim?");
      if (!proceed) return;
      setUnsavedClinicalDraft(false);
    }
    dictation.cancel();
    consultationAudio.cancel();
    const epoch = epochRef.current + 1;
    epochRef.current = epoch;
    abortRef.current?.abort();
    setStarting(true);
    setPending(false);
    setStreamingId(null);
    setFailure(null);
    setMoreTurnId(null);
    setMoreError(null);
    try {
      await persistQueue.current;
      if (epoch !== epochRef.current) return;
      const { ok, payload } = await postConversation({ action: "start" });
      if (epoch !== epochRef.current) return;
      if (!ok) {
        setFailure("Não foi possível iniciar uma nova conversa. Tente novamente.");
        return;
      }
      const id = sessionIdFrom(payload);
      selectedProposalRef.current = null; setSelectedProposal(null);
      sessionRef.current = id;
      setOpenSessionId(id);
      setHistoryOpen(false);
      setContextFor(null);
      setExpectedAthlete(null);
      contextClearedRef.current = true;
      selectedAthleteRef.current = null;
      setContextCleared(true);
      replaceTurns([]);
      void refreshHistory(epoch);
      const params = new URLSearchParams(window.location.search);
      params.delete("atleta");
      const next = params.toString();
      router.replace(next ? `/?${next}` : "/");
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      if (epoch === epochRef.current) setFailure("Não foi possível iniciar uma nova conversa. Tente novamente.");
    } finally {
      if (epoch === epochRef.current) setStarting(false);
    }
  }

  async function resume(id: string) {
    if(!allowAttachmentContextChange(null))return;
    setAttachmentOpen(false);
    if (starting || id === sessionRef.current) {
      setHistoryOpen(false);
      return;
    }
    dictation.cancel();
    consultationAudio.cancel();
    const epoch = epochRef.current + 1;
    epochRef.current = epoch;
    abortRef.current?.abort();
    setStarting(true);
    setPending(false);
    setStreamingId(null);
    setFailure(null);
    setMoreTurnId(null);
    setMoreError(null);
    try {
      await persistQueue.current;
      if (epoch !== epochRef.current) return;
      const { ok, payload } = await postConversation({ action: "resume", sessionId: id });
      if (epoch !== epochRef.current) return;
      const view = ok ? parseConversation(payload) : null;
      if (!view?.sessionId) {
        setFailure("Não foi possível abrir essa conversa.");
        return;
      }
      selectedProposalRef.current = null; setSelectedProposal(null);
      sessionRef.current = view.sessionId;
      setOpenSessionId(view.sessionId);
      setHistoryOpen(false);
      setContextFor(null);
      setExpectedAthlete(view.athleteId);
      if (view.athleteId) revealContextPanel();
      selectedAthleteRef.current = view.athleteId;
      contextClearedRef.current = !view.athleteId;
      setContextCleared(!view.athleteId);
      replaceTurns(view.messages);
      const params = new URLSearchParams(window.location.search);
      if (view.athleteId) params.set("atleta", view.athleteId);
      else params.delete("atleta");
      const next = params.toString();
      router.replace(next ? `/?${next}` : "/");
      void refreshHistory(epoch);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      if (epoch === epochRef.current) setFailure("Não foi possível abrir essa conversa.");
    } finally {
      if (epoch === epochRef.current) setStarting(false);
    }
  }

  async function ensureAttachmentSession(target:string) {
    await persistQueue.current;
    if(!sessionRef.current){
      const response=await postConversation({action:"start"});
      const id=response.ok?sessionIdFrom(response.payload):null;
      if(!id)throw new Error("Não foi possível confirmar a conversa de destino.");
      sessionRef.current=id;setOpenSessionId(id);
    }
    const response=await postConversation({action:"context",athleteId:target,sessionId:sessionRef.current});
    if(!response.ok)throw new Error("Não foi possível confirmar o atleta na conversa.");
    return sessionRef.current!;
  }

  // A request to attach a file opens the attachment form with the athlete in context and the
  // fields suggested from the message. Nothing is stored until the professional selects the
  // file, reviews the required fields and confirms the sending.
  function requestAttachmentUpload(message:string, upload:UploadRequest) {
    const target = currentAthlete();
    const empty = { athletes: [], navigation: null, search: null, draft: null, document: null, readings: null, analysis: null };
    const suggested = [upload.title && `título ${upload.title}`, upload.category && `categoria ${attachmentCategories[upload.category as keyof typeof attachmentCategories]}`, upload.documentDate && `data clínica ${upload.documentDate.split("-").reverse().join("/")}`].filter(Boolean);
    const text = target
      ? `Abri o envio de anexo clínico para o atleta em contexto. Selecione o arquivo (PDF ou imagem)${suggested.length ? `, revise os campos sugeridos (${suggested.join(", ")})` : ", informe título e categoria"} e confirme. O anexo entra no cadastro do atleta e na linha do tempo.`
      : "Abri o envio de anexo clínico. Escolha o atleta, selecione o arquivo (PDF ou imagem), informe título e categoria e confirme. O anexo entra no cadastro do atleta e na linha do tempo.";
    patchTurns((current) => [
      ...current,
      { ...empty, id: crypto.randomUUID(), role: "user", text: message },
      { ...empty, id: crypto.randomUUID(), role: "assistant", text },
    ]);
    setFailure(null);
    setAttachmentPrefill(upload);
    setAttachmentOpen(true);
    if (target) queuePersist(target, epochRef.current);
  }

  function uploadedAttachment(id:string,athleteId:string,reused=false) {
    setAttachmentOpen(false);setAttachmentPending(false);setAttachmentPrefill(null);
    patchTurns(current=>[...current,{id:crypto.randomUUID(),role:"assistant",text:reused?"Este arquivo já estava anexado. O registro existente foi reutilizado e seus metadados foram preservados.":"Anexo clínico registrado no cadastro do atleta confirmado e incluído na linha do tempo. O conteúdo do arquivo não foi enviado à IA.",athletes:[],navigation:null,search:null,draft:null,document:null,readings:null,analysis:null,attachments:{athleteId,ids:[id]}}]);
    queuePersist(athleteId,epochRef.current);
  }

  function patchTurns(updater: (current: ChatTurn[]) => ChatTurn[]) {
    replaceTurns(updater(loadTurns()));
  }

  function finishTurn(id: string, text: string, athletes: PresentedAthlete[], navigation: ChatTurn["navigation"], search: PresentedSearch | null, draft: ChatTurn["draft"] = null, document: ChatTurn["document"] = null, readings: ReadingBoard | null = null, analysis: HistoryAnalysis | null = null) {
    if (document) { selectedProposalRef.current = document.requestId; setSelectedProposal(document.requestId); }
    patchTurns((current) => {
      // A recovered server copy must not replace an editor with unsaved local input.
      const editing = document && current.some(turn => turn.document?.requestId === document.requestId && turn.document.locallyEdited);
      if (editing) return current.map(turn => turn.id === id ? { ...turn, text: "O cartão selecionado tem alterações locais. Você pode continuar a edição nele." } : turn);
      return current.map((turn) => turn.id === id
        ? { ...turn, text, athletes, navigation, search, draft, document, readings, analysis }
        : document && turn.document?.requestId === document.requestId ? { ...turn, document: null } : turn);
    });
  }

  function updateDocument(turnId: string, document: DocumentDraft) {
    const text = document.readOnlyReason
      ? "O estado do documento foi atualizado. Consulte a assinatura e a entrega no cartão."
      : document.state === "saved"
      ? "A proposta foi gravada como rascunho. Ela não foi emitida nem assinada."
      : document.state === "discarded"
        ? "A proposta foi descartada. Nenhum documento foi gravado."
        : null;
    patchTurns((current) => updateDocumentTurn(current, turnId, document, text));
    if (!document.locallyEdited && document.state !== "saving") queuePersist(currentAthlete(), epochRef.current);
  }

  function updateDraft(turnId: string, draft: ChatTurn["draft"]) {
    const previous = loadTurns().find((turn) => turn.id === turnId)?.draft;
    const text = previous?.state === "choose" && draft?.state === "proposal"
      ? `Preparei o ${draft.title.charAt(0).toLowerCase()}${draft.title.slice(1)}. Revise, edite se precisar e confirme no cartão para salvar como rascunho.`
      : previous?.state === "choose" && draft?.state === "discarded"
        ? "A transcrição foi descartada. Nenhum relatório foi gerado."
      : draft?.state === "saved"
      ? "A proposta foi gravada como rascunho. Ela ainda não foi finalizada."
      : draft?.state === "finalized"
        ? "A evolução foi finalizada."
        : draft?.state === "discarded"
          ? "A proposta foi descartada. Nenhum registro foi gravado."
          : null;
    patchTurns((current) => current.map((turn) => turn.id === turnId ? { ...turn, draft, text: text ?? turn.text } : turn));
    if (draft?.state === "saved" || draft?.state === "finalized" || draft?.state === "discarded") queuePersist(currentAthlete(), epochRef.current);
  }

  async function showMore(turnId: string) {
    const turn = loadTurns().find((item) => item.id === turnId);
    if (!turn?.search || moreTurnId) return;
    setMoreError(null);
    setMoreTurnId(turnId);
    try {
      const response = await fetch("/api/inteligencia/busca", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filters: turn.search.filters, page: turn.search.page + 1 }),
      });
      if (!response.ok) throw new Error("Não foi possível carregar a página seguinte.");
      const body = await response.json() as { athletes?: unknown; total?: unknown };
      const incoming = presentedAthletes(body.athletes);
      const total = typeof body.total === "number" ? body.total : turn.search.total;
      patchTurns((current) => current.map((item) => {
        if (item.id !== turnId || !item.search) return item;
        const seen = new Set(item.athletes.map((athlete) => athlete.id));
        const athletes = [...item.athletes, ...incoming.filter((athlete) => !seen.has(athlete.id))];
        const nextTotal = incoming.length === 0 ? athletes.length : total;
        const text = athletes.length >= nextTotal ? compactDirectoryReply(nextTotal, athletes.length) : item.text;
        return { ...item, text, athletes, search: { ...item.search, page: item.search.page + 1, total: nextTotal } };
      }));
      queuePersist(currentAthlete(), epochRef.current);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      setMoreError({ id: turnId, text: "Não foi possível carregar mais atletas. Tente novamente." });
    } finally {
      setMoreTurnId(null);
    }
  }

  async function showMoreDocuments(turnId: string) {
    const turn = loadTurns().find((item) => item.id === turnId);
    if (!turn?.readings || turn.readings.source !== "document" || moreTurnId) return;
    setMoreTurnId(turnId);
    try {
      const response = await fetch("/api/inteligencia/documentos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          athleteId: turn.readings.athleteId,
          page: turn.readings.page + 1,
          kind: turn.readings.kind,
          status: turn.readings.status,
        }),
      });
      if (!response.ok) throw new Error("Não foi possível carregar mais documentos.");
      const body = await response.json() as { documents?: { id?: string; kind?: string }[]; total?: number };
      const incoming: ReadingRef[] = Array.isArray(body.documents) ? body.documents.flatMap((item) => {
        const kind = isDocumentKind(item.kind) ? item.kind : null;
        if (!item.id || !kind) return [];
        const ref: ReadingRef = { id: item.id, athleteId: turn.readings?.athleteId ?? "", kind, open: false };
        return [ref];
      }) : [];
      patchTurns((current) => current.map((item) => {
        if (item.id !== turnId || !item.readings) return item;
        const seen = new Set(item.readings.items.map((entry) => entry.id));
        const items = [...item.readings.items, ...incoming.filter((entry) => !seen.has(entry.id))].slice(0, 8);
        return { ...item, readings: { ...item.readings, page: item.readings.page + 1, total: typeof body.total === "number" ? body.total : item.readings.total, items } };
      }));
      queuePersist(currentAthlete(), epochRef.current);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      setMoreError({ id: turnId, text: "Não foi possível carregar mais documentos. Tente novamente." });
    } finally {
      setMoreTurnId(null);
    }
  }

  async function send(message: string, inputMode: "text" | "voice" = "text") {
    if(hasPendingAttachment()){setFailure("Conclua ou descarte o anexo pendente antes de enviar outra mensagem.");return;}
    const upload = uploadRequest(message);
    if (upload) { requestAttachmentUpload(message, upload); return; }
    const pendingDrafts = loadTurns().flatMap((turn) => turn.draft && turn.draft.contentHash && (turn.draft.state === "proposal" || turn.draft.state === "error")
      ? [{ turnId: turn.id, draft: turn.draft }]
      : []);
    const pendingDocuments = loadTurns().flatMap((turn) => turn.document && turn.document.contentHash && turn.document.content && (turn.document.state === "proposal" || turn.document.state === "error")
      ? [{ turnId: turn.id, document: turn.document }]
      : []);
    const spokenDraft = pendingDrafts.length === 1 && pendingDocuments.length === 0 ? pendingDrafts[0] : null;
    const confirmation = spokenDraft
      ? confirmSpokenDraft({
        utterance: message,
        requestId: spokenDraft.draft.requestId,
        title: spokenDraft.draft.title,
        body: spokenDraft.draft.body,
        occurredOn: spokenDraft.draft.occurredOn,
        restricted: spokenDraft.draft.restricted,
        inputMode,
      }).then((result) => ({ kind: "draft" as const, result }))
      : pendingDrafts.length > 1 && pendingDocuments.length === 0
          ? confirmSpokenDraft({
            utterance: message,
            requestId: null,
            title: "",
            body: "",
            occurredOn: null,
            restricted: true,
            inputMode,
          }).then((result) => ({ kind: "draft" as const, result }))
          : null;
    const previousClinical = previousClinicalSearch(loadTurns());
    const roster = presentedRoster(loadTurns());
    const documentRoster = presentedDocumentRoster(loadTurns());
    const savedDocumentIds = createdDocumentIds(loadTurns());
    const history = [
      ...loadTurns().flatMap((turn) => turn.text.trim() ? [{ role: turn.role, content: turn.text.slice(0, 2000) }] : []),
      { role: "user" as const, content: message },
    ].slice(-8);
    const previousAnalysis = [...loadTurns()].reverse().find((turn) => turn.analysis)?.analysis ?? null;
    const userTurn: ChatTurn = { id: crypto.randomUUID(), role: "user", text: message, athletes: [], navigation: null, search: null, draft: null, document: null, readings: null, analysis: null };
    const assistantId = crypto.randomUUID();
    pinRef.current = true;
    setFailure(null);
    setPending(true);
    setProcessingTools(false);
    setStreamingId(assistantId);
    patchTurns((current) => [
      ...current.filter((turn) => turnCarriesContent(turn)),
      userTurn,
      { id: assistantId, role: "assistant", text: "", athletes: [], navigation: null, search: null, draft: null, document: null, readings: null, analysis: null },
    ]);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let settled = false;
    try {
      if (!sessionRef.current) {
        const start = persistQueue.current.then(() => postConversation({ action: "start" }));
        persistQueue.current = start.then(() => undefined, () => undefined);
        const started = await start;
        const id = started.ok ? sessionIdFrom(started.payload) : null;
        if (!id) throw new Error("Não foi possível iniciar a conversa.");
        if (controller.signal.aborted) return;
        sessionRef.current = id;
        setOpenSessionId(id);
        const athleteId = currentAthlete();
        if (athleteId) {
          const context = await postConversation({ action: "context", athleteId, sessionId: id });
          if (!context.ok) throw new Error("Não foi possível selecionar o atleta.");
        }
      }
      await persistQueue.current;
      if (controller.signal.aborted) return;
      const asked = historyRequest(message);
      if (asked.command === "sources" || asked.command === "analyze" || (asked.command === "follow" && previousAnalysis)) {
        if (asked.command === "sources") {
          finishTurn(assistantId, previousAnalysis ? "As fontes estão nos cartões da análise. Cada uma abre o registro original." : "Ainda não há uma análise nesta conversa.", [], null, null);
          settled = true;
          return;
        }
        const historyResponse = await fetch("/api/inteligencia/historico", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            utterance: message,
            contextAthleteId: currentAthlete(),
            inputMode,
            previous: previousAnalysis ? {
              athleteId: previousAnalysis.athleteId,
              athleteName: previousAnalysis.athleteName,
              from: previousAnalysis.from,
              to: previousAnalysis.to,
              unbounded: previousAnalysis.unbounded,
              periodLabel: previousAnalysis.periodLabel,
              specialties: previousAnalysis.specialties,
              kinds: previousAnalysis.kinds,
            } : null,
          }),
          signal: controller.signal,
        });
        const historyBody = await historyResponse.json() as { text?: unknown; analysis?: unknown; athletes?: unknown };
        const historyAnalysis = presentedAnalysis(historyBody.analysis);
        const historyText = historyAnalysis ? "A análise longitudinal está no cartão." : typeof historyBody.text === "string" && historyBody.text.trim() ? historyBody.text.trim() : "Não consegui consultar o histórico.";
        finishTurn(assistantId, historyResponse.ok ? historyText : "Não consegui consultar o histórico.", presentedAthletes(historyBody.athletes), null, null, null, null, null, historyAnalysis);
        if (!historyResponse.ok) setFailure("Não consegui consultar o histórico.");
        settled = true;
        return;
      }
      const response = await fetch("/api/inteligencia", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: history,
          messageId: userTurn.id,
          displayedProposals: displayedDocumentProposals(loadTurns(), selectedProposalRef.current),
          contextAthleteId: currentAthlete(),
          inputMode,
          roster,
          documentRoster,
          attachmentRoster: attachmentRoster(loadTurns(),currentAthlete()),
          clinicalSearchScope: previousClinical,
          createdDocumentIds: savedDocumentIds,
          historyScope: previousAnalysis ? {
            athleteId: previousAnalysis.athleteId,
            athleteName: previousAnalysis.athleteName,
            from: previousAnalysis.from,
            to: previousAnalysis.to,
            unbounded: previousAnalysis.unbounded,
            periodLabel: previousAnalysis.periodLabel,
            specialties: previousAnalysis.specialties,
            kinds: previousAnalysis.kinds,
          } : null,
        }),
        signal: controller.signal,
      });
      const type = response.headers.get("content-type") ?? "";
      if (!type.includes("text/event-stream")) {
        let code: unknown = "provider";
        try {
          const body = await response.json() as { error?: unknown };
          code = body.error;
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
        }
        const sentence = replyFor(code);
        finishTurn(assistantId, sentence, [], null, null);
        setFailure(sentence);
        settled = true;
        return;
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("A resposta do assistente chegou sem conteúdo.");
      const decoder = new TextDecoder();
      let buffer = "";
      while (!settled) {
        const step = await reader.read();
        if (step.done) break;
        buffer += decoder.decode(step.value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          let parsed: { event: string; data: unknown } | null = null;
          try {
            parsed = readEvent(chunk);
          } catch (error) {
            if (error instanceof SyntaxError) continue;
            throw error;
          }
          if (!parsed || settled) continue;
          if (parsed.event === "status") {
            const phase = parsed.data && typeof parsed.data === "object" ? (parsed.data as { phase?: unknown }).phase : null;
            if (phase === "tool" || phase === "response") setProcessingTools(phase === "tool");
            continue;
          }
          const data = parsed.data;
          const record = data && typeof data === "object" ? data as { text?: unknown; athletes?: unknown; navigation?: unknown; search?: unknown; draft?: unknown; document?: unknown; readings?: unknown; attachments?: unknown; clinicalSearch?: unknown; analysis?: unknown; context?: unknown; contextCleared?: unknown; sessionId?: unknown; error?: unknown } : {};
          if (parsed.event === "delta" && typeof record.text === "string" && record.text) {
            patchTurns((current) => current.map((turn) => turn.id === assistantId && typeof record.text === "string" ? { ...turn, text: turn.text + record.text } : turn));
          } else if (parsed.event === "done") {
            const text = typeof record.text === "string" && record.text.trim() ? record.text.trim() : replies.provider;
            finishTurn(assistantId, text, presentedAthletes(record.athletes), presentedNavigation(record.navigation), presentedSearch(record.search), presentedDraft(record.draft), presentedDocument(record.document), presentedReadings(record.readings), presentedAnalysis(record.analysis));
            patchTurns(current=>current.map(turn=>turn.id===assistantId?{...turn,clinicalSearch:clinicalSearchBoard(record.clinicalSearch),attachments:attachmentBoard(record.attachments)}:turn));
            if (typeof record.sessionId === "string" && uuidPattern.test(record.sessionId) && !sessionRef.current) {
              sessionRef.current = record.sessionId;
              setOpenSessionId(record.sessionId);
            }
            if (record.contextCleared === true) clearSelectedAthlete();
            else {
              const selected = presentedContext(record.context);
              if (selected) selectAthlete(selected.id);
            }
            settled = true;
          } else if (parsed.event === "error") {
            const sentence = replyFor(record.error);
            finishTurn(assistantId, sentence, [], null, null);
            setFailure(sentence);
            settled = true;
          }
        }
      }
      if (!settled) {
        patchTurns((current) => current.map((turn) => turn.id === assistantId && !turn.text.trim()
          ? { ...turn, text: replies.provider }
          : turn));
        setFailure(replies.provider);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (!(error instanceof Error)) throw error;
      finishTurn(assistantId, replies.provider, [], null, null);
      setFailure(replies.provider);
    } finally {
      if (!controller.signal.aborted && confirmation) {
        try {
          const outcome = await confirmation;
          if (outcome.kind === "draft" && outcome.result.ok && spokenDraft) {
            updateDraft(spokenDraft.turnId, { ...spokenDraft.draft, state: "saved", recordId: outcome.result.id, error: null });
          } else if (!outcome.result.ok && outcome.result.error !== "ignored") {
            setFailure(draftSaveMessage(outcome.result.error));
          }
        } catch (error) {
          if (!(error instanceof Error)) throw error;
          setFailure((current) => current ?? "Não foi possível confirmar o rascunho.");
        }
      }
      if (!controller.signal.aborted) {
        setPending(false);
        setStreamingId(null);
        queuePersist(currentAthlete(), epochRef.current);
      }
    }
  }

  const panels = useSyncExternalStore(subscribePanels, readPanels, () => panelsOpen);
  const isNarrow = useSyncExternalStore(subscribeNarrow, readNarrow, () => false);
  const historyCollapsed = panels.history && !isNarrow;
  const contextCollapsed = panels.context && !isNarrow;
  const shownSessionId = transcriptFollowsServer() ? initialSessionId : openSessionId;
  const athleteMatches = expectedAthlete === undefined || expectedAthlete === contextAthleteId;
  const visibleContext = contextCleared || !athleteMatches ? null : context;
  const selectedId = contextCleared || !athleteMatches ? null : contextAthleteId;
  const contextOpen = Boolean(selectedId) && contextFor === selectedId;

  useLayoutEffect(() => {
    if (!contextOpen) return;
    contextPanelRef.current?.querySelector<HTMLElement>(".ia-context-close")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setContextFor(null);
      contextToggleRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [contextOpen]);

  useLayoutEffect(() => {
    if (!historyOpen) return;
    historyPanelRef.current?.querySelector<HTMLElement>(".ia-history-close")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setHistoryOpen(false);
      historyToggleRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [historyOpen]);

  return (
    <div className={`ia ${fonts}${live ? " is-live" : ""}${visibleContext ? " has-context" : ""}${historyCollapsed ? " is-history-collapsed" : ""}${contextCollapsed ? " is-context-collapsed" : ""}`}>
      <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
      <aside className="ia-rail">
        <Link className="ia-brand" href="/" aria-label="Prontuário CBB, início" prefetch={false}>
          <Image src="/brand/cbb.png" width={697} height={869} alt="" priority />
        </Link>
        <nav aria-label="Atalhos">
          {shortcuts.filter((item) => !item.audit || profile.canReadAudit).map((item) => {
            return (
              <Link
                key={item.href}
                className="ia-icon"
                href={item.href}
                aria-label={item.label}
                aria-current={pathname === item.href ? "page" : undefined}
                prefetch={false}
              >
                <Icon name={item.icon} size={18} />
              </Link>
            );
          })}
        </nav>
      </aside>
      <aside id="conversas-anteriores" ref={historyPanelRef} className={`ia-history${historyOpen ? " is-open" : ""}`} aria-label="Conversas" aria-hidden={historyCollapsed ? true : undefined} inert={historyCollapsed ? true : undefined}>
        {historyOpen ? <button type="button" className="ia-history-backdrop" aria-label="Fechar conversas" onClick={() => { setHistoryOpen(false); historyToggleRef.current?.focus(); }} /> : null}
        <div className="ia-history-sheet">
          <div className="ia-panel-bar">
            <button type="button" className="ia-history-close" onClick={() => { setHistoryOpen(false); historyToggleRef.current?.focus(); }}>Fechar</button>
            <button type="button" className="ia-panel-collapse" onClick={() => { storePanels({ ...readPanels(), history: true }); historyToggleRef.current?.focus(); }}>Recolher</button>
          </div>
          {live ? (
            <button type="button" className="ia-new" onClick={startNew} disabled={starting}>
              <Icon name="plus" size={16} />
              Nova conversa
            </button>
          ) : null}
          <nav aria-label="Conversas anteriores">
            {history.length === 0 ? <p className="ia-history-empty">Nenhuma conversa ainda.</p> : (
              <ul>
                {history.map((item) => {
                  const when = historyWhen(item.lastActivityAt);
                  const athlete = item.athleteName && item.athleteName !== item.preview ? item.athleteName : "";
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="ia-history-item"
                        aria-current={item.id === shownSessionId ? "true" : undefined}
                        disabled={starting}
                        onClick={() => void resume(item.id)}
                      >
                        <strong>{item.preview}</strong>
                        {athlete || when ? <small>{athlete ? <span>{athlete}</span> : null}{when ? <span>{when}</span> : null}</small> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>
        </div>
      </aside>

      <div className="ia-stage">
        <header className="ia-top">
          <div className="ia-top-start">
            <p className="ia-product">Prontuário</p>
            <button
              ref={historyToggleRef}
              type="button"
              className="ia-history-toggle"
              aria-expanded={isNarrow ? historyOpen : !panels.history}
              aria-controls="conversas-anteriores"
              onClick={() => {
                if (window.matchMedia("(max-width: 760px)").matches) {
                  setHistoryOpen((open) => !open);
                  setContextFor(null);
                  return;
                }
                storePanels({ ...readPanels(), history: !readPanels().history });
              }}
            >
              Conversas
            </button>
          </div>
          <div className="ia-top-end">
          {visibleContext ? (
            <button
              ref={contextToggleRef}
              type="button"
              className="ia-context-toggle"
              aria-expanded={isNarrow ? contextOpen : !panels.context}
              aria-controls="contexto-atleta"
              onClick={() => {
                if (window.matchMedia("(max-width: 760px)").matches) {
                  setContextFor(contextOpen ? null : selectedId);
                  return;
                }
                storePanels({ ...readPanels(), context: !readPanels().context });
              }}
            >
              Contexto
            </button>
          ) : null}
          <AccountMenu profile={profile} signOut={signOut} />
          </div>
        </header>

        <main className="ia-canvas" id="conteudo" tabIndex={-1}>
          <div className="ia-hero" inert={live ? true : undefined} aria-hidden={live ? true : undefined}>
            <div className="ia-hero-inner">
              <p>{greeting}</p>
              {!live && <HomeGreeting paused={composerFocused || draftMessage.length > 0 || dictation.active || starting || attachmentOpen} />}
            </div>
          </div>
          {live ? (
            <div
              className="ia-log"
              ref={logRef}
              role="region"
              aria-label="Histórico da conversa"
              tabIndex={0}
              onScroll={(event) => {
                const node = event.currentTarget;
                stickRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64;
                saveScroll(node.scrollTop);
              }}
            >
              {turns.map((turn) => {
                if (turn.role === "assistant" && !turnCarriesContent(turn) && turn.id !== streamingId) return null;
                return (
                <article
                  key={turn.id}
                  className={turn.role === "user" ? "ia-turn ia-turn-user" : "ia-turn"}
                  aria-live={turn.role === "assistant" && turn.id === streamingId ? "off" : undefined}
                >
                  <p className="ia-sr">{turn.role === "user" ? "Você" : "Assistente"}</p>
                  {turn.role === "user" ? <p className="ia-user-text">{turn.text}</p> : null}
                  {turn.role === "assistant" && turn.text ? <MessageText text={turn.text} /> : null}
                  {turn.role === "assistant" && turn.id === streamingId && pending ? (
                    <ProcessingIndicator tools={processingTools} />
                  ) : null}
                  {turn.athletes.length > 0 && !turn.clinicalSearch ? (
                    <AthleteResults
                      turn={turn}
                      selectedId={selectedId}
                      pending={moreTurnId === turn.id}
                      error={moreError?.id === turn.id ? moreError.text : null}
                      onSelect={selectAthlete}
                      onMore={showMore}
                    />
                  ) : null}
                  {turn.navigation && (turn.athletes.length === 0 || turn.navigation.href.includes("?")) ? (
                    <Link className="ia-open" href={turn.navigation.href} prefetch={false}
                      onNavigate={(event) => {
                        if (!turn.navigation?.href.includes("?")) return;
                        event.preventDefault();
                        leaveForClinicalPage(turn.navigation.href);
                      }}>
                      {turn.navigation.href.endsWith("?modo=voz") ? "Registrar evolução por voz"
                        : turn.navigation.href.includes("/evolucao?") ? "Abrir revisão da evolução"
                        : turn.navigation.href.endsWith("?aba=cadastro") ? "Abrir cadastro do atleta"
                        : "Abrir prontuário de " + turn.navigation.name}
                    </Link>
                  ) : null}
                  {turn.draft ? <ClinicalDraftCard draft={turn.draft} mandatoryRestriction={evolutionRestricted} canFinalize={canFinalize && turn.draft.athleteId === selectedId} onChange={(next) => updateDraft(turn.id, next)} /> : null}
                  {turn.document ? <DocumentDraftCard draft={turn.document} onChange={(next) => updateDocument(turn.id, next)} selected={selectedProposal === turn.document.requestId} sending={pending} onSend={(message) => { selectedProposalRef.current = turn.document!.requestId; setSelectedProposal(turn.document!.requestId); void send(message); }} onSelect={() => { selectedProposalRef.current = turn.document!.requestId; setSelectedProposal(turn.document!.requestId); }} /> : null}
                  {turn.clinicalSearch ? <ClinicalSearchCards board={turn.clinicalSearch} onSelect={selectAthlete}
                    onResults={(data:ActivityResult)=>{
                      const athletes=presentedAthletes(data.items.map(item=>({id:item.athlete_id,name:item.name,category:item.category,club:item.club,division:item.division,facts:[item.category,item.club,item.division,item.modality].filter(Boolean)})));
                      patchTurns(current=>current.map(item=>item.id===turn.id?{...item,athletes,clinicalSearch:{filters:data.filters,page:data.page}}:item));
                      queuePersist(currentAthlete(),epochRef.current);
                    }}
                    onPage={page=>patchTurns(current=>current.map(item=>item.id===turn.id&&item.clinicalSearch?{...item,athletes:[],clinicalSearch:{...item.clinicalSearch,page}}:item))}/>:null}
                  {turn.attachments ? <AttachmentCards key={JSON.stringify(turn.attachments)} board={turn.attachments} /> : null}
                  {turn.readings ? (
                    <ClinicalReadings
                      board={turn.readings}
                      morePending={moreTurnId === turn.id}
                      onMore={turn.readings.source === "document" && turn.readings.items.length < turn.readings.total ? () => showMoreDocuments(turn.id) : undefined}
                    />
                  ) : null}
                  {turn.analysis ? <LongitudinalCard analysis={turn.analysis} /> : null}
                </article>
                );
              })}
            </div>
          ) : null}
          <MessageComposer
            key="composer"
            onFocusChange={setComposerFocused}
            enabled={enabled}
            pending={pending || attachmentPending || dictation.state === "transcribing"}
            attachmentControl={consultationAudio.state !== "idle" ? (
              <ConsultationAudioStatus
                state={consultationAudio.state}
                progress={consultationAudio.progress}
                error={consultationAudio.error}
                canRetry={consultationAudio.canRetry}
                onCancel={consultationAudio.cancel}
                onRetry={consultationAudio.retry}
              />
            ) : dictation.state !== "idle" ? (
              <DictationStatus
                state={dictation.state}
                elapsed={dictation.elapsed}
                level={dictation.level}
                error={dictation.error}
                canRetry={dictation.canRetry}
                onCancel={dictation.cancel}
                onRetry={() => void dictation.retry()}
              />
            ) : (
              <span className="ia-attach-group">
                <button type="button" className="ia-attach" disabled={starting || pending} onClick={()=>{setAttachmentPrefill(null);setAttachmentOpen(true);}}><Icon name="clip" size={16}/>Anexar ao prontuário</button>
                {voiceEnabled ? <ConsultationAudioButton disabled={!enabled || starting || pending} onFile={attachConsultationAudio} /> : null}
              </span>
            )}
            failure={failure}
            value={draftMessage}
            onValueChange={(next) => {
              if (!next) voiceDraft.current = false;
              setDraftMessage(next);
            }}
            onEdit={() => setFailure(null)}
            onSend={(message) => {
              const mode = voiceDraft.current ? "voice" : "text";
              voiceDraft.current = false;
              void send(message, mode);
            }}
            voiceControl={voiceEnabled ? (
              <DictationButton
                state={dictation.state}
                disabled={!enabled || starting || pending || attachmentPending || consultationAudio.busy}
                onStart={() => void dictation.start()}
                onStop={() => void dictation.stop()}
              />
            ) : undefined}
          />
          {attachmentOpen && <AttachmentUpload athleteId={selectedId} base="/api/inteligencia/anexos" initial={attachmentPrefill ?? undefined} ensureSession={ensureAttachmentSession} onSelect={selectAthlete} onClose={()=>{setAttachmentOpen(false);setAttachmentPending(false);setAttachmentPrefill(null);}} onSaved={uploadedAttachment} onPending={setAttachmentPending}/>}

        </main>
      </div>
      {visibleContext ? (
        <aside
          id="contexto-atleta"
          ref={contextPanelRef}
          className={`ia-context${contextOpen ? " is-open" : ""}`}
          aria-label="Contexto da tarefa"
          aria-hidden={contextCollapsed ? true : undefined}
          inert={contextCollapsed ? true : undefined}
        >
          {contextOpen ? <button type="button" className="ia-context-backdrop" aria-label="Fechar contexto" onClick={() => { setContextFor(null); contextToggleRef.current?.focus(); }} /> : null}
          <div className="ia-context-sheet">
            <div className="ia-panel-bar">
              <button type="button" className="ia-context-close" onClick={() => { setContextFor(null); contextToggleRef.current?.focus(); }}>Fechar</button>
              <button type="button" className="ia-panel-collapse" onClick={() => { storePanels({ ...readPanels(), context: true }); contextToggleRef.current?.focus(); }}>Recolher</button>
            </div>
            {visibleContext}
            {consultationAvailable && selectedId ? (
              <Link className="ia-open" href={`/atletas/${selectedId}/evolucao?modo=voz`} prefetch={false}
                onNavigate={(event) => {
                  event.preventDefault();
                  leaveForClinicalPage(`/atletas/${selectedId}/evolucao?modo=voz`);
                }}>
                Registrar evolução por voz
              </Link>
            ) : null}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
