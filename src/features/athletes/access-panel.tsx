import { SubmitButton } from "../../components/submit-button";
import { grantAccess, revokeAccess } from "./access-actions";
import { eventDate, type AccessLink } from "./data";

function capabilities(link: AccessLink) {
  return [
    link.can_read_records ? "leitura" : null,
    link.can_write ? "evolução" : null,
    link.can_finalize ? "finalização" : null,
    link.can_edit ? "cadastro" : null,
  ].filter(Boolean).join(", ");
}

export function AccessPanel({ athleteId, links, matches, term, notice }: {
  athleteId: string;
  links: AccessLink[];
  matches: { id: string; display_name: string; profession: string }[];
  term: string;
  notice: string | null;
}) {
  const linked = new Set(links.map((link) => link.professional_id));
  const available = matches.filter((person) => !linked.has(person.id));
  return (
    <section aria-labelledby="access-title">
      <h2 id="access-title">Profissionais vinculados</h2>
      <p>A concessão inclui leitura do prontuário compartilhado e o registro das próprias evoluções. Não inclui edição do cadastro. Quem administra o acesso não recebe o prontuário.</p>
      {notice && <p role="status">{notice}</p>}
      {links.length ? (
        <ul className="clinical-list">
          {links.map((link) => (
            <li key={link.professional_id}>
              <strong>{link.display_name}</strong>
              <span className="meta-list">
                <span>{link.profession}</span>
                <span>{capabilities(link)}</span>
                <span>{link.granted_by_name ? `Concedido por ${link.granted_by_name}` : "Concessão anterior ao registro"}</span>
                {link.granted_at && <time dateTime={link.granted_at}>{eventDate.format(new Date(link.granted_at))}</time>}
              </span>
              <form action={revokeAccess}>
                <input type="hidden" name="athlete" value={athleteId} />
                <input type="hidden" name="professional" value={link.professional_id} />
                <SubmitButton pendingLabel="Revogando…">Revogar</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      ) : <p>Nenhum profissional vinculado.</p>}
      <form className="athlete-form" action={`/atletas/${athleteId}`} method="get">
        <h2>Conceder acesso</h2>
        <label>Profissional<input name="q" defaultValue={term} minLength={2} maxLength={80} required /></label>
        <input type="hidden" name="aba" value="acesso" />
        <button className="button" type="submit">Buscar</button>
      </form>
      {term.length >= 2 && (available.length ? (
        <ul className="clinical-list">
          {available.map((person) => (
            <li key={person.id}>
              <strong>{person.display_name}</strong>
              <span className="meta-list"><span>{person.profession}</span></span>
              <form action={grantAccess}>
                <input type="hidden" name="athlete" value={athleteId} />
                <input type="hidden" name="professional" value={person.id} />
                <SubmitButton pendingLabel="Concedendo…">Conceder acesso</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      ) : <p>Nenhum profissional encontrado.</p>)}
    </section>
  );
}
