import { getPushinPayTransaction, PushinPayHttpError } from "@/lib/payments/pushinpay";
import { isTrustedMutationRequest, rateLimit } from "@/lib/security";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function respond(data: unknown, status=200) {
  return Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
}

async function runReconciliation() {
  const admin = supabaseAdmin();
  const { data: rows, error } = await admin.from("deposits")
    .select("id,user_id,gateway_id,status,provider_status")
    .eq("provider", "pushinpay")
    .in("status", ["pending", "cancelled"])
    .not("gateway_id", "is", null)
    .order("provider_checked_at", { ascending: true, nullsFirst: true })
    .limit(8);
  if (error) throw new Error("Falha ao consultar depósitos no Supabase.");

  let checked = 0, credited = 0, failed = 0, notFound = 0, skipped = 0;
  const providerStatuses: Record<string, number> = {};
  const gatewayChecks: { gatewayId: string; status: string; amountCents: number }[] = [];
  const issues: { gatewayId: string; stage: string; code: string }[] = [];

  const recordIssue = (gatewayId: string, stage: string, code: string) => {
    failed++;
    issues.push({ gatewayId, stage, code });
    console.error("PIX reconciliation issue", { stage, code, gatewayId });
  };
  const errorCode = (value: unknown): string => {
    if (value instanceof PushinPayHttpError) return `HTTP_${value.status}`;
    if (value instanceof Error && value.message === "PUSHINPAY_INVALID_TRANSACTION_RESPONSE")
      return "GATEWAY_RESPOSTA_INVALIDA";
    if (value instanceof Error && value.message.includes("fetch")) return "GATEWAY_REDE";
    return "GATEWAY_ERRO_DESCONHECIDO";
  };

  for (const row of rows || []) {
    const gatewayId = String(row.gateway_id || "");
    const { data: claim, error: claimError } = await admin.rpc("claim_pushinpay_reconciliation", {
      p_deposit_id: row.id, p_user_id: row.user_id,
    });
    if (claimError) {
      recordIssue(gatewayId, "claim", `SUPABASE_${claimError.code || "ERRO"}`);
      continue;
    }
    if (!claim || typeof claim !== "object" || !(claim as { claimed?: boolean }).claimed) {
      skipped++;
      continue;
    }
    checked++;

    let tx;
    try {
      tx = await getPushinPayTransaction(gatewayId);
    } catch (error) {
      const code = errorCode(error);
      recordIssue(gatewayId, "consultar_gateway", code);
      if (code === "HTTP_401" || code === "HTTP_403" || code === "HTTP_429") {
        // Falha de autenticacao/permissao/limite: nao martelar as outras cobrancas.
        break;
      }
      continue;
    }

    if (!tx) {
      notFound++;
      issues.push({ gatewayId, stage: "consultar_gateway", code: "TRANSACAO_NAO_ENCONTRADA" });
      continue;
    }
    if (tx.id.toLowerCase() !== gatewayId.toLowerCase()) {
      recordIssue(gatewayId, "validar_id", "GATEWAY_ID_DIFERENTE");
      continue;
    }
    const status = String(tx.status).toLowerCase();
    providerStatuses[status] = (providerStatuses[status] || 0) + 1;
    gatewayChecks.push({ gatewayId, status, amountCents: tx.value });
    // Nao ha credito por comprovante, horario, saldo aparente ou status 'created'.
    if (status === "paid" && row.status === "cancelled") {
      const { data: restored, error: restoreError } = await admin.rpc("reopen_pushinpay_local_cancelled", {
        p_gateway_id: tx.id, p_value_cents: tx.value,
      });
      if (restoreError || !restored) {
        recordIssue(gatewayId, "reabrir_cancelamento_local", `SUPABASE_${restoreError?.code || "REVISAR"}`);
        continue;
      }
    }
    const { data: settled, error: settleError } = await admin.rpc("settle_pushinpay_deposit", {
      p_gateway_id: tx.id,
      p_value_cents: tx.value,
      p_status: tx.status,
      p_end_to_end_id: tx.end_to_end_id ?? null,
    });
    if (settleError) {
      recordIssue(gatewayId, "creditar_carteira", `SUPABASE_${settleError.code || "ERRO"}`);
      continue;
    }
    if (settled && typeof settled === "object") {
      if ((settled as { credited?: boolean }).credited) credited++;
      const reason = (settled as { reason?: string }).reason;
      if (status === "paid" && reason) recordIssue(gatewayId, "creditar_carteira", `RPC_${reason}`);
    }
  }

  return { ok: failed === 0 && notFound === 0, checked, credited, failed,
    notFound, skipped, providerStatuses, gatewayChecks, issues,
    explanation: "Saldo so e creditado quando a PushinPay retorna paid com ID e valor coincidentes." };
}

export async function GET(request:Request){
  const secret=process.env.CRON_SECRET;
  if(!secret || request.headers.get("authorization")!==`Bearer ${secret}`)
    return respond({error:"Não autorizado"},401);
  try{
    const result=await runReconciliation();
    return respond(result);
  }catch(error){
    console.error("Pix cron error",error instanceof Error ? error.name : "unknown");
    return respond({error:"Não foi possível consultar pagamentos no momento."},503);
  }
}

// Atualização manual permitida SOMENTE a administrador autenticado. Sem CRON_SECRET no navegador.
export async function POST(request:Request){
  if(!isTrustedMutationRequest(request)) return respond({error:"Origem inválida."},403);
  try{
    const db=await supabaseServer();
    const {data:{user}}=await db.auth.getUser();
    if(!user) return respond({error:"Entre na conta administrativa."},401);
    // A RPC valida a identidade administrativa real (UUID) no Supabase.
    const {data:authorized,error:authError}=await db.rpc("admin_dashboard_snapshot");
    if(authError || !authorized) return respond({error:"Acesso restrito ao administrador."},403);
    await rateLimit(`ventora-admin-pix:${user.id}`,{limit:2,windowSeconds:120});
    const result=await runReconciliation();
    return respond(result);
  }catch(error){
    console.error("Pix admin reconcile error",error instanceof Error ? error.name : "unknown");
    return respond({error:"Não foi possível verificar os pagamentos agora. Aguarde e tente novamente."},503);
  }
}
