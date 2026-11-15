import Link from "next/link";
import { notFound } from "next/navigation";
import { availableSections } from "../../../features/sections";
import { requireProfile } from "../../../lib/profile";
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
      <main id="conteudo" tabIndex={-1} className="traditional-content">
        <h1>{current[1].title}</h1>
        <section className="unavailable-state" aria-labelledby="unavailable-title">
          <h2 id="unavailable-title">Este módulo ainda está indisponível</h2>
          <p>{current[1].description}</p>
          <Link href="/" className="outline">Voltar ao chat</Link>
        </section>
      </main>
    </WorkspaceArea>
  );
}
