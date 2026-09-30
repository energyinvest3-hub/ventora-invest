import { supabaseServer } from "@/lib/supabase/server";
import {
  clientIp,
  isTrustedMutationRequest,
  rateLimit,
  readJsonBody,
  safeApiError,
  stableHash,
} from "@/lib/security";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RE = /^.{6,128}$/;

function noStore(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    if (!isTrustedMutationRequest(request)) return noStore({ error: "Origem inválida." }, 403);

    const ip = clientIp(request);
    const body = await readJsonBody(request);
    const action = String(body.action || "");

    const policy =
      action === "recover" ? { limit: 5, windowSeconds: 3600 } :
      action === "signup" ? { limit: 8, windowSeconds: 3600 } :
      action === "reset" ? { limit: 8, windowSeconds: 900 } :
      action === "logout" ? { limit: 30, windowSeconds: 300 } :
      { limit: 20, windowSeconds: 300 };

    await rateLimit(`auth:${action || "invalid"}:ip:${stableHash(ip)}`, policy);
    const db = await supabaseServer();

    if (action === "login") {
      const email = String(body.identifier || "").trim().toLowerCase().slice(0, 320);
      const password = String(body.password || "");
      if (!EMAIL_RE.test(email) || password.length < 6 || password.length > 128) {
        return noStore({ error: "E-mail ou senha incorretos." }, 401);
      }
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) return noStore({ error: "E-mail ou senha incorretos." }, 401);
      return noStore({ ok: true, authenticated: true });
    }

    if (action === "signup") {
      const name = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 120);
      const email = String(body.email || "").trim().toLowerCase().slice(0, 320);
      const phone = String(body.phone || "").trim().slice(0, 32);
      const password = String(body.password || "");
      const terms = body.terms === "on" || body.terms === true;
      const inviteCode = String(body.inviteCode || "").trim().toUpperCase().slice(0, 32);

      if (name.length < 3) return noStore({ error: "Informe seu nome completo." }, 400);
      if (!EMAIL_RE.test(email)) return noStore({ error: "Informe um e-mail válido." }, 400);
      if (!PASSWORD_RE.test(password)) return noStore({ error: "Use pelo menos 6 caracteres." }, 400);
      if (!terms) return noStore({ error: "Aceite os Termos de Uso e a Política de Privacidade." }, 400);

      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: { data: { name, phone, inviteCode } },
      });
      if (error) {
        console.warn("Signup rejected by Supabase", error.code || error.status);
        return noStore({ error: "Não foi possível criar a conta com estes dados." }, 400);
      }
      if (!data.session) {
        // In production Ventora uses immediate sign-in. If this happens,
        // Confirm Email is still enabled in Supabase Auth.
        return noStore({
          error: "O cadastro foi criado, mas o acesso imediato ainda não está habilitado. Desative Confirm Email no Supabase e crie a conta novamente.",
        }, 409);
      }

      return noStore({
        ok: true,
        authenticated: true,
        message: "Conta criada com sucesso.",
      });
    }

    if (action === "recover") {
      const email = String(body.email || "").trim().toLowerCase().slice(0, 320);
      if (!EMAIL_RE.test(email)) return noStore({ error: "Informe um e-mail válido." }, 400);
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
      const { error } = await db.auth.resetPasswordForEmail(email, {
        redirectTo: `${siteUrl.replace(/\/$/, "")}/auth/callback?next=/redefinir-senha`,
      });
      if (error) console.warn("Password recovery rejected by Supabase", error.code || error.status);
      // Always return the same answer to avoid account enumeration.
      return noStore({ message: "Se este e-mail estiver cadastrado, enviaremos um link de recuperação." });
    }

    if (action === "reset") {
      const password = String(body.password || "");
      if (!PASSWORD_RE.test(password)) return noStore({ error: "Use pelo menos 6 caracteres." }, 400);
      const { data: { user } } = await db.auth.getUser();
      if (!user) return noStore({ error: "Abra o link de recuperação enviado ao seu e-mail." }, 401);
      const { error } = await db.auth.updateUser({ password });
      if (error) return noStore({ error: "Não foi possível alterar a senha. Solicite um novo link." }, 400);
      await db.auth.signOut();
      return noStore({ ok: true, message: "Senha alterada com sucesso." });
    }

    if (action === "logout") {
      await db.auth.signOut();
      return noStore({ ok: true });
    }

    return noStore({ error: "Ação inválida." }, 400);
  } catch (error) {
    return safeApiError(error);
  }
}
