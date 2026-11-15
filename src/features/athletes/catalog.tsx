import Link from "next/link";
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
          <h1>{title}</h1>
          {can_create && <Link href="/atletas/novo" prefetch={false} className="button">Cadastrar atleta</Link>}
        </header>
        <form action={action} className="athlete-search">
          <label htmlFor="athlete-search">Nome ou identificador interno</label>
          <div>
            <input type="search" id="athlete-search" name="q" defaultValue={search} maxLength={160} />
            <button className="outline">Buscar</button>
          </div>
        </form>
        {visible.length === 0 ? (
          <p className="clinical-empty">{search ? "Nenhum atleta corresponde à busca." : "Nenhum atleta disponível para este perfil."}</p>
        ) : (
          <ul className="clinical-list">
            {visible.map((athlete) => (
              <li key={athlete.id}>
                <Link href={`/atletas/${athlete.id}`} prefetch={false}>{athlete.social_name || athlete.full_name}</Link>
                <small>{[athlete.team, athlete.category, athlete.status === "inactive" ? "Inativo" : null].filter(Boolean).join(" · ")}</small>
                <small className="record-id">{athlete.id}</small>
              </li>
            ))}
          </ul>
        )}
        {athletes.length > visible.length && <p>Refine a busca para localizar outros atletas.</p>}
      </main>
    </WorkspaceArea>
  );
}
