import Link from "next/link";
import { notFound } from "next/navigation";
import { directory, loadCatalog } from "../../../../features/athletes/data";
import { CsvImport } from "../../../../features/athletes/csv-import";

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ retorno?: string }> }) {
 const [{ can_create }, catalog, params] = await Promise.all([directory({}), loadCatalog(), searchParams]);
 if (!can_create || !catalog) notFound();
 const returnTo = params.retorno?.startsWith("/atletas?") ? params.retorno : "/atletas";
 return <main id="conteudo" tabIndex={-1} className="traditional-content clinical-page">
  <Link className="back-link" href={returnTo} prefetch={false}>Voltar para atletas</Link>
  <header className="clinical-header"><div><h1>Importar atletas</h1><p>Revise os dados antes de criar os cadastros.</p></div></header>
  <CsvImport catalog={catalog} returnTo={returnTo} />
 </main>;
}
