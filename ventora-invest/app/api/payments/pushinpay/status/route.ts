import { getPushinPayTransaction } from "@/lib/payments/pushinpay";
import {
  clientIp,
  isTrustedMutationRequest,
  rateLimit,
  readJsonBody,
  safeApiError,
} from "@/lib/security";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function readDeposit(db: Awaited<ReturnType<typeof supabaseServer>>, userId: string, id: string) {
  const { data, error } = await db
    .from("deposits")
    .select("id,amount,status,gateway_id,provider_status,pix_code,qr_code_base64,paid_at,reversal_pending,provider_checked_at")
    .eq("id", id)
    .eq("user_id", userId)
    .eq("provider", "pushinpay")
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

function responseDeposit(deposit: Record<string, unknown>) {
  return {
    id: String(deposit.id),
    identifier: String(deposit.gateway_id ?? deposit.id),
    amount: Number(deposit.amount),
    status: deposit.status,
    providerStatus: deposit.provider_status,
    pixCode: deposit.pix_code ?? "",
    qrCodeDataUrl: deposit.qr_code_base64 ?? "",
    reversalPending: Boolean(deposit.reversal_pending),
  };
}

export async function POST(request: Request) {
  try {
    if (!isTrustedMutationRequest(request)) return noStore({ error: "Origem inválida." }, 403);

    const db = await supabaseServer();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return noStore({ error: "Entre na sua conta." }, 401);

    const ip = clientIp(request);
    await rateLimit(`pushinpay-status-user:${user.id}`, { limit: 30, windowSeconds: 60 });
    await rateLimit(`pushinpay-status-ip:${ip}`, { limit: 80, windowSeconds: 60 });

    const body = await readJsonBody(request);
    const id = typeof body.id === "string" ? body.id : "";
    if (!isUuid(id)) return noStore({ error: "Pagamento inválido." }, 400);

    let deposit = await readDeposit(db, user.id, id);
    if (!deposit) return noStore({ error: "Pagamento não encontrado." }, 404);

    if (deposit.status !== "completed" && typeof deposit.gateway_id === "string" && deposit.gateway_id) {
      const admin = supabaseAdmin();
      const { data: claim, error: claimError } = await admin.rpc("claim_pushinpay_reconciliation", {
        p_deposit_id: id,
        p_user_id: user.id,
      });

      if (!claimError && claim && typeof claim === "object" && (claim as { claimed?: boolean }).claimed) {
        try {
          const transaction = await getPushinPayTransaction(String((claim as { gatewayId: string }).gatewayId));
          if (transaction) {
            await admin.rpc("settle_pushinpay_deposit", {
              p_gateway_id: transaction.id,
              p_value_cents: transaction.value,
              p_status: transaction.status,
              p_end_to_end_id: transaction.end_to_end_id ?? null,
            });
          }
        } catch (error) {
          console.error("PushinPay direct status fallback error", error);
        }
        deposit = (await readDeposit(db, user.id, id)) ?? deposit;
      }
    }

    return noStore({ deposit: responseDeposit(deposit as Record<string, unknown>) });
  } catch (error) {
    return safeApiError(error);
  }
}
