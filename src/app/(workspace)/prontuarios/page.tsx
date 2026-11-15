import { AthleteCatalog } from "../../../features/athletes/catalog";

export default async function RecordsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <AthleteCatalog action="/prontuarios" title="Prontuários" query={(await searchParams).q} params={await searchParams} />;
}
