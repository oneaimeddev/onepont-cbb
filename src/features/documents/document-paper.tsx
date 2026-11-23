import Image from "next/image";
import type { ReactNode } from "react";
import "./documents.css";
import { requestDate, type RequestGroup, type RequestSection } from "./request-format";

/**
 * Letterhead paper shared by every medical document: institution, document title, patient,
 * the type-specific body and, at the end, date and signature of the responsible professional.
 * `compact` drops letterhead and signature for the chat card, keeping title and patient.
 */
export function DocumentPaper({ title, patient, date, author, credential, compact = false, children }: {
  title: string;
  patient: string;
  date?: string | null;
  author?: string | null;
  credential?: string | null;
  compact?: boolean;
  children: ReactNode;
}) {
  const written = date ? requestDate(date) : "";
  return (
    <div className={compact ? "paper is-compact" : "paper"}>
      {compact ? null : (
        <div className="paper-head">
          <Image src="/brand/cbb.png" width={34} height={42} alt="" className="paper-shield" />
          <div>
            <p className="paper-institution">Confederação Brasileira de Basketball</p>
            <p className="paper-department">Departamento Médico · Seleções Brasileiras</p>
          </div>
        </div>
      )}
      <p className="paper-title">{title}</p>
      <p className="paper-patient"><span>Paciente:</span> {patient.trim() || "Não informado"}</p>
      <div className="paper-body">{children}</div>
      {compact ? null : (
        <div className="paper-sign">
          {written ? <p className="paper-date">{written}</p> : null}
          <div className="paper-signature">
            <span className="paper-line" aria-hidden="true" />
            <p className="paper-author">{author?.trim() || "Profissional responsável"}</p>
            <p className="paper-credential">{credential?.trim() || "Identificação profissional não registrada"}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Numbered request list ("Solicito:") grouped by type, as in exam requests. */
export function RequestList({ groups, lead = "Solicito:" }: { groups: RequestGroup[]; lead?: string }) {
  return (
    <div className="request">
      <p className="request-lead">{lead}</p>
      {groups.map((group) => (
        <section key={group.heading || "itens"} className="request-group" aria-label={group.heading || "Itens solicitados"}>
          {group.heading ? <p className="request-heading">{group.heading}</p> : null}
          <ol className="request-items">
            {group.lines.map((line) => (
              <li key={line.number} className="request-item">
                <p className="request-title">{line.number}. {line.title}</p>
                {line.details.map((detail) => <p key={detail} className="request-detail">{detail}</p>)}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** Labelled clinical sections and the priority mark that close a request. */
export function RequestSections({ sections, priority }: { sections: RequestSection[]; priority?: string }) {
  if (!sections.length && !priority) return null;
  return (
    <dl className="request-sections">
      {sections.map((section) => (
        <div key={section.label}><dt>{section.label}</dt><dd>{section.value}</dd></div>
      ))}
      {priority ? <div className="request-priority"><dt>Caráter</dt><dd><span className={`request-mark is-${priority === "Urgente" ? "urgent" : priority === "Prioritário" ? "priority" : "elective"}`}>{priority}</span></dd></div> : null}
    </dl>
  );
}
