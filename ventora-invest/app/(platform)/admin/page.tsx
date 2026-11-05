import { redirect } from "next/navigation";
import { AdminPage } from "@/components/admin-page";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Admin() {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const [dashboard, withdrawalList] = await Promise.all([
    db.rpc("admin_dashboard_snapshot"),
    db.rpc("admin_withdrawals_snapshot"),
  ]);
  if (dashboard.error || !dashboard.data || withdrawalList.error || !withdrawalList.data) redirect("/perfil");
  return <AdminPage records={{...(dashboard.data as Record<string, Record<string, unknown>[]>),
    withdrawals: withdrawalList.data as Record<string, unknown>[]}}/>;
}
