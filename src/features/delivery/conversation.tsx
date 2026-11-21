"use client";
import Link from "next/link";
import { useState } from "react";
import { deliveryLabel } from "../documents/workflow-types";
import type { DeliveryState } from "./contracts";
import "./conversation.css";

export type SimulatedConversation = { athleteId:string; messages: {
  id:string;documentId:string;version:number;snapshotId:string;state:DeliveryState;provenance:"simulated";
  recipient:{name:string;relation:string};text:string;at:string;updatedAt:string;pdfHash:string;
}[] };
const date = new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short",timeZone:"America/Sao_Paulo"});
export function DeliveryConversation({documentId,initial}:{documentId:string;initial:SimulatedConversation}) {
  const [data,setData]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const endpoint=`/api/documents/simulation?document=${documentId}`;
  async function refresh() {
    setBusy(true);setError("");
    try {
      const res=await fetch(endpoint,{cache:"no-store"});
      if(!res.ok) throw new Error("Consulta indisponível. Volte ao documento para conferir seu acesso.");
      setData(await res.json());
    } catch(e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  return <main id="conteudo" tabIndex={-1} className="traditional-content clinical-page simulation-page">
    <Link className="back-link" prefetch={false} href={`/atletas/${data.athleteId}/documentos/${documentId}`}>Voltar ao documento</Link>
    <div className="simulation-thread">
      <header className="simulation-header"><div className="simulation-avatar" aria-hidden="true">DE</div><div><h1>Conversa simulada</h1><p>{data.messages[0]?.recipient.name}</p><p>Destinatário fictício · Ambiente de demonstração</p></div></header>
      <aside className="simulation-notice"><strong>Simulação — nenhum WhatsApp foi enviado</strong><p>Mensagens e anexos desta demonstração são armazenados apenas no Prontuário CBB.</p></aside>
      <ol className="simulation-messages" aria-label="Histórico de mensagens demonstrativas">{data.messages.map(m=><li key={m.id} className="simulation-message">
        <p>{m.text}</p>
        <section className="simulation-attachment" aria-label="Anexo PDF"><span className="simulation-pdf" aria-hidden="true">PDF</span><div><h2>Prescrição demonstrativa</h2><p>Versão finalizada {m.version} · PDF real</p><div className="simulation-links"><a href={`${endpoint}&attachment=${m.id}`} target="_blank" rel="noopener noreferrer">Visualizar PDF<span className="sr-only"> (nova aba)</span></a><a href={`${endpoint}&attachment=${m.id}&download=1`}>Baixar PDF</a></div></div></section>
        <footer><time dateTime={m.at}>{date.format(new Date(m.at))}</time><span>{deliveryLabel(m.state,m.provenance)}</span></footer>
        <details><summary>Identificação da entrega</summary><p>Solicitação: {m.id}</p><p>Documento: {m.documentId} · Versão {m.version}</p><p>Snapshot: {m.snapshotId}</p><p>Atualização: {date.format(new Date(m.updatedAt))}</p></details>
      </li>)}</ol>
      <div className="simulation-bottom"><p>Assinatura demonstrativa sem validade digital. Não utilizar para dispensação.</p><button className="outline" onClick={()=>void refresh()} disabled={busy}>{busy?"Consultando…":"Atualizar conversa"}</button>{error&&<p role="alert">{error}</p>}<span role="status" className="sr-only">{busy?"Consultando mensagens persistidas":"Conversa carregada"}</span></div>
    </div>
  </main>;
}
