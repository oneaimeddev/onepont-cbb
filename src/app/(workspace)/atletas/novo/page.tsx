import Link from "next/link";
import { saoPauloToday } from "../../../../features/athletes/birth-date";
import { notFound } from "next/navigation";
import { Icon } from "../../../../components/icon";
import { listAthletes, loadCatalog } from "../../../../features/athletes/data";
import { RegistrationForm } from "../../../../features/athletes/registration-form";

export default async function NewAthletePage({ searchParams }: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { can_create } = await listAthletes();
  if (!can_create) notFound();
  const catalog = await loadCatalog();
  if (!catalog) notFound();
  const { erro } = await searchParams;
  return (
    <main id="conteudo" tabIndex={-1} className="traditional-content clinical-page">
      <Link className="back-link" href="/atletas" prefetch={false}><Icon name="back" size={18} />Voltar para atletas</Link>
      <header className="clinical-header">
        <div>
          <h1>Cadastrar atleta</h1>
        </div>
      </header>
      {erro && <p role="alert">Não foi possível salvar o cadastro. Confira os dados e tente novamente.</p>}
      <RegistrationForm catalog={catalog} initialToday={saoPauloToday()} />
    </main>
  );
}
