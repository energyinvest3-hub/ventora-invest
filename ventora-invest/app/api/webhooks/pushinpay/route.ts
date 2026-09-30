import {
  parsePushinPayWebhook,
  verifyPushinPayWebhook,
} from "@/lib/payments/pushinpay";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!verifyPushinPayWebhook(request)) {
      return Response.json({ error: "Webhook não autorizado." }, { status: 401 });
    }

    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 16 * 1024) {
      return Response.json({ error: "Webhook inválido." }, { status: 413 });
    }

    let body: unknown = null;
    try { body = JSON.parse(raw || "{}"); } catch { /* invalid below */ }
    const event = parsePushinPayWebhook(body);
    if (!event) return Response.json({ error: "Webhook inválido." }, { status: 400 });

    const { data, error } = await supabaseAdmin().rpc("settle_pushinpay_deposit", {
      p_gateway_id: event.id,
      p_value_cents: event.value,
      p_status: event.status,
      p_end_to_end_id: event.end_to_end_id ?? null,
    });

    if (error) {
      console.error("PushinPay webhook database error", error.code);
      return Response.json(
        { error: "Falha temporária ao processar o pagamento." },
        { status: 503, headers: { "Retry-After": "15" } },
      );
    }

    if (data && typeof data === "object" && !(data as { processed?: boolean }).processed && (data as { reason?: string }).reason === "deposit_not_found") {
      return Response.json(
        { error: "Depósito ainda não vinculado. Tente novamente." },
        { status: 503, headers: { "Retry-After": "5" } },
      );
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("PushinPay webhook error", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Não foi possível processar o webhook." }, { status: 400 });
  }
}
