import { AthleteCatalog } from "../../../features/athletes/catalog";

export default async function AthletesPage({ searchParams }: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  return <AthleteCatalog action="/atletas" title="Buscar atleta" query={(await searchParams).q} />;
}
