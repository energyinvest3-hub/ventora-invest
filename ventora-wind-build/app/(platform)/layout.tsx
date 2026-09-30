import { redirect } from "next/navigation";
import { AppProvider } from "@/components/app-provider";
import { AppShell } from "@/components/shell";
import { supabaseServer } from "@/lib/supabase/server";
import type { Holding } from "@/lib/types";

export const dynamic = "force-dynamic";
export default async function PlatformLayout({children}:{children:React.ReactNode}){
  const db=await supabaseServer();
  const {data:{user}}=await db.auth.getUser();
  if(!user) redirect("/login");
  const [{data:profile},{data:wallet},{data:rows}] = await Promise.all([
    db.from("profiles").select("name,email,phone").eq("id",user.id).maybeSingle(),
    db.from("wallets").select("balance").eq("user_id",user.id).maybeSingle(),
    db.from("user_projects").select("id,project_slug,quantity,amount_invested,started_at,status").eq("user_id",user.id).order("created_at",{ascending:false}),
  ]);
  const holdings:Holding[]=(rows||[]).map((r:any)=>({id:String(r.id),projectId:String(r.project_slug),units:Number(r.quantity),amount:Number(r.amount_invested),startedAt:String(r.started_at),status:r.status==="finished"?"finished":"active"}));
  return <AppProvider profile={{name:profile?.name || user.user_metadata?.name || "Investidor",email:profile?.email || user.email || "",phone:profile?.phone || ""}} initialBalance={Number(wallet?.balance || 0)} initialHoldings={holdings}><AppShell>{children}</AppShell></AppProvider>;
}
