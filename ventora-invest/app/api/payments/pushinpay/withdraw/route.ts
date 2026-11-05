import { clientIp, isTrustedMutationRequest, rateLimit, readJsonBody, safeApiError } from "@/lib/security";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

function withdrawalWindow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const weekday = parts.find(p => p.type === "weekday")?.value;
  const hour = Number(parts.find(p => p.type === "hour")?.value ?? "-1");
  return weekday !== "Sat" && weekday !== "Sun" && hour >= 9 && hour < 18;
}

// Apesar do endereço histórico da API, ESTA rota não envia dinheiro à PushinPay.
// Ela só cria uma reserva + pedido de saque pendente para pagamento manual no admin.
export async function POST(request: Request) {
  try {
    if (!isTrustedMutationRequest(request)) return noStore({error:"Origem inválida."},403);
    const db = await supabaseServer();
    const {data:{user}} = await db.auth.getUser();
    if (!user) return noStore({error:"Entre na sua conta."},401);
    if (!withdrawalWindow()) return noStore({error:"Saques somente de segunda a sexta, das 9h às 18h (Brasília)."},403);
    await rateLimit(`withdraw-request:${user.id}`,{limit:2,windowSeconds:60});
    await rateLimit(`withdraw-ip:${clientIp(request)}`,{limit:6,windowSeconds:60});
    const body = await readJsonBody(request);
    const inputAmount = Number(body.amount);
    const amount = Math.round(inputAmount * 100)/100;
    const type = String(body.pixKeyType??"");
    const key = String(body.pixKey??"").trim();
    const document = digits(body.receiverNationalRegistration);
    if (!Number.isFinite(amount) || Math.abs(inputAmount-amount)>0.000001 || amount<1.05 || amount>100000)
      return noStore({error:"Informe valor entre R$ 1,05 e R$ 100.000,00 com duas casas decimais."},400);
    if (!["cpf","email","phone","random"].includes(type)) return noStore({error:"Tipo de chave PIX inválido."},400);
    if (key.length<3 || key.length>200 || ![11,14].includes(document.length))
      return noStore({error:"Informe uma chave PIX e CPF/CNPJ do titular válidos."},400);
    if (type==="cpf" && (digits(key).length!==11 || digits(key)!==document))
      return noStore({error:"Chave PIX CPF e CPF do titular devem coincidir."},400);
    if (type==="email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key))
      return noStore({error:"Informe um e-mail PIX válido."},400);
    if (type==="phone" && !/^\+?55\d{10,11}$/.test(key.replace(/[^\d+]/g,"")))
      return noStore({error:"Informe o telefone PIX com DDI +55."},400);
    if (type==="random" && !/^[0-9a-f-]{32,36}$/i.test(key))
      return noStore({error:"Chave PIX aleatória inválida."},400);
    const admin = supabaseAdmin();
    const {data,error} = await admin.rpc("server_create_manual_withdrawal",{
      p_user_id:user.id,p_amount:amount,p_pix_key_type:type,p_pix_key:key,
      p_receiver_national_registration:document,
    });
    if(error){
      if(error.message.includes("Saques permitidos"))return noStore({error:error.message},403);
      if(error.message.includes("já tem um saque pendente"))return noStore({error:error.message},409);
      if(error.message.includes("Saldo insuficiente"))return noStore({error:error.message},400);
      if(error.code==="PGRST202")return noStore({error:"Atualização financeira ainda não ativada. Tente novamente mais tarde."},503);
      console.error("Failed to create manual withdrawal",error.code);
      return noStore({error:"Não foi possível registrar o saque. Nenhum pagamento foi enviado."},400);
    }
    const row = (Array.isArray(data) ? data[0] : data) as Record<string,unknown>|null;
    if(!row?.id)return noStore({error:"Solicitação não confirmada pelo banco."},503);
    return noStore({ok:true,withdrawal:{id:row.id,status:"pending",amount:Number(row.amount),
      feeAmount:Number(row.fee_amount),netAmount:Number(row.net_amount)},
      message:"Saque solicitado com sucesso. O valor está reservado e aguarda pagamento manual pelo responsável."});
  } catch(error) {
    return safeApiError(error);
  }
}
