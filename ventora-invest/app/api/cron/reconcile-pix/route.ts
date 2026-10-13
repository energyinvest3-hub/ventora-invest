import { getPushinPayTransaction } from "@/lib/payments/pushinpay";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }
  const admin = supabaseAdmin();
  const { data: rows, error } = await admin.from("deposits")
    .select("id,user_id,gateway_id,status,provider_status")
    .eq("provider", "pushinpay")
    .eq("status", "pending")
    .not("gateway_id", "is", null)
    .order("provider_checked_at", { ascending: true, nullsFirst: true }).limit(25);
  if (error) return Response.json({ error: "Falha ao consultar depósitos" }, {status:503});
  let checked=0, credited=0, failed=0;
  for (const row of rows || []) {
    const { data: claim, error: claimError } = await admin.rpc("claim_pushinpay_reconciliation", {
      p_deposit_id: row.id, p_user_id: row.user_id,
    });
    if (claimError || !claim || typeof claim !== "object" || !(claim as {claimed?:boolean}).claimed) continue;
    checked++;
    try {
      const tx = await getPushinPayTransaction(String((claim as {gatewayId:string}).gatewayId));
      if (!tx) continue;
      const {data, error: settleError} = await admin.rpc("settle_pushinpay_deposit", {
        p_gateway_id: tx.id,
        p_value_cents: tx.value,
        p_status: tx.status,
        p_end_to_end_id: tx.end_to_end_id ?? null,
      });
      if (settleError) {failed++; continue;}
      if (data && typeof data === "object" && (data as {credited?:boolean}).credited) credited++;
    } catch {failed++;}
  }
  return Response.json({ok:true,checked,credited,failed}, {headers:{"Cache-Control":"no-store"}});
}
