import type { ExamContent, SurgicalContent } from "./content";
import { RequestList, RequestSections } from "./document-paper";
import { brazilianDate } from "./letter-format";
import { examRequestFormat, surgicalRequestFormat } from "./request-format";

/** Body of an exam request: numbered exams by type, then indication, hypothesis and priority. */
export function ExamSheet({ content }: { content: ExamContent }) {
  const sheet = examRequestFormat(content);
  return (
    <>
      {content.occurred_at ? <p className="request-note">Data do atendimento: {brazilianDate(content.occurred_at)}</p> : null}
      <RequestList groups={sheet.groups} />
      <RequestSections sections={sheet.sections} priority={sheet.priority} />
    </>
  );
}

/** Body of a surgical request: proposed procedure, diagnosis, indication, OPME and priority. */
export function SurgicalSheet({ content }: { content: SurgicalContent }) {
  const sheet = surgicalRequestFormat(content);
  return (
    <>
      <div className="request">
        <p className="request-lead">Procedimento proposto:</p>
        <p className="request-procedure">{sheet.procedure}</p>
      </div>
      <RequestSections sections={sheet.sections} priority={sheet.priority} />
    </>
  );
}
