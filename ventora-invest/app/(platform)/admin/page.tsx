import { redirect } from "next/navigation";
import { AdminPage } from "@/components/admin-page";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Admin() {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await db.rpc("admin_dashboard_snapshot");
  if (error || !data) redirect("/perfil");
  return <AdminPage records={data as Record<string, Record<string, unknown>[]>}/>;
}
