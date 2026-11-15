import { AthleteCatalog } from "../../../features/athletes/catalog";

export default async function RecordsPage({ searchParams }: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  return <AthleteCatalog action="/prontuarios" title="Prontuários" query={(await searchParams).q} />;
}
