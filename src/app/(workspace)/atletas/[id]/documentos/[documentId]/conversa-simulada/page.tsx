import { notFound } from "next/navigation";
import { requireProfile } from "../../../../../../../lib/profile";
import { supabaseServer } from "../../../../../../../lib/supabase";
import { uuidPattern } from "../../../../../../../features/athletes/data";
import { deliveryEnvironmentAllowed } from "../../../../../../../features/delivery/engine";
import { DeliveryConversation } from "../../../../../../../features/delivery/conversation";

export default async function Page({params}:{params:Promise<{id:string;documentId:string}>}) {
  await requireProfile();
  const {id,documentId}=await params;
  if (!deliveryEnvironmentAllowed(process.env) || !uuidPattern.test(id) || !uuidPattern.test(documentId)) notFound();
  const client=await supabaseServer();
  const {data,error}=await client.rpc("demo_delivery_conversation",{target:documentId});
  if(error||data?.error||data.athleteId!==id) notFound();
  return <DeliveryConversation documentId={documentId} initial={data}/>;
}
