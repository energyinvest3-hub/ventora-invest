import { getPushinPayTransaction } from "@/lib/payments/pushinpay";
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
  const {data:rows,error} = await admin.from("deposits")
    .select("id,user_id,gateway_id,status,provider_status")
    .eq("provider","pushinpay")
    .in("status",["pending","cancelled"])
    .not("gateway_id","is",null)
    .order("provider_checked_at",{ascending:true,nullsFirst:true})
    .limit(15);
  if(error) throw new Error("Falha ao consultar depósitos no Supabase.");
  let checked=0,credited=0,failed=0,notFound=0,skipped=0;
  const providerStatuses:Record<string,number>={};
  const gatewayChecks:{gatewayId:string;status:string;amountCents:number}[]=[];
  for(const row of rows || []){
    const {data:claim,error:claimError}=await admin.rpc("claim_pushinpay_reconciliation",{
      p_deposit_id:row.id,p_user_id:row.user_id
    });
    if(claimError){failed++;console.error("Pix claim error",claimError.code);continue;}
    if(!claim || typeof claim!=="object" || !(claim as {claimed?:boolean}).claimed){skipped++;continue;}
    checked++;
    try{
      const gatewayId=String((claim as {gatewayId:string}).gatewayId);
      const tx=await getPushinPayTransaction(gatewayId);
      if(!tx){notFound++;continue;}
      if(tx.id!==gatewayId){failed++;console.error("Pix ID mismatch",gatewayId);continue;}
      const status=String(tx.status).toLowerCase();
      providerStatuses[status]=(providerStatuses[status]||0)+1;
      gatewayChecks.push({gatewayId,status,amountCents:tx.value});
      if(status==="paid" && row.status==="cancelled"){
        const {data:restored,error:restoreError}=await admin.rpc("reopen_pushinpay_local_cancelled",{
          p_gateway_id:tx.id,p_value_cents:tx.value,
        });
        if(restoreError || !restored){failed++;console.error("Pix cancelled restore requires review",gatewayId);continue;}
      }
      const {data,error:settleError}=await admin.rpc("settle_pushinpay_deposit",{
        p_gateway_id:tx.id,p_value_cents:tx.value,p_status:tx.status,
        p_end_to_end_id:tx.end_to_end_id ?? null,
      });
      if(settleError){failed++;console.error("Pix settle error",gatewayId,settleError.code);continue;}
      if(data && typeof data==="object" && (data as {credited?:boolean}).credited) credited++;
    }catch(error){failed++;console.error("Pix gateway reconciliation failure",error instanceof Error ? error.name : "unknown");}
  }
  return {ok:failed===0,checked,credited,failed,notFound,skipped,providerStatuses,gatewayChecks};
}

export async function GET(request:Request){
  const secret=process.env.CRON_SECRET;
  if(!secret || request.headers.get("authorization")!==`Bearer ${secret}`)
    return respond({error:"Não autorizado"},401);
  try{
    const result=await runReconciliation();
    return respond(result,result.failed>0?503:200);
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
    return respond(result,result.failed>0?503:200);
  }catch(error){
    console.error("Pix admin reconcile error",error instanceof Error ? error.name : "unknown");
    return respond({error:"Não foi possível verificar os pagamentos agora. Aguarde e tente novamente."},503);
  }
}
