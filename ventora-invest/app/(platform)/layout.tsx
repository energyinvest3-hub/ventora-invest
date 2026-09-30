import { redirect } from "next/navigation";
import { AppProvider } from "@/components/app-provider";
import { AppShell } from "@/components/shell";
import { supabaseServer } from "@/lib/supabase/server";
import type { Holding, WindProject } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const db = await supabaseServer();
  const { data: { user }, error: userError } = await db.auth.getUser();
  if (userError || !user) redirect("/login");

  const [profileResult, walletResult, holdingsResult, projectsResult] = await Promise.all([
    db.from("profiles").select("name,email,phone").eq("id", user.id).maybeSingle(),
    db.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
    db.from("user_projects")
      .select("id,project_slug,quantity,amount_invested,started_at,status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    db.from("wind_projects")
      .select("slug,name,city,region,image,unit_value,duration_days,projected_scenario,available_units,capacity_mw,status,featured")
      .order("created_at", { ascending: true }),
  ]);

  const firstError = [profileResult, walletResult, holdingsResult, projectsResult].find((item) => item.error)?.error;
  if (firstError) {
    console.error("Failed to load authenticated Ventora data", firstError.code);
    throw new Error("Não foi possível carregar sua conta com segurança.");
  }

  const holdings: Holding[] = (holdingsResult.data || []).map((row) => ({
    id: String(row.id),
    projectId: String(row.project_slug),
    units: Number(row.quantity),
    amount: Number(row.amount_invested),
    startedAt: String(row.started_at),
    status: row.status === "finished" ? "finished" : "active",
  }));

  const projects: WindProject[] = (projectsResult.data || []).map((row) => ({
    id: String(row.slug),
    name: String(row.name),
    city: String(row.city),
    region: String(row.region),
    image: String(row.image),
    unitValue: Number(row.unit_value),
    termDays: Number(row.duration_days),
    projectedScenario: Number(row.projected_scenario),
    availableUnits: Number(row.available_units),
    capacityMw: Number(row.capacity_mw),
    status: row.status as WindProject["status"],
    featured: Boolean(row.featured),
  }));

  const profile = profileResult.data;
  const wallet = walletResult.data;

  return (
    <AppProvider
      profile={{
        name: profile?.name || user.user_metadata?.name || "Investidor",
        email: profile?.email || user.email || "",
        phone: profile?.phone || "",
      }}
      initialBalance={Number(wallet?.balance || 0)}
      initialHoldings={holdings}
      initialProjects={projects}
    >
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
