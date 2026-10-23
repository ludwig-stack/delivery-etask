import { getSessionUser } from "../lib/auth";
import { redirect } from "next/navigation";
import source from "./data/plan.json";
import DeliveryConsole from "./delivery-console";
import type { Plan } from "../lib/delivery";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user=await getSessionUser();
  if(!user) redirect('/login');
  return <DeliveryConsole plan={source as unknown as Plan} viewer={user.displayName} role={user.role} accountOwner={user.owner}/>;
}
