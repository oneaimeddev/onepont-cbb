import Link from "next/link";
import { Avatar } from "../../components/avatar";
import { EmptyState } from "../../components/empty-state";
import { Icon } from "../../components/icon";
import { WorkspaceArea } from "../../components/workspace-area";
import { SubmitButton } from "../../components/submit-button";
import { requireProfile } from "../../lib/profile";
import { openAthleteAccess } from "./access-actions";
import { directory } from "./data";

export async function AthleteCatalog({ title, action, query, params = {} }: {
  title: string;
  action: "/atletas" | "/prontuarios";
  query?: string | string[];
  params?: Record<string, string | string[] | undefined>;
}) {
  const search = typeof query === "string" ? query.trim().slice(0, 160) : "";
  const filters: Record<string,string> = { q: search };
  for (const key of ["category", "division", "modality", "club", "status", "page"]) {
    if (typeof params[key] === "string") filters[key] = params[key] as string;
  }
  if (!/^\d+$/.test(filters.page ?? "")) filters.page = "1";
  const profile = await requireProfile();
  const { athletes: visible, can_create, total, page, options } = await directory(filters);
  const returnTo = action + "?" + new URLSearchParams(filters);
  function pageLink(next: number) {
    return action + "?" + new URLSearchParams({ ...filters, page: String(next) });
  }

  return (
    <WorkspaceArea>
      <main id="conteudo" tabIndex={-1} className="traditional-content clinical-page">
        <header className="clinical-header">
          <div>
            <h1>{title}</h1>
            <p>Atletas aos quais seu perfil tem acesso.</p>
          </div>
          {can_create && (
            <Link href="/atletas/novo" prefetch={false} className="button"><Icon name="plus" size={18} />Cadastrar atleta</Link>
          )}
        </header>
        <form action={action} className="athlete-search" role="search">
          <label htmlFor="athlete-search">Nome ou identificador interno</label>
          <div>
            <span className="search-field">
              <Icon name="search" size={18} />
              <input type="search" id="athlete-search" name="q" defaultValue={search} maxLength={160} />
            </span>
            <button className="outline">Buscar</button>
          </div>
          <div className="directory-filters">
            {(["category", "division", "modality", "club"] as const).map((key) => (
              <label key={key}>{({ category: "Categoria", division: "Naipe", modality: "Modalidade", club: "Clube" })[key]}
                <select name={key} defaultValue={filters[key] ?? ""}>
                  <option value="">Todos</option>
                  {[...new Set(options.map((option) => option[key]).filter(Boolean))].sort().map((value) => <option key={value} value={value!}>{value}</option>)}
                </select>
              </label>
            ))}
            <label>Status<select name="status" defaultValue={filters.status ?? ""}><option value="">Todos</option><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label>
            <Link className="clinical-link" href={action} prefetch={false}>Limpar filtros</Link>
          </div>
        </form>
        {action === "/atletas" && profile.can_manage_access && (
          <form action={openAthleteAccess} className="athlete-form">
            <h2>Gerenciar acesso</h2>
            <label>Identificador do atleta<input name="athlete" required spellCheck={false} pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" /></label>
            <SubmitButton pendingLabel="Abrindo…">Abrir vínculos</SubmitButton>
          </form>
        )}
        {visible.length === 0 ? (
          <EmptyState icon="search" title={search ? "Nenhum atleta corresponde à busca." : "Nenhum atleta disponível para este perfil."}>
            <p>{search ? "Confira a grafia ou busque pelo identificador interno." : "Atletas aparecem aqui quando seu perfil recebe acesso a eles."}</p>
          </EmptyState>
        ) : (
          <>
            <p className="result-count">
              {total === 1 ? "1 atleta" : `${total} atletas`}{search && ` para “${search}”`}
            </p>
            <ul className="clinical-list athlete-list">
              {visible.map((athlete) => {
                const name = athlete.social_name || athlete.full_name;
                const details = [...new Set([athlete.team, athlete.category, ...(athlete.sports ?? []).flatMap((sport) => [sport.category, sport.division, sport.modality, sport.club])].filter(Boolean))];
                return (
                  <li key={athlete.id}>
                    <Avatar name={name} athleteId={athlete.id} photoVersion={athlete.photo_version} />
                    <div className="athlete-row-main">
                      <Link href={`/atletas/${athlete.id}?retorno=${encodeURIComponent(returnTo)}`} prefetch={false}>{name}</Link>
                      {details.length > 0 && <span className="meta-list">{details.map((item) => <span key={item}>{item}</span>)}</span>}
                      <small className="record-id">{athlete.id}</small>
                      {athlete.birth_date && <small>Nascimento {athlete.birth_date.split("-").reverse().join("/")}</small>}
                    </div>
                    {athlete.status === "inactive" && <span className="pill">Inativo</span>}
                    <Icon name="chevron" size={18} />
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <nav className="pagination" aria-label="Paginação">
          {page > 1 && <Link className="outline" prefetch={false} href={pageLink(page - 1)}>Anterior</Link>}
          <span>Página {page} de {Math.max(1, Math.ceil(total / 25))}</span>
          {page * 25 < total && <Link className="outline" prefetch={false} href={pageLink(page + 1)}>Próxima</Link>}
        </nav>
      </main>
    </WorkspaceArea>
  );
}
