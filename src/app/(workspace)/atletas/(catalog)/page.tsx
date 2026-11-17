import { AthleteCatalog } from "../../../../features/athletes/catalog";

export default async function AthletesPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <AthleteCatalog action="/atletas" intent="browse" query={(await searchParams).q} params={await searchParams} />;
}
