import Link from "next/link";
import { EmptyState } from "../../components/empty-state";

export default function WorkspaceNotFound() {
  return (
    <main id="conteudo" tabIndex={-1} className="traditional-content clinical-page">
      <header className="clinical-header"><h1>Página indisponível</h1></header>
      <EmptyState icon="info" title="Esta página não existe ou não está disponível para o seu perfil.">
        <p>Abra uma página disponível na navegação do workspace.</p>
        <Link href="/" className="outline">Voltar ao chat</Link>
      </EmptyState>
    </main>
  );
}
