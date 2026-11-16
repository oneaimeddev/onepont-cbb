import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "../../../../components/icon";
import { SubmitButton } from "../../../../components/submit-button";
import { listAthletes } from "../../../../features/athletes/data";
import { createAthlete } from "./actions";

function Optional() {
  return <span className="optional"> (opcional)</span>;
}

export default async function NewAthletePage({ searchParams }: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { can_create } = await listAthletes();
  if (!can_create) notFound();
  const { erro } = await searchParams;
  return (
    <main id="conteudo" tabIndex={-1} className="traditional-content clinical-page">
      <Link className="back-link" href="/atletas" prefetch={false}><Icon name="back" size={18} />Voltar para atletas</Link>
      <header className="clinical-header">
        <div>
          <h1>Cadastrar atleta</h1>
          <p className="notice"><Icon name="info" size={16} />Use dados fictícios no ambiente de demonstração.</p>
        </div>
      </header>
      {erro && <p role="alert">Não foi possível salvar o cadastro. Confira os dados e tente novamente.</p>}
      <form action={createAthlete} className="athlete-form composer-panel">
        <p>Após salvar, abra Dados cadastrais para adicionar a foto do atleta.</p>
        <input type="hidden" name="creation_id" value={randomUUID()} />
        <label>Nome completo<input name="name" required maxLength={160} autoComplete="off" /></label>
        <label>Nome social<Optional /><input name="social" maxLength={160} autoComplete="off" /></label>
        <label>Data de nascimento<Optional /><input name="birth" type="date" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} /></label>
        <div className="form-row">
          <label>Clube ou equipe<Optional /><input name="club" maxLength={120} autoComplete="off" /></label>
          <label>Categoria<Optional /><input name="category" maxLength={120} autoComplete="off" /></label>
        </div>
        <div className="form-actions">
          <SubmitButton pendingLabel="Salvando…">Salvar cadastro</SubmitButton>
          <Link className="ghost-link" href="/atletas" prefetch={false}>Cancelar</Link>
        </div>
      </form>
    </main>
  );
}
