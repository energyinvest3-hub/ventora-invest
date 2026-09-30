import { supabaseServer } from "@/lib/supabase/server";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!host) return true;
  try { return new URL(origin).host === host; } catch { return false; }
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return value.trim().startsWith("+") ? `+${digits}` : `+55${digits}`;
}

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
    const body = await request.json();
    const action = String(body.action || "");
    const db = await supabaseServer();

    if (action === "login") {
      const identifier = String(body.identifier || "").trim();
      const password = String(body.password || "");
      if (!identifier || password.length < 8) return Response.json({ error: "Informe seu acesso e uma senha válida." }, { status: 400 });
      const credentials = identifier.includes("@")
        ? { email: identifier.toLowerCase(), password }
        : { phone: normalizePhone(identifier), password };
      const { error } = await db.auth.signInWithPassword(credentials);
      if (error) return Response.json({ error: "E-mail/telefone ou senha incorretos." }, { status: 401 });
      return Response.json({ ok: true, authenticated: true });
    }

    if (action === "signup") {
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const phone = String(body.phone || "").trim();
      const password = String(body.password || "");
      if (name.length < 3) return Response.json({ error: "Informe seu nome completo." }, { status: 400 });
      if (!email.includes("@")) return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });
      if (password.length < 8) return Response.json({ error: "A senha precisa ter pelo menos 8 caracteres." }, { status: 400 });
      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: { data: { name, phone } },
      });
      if (error) return Response.json({ error: error.message.includes("registered") ? "Este e-mail já está cadastrado." : "Não foi possível criar a conta." }, { status: 400 });
      return Response.json({
        ok: true,
        authenticated: Boolean(data.session),
        message: data.session ? "Conta criada com sucesso." : "Conta criada. Confira seu e-mail para confirmar o cadastro.",
      });
    }

    if (action === "recover") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email.includes("@")) return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
      const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl}/auth/callback?next=/redefinir-senha` });
      if (error) return Response.json({ error: "Não foi possível enviar o e-mail de recuperação." }, { status: 400 });
      return Response.json({ message: "Se este e-mail estiver cadastrado, enviamos um link de recuperação." });
    }

    if (action === "reset") {
      const password = String(body.password || "");
      if (password.length < 8) return Response.json({ error: "A nova senha precisa ter pelo menos 8 caracteres." }, { status: 400 });
      const { data: { user } } = await db.auth.getUser();
      if (!user) return Response.json({ error: "Abra o link de recuperação enviado ao seu e-mail." }, { status: 401 });
      const { error } = await db.auth.updateUser({ password });
      if (error) return Response.json({ error: "Não foi possível alterar a senha." }, { status: 400 });
      await db.auth.signOut();
      return Response.json({ ok: true, message: "Senha alterada com sucesso." });
    }

    if (action === "logout") {
      await db.auth.signOut();
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível concluir." }, { status: 400 });
  }
}
