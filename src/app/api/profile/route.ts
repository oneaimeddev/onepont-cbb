import { getAccess } from "../../../lib/profile";

export async function GET() {
  const access = await getAccess();
  const body = access.status === 200 ? access.profile : {
    error: access.status === 401 ? "Autenticação necessária." : "Perfil indisponível.",
  };
  return Response.json(body, {
    status: access.status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
