import { redirect } from "next/navigation";
import { AppProvider } from "@/components/app-provider";
import { AppShell } from "@/components/shell";
import { supabaseServer } from "@/lib/supabase/server";
import type {
  Holding,
  ReferralSummary,
  WalletSummary,
  WalletTransaction,
  WindProject,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const emptyReferral: ReferralSummary = {
  active: true,
  inviteCode: "",
  rewardAmount: 0,
  minPurchaseAmount: 0,
  invitedCount: 0,
  qualifiedCount: 0,
  totalBonus: 0,
  referrals: [],
};

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const db = await supabaseServer();
  const { data: { user }, error: userError } = await db.auth.getUser();
  if (userError || !user) redirect("/login");

  const [
    profileResult,
    walletResult,
    holdingsResult,
    projectsResult,
    transactionsResult,
    referralResult,
  ] = await Promise.all([
    db.from("profiles").select("id,name,email,phone,role,invite_code").eq("id", user.id).maybeSingle(),
    db.from("wallets")
      .select("balance,total_deposited,total_withdrawn,total_earned")
      .eq("user_id", user.id)
      .maybeSingle(),
    db.from("user_projects")
      .select("id,project_slug,quantity,amount_invested,total_received,started_at,status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    db.from("wind_projects")
      .select("slug,name,city,region,image,unit_value,duration_days,projected_scenario,available_units,capacity_mw,status,featured")
      .order("created_at", { ascending: true }),
    db.from("transactions")
      .select("id,type,amount,description,status,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
    db.rpc("get_my_referral_summary"),
  ]);

  const firstError = [
    profileResult,
    walletResult,
    holdingsResult,
    projectsResult,
    transactionsResult,
  ].find((item) => item.error)?.error;

  if (firstError) {
    console.error("Failed to load authenticated Ventora data", firstError.code);
    throw new Error("Não foi possível carregar sua conta com segurança.");
  }

  const holdings: Holding[] = (holdingsResult.data || []).map((row) => ({
    id: String(row.id),
    projectId: String(row.project_slug),
    units: Number(row.quantity),
    amount: Number(row.amount_invested),
    totalReceived: Number(row.total_received || 0),
    startedAt: String(row.started_at),
    status:
      row.status === "finished"
        ? "finished"
        : row.status === "cancelled"
          ? "cancelled"
          : "active",
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

  const transactions: WalletTransaction[] = (transactionsResult.data || []).map((row) => ({
    id: String(row.id),
    type: row.type as WalletTransaction["type"],
    amount: Number(row.amount),
    description: String(row.description || "Movimentação"),
    status: row.status as WalletTransaction["status"],
    createdAt: String(row.created_at),
  }));

  const profile = profileResult.data;
  const wallet = walletResult.data;
  const walletSummary: WalletSummary = {
    balance: Number(wallet?.balance || 0),
    totalDeposited: Number(wallet?.total_deposited || 0),
    totalWithdrawn: Number(wallet?.total_withdrawn || 0),
    totalEarned: Number(wallet?.total_earned || 0),
  };

  const referral = referralResult.error || !referralResult.data
    ? { ...emptyReferral, inviteCode: String(profile?.invite_code || "") }
    : (referralResult.data as unknown as ReferralSummary);

  return (
    <AppProvider
      profile={{
        id: user.id,
        name: profile?.name || user.user_metadata?.name || "Investidor",
        email: profile?.email || user.email || "",
        phone: profile?.phone || "",
        role: profile?.role === "ADMIN" ? "ADMIN" : "USER",
        inviteCode: String(profile?.invite_code || referral.inviteCode || ""),
      }}
      referral={referral}
      initialWallet={walletSummary}
      initialHoldings={holdings}
      initialProjects={projects}
      initialTransactions={transactions}
    >
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
