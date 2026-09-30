import { supabaseServer } from "@/lib/supabase/server";
import {
  clientIp,
  isTrustedMutationRequest,
  rateLimit,
  readJsonBody,
  safeApiError,
  stableHash,
} from "@/lib/security";

const SAFE_BUSINESS_ERRORS = new Set([
  "Faça login para continuar.",
  "Quantidade inválida.",
  "Projeto não encontrado.",
  "Projeto indisponível.",
  "Quantidade indisponível.",
  "Limite por usuário excedido.",
  "Saldo insuficiente.",
]);

export async function POST(request: Request) {
  try {
    if (!isTrustedMutationRequest(request)) {
      return Response.json({ error: "Origem inválida." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }

    const db = await supabaseServer();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return Response.json({ error: "Faça login para continuar." }, { status: 401, headers: { "Cache-Control": "no-store" } });

    const ip = clientIp(request);
    await rateLimit(`participate:user:${user.id}`, { limit: 12, windowSeconds: 60 });
    await rateLimit(`participate:ip:${stableHash(ip)}`, { limit: 24, windowSeconds: 60 });

    const body = await readJsonBody(request);
    const projectId = String(body.projectId || "").trim();
    const quantity = Number(body.units);

    if (!/^[a-z0-9-]{3,64}$/.test(projectId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      return Response.json({ error: "Participação inválida." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const { data, error } = await db.rpc("purchase_wind_project", {
      p_project_slug: projectId,
      p_units: quantity,
    });

    if (error) {
      console.warn("Purchase RPC rejected", { code: error.code, userId: user.id, projectId });
      const message = SAFE_BUSINESS_ERRORS.has(error.message) ? error.message : "Não foi possível concluir a operação.";
      return Response.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    return Response.json({ ok: true, result: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeApiError(error);
  }
}
