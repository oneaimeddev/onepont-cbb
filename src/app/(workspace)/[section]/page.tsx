import Link from "next/link";
import { notFound } from "next/navigation";
import { availableSections } from "../../../features/sections";
import { requireProfile } from "../../../lib/profile";
import { EmptyState } from "../../../components/empty-state";
import { WorkspaceArea } from "../../../components/workspace-area";

export default async function TraditionalPage({ params }: {
  params: Promise<{ section: string }>;
}) {
  const profile = await requireProfile();
  const { section } = await params;
  const current = availableSections(profile.can_read_audit).find(([slug]) => slug === section);
  if (!current) notFound();

  return (
    <WorkspaceArea>
      <main id="conteudo" tabIndex={-1} className="traditional-content clinical-page">
        <header className="clinical-header"><h1>{current[1].title}</h1></header>
        <EmptyState icon="lock" title="Este módulo ainda está indisponível">
          <p>{current[1].description}</p>
          <Link href="/" className="outline">Voltar ao chat</Link>
        </EmptyState>
      </main>
    </WorkspaceArea>
  );
}
