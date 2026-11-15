import Link from "next/link";

export default function WorkspaceNotFound() {
  return (
    <main id="conteudo" tabIndex={-1} className="traditional-content clinical-page">
      <h1>Página indisponível</h1>
      <p>Abra uma página disponível na navegação do workspace.</p>
      <Link href="/" className="clinical-link">Voltar ao chat</Link>
    </main>
  );
}
