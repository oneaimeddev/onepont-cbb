import { z } from "zod";
import { getAccess } from "../../../../lib/profile";
import { activityFilterSchema } from "../../../../features/clinical-search/contract";
import { queryClinicalActivity } from "../../../../features/clinical-search/service";
import { sameAttachmentOrigin } from "../../../../features/attachments/service";
const schema = z
  .object({
    filters: activityFilterSchema,
    page: z.number().int().min(1).max(20000).default(1),
    athleteId: z.string().uuid().optional(),
    sourcePage: z.number().int().min(1).max(20000).default(1),
    mode: z.enum(["text", "voice"]).default("text"),
  })
  .strict();
export async function POST(request: Request) {
  if (!sameAttachmentOrigin(request))
    return Response.json({ error: "Origem inválida." }, { status: 403 });
  const access = await getAccess();
  if (access.status !== 200)
    return Response.json(
      { error: "Sessão indisponível." },
      { status: access.status },
    );
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Consulta inválida." }, { status: 400 });
  }
  const input = schema.safeParse(body);
  if (!input.success)
    return Response.json({ error: "Filtros inválidos." }, { status: 400 });
  const result = await queryClinicalActivity(
    input.data.filters,
    input.data.mode,
    "human",
    input.data.page,
    input.data.athleteId,
    input.data.sourcePage,
  );
  return Response.json(result.data ?? { error: result.error }, {
    status: result.data ? 200 : 503,
    headers: { "Cache-Control": "private, no-store" },
  });
}
