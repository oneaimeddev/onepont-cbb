import Link from "next/link";
import { Avatar } from "../../components/avatar";
import { EmptyState } from "../../components/empty-state";
import { Icon } from "../../components/icon";
import { WorkspaceArea } from "../../components/workspace-area";
import { listAthletes } from "./data";

export async function AthleteCatalog({ title, action, query }: {
  title: string;
  action: "/atletas" | "/prontuarios";
  query?: string | string[];
}) {
  const search = typeof query === "string" ? query.trim().slice(0, 160) : "";
  const { athletes, can_create } = await listAthletes(search);
  const visible = athletes.slice(0, 50);

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
        </form>
        {visible.length === 0 ? (
          <EmptyState icon="search" title={search ? "Nenhum atleta corresponde à busca." : "Nenhum atleta disponível para este perfil."}>
            <p>{search ? "Confira a grafia ou busque pelo identificador interno." : "Atletas aparecem aqui quando seu perfil recebe acesso a eles."}</p>
          </EmptyState>
        ) : (
          <>
            <p className="result-count">
              {visible.length === 1 ? "1 atleta" : `${visible.length} atletas`}{search && ` para “${search}”`}
            </p>
            <ul className="clinical-list athlete-list">
              {visible.map((athlete) => {
                const name = athlete.social_name || athlete.full_name;
                const details = [athlete.team, athlete.category].filter(Boolean);
                return (
                  <li key={athlete.id}>
                    <Avatar name={name} />
                    <div className="athlete-row-main">
                      <Link href={`/atletas/${athlete.id}`} prefetch={false}>{name}</Link>
                      {details.length > 0 && <span className="meta-list">{details.map((item) => <span key={item}>{item}</span>)}</span>}
                      <small className="record-id">{athlete.id}</small>
                    </div>
                    {athlete.status === "inactive" && <span className="pill">Inativo</span>}
                    <Icon name="chevron" size={18} />
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {athletes.length > visible.length && <p className="result-count">Refine a busca para localizar outros atletas.</p>}
      </main>
    </WorkspaceArea>
  );
}
