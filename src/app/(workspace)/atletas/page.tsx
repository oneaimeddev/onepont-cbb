import { AthleteCatalog } from "../../../features/athletes/catalog";

export default async function AthletesPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <AthleteCatalog action="/atletas" title="Buscar atleta" query={(await searchParams).q} params={await searchParams} />;
}
