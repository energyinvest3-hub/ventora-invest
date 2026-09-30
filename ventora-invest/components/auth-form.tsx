"use client";
import { FormEvent, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Eye, EyeOff, ShieldCheck, Wind } from "lucide-react";

type Mode = "login" | "signup" | "recover" | "reset";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const search = useSearchParams();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(search.get("erro") || "");
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage(""); setSuccess(false);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirm = String(form.get("confirm") || "");
    if ((mode === "signup" || mode === "reset") && password !== confirm) {
      setBusy(false); setMessage("As senhas não coincidem."); return;
    }
    if (mode === "signup" && form.get("terms") !== "on") {
      setBusy(false); setMessage("Você precisa aceitar os Termos de Uso e a Política de Privacidade."); return;
    }
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, action: mode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível concluir.");
      if (mode === "login" || data.authenticated) {
        router.replace("/"); router.refresh(); return;
      }
      if (mode === "reset") {
        setSuccess(true); setMessage(data.message || "Senha alterada.");
        setTimeout(() => router.replace("/login"), 700); return;
      }
      setSuccess(true); setMessage(data.message || "Tudo certo.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível concluir.");
    } finally { setBusy(false); }
  }

  const title = mode === "login" ? "Bom ter você de volta." : mode === "signup" ? "Crie sua conta Ventora." : mode === "recover" ? "Recupere seu acesso." : "Defina sua nova senha.";
  const desc = mode === "login" ? "Entre para acompanhar sua conta e seus projetos eólicos." : mode === "signup" ? "Cadastre-se para acessar a plataforma Ventora." : mode === "recover" ? "Informe seu e-mail e enviaremos um link seguro." : "Escolha uma nova senha para sua conta.";

  return <main className="auth-page">
    <section className="auth-visual">
      <Image src="/wind-hero.png" fill priority alt="Parque eólico" />
      <div className="auth-shade" />
      <div className="auth-brand"><Image src="/logo-light.svg" width={190} height={54} alt="Ventora"/><span><Wind size={18}/> ENERGIA EM MOVIMENTO</span><h1>O vento muda.<br/>A visão também.</h1><p>Seus projetos e sua conta conectados em um só lugar.</p></div>
    </section>
    <section className="auth-form">
      <Image src="/logo.svg" width={190} height={56} alt="Ventora" priority />
      <h2>{title}</h2><p>{desc}</p>
      <form onSubmit={submit}>
        {mode === "signup" && <><label>Nome completo<input name="name" required minLength={3} maxLength={120} autoComplete="name" placeholder="Seu nome"/></label><label>Telefone<input name="phone" maxLength={32} autoComplete="tel" placeholder="(11) 99999-9999"/></label></>}
        {mode === "login" && <label>E-mail<input name="identifier" type="email" required maxLength={320} autoComplete="email" placeholder="voce@exemplo.com"/></label>}
        {(mode === "signup" || mode === "recover") && <label>E-mail<input name="email" type="email" required maxLength={320} autoComplete="email" placeholder="voce@exemplo.com"/></label>}
        {mode !== "recover" && <label>Senha<div className="password-input"><input name="password" type={show ? "text" : "password"} required minLength={6} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Crie uma senha com 6 ou mais caracteres"/><button type="button" onClick={() => setShow(v => !v)} aria-label={show ? "Ocultar senha" : "Mostrar senha"}>{show ? <EyeOff size={19}/> : <Eye size={19}/>}</button></div></label>}
        {(mode === "signup" || mode === "reset") && <label>Confirmar senha<input name="confirm" type={show ? "text" : "password"} required minLength={6} maxLength={128} autoComplete="new-password" placeholder="Repita sua senha"/></label>}
        {mode === "signup" && <label className="auth-check"><input name="terms" type="checkbox"/><span>Li e concordo com os <Link href="/termos">Termos de Uso</Link> e a <Link href="/privacidade">Política de Privacidade</Link>.</span></label>}
        {mode === "login" && <Link className="forgot-link" href="/recuperar-senha">Esqueci minha senha</Link>}
        {message && <div className={success ? "auth-message success" : "auth-message"}>{message}</div>}
        <button className="primary wide" disabled={busy}>{busy ? "Aguarde..." : mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : mode === "recover" ? "Enviar link" : "Alterar senha"}<ArrowUpRight size={17}/></button>
      </form>
      <small>{mode === "login" ? <>Ainda não tem conta? <Link href="/cadastro">Criar conta</Link></> : mode === "signup" ? <>Já tem conta? <Link href="/login">Entrar</Link></> : <Link href="/login"><ArrowLeft size={14}/> Voltar ao login</Link>}</small>
      <div className="auth-security"><ShieldCheck size={15}/> Acesso protegido por Criptografia.</div>
    </section>
  </main>;
}
