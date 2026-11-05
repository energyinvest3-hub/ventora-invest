import { isTrustedMutationRequest, rateLimit, readJsonBody, safeApiError } from "@/lib/security";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = (body:unknown,status=200) => Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
const isUuid = (s:string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

export async function POST(request:Request){
  try{
    if(!isTrustedMutationRequest(request))return noStore({error:"Origem inválida."},403);
    const db=await supabaseServer();
    const {data:{user}}=await db.auth.getUser();
    if(!user)return noStore({error:"Entre na sua conta."},401);
    await rateLimit(`admin-withdrawals:${user.id}`,{limit:12,windowSeconds:60});
    const body=await readJsonBody(request);
    const id=String(body.id??"");
    const action=String(body.action??"");
    const paymentReference=String(body.paymentReference??"").trim();
    const reason=String(body.reason??"").trim();
    if(!isUuid(id)||!["complete","cancel"].includes(action))return noStore({error:"Solicitação inválida."},400);
    if(action==="complete" && (paymentReference.length<8||paymentReference.length>160))
      return noStore({error:"Informe uma referência do PIX pago (8 a 160 caracteres)."},400);
    if(action==="cancel" && (reason.length<8||reason.length>240))
      return noStore({error:"Informe o motivo do cancelamento (8 a 240 caracteres)."},400);
    // JWT do admin é validado dentro da função via private.is_admin(), nunca por campo enviado pelo cliente.
    const {data,error}=await db.rpc("admin_resolve_manual_withdrawal",{
      p_withdrawal_id:id,p_action:action,
      p_payment_reference:action==="complete"?paymentReference:null,
      p_reason:action==="cancel"?reason:null,
    });
    if(error){
      if(error.message.includes("ADMIN_REQUIRED"))return noStore({error:"Somente o administrador pode realizar essa ação."},403);
      if(error.message.includes("SAQUE_EM_REVISAO_OU_JA_PROCESSADO"))return noStore({error:"Saque já processado ou em revisão. Atualize o painel e confira o gateway."},409);
      if(error.code==="23505")return noStore({error:"Essa referência de PIX já foi usada em outro saque."},409);
      if(error.code==="PGRST202")return noStore({error:"A atualização do banco ainda não foi instalada."},503);
      console.error("Manual withdrawal action rejected",error.code);
      return noStore({error:"Não foi possível concluir a operação. Nenhum pagamento foi enviado por este site."},400);
    }
    const result=data as {ok?:boolean;alreadyApplied?:boolean;status?:string;refunded?:number}|null;
    if(!result?.ok)return noStore({error:"Operação não confirmada."},500);
    return noStore({ok:true,status:result.status,alreadyApplied:result.alreadyApplied,refunded:result.refunded??0});
  }catch(error){return safeApiError(error);}
}
