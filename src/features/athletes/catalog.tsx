import Link from "next/link";
import { redirect } from "next/navigation";
import { saoPauloToday } from "./birth-date";
import { DirectoryFilters } from "./directory-filters";
import { DirectorySports } from "./directory-sports";
import "./directory.css";
import { Avatar } from "../../components/avatar";
import { EmptyState } from "../../components/empty-state";
import { Icon } from "../../components/icon";
import { WorkspaceArea } from "../../components/workspace-area";
import { SubmitButton } from "../../components/submit-button";
import { requireProfile } from "../../lib/profile";
import { openAthleteAccess } from "./access-actions";
import { directory, loadCatalog } from "./data";
import { RegistrationEntry } from "./registration-form";

const filterLabels = { category: "Categoria", division: "Naipe", modality: "Modalidade", club: "Clube de origem" } as const;
const genderLabels: Record<string, string> = { feminino: "Feminino", masculino: "Masculino", nao_binario: "Não binário", outro: "Outro" };

function sportFacts(athlete: { team: string | null; category: string | null; sports?: { category: string; division: string; modality: string; club: string | null }[] }) {
  const sport = athlete.sports?.[0];
  const pairs: [string, string | null][] = sport
    ? [["Categoria", sport.category], ["Naipe", sport.division], ["Modalidade", sport.modality], ["Clube", sport.club]]
    : [["Categoria", athlete.category], ["Clube", athlete.team]];
  return pairs.filter((entry): entry is [string, string] => Boolean(entry[1]));
}

const intentCopy = {
  browse: "Encontre o atleta pelo nome e abra o perfil.",
  evolution: "Escolha o atleta para registrar a evolução. O editor abre direto, sem uma nova busca.",
  record: "Encontre o atleta e abra o prontuário autorizado.",
} as const;

export async function AthleteCatalog({ intent = "browse", action, query, params = {} }: {
  intent?: keyof typeof intentCopy;
  action: "/atletas" | "/prontuarios" | "/evolucoes";
  query?: string | string[];
  params?: Record<string, string | string[] | undefined>;
}) {
  const refined = action === "/atletas";
  const search = typeof query === "string" ? query.trim().slice(0, 160) : "";
  const filters: Record<string, string> = { q: search };
  for (const key of ["category", "division", "modality", "club", "gender", "status", "page"]) {
    if (typeof params[key] === "string") filters[key] = params[key];
  }
  if (!/^\d+$/.test(filters.page ?? "")) filters.page = "1";
  if (refined) filters.page = String(Math.max(1, Math.min(100000, Number(filters.page))));
  const profile = await requireProfile();
  let visible: Awaited<ReturnType<typeof directory>>["athletes"] = [];
  let canCreate = false;
  let total = 0;
  let page = 1;
  let options: Awaited<ReturnType<typeof directory>>["options"] = [];
  let failed = false;
  try {
    const result = await directory(filters);
    visible = result.athletes;
    canCreate = result.can_create;
    total = result.total;
    page = result.page;
    options = result.options;
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    failed = true;
  }
  const lastPage = Math.max(1, Math.ceil(total / 25));
  if (refined && !failed && page > lastPage) {
    redirect(action + "?" + new URLSearchParams({ ...filters, page: String(lastPage) }));
  }
  const catalog = canCreate && action === "/atletas" ? await loadCatalog() : null;
  const returnTo = action + "?" + new URLSearchParams(filters);
  const activeKeys = ["gender", "category", "division", "modality", "club", "status"].filter((key) => filters[key]);
  const activeFilters = activeKeys.length;
  const activeLabels = activeKeys.map((key) => key === "status" ? (filters.status === "inactive" ? "Inativo" : "Ativo")
    : key === "gender" ? `Gênero: ${genderLabels[filters.gender] ?? filters.gender}` : filters[key]);
  const hasCriteria = Boolean(search || activeFilters);
  const filterFields = (
            <div className="filter-grid">
              <label>Gênero<select name="gender" defaultValue={filters.gender ?? ""}><option value="">Todos</option>{Object.entries(genderLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              {(["category", "division", "modality", "club"] as const).map((key) => (
                <label key={key}>{filterLabels[key]}
                  <select name={key} defaultValue={filters[key] ?? ""}>
                    <option value="">Todos</option>
                    {[...new Set(options.map((option) => option[key]).filter(Boolean))].sort().map((value) => <option key={value} value={value!}>{value}</option>)}
                  </select>
                </label>
              ))}
              <label>Status<select name="status" defaultValue={filters.status ?? ""}><option value="">Todos</option><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label>
            </div>
  );
  function pageLink(next: number) {
    return action + "?" + new URLSearchParams({ ...filters, page: String(next) });
  }
  return (
    <WorkspaceArea>
      <main id="conteudo" tabIndex={-1} className={`traditional-content clinical-page${refined ? " athletes-directory" : ""}`}>
        <header className="clinical-header directory-intro">
          <div>
            <h1>Atletas</h1>
            <p>{intentCopy[intent]}</p>
          </div>
          {canCreate && (
            <div className="directory-actions">
              {action === "/atletas" && <Link href={`/atletas/importar?retorno=${encodeURIComponent(returnTo)}`} prefetch={false} className="outline">Importar CSV</Link>}
              {catalog ? <RegistrationEntry catalog={catalog} initialToday={saoPauloToday()} /> : (
                <Link href="/atletas/novo" prefetch={false} className="button"><Icon name="plus" size={18} />Cadastrar atleta</Link>
              )}
            </div>
          )}
        </header>
        <form action={action} className="directory-search" role="search">
          <label htmlFor="athlete-search">Nome do atleta</label>
          <div className="search-row">
            <span className="search-field">
              <Icon name="search" size={18} />
              <input type="search" id="athlete-search" name="q" defaultValue={search} maxLength={160} />
            </span>
            <button className="directory-submit">Buscar</button>
          </div>
          {refined ? <DirectoryFilters key={JSON.stringify(filters)} count={activeFilters}>{filterFields}</DirectoryFilters> : (
            <details className="directory-filters" open={activeFilters > 0 || undefined}>
              <summary>Filtros{activeFilters > 0 ? <span className="filter-count">{activeFilters}</span> : null}</summary>
              {filterFields}
            </details>
          )}
          {(activeLabels.length > 0 || (refined && search)) ? (
            <p className="filter-applied">{activeLabels.join(", ")} <Link href={action} prefetch={false}>{refined ? "Limpar busca e filtros" : "Limpar filtros"}</Link></p>
          ) : null}
        </form>
        {action === "/atletas" && profile.can_manage_access && (
          <form action={openAthleteAccess} className="athlete-form">
            <h2>Gerenciar acesso</h2>
            <label>Identificador do atleta<input name="athlete" required spellCheck={false} pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" /></label>
            <SubmitButton pendingLabel="Abrindo…">Abrir vínculos</SubmitButton>
          </form>
        )}
        {failed ? (
          <EmptyState icon="search" title="Não foi possível carregar os atletas.">
            <p>A busca autorizada não respondeu. Tente de novo.</p>
            <Link href={action} prefetch={false} className="outline">Tentar de novo</Link>
          </EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState icon="search" title={refined && hasCriteria ? "Nenhum atleta corresponde aos critérios aplicados." : search ? "Nenhum atleta corresponde à busca." : "Nenhum atleta disponível para este perfil."}>
            <p>{refined && hasCriteria ? "Ajuste os critérios de busca e filtros para tentar novamente." : search ? "Confira a grafia ou busque pelo nome." : "Atletas aparecem aqui quando seu perfil recebe acesso a eles."}</p>
          </EmptyState>
        ) : (
          <>
            <p className="result-count">
              {total === 1 ? "1 atleta" : `${total} atletas`}{search && ` para “${search}”`}
            </p>
            {refined && <p className="directory-order">Ordem por nome completo.</p>}
            <ul className="clinical-list athlete-list">
              {visible.map((athlete) => {
                const name = athlete.social_name || athlete.full_name;
                const legal = athlete.social_name && athlete.social_name !== athlete.full_name ? athlete.full_name : null;
                const facts = sportFacts(athlete);
                const profileHref = `/atletas/${athlete.id}?retorno=${encodeURIComponent(returnTo)}`;
                const href = intent === "evolution" ? `/atletas/${athlete.id}/evolucao` : profileHref;
                return (
                  <li key={athlete.id}>
                    <Avatar name={name} athleteId={athlete.id} photoVersion={athlete.photo_version} />
                    <div className="athlete-row-main">
                      <Link href={href} prefetch={false}>{name}</Link>
                      {legal ? <span className="directory-legal">{legal}</span> : null}
                      {refined ? <DirectorySports sports={athlete.sports} category={athlete.category} team={athlete.team} filters={filters} /> : facts.length > 0 && (
                        <span className="directory-facts">
                          {facts.map(([label, value]) => <span key={label}><span className="sr-only">{label}: </span>{value}</span>)}
                        </span>
                      )}
                      <span className="record-id sr-only" aria-hidden={refined || undefined}>{athlete.id}</span>
                    </div>
                    <div className="athlete-row-side">
                      {intent === "evolution" ? <span className="athlete-row-action">Nova evolução</span> : null}
                      {athlete.status === "inactive" && <span className="pill">Inativo</span>}
                      <Icon name="chevron" size={18} />
                    </div>
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
