import { getAccess } from "../../../../lib/profile";
import { supabaseServer } from "../../../../lib/supabase";
import { deliveryEnvironmentAllowed } from "../../../../features/delivery/engine";
import { uuidPattern } from "../../../../features/athletes/data";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  const access = await getAccess();
  if (access.status !== 200) return Response.json({ error:"unavailable" }, {status:access.status,headers});
  if (!deliveryEnvironmentAllowed(process.env)) return Response.json({error:"unavailable"},{status:404,headers});
  const url = new URL(request.url), documentId = url.searchParams.get("document"), attachment = url.searchParams.get("attachment");
  if (!documentId || !uuidPattern.test(documentId) || (attachment && !uuidPattern.test(attachment)))
    return Response.json({error:"invalid"},{status:400,headers});
  try {
    const client = await supabaseServer();
    const {data,error} = await client.rpc("demo_delivery_conversation", {target:documentId,attachment:attachment ?? null});
    if (error || data?.error) return Response.json({error:"unavailable"},{status:404,headers});
    if (!attachment) return Response.json(data,{headers});
    const message = data.messages.find((m: {id:string;pdf:string|null}) => m.id===attachment);
    if (!message?.pdf) return Response.json({error:"unavailable"},{status:404,headers});
    return new Response(Buffer.from(message.pdf,"base64"),{headers:{...headers,
      "Content-Type":"application/pdf",
      "Content-Disposition":`${url.searchParams.get("download")==="1" ? "attachment" : "inline"}; filename="prescricao-demo-v${message.version}.pdf"`,
      "Content-Security-Policy":"frame-ancestors 'self'",
    }});
  } catch { return Response.json({error:"unavailable"},{status:503,headers}); }
}
