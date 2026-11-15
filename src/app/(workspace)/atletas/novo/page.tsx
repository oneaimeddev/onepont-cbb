import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { SubmitButton } from "../../../../components/submit-button";
import { listAthletes } from "../../../../features/athletes/data";
import { createAthlete } from "./actions";

export default async function NewAthletePage({ searchParams }: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { can_create } = await listAthletes();
  if (!can_create) notFound();
  const { erro } = await searchParams;
  return (
    <main id="conteudo" tabIndex={-1} className="traditional-content clinical-page">
      <h1>Cadastrar atleta</h1>
      <p>Use dados fictícios no ambiente de demonstração.</p>
      {erro && <p role="alert">Não foi possível salvar o cadastro. Confira os dados e tente novamente.</p>}
      <form action={createAthlete} className="athlete-form">
        <input type="hidden" name="creation_id" value={randomUUID()} />
        <label>Nome completo<input name="name" required maxLength={160} /></label>
        <label>Nome social<input name="social" maxLength={160} /></label>
        <label>Data de nascimento<input name="birth" type="date" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} /></label>
        <label>Clube ou equipe<input name="club" maxLength={120} /></label>
        <label>Categoria<input name="category" maxLength={120} /></label>
        <SubmitButton pendingLabel="Salvando…">Salvar cadastro</SubmitButton>
      </form>
    </main>
  );
}
