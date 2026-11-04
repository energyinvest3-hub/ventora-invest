import { isTrustedMutationRequest, rateLimit, readJsonBody, safeApiError, clientIp } from "@/lib/security";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function amountFromString(value:unknown,allowZero=false):string|null {
  if(typeof value!=="string" || !/^\d{1,7}\.\d{2}$/.test(value))return null;
  const n=Number(value);
  if(!Number.isFinite(n)||n<0||(!allowZero&&n===0))return null;
  return n.toFixed(2);
}
function noStore(value:unknown,status=200){return Response.json(value,{status,headers:{"Cache-Control":"no-store"}});}

export async function POST(request:Request){
  try{
    if(!isTrustedMutationRequest(request))return noStore({error:"Origem inválida."},403);
    const db=await supabaseServer();
    const {data:{user}}=await db.auth.getUser();
    if(!user)return noStore({error:"Faça login novamente."},401);
    await rateLimit(`admin-wallet:${user.id}`,{limit:6,windowSeconds:60});
    await rateLimit(`admin-wallet-ip:${clientIp(request)}`,{limit:12,windowSeconds:60});
    const body=await readJsonBody(request);
    const userId=String(body.userId||"");
    const requestId=String(body.requestId||"");
    const mode=String(body.mode||"");
    const reason=String(body.reason||"").trim();
    const amount=amountFromString(body.amount,true);
    const expectedBalance=amountFromString(body.expectedBalance,true);
    if(!uuidPattern.test(userId)||!uuidPattern.test(requestId)||!["credit","debit","set"].includes(mode)
       ||amount===null||expectedBalance===null||reason.length<8||reason.length>240
       ||Number(amount)>50000||Number(expectedBalance)<0||(mode!=="set"&&Number(amount)===0)){
      return noStore({error:"Confira o usuário, valor, motivo e tipo de ajuste."},400);
    }
    // A função SQL verifica private.is_admin() e usa auth.uid(): nunca confia em role passada pelo cliente.
    const {data,error}=await db.rpc("admin_adjust_wallet_secure",{
      p_user_id:userId,p_mode:mode,p_amount:amount,p_expected_balance:expectedBalance,
      p_reason:reason,p_request_id:requestId
    });
    if(error){
      const message=error.message||"";
      if(message.includes("ADMIN_REQUIRED"))return noStore({error:"Acesso permitido apenas ao administrador."},403);
      if(message.includes("SALDO_ALTERADO_ATUALIZE_PAINEL"))return noStore({error:"O saldo mudou desde que você abriu esta tela. Atualize o painel e tente novamente."},409);
      if(message.includes("SALDO_INSUFICIENTE"))return noStore({error:"Saldo insuficiente para esse ajuste."},400);
      if(message.includes("SOLICITACAO_DUPLICADA_DIVERGENTE"))return noStore({error:"Essa solicitação já foi usada com dados diferentes. Feche e abra o formulário novamente."},409);
      if(message.includes("SEM_ALTERACAO"))return noStore({error:"O saldo final precisa ser diferente do atual."},400);
      if(message.includes("function public.admin_adjust_wallet_secure")||message.includes("PGRST202"))return noStore({error:"A atualização do banco ainda não foi ativada. Nenhum saldo foi alterado."},503);
      console.error("admin wallet adjustment rejected",error.code);
      return noStore({error:"Não foi possível registrar o ajuste. Verifique o painel de auditoria."},400);
    }
    const result=data as {ok?:boolean;oldBalance?:number;newBalance?:number;delta?:number;alreadyApplied?:boolean;transactionId?:string}|null;
    if(!result?.ok)return noStore({error:"O banco não confirmou o ajuste."},500);
    return noStore({ok:true,oldBalance:result.oldBalance,newBalance:result.newBalance,
      delta:result.delta,alreadyApplied:result.alreadyApplied,transactionId:result.transactionId});
  }catch(error){return safeApiError(error);}
}
