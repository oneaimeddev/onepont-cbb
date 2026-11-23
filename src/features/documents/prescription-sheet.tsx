import "./documents.css";
import { prescriptionGroups, type PrescriptionFields } from "./prescription-format";

/** Prescription in the usual layout: route headings, numbered items with quantity, directions in running text. */
export function PrescriptionSheet({ items, notes }: { items: readonly PrescriptionFields[]; notes: string }) {
  return (
    <div className="rx">
      {prescriptionGroups(items).map((group) => (
        <section key={group.heading} className="rx-group" aria-label={group.heading}>
          <p className="rx-use">{group.heading}</p>
          <ol className="rx-items">
            {group.lines.map((line) => (
              <li key={line.number} className="rx-item" aria-label={`Medicamento ${line.number}`}>
                <p className="rx-line">
                  <span className="rx-title">{line.number}. {line.title}</span>
                  {line.quantity ? <><span className="rx-leader" aria-hidden="true" /><span className="rx-quantity">{line.quantity}</span></> : null}
                </p>
                {line.directions ? <p className="rx-directions">{line.directions}</p> : null}
              </li>
            ))}
          </ol>
        </section>
      ))}
      {notes.trim() ? <p className="rx-notes"><strong>Observações:</strong> {notes}</p> : null}
    </div>
  );
}
