import { supabaseServer } from "@/lib/supabase/server";
import { clientIp, isTrustedMutationRequest, rateLimit, readJsonBody, safeApiError, stableHash } from "@/lib/security";

export async function POST(request: Request) {
  try {
    if (!isTrustedMutationRequest(request)) return Response.json({ error: "Origem inválida." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    const db = await supabaseServer();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return Response.json({ error: "Faça login para continuar." }, { status: 401, headers: { "Cache-Control": "no-store" } });

    await rateLimit(`profile:user:${user.id}`, { limit: 12, windowSeconds: 300 });
    await rateLimit(`profile:ip:${stableHash(clientIp(request))}`, { limit: 30, windowSeconds: 300 });
    const body = await readJsonBody(request);
    const name = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 120);
    const phone = String(body.phone || "").trim().slice(0, 32);
    if (name.length < 3) return Response.json({ error: "Informe seu nome completo." }, { status: 400 });

    const { error } = await db.from("profiles").update({ name, phone }).eq("id", user.id);
    if (error) {
      console.warn("Profile update rejected", error.code);
      return Response.json({ error: "Não foi possível salvar seus dados." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeApiError(error);
  }
}
