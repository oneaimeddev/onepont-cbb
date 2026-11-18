"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RegistrationCatalog } from "./data";
import { createCategory, createOrganization } from "../../app/(workspace)/atletas/novo/actions";
import { importBatch, importJob } from "../../app/(workspace)/atletas/importar/actions";
import { correction, csvReport, fields, FILE_LIMIT, key, mappedRows, parseCsv, stateLabels, templateCsv, type CsvRow, type ImportJob, type RowResult } from "./csv";
import "./csv-import.css";

function download(content: string, name: string) {
 const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
 const a = document.createElement("a"); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);
}
async function hash(text: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))).map(b => b.toString(16).padStart(2,"0")).join(""); }
const storageKey="cbb-athlete-import";

export function CsvImport({ catalog, returnTo }: { catalog: RegistrationCatalog; returnTo: string }) {
 const router=useRouter();
 const rootRef=useRef<HTMLElement>(null);
 const busyRef=useRef(false);
 const [step,setStep]=useState(1);
 const [file,setFile]=useState<{ name: string; size: number; digest: string }>();
 const [parsed,setParsed]=useState<ReturnType<typeof parseCsv>>();
 const [mapping,setMapping]=useState<string[]>([]);
 const [rows,setRows]=useState<CsvRow[]>([]);
 const [results,setResults]=useState<RowResult[]>([]);
 const [job,setJob]=useState<ImportJob>();
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [progress,setProgress]=useState({ done:0,total:1 });
 const [filter,setFilter]=useState("");
 const [page,setPage]=useState(1);
 const [confirmed,setConfirmed]=useState(false);
 const [decisions,setDecisions]=useState<Record<number,string>>({});
 const [categories,setCategories]=useState(catalog.categories);
 const [clubs,setClubs]=useState(catalog.clubs);
 const [replacements,setReplacements]=useState<Record<string,string>>({});
 const [catalogReady,setCatalogReady]=useState(false);

 async function work(action:()=>Promise<void>) {
  if(busyRef.current) return;
  busyRef.current=true; setBusy(true); setMessage("");
  try { await action(); } catch(e) { setMessage(e instanceof Error && !("digest" in e) ? e.message : "Operação interrompida. Retome para consultar o resultado real e continuar com segurança."); }
  finally { busyRef.current=false; setBusy(false); }
 }
 async function selectFile(selected?: File) {
  setFile(undefined); setParsed(undefined); setJob(undefined); setResults([]); setRows([]); setReplacements({}); setCatalogReady(false); setConfirmed(false); setDecisions({});
  if(!selected) return;
  if(selected.size>FILE_LIMIT || !selected.name.toLowerCase().endsWith(".csv")) throw new Error("Selecione um CSV de até 5 MB.");
  let text: string;
  try { text=new TextDecoder("utf-8",{fatal:true}).decode(await selected.arrayBuffer()); } catch { throw new Error("Salve o arquivo na codificação UTF-8."); }
  const data=parseCsv(text); const digest=await hash(text);
  setParsed(data); setFile({name:selected.name,size:selected.size,digest}); setMapping(data.mapping);
  try {
   const saved=JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
   if(saved?.fileDigest===digest && Array.isArray(saved.mapping) && saved.mapping.length===data.headers.length) {
    setMapping(saved.mapping);
    const restored:Record<string,string>={};
    const original=mappedRows(data.records,saved.mapping);
    for(const resolution of saved.resolutions ?? []) {
     const source=original.find(row=>row.line===resolution.line);
     for(const field of ["category","club"] as const) {
      const selected=(field==="category" ? catalog.categories : catalog.clubs).find(option=>option.id===resolution[field]);
      if(source?.payload[field] && selected)restored[`${field}:${source.payload[field]}`]=selected.name;
     }
    }
    setReplacements(restored); setMessage("Importação anterior encontrada. Continue para consultar o estado e retomar com segurança.");
   }
  } catch { /* A fresh import remains available when browser storage is unavailable. */ }
 }
 function effectiveRows() {
  return mappedRows(parsed!.records,mapping).map(row=>({...row,payload:Object.fromEntries(Object.entries(row.payload).map(([field,value])=>[field,replacements[`${field}:${value}`] ?? value]))}));
 }
 async function review() {
  const input=effectiveRows();
  const digest=await hash(JSON.stringify(input));
  let id=crypto.randomUUID();
  try { const saved=JSON.parse(sessionStorage.getItem(storageKey) ?? "null"); if(saved?.digest===digest) id=saved.id; } catch {}
  const current=await importJob(id,"start",digest,input.length);
  try { sessionStorage.setItem(storageKey,JSON.stringify({id,digest,fileDigest:file!.digest,mapping,resolutions:input.map(row=>({line:row.line,
   category:categories.find(option=>key(option.name)===key(row.payload.category ?? ""))?.id,
   club:clubs.find(option=>key(option.name)===key(row.payload.club ?? ""))?.id}))})); } catch {}
  setJob(current); setRows(input); setDecisions({}); setConfirmed(false); setResults([]); setProgress({done:0,total:input.length});
  if(current.state!=="review") { setResults(current.rows); setProgress({done:current.processed,total:current.total}); setStep(4); return; }
  const checked:RowResult[]=[];
  for(let offset=0;offset<input.length;offset+=25) {
   checked.push(...await importBatch(id,input.slice(offset,offset+25),false));
   setProgress({done:checked.length,total:input.length});
  }
  setResults(checked); setFilter(""); setPage(1); setStep(3);
 }
 async function execute() {
  if(!job) return;
  const current=await importJob(job.id,"confirm"); setJob(current); setStep(4);
  const terminal=new Set(current.rows.filter(r=>["created","ignored","rejected"].includes(r.state)).map(r=>r.line));
  setResults(current.rows); setProgress({done:current.processed,total:current.total});
  const pending=rows.filter(row=>!terminal.has(row.line));
  for(let offset=0;offset<pending.length;offset+=25) {
   const batch=pending.slice(offset,offset+25).map(row=>({...row, decision:decisions[row.line]==="create" ? "create" as const : decisions[row.line]==="ignore" ? "ignore" as const : undefined}));
   const updated=await importBatch(job.id,batch,true);
   setResults(prev=>prev.map(row=>updated.find(r=>r.line===row.line) ?? row));
   setProgress({done:current.processed+Math.min(offset+25,pending.length),total:rows.length});
  }
  const final=await importJob(job.id,"status"); setJob(final); setResults(final.rows); setProgress({done:final.processed,total:final.total}); router.refresh();
 }
 const unknown = parsed && catalogReady && step===2 ? [...new Map(effectiveRows().flatMap(row=>(["category","club"] as const).flatMap(field=> {
  const value=row.payload[field]; const options=field==="category" ? categories : clubs;
  return value && !options.some(option=>key(option.name)===key(value)) ? [[`${field}:${value}`,{field,value}] as const] : [];
 }))).values()] : [];
 const visible=results.filter(row=>!filter || row.state===filter);
 const counts=results.reduce<Record<string,number>>((all,row)=>({...all,[row.state]:(all[row.state]??0)+1}),{});
 const duplicatedMapping=mapping.filter(Boolean).length!==new Set(mapping.filter(Boolean)).size;
 const finished=job?.state==="completed";
 useEffect(()=>{const heading=rootRef.current?.querySelector("h2"); if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});heading.scrollIntoView({block:"start"});}},[step]);
 useEffect(()=>{
  if(!parsed || finished)return;
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();};
  window.addEventListener("beforeunload",warn);
  return ()=>window.removeEventListener("beforeunload",warn);
 },[parsed,finished]);

 return <section ref={rootRef} className="csv-import" aria-label="Importação CSV">
  <ol className="csv-steps" aria-label="Etapas">{["Selecionar arquivo","Mapear campos","Revisar e validar","Confirmar e acompanhar"].map((label,i)=><li key={label} aria-current={step===i+1 ? "step" : undefined}><span>{i+1}</span>{label}</li>)}</ol>
  <p className="notice">Use exclusivamente atletas fictícios nesta demonstração. O arquivo fica na memória desta página; ao sair, selecione-o novamente para retomar. O navegador guarda apenas a referência da importação nesta sessão.</p>
  {message && <p className="field-error" role="alert">{message}</p>}
  {busy && <div role="status" className="csv-progress"><p>{step===4 ? "Gravando registros confirmados" : "Validando registros"}: {progress.done} de {progress.total}</p><progress value={progress.done} max={progress.total} aria-label="Progresso da importação" /></div>}
  {step===1 && <div className="csv-panel">
   <h2>Selecione o arquivo</h2><p>CSV UTF-8, separado por vírgula ou ponto e vírgula. Até 5 MB e 5.000 linhas. Somente nome completo é obrigatório. Datas: AAAA-MM-DD.</p>
   <button type="button" className="outline" onClick={()=>download(templateCsv(),"modelo-atletas.csv")}>Baixar modelo CSV</button>
   <label className="csv-upload">Arquivo CSV<input name="csv_file" type="file" accept=".csv,text/csv" disabled={busy} onChange={e=>void work(()=>selectFile(e.target.files?.[0]))} /></label>
   {file && <p>{file.name} · {(file.size/1024).toFixed(1)} KB · {parsed?.records.length} registros</p>}
   <button className="button" disabled={!parsed || busy} onClick={()=>setStep(2)}>Continuar para mapeamento</button>
  </div>}
  {step===2 && parsed && <div className="csv-panel">
   <h2>Mapeie as colunas</h2><p>Colunas desconhecidas serão ignoradas, conforme indicado abaixo. Identificadores e camisas são preservados como texto.</p>
   <p>Para criar um vínculo inicial, informe categoria, naipe e modalidade juntos. Cada linha admite um vínculo; vínculos futuros continuam disponíveis no perfil.</p>
   <div className="csv-mapping">{parsed.headers.map((header,i)=><label key={header}>{header}<select name={`mapping_${i}`} value={mapping[i]} disabled={busy} onChange={e=>{setMapping(prev=>prev.map((v,j)=>j===i ? e.target.value : v));setCatalogReady(false);setReplacements({});}}><option value="">Ignorar esta coluna</option>{fields.map(([id,,label])=><option value={id} key={id}>{label}</option>)}</select></label>)}</div>
   {duplicatedMapping && <p role="alert">Mapeie cada campo apenas uma vez.</p>}
   {!mapping.includes("name") && <p role="alert">Mapeie a coluna Nome completo para continuar.</p>}
   <h3>Categorias e clubes</h3><p>Confira os nomes desconhecidos antes da validação. A criação de uma opção exige sua ação e a autorização do cadastro.</p>
   <button className="outline" disabled={busy || duplicatedMapping || !mapping.includes("name")} onClick={()=>setCatalogReady(true)}>Conferir catálogos</button>
   {unknown.map(({field,value})=><div className="csv-catalog" key={`${field}:${value}`}><p>{field==="category" ? "Categoria" : "Clube"} desconhecido: <strong>{value}</strong></p>
    <label>Usar opção existente<select defaultValue="" disabled={busy} onChange={e=>{if(e.target.value)setReplacements(prev=>({...prev,[`${field}:${value}`]:e.target.value}));}}><option value="">Escolher…</option>{(field==="category" ? categories : clubs).map(option=><option key={option.id} value={option.name}>{option.name}</option>)}</select></label>
    <button className="outline" disabled={busy} onClick={()=>void work(async()=>{const result=field==="category" ? await createCategory(value) : await createOrganization(value,"club"); if(!result.id || !result.name)throw new Error("Não foi possível criar esta opção. Verifique o nome e sua permissão."); const option={id:result.id,name:result.name}; (field==="category" ? setCategories : setClubs)(prev=>[...prev.filter(o=>o.id!==option.id),option]);})}>Cadastrar {field==="category" ? "categoria" : "clube"}</button>
   </div>)}
   {catalogReady && unknown.length===0 && <p role="status">Categorias e clubes reconhecidos.</p>}
   <div className="form-actions"><button className="button" disabled={busy || duplicatedMapping || !mapping.includes("name") || !catalogReady} onClick={()=>void work(review)}>Validar todas as linhas</button><button className="outline" disabled={busy} onClick={()=>setStep(1)}>Substituir arquivo</button></div>
  </div>}
  {step>=3 && <div className="csv-panel">
   <h2>{step===3 ? "Revise antes de importar" : finished ? "Relatório da importação" : "Acompanhe a importação"}</h2>
   <p>{results.length} registros · {Object.entries(counts).map(([state,count])=>`${count} ${stateLabels[state]?.toLowerCase()}`).join(" · ")}</p>
   {step===3 && <p>Nenhum atleta foi criado. Possíveis duplicidades ficam ignoradas até uma decisão explícita. Conflitos restritos não mostram dados de outros atletas. Corrija linhas inválidas no arquivo original.</p>}
   {step===4 && <p role="status">{finished ? `Concluída: ${job.created} criados, ${job.ignored} ignorados e ${job.rejected} rejeitados. ${job.duplicates} possíveis duplicidades identificadas.` : `${progress.done} de ${progress.total} processados. Em caso de interrupção, retome para consultar o resultado real.`}</p>}
   <label className="csv-filter">Filtrar situação<select name="validation_filter" value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}><option value="">Todas</option>{Object.keys(counts).map(state=><option key={state} value={state}>{stateLabels[state]}</option>)}</select></label>
   <div className="csv-table-wrap" role="region" aria-label="Tabela de registros com rolagem horizontal" tabIndex={0}><table className="csv-table"><caption className="sr-only">Registros da importação, 25 por página</caption><thead><tr><th scope="col">Linha</th><th scope="col">Atleta</th><th scope="col">Situação</th><th scope="col">Revisão</th></tr></thead><tbody>{visible.slice((page-1)*25,page*25).map(result=><tr key={result.line}><td>{result.line}</td><td>{rows.find(row=>row.line===result.line)?.payload.name}</td><td>{stateLabels[result.state]}{result.field && <p className="field-error">{fields.find(([id])=>id===result.field)?.[2] ?? result.field}: {correction[result.field] ?? "Revise o valor e o tamanho do campo no arquivo."}</p>}</td><td>
    {result.id && <Link href={`/atletas/${result.id}`} prefetch={false}>Abrir perfil</Link>}
    {result.matches?.map(match=><p key={match.id}><Link href={`/atletas/${match.id}`} target="_blank" rel="noreferrer">{match.name} (abre em outra aba)</Link></p>)}
    {step===3 && ["ready","duplicate"].includes(result.state) && <label>Decisão da linha {result.line}<select disabled={busy} value={decisions[result.line] ?? (result.state==="duplicate" ? "ignore" : "create")} onChange={e=>setDecisions(prev=>({...prev,[result.line]:e.target.value}))}><option value="ignore">Ignorar</option><option value="create">{result.state==="duplicate" ? "Criar outro atleta após revisão" : "Cadastrar"}</option></select></label>}
   </td></tr>)}</tbody></table></div>
   <nav className="pagination" aria-label="Páginas da prévia"><button className="outline" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>Página {page} de {Math.max(1,Math.ceil(visible.length/25))}</span><button className="outline" disabled={page*25>=visible.length} onClick={()=>setPage(p=>p+1)}>Próxima</button></nav>
   {step===3 && <><label className="csv-confirm"><input name="confirm_import" type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)} />Revisei os resultados e confirmo a criação dos atletas selecionados.</label><div className="form-actions"><button className="button" disabled={!confirmed || busy} onClick={()=>void work(execute)}>Confirmar importação</button><button className="outline" disabled={busy} onClick={()=>{setStep(2);setResults([]);}}>Revisar mapeamento</button></div></>}
   {step===4 && !finished && <button className="button" disabled={busy} onClick={()=>void work(execute)}>Retomar processamento</button>}
   {step===4 && <div className="form-actions"><button className="outline" disabled={busy} onClick={()=>void work(async()=>{const actual=await importJob(job!.id,"status");setJob(actual);setResults(actual.rows); download(csvReport([["linha","situacao","campo","orientacao"],...actual.rows.map(row=>[String(row.line),stateLabels[row.state],row.field ?? "", row.field ? correction[row.field] ?? "Revise o arquivo." : row.review_state === "duplicate" ? "Possível duplicidade; decisão do operador ou ignorada por padrão." : row.review_state === "repeat" ? "Registro repetido ou já importado." : row.state === "ignored" ? "Ignorado por decisão do operador." : ""])]),"relatorio-importacao.csv");})}>Baixar relatório CSV</button><Link className="outline" href={returnTo} prefetch={false}>Voltar ao diretório</Link></div>}
  </div>}
 </section>;
}
