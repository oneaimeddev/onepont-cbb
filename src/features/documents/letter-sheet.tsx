import "./documents.css";
import type { Letter } from "./letter-format";

/** Certificate or referral in letter form: recipient, text, labelled sections and closing. The title is shown by the paper. */
export function LetterSheet({ letter }: { letter: Letter }) {
  return (
    <div className="letter">
      {letter.recipient ? <p className="letter-recipient">{letter.recipient}</p> : null}
      {letter.paragraphs.map((paragraph) => <p key={paragraph} className="letter-text">{paragraph}</p>)}
      {letter.sections.length ? (
        <dl className="letter-sections">
          {letter.sections.map((section) => (
            <div key={section.label}><dt>{section.label}</dt><dd>{section.value}</dd></div>
          ))}
        </dl>
      ) : null}
      {letter.closing ? <p className="letter-closing">{letter.closing}</p> : null}
    </div>
  );
}
