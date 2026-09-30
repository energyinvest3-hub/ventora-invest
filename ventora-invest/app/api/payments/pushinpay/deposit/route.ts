import {
  createPushinPayCharge,
  normalizePushinPayQr,
  pushinPayWebhookUrl,
  PushinPayHttpError,
} from "@/lib/payments/pushinpay";
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

function firstRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

function noStore(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  let localDepositId: string | null = null;

  try {
    if (!isTrustedMutationRequest(request)) {
      return noStore({ error: "Origem inválida." }, 403);
    }
    if (process.env.DEPOSITS_DISABLED === "true") {
      return noStore({ error: "Novos pagamentos estão temporariamente indisponíveis." }, 503);
    }

    const db = await supabaseServer();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return noStore({ error: "Entre na sua conta." }, 401);

    const ip = clientIp(request);
    await rateLimit(`pushinpay-create-user:${user.id}`, { limit: 2, windowSeconds: 60 });
    await rateLimit(`pushinpay-create-ip:${ip}`, { limit: 6, windowSeconds: 60 });

    const input = await readJsonBody(request);
    const rawAmount = Number(input.amount);
    if (!Number.isFinite(rawAmount) || rawAmount < 1 || rawAmount > 100000) {
      return noStore({ error: "Informe um valor entre R$ 1,00 e R$ 100.000,00." }, 400);
    }

    const amount = Math.round(rawAmount * 100) / 100;
    const valueCents = Math.round(amount * 100);

    const { data: createdRaw, error: createError } = await db.rpc(
      "create_pushinpay_deposit",
      { p_amount: amount },
    );
    const created = firstRow(createdRaw) as Record<string, unknown> | null;
    if (createError || !created?.id) {
      console.error("Ventora create deposit DB error", createError?.code);
      return noStore({ error: createError?.message || "Não foi possível iniciar o pagamento." }, 400);
    }

    localDepositId = String(created.id);
    const charge = await createPushinPayCharge(valueCents, pushinPayWebhookUrl(request));

    if (charge.value !== valueCents) {
      throw new Error("PUSHINPAY_AMOUNT_MISMATCH");
    }

    const admin = supabaseAdmin();
    const { data: attachedRaw, error: attachError } = await admin.rpc(
      "attach_pushinpay_charge",
      {
        p_deposit_id: localDepositId,
        p_gateway_id: charge.id,
        p_qr_code: charge.qr_code,
        p_qr_code_base64: normalizePushinPayQr(charge.qr_code_base64),
        p_provider_status: charge.status,
        p_value_cents: charge.value,
      },
    );
    const attached = firstRow(attachedRaw) as Record<string, unknown> | null;

    if (attachError || !attached?.id) {
      console.error("Ventora attach PIX DB error", attachError?.code);
      throw new Error("Não foi possível registrar o PIX criado.");
    }

    return noStore({
      deposit: {
        id: String(attached.id),
        identifier: String(attached.gateway_id),
        amount: Number(attached.amount),
        status: attached.status,
        providerStatus: attached.provider_status,
        pixCode: String(attached.pix_code ?? ""),
        qrCodeDataUrl: String(attached.qr_code_base64 ?? ""),
      },
    });
  } catch (error) {
    if (localDepositId) {
      try {
        await supabaseAdmin().rpc("cancel_pushinpay_deposit", {
          p_deposit_id: localDepositId,
          p_reason: "creation_failed",
        });
      } catch {
        // Do not hide the original error.
      }
    }

    if (error instanceof PushinPayHttpError) {
      console.error("PushinPay create PIX HTTP error", error.status, error.providerMessage || "");
      if (error.status === 401) {
        return noStore({ error: "A PushinPay recusou o token da API. Confira PUSHINPAY_API_TOKEN no Vercel e faça um novo deploy." }, 502);
      }
      if (error.status === 403) {
        return noStore({ error: "A conta/token da PushinPay não tem permissão para criar PIX. Confira se a conta está aprovada e o token está ativo." }, 502);
      }
      if (error.status === 422) {
        return noStore({ error: error.providerMessage || "A PushinPay recusou os dados da cobrança." }, 422);
      }
      if (error.status === 429) {
        return noStore({ error: "A PushinPay limitou temporariamente as requisições. Aguarde um minuto e tente novamente." }, 429);
      }
      if (error.status >= 500) {
        return noStore({ error: "A PushinPay está temporariamente indisponível. Tente novamente em alguns instantes." }, 502);
      }
      return noStore({ error: `A PushinPay recusou a cobrança (HTTP ${error.status}).` }, 502);
    }

    if (error instanceof Error) {
      if (error.message === "PUSHINPAY_AMOUNT_MISMATCH") {
        return noStore({ error: "O gateway retornou uma cobrança com valor diferente. Nenhum saldo foi creditado." }, 502);
      }
      if (error.message === "PUSHINPAY_API_TOKEN_MISSING") {
        return noStore({ error: "PUSHINPAY_API_TOKEN não está disponível neste deploy da Vercel." }, 503);
      }
      if (error.message === "PUSHINPAY_WEBHOOK_SECRET_MISSING") {
        return noStore({ error: "PUSHINPAY_WEBHOOK_SECRET não está disponível neste deploy da Vercel." }, 503);
      }
      if (error.message === "PUSHINPAY_BASE_URL_INVALID") {
        return noStore({ error: "PUSHINPAY_BASE_URL está inválida no Vercel." }, 503);
      }
      if (error.message === "PUSHINPAY_INVALID_CHARGE_RESPONSE") {
        return noStore({ error: "A PushinPay respondeu em um formato inesperado. Confira os Runtime Logs." }, 502);
      }
      if (error.message.includes("SUPABASE_SERVER_SECRET_MISSING")) {
        return noStore({ error: "SUPABASE_SECRET_KEY não está disponível neste deploy da Vercel." }, 503);
      }
      if (error.message === "Não foi possível registrar o PIX criado.") {
        return noStore({ error: "O PIX chegou a ser criado no gateway, mas o servidor não conseguiu registrá-lo no Supabase. Confira SUPABASE_SECRET_KEY e se o SQL da PushinPay foi executado." }, 500);
      }
    }
    return safeApiError(error);
  }
}
