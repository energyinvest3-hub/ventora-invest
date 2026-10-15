import {
  createPushinPayCashOut,
  getPushinPayConfig,
  pushinPayWebhookUrl,
  PushinPayCashOutError,
} from "@/lib/payments/pushinpay";
import { clientIp, isTrustedMutationRequest, rateLimit, readJsonBody, safeApiError } from "@/lib/security";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
function firstRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? (data[0] ?? null) : data;
}
function digits(value: unknown) { return String(value ?? "").replace(/\D/g, ""); }
function isWithdrawalWindowBrasilia() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date());
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "-1");
  return weekday !== "Sat" && weekday !== "Sun" && hour === 9;
}

export async function POST(request: Request) {
  let withdrawalId: string | null = null;
  try {
    if (!isTrustedMutationRequest(request)) return noStore({ error: "Origem inválida." }, 403);

    // Valida token/base/webhook ANTES de reservar saldo.
    getPushinPayConfig();

    const db = await supabaseServer();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return noStore({ error: "Entre na sua conta." }, 401);
    if (!isWithdrawalWindowBrasilia()) {
      return noStore({ error: "Saques somente de segunda a sexta, das 9h às 10h (horário de Brasília)." }, 403);
    }

    const ip = clientIp(request);
    await rateLimit(`pushinpay-withdraw-user:${user.id}`, { limit: 2, windowSeconds: 60 });
    await rateLimit(`pushinpay-withdraw-ip:${ip}`, { limit: 5, windowSeconds: 60 });

    const body = await readJsonBody(request);
    const amount = Math.round(Number(body.amount) * 100) / 100;
    const pixKeyType = String(body.pixKeyType ?? "");
    const pixKey = String(body.pixKey ?? "").trim();
    const receiverNationalRegistration = digits(body.receiverNationalRegistration);

    if (!Number.isFinite(amount) || amount < 1.05 || amount > 100000) return noStore({ error: "Informe um valor entre R$ 1,05 e R$ 100.000,00." }, 400);
    if (!["cpf","email","phone","random"].includes(pixKeyType)) return noStore({ error: "Tipo de chave PIX inválido." }, 400);
    if (!pixKey || pixKey.length > 200) return noStore({ error: "Informe uma chave PIX válida." }, 400);
    if (![11,14].includes(receiverNationalRegistration.length)) return noStore({ error: "Informe o CPF ou CNPJ do titular da chave PIX." }, 400);
    if (pixKeyType === "cpf" && digits(pixKey) !== receiverNationalRegistration) return noStore({ error: "O CPF do titular precisa ser igual à chave PIX CPF." }, 400);

    const admin = supabaseAdmin();
    const { data: createdRaw, error: createError } = await admin.rpc("server_create_pushinpay_withdrawal", {
      p_user_id: user.id,
      p_amount: amount,
      p_pix_key_type: pixKeyType,
      p_pix_key: pixKey,
      p_receiver_national_registration: receiverNationalRegistration,
    });
    const created = firstRow(createdRaw) as Record<string, unknown> | null;
    if (createError || !created?.id) return noStore({ error: createError?.message || "Não foi possível reservar o saque." }, 400);
    withdrawalId = String(created.id);
    // A base calcula e registra a taxa; nunca use o valor bruto no CashOut.
    const feeAmount = Number(created.fee_amount);
    const netAmount = Number(created.net_amount);
    const expectedFee = Math.round(amount * 4) / 100;
    if (!Number.isFinite(feeAmount) || !Number.isFinite(netAmount) ||
        Math.round(feeAmount * 100) !== Math.round(expectedFee * 100) ||
        Math.round((netAmount + feeAmount) * 100) !== Math.round(amount * 100) || netAmount <= 0) {
      throw new Error("WITHDRAWAL_FEE_SCHEMA_NOT_READY");
    }

    const cashout = await createPushinPayCashOut({
      valueCents: Math.round(netAmount * 100),
      pixKeyType, pixKey, receiverNationalRegistration,
      webhookUrl: pushinPayWebhookUrl(request),
    });

    const { error: attachError } = await admin.rpc("attach_pushinpay_withdrawal", {
      p_withdrawal_id: withdrawalId,
      p_cashout_id: cashout.id,
      p_value_cents: cashout.value,
      p_status: cashout.status,
      p_end_to_end_id: cashout.end_to_end_id ?? null,
      p_receiver_name: cashout.receiver_name ?? null,
    });
    if (attachError) {
      await admin.rpc("mark_pushinpay_withdrawal_review", {
        p_withdrawal_id: withdrawalId,
        p_reason: `CashOut ${cashout.id} criado, mas falhou ao vincular: ${attachError.message}`,
      });
      return noStore({ error: "O saque foi enviado ao gateway e precisa de revisão. Não tente novamente agora." }, 503);
    }

    const normalized = cashout.status.toLowerCase();
    if (["paid","canceled","cancelled"].includes(normalized)) {
      await admin.rpc("settle_pushinpay_withdrawal", {
        p_cashout_id: cashout.id,
        p_value_cents: cashout.value,
        p_status: cashout.status,
        p_end_to_end_id: cashout.end_to_end_id ?? null,
      });
    }

    return noStore({
      ok: true,
      withdrawal: { id: withdrawalId, amount, feeAmount, netAmount, status: normalized === "paid" ? "completed" : normalized, cashoutId: cashout.id },
      message: normalized === "paid" ? `Saque concluído. Taxa: R$ ${feeAmount.toFixed(2)}; PIX enviado: R$ ${netAmount.toFixed(2)}.` : `Saque enviado para processamento. Taxa de 4%: R$ ${feeAmount.toFixed(2)}. Valor líquido: R$ ${netAmount.toFixed(2)}.`,
    });
  } catch (error) {
    if (withdrawalId) {
      const admin = supabaseAdmin();
      if (error instanceof PushinPayCashOutError && error.retrySafe) {
        await admin.rpc("cancel_unsubmitted_pushinpay_withdrawal", { p_withdrawal_id: withdrawalId, p_reason: error.message });
      } else {
        await admin.rpc("mark_pushinpay_withdrawal_review", {
          p_withdrawal_id: withdrawalId,
          p_reason: error instanceof Error ? error.message : "Falha ambígua no gateway.",
        });
      }
    }

    if (error instanceof PushinPayCashOutError) {
      return noStore({ error: error.message }, error.httpStatus === 429 ? 429 : 502);
    }
    if (error instanceof Error) {
      if (error.message === "WITHDRAWAL_FEE_SCHEMA_NOT_READY") return noStore({ error: "Regras de saque ainda não ativadas no banco; a reserva será estornada. Aguarde a atualização." }, 503);
      if (error.message === "PUSHINPAY_API_TOKEN_MISSING") return noStore({ error: "PUSHINPAY_API_TOKEN não está disponível neste deploy." }, 503);
      if (error.message === "PUSHINPAY_WEBHOOK_SECRET_MISSING") return noStore({ error: "PUSHINPAY_WEBHOOK_SECRET não está disponível neste deploy." }, 503);
      if (error.message === "PUSHINPAY_BASE_URL_INVALID") return noStore({ error: "PUSHINPAY_BASE_URL está inválida." }, 503);
    }
    return safeApiError(error);
  }
}
