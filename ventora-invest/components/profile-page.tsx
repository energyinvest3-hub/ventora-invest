"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeftRight,
  BadgeCheck,
  Building2,
  CalendarCheck,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  Copy,
  CreditCard,
  Gift,
  Handshake,
  Headphones,
  History,
  LifeBuoy,
  LockKeyhole,
  Mail,
  Settings,
  Share2,
  ShieldCheck,
  TicketPercent,
  UserPlus,
  UserRound,
  UsersRound,
  Wallet,
  Wind,
} from "lucide-react";
import { useApp } from "./app-provider";

const shortcuts = [
  ["Intercâmbio", "/perfil/intercambio", ArrowLeftRight],
  ["Convidar", "/perfil/convites", UserPlus],
  ["PIX", "/carteira", CreditCard],
  ["Equipe", "/perfil/equipe", UsersRound],
  ["Créditos semanais", "/perfil/creditos-semanais", CalendarDays],
  ["Receber créditos", "/carteira", CalendarCheck],
  ["Rendimento eólico", "/meus-projetos", Wind],
  ["Cupom", "/perfil/cupom", TicketPercent],
  ["Recompensas por convite", "/perfil/recompensas", Handshake],
  ["Central de tarefas", "/perfil/metas", ClipboardCheck],
  ["Política de privacidade", "/privacidade", ShieldCheck],
  ["Sobre nós", "/perfil/sobre", Building2],
  ["Atendimento ao cliente", "/perfil/suporte", LifeBuoy],
  ["Configurações", "/perfil/dados", Settings],
] as const;

const menu = [
  ["Dados pessoais", "/perfil/dados", UserRound],
  ["Segurança", "/perfil/seguranca", ShieldCheck],
  ["Minha carteira", "/carteira", Wallet],
  ["Meus ativos", "/meus-projetos", Wind],
  ["Histórico", "/carteira", History],
  ["Privacidade", "/privacidade", LockKeyhole],
  ["Termos de uso", "/termos", ShieldCheck],
  ["Suporte", "/perfil/suporte", Headphones],
] as const;

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

export function ProfilePage() {
  const { profile } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      router.replace("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return <div className="profile-wrap">
    <div className="page-head"><div><span>DO SEU JEITO</span><h1>Meu perfil</h1><p>Sua conta e tudo o que importa.</p></div></div>
    <section className="profile-hero-card">
      <div className="avatar">{profile.name.charAt(0).toUpperCase()}</div>
      <div className="profile-hero-copy"><h2>{profile.name}</h2><p><Mail size={15}/>{profile.email}</p><span className="profile-badge"><ShieldCheck size={14}/> Conta pessoal</span><small>ID: {profile.id}</small></div>
    </section>

    <section className="profile-shortcuts" aria-label="Atalhos da conta">
      {shortcuts.map(([label, href, Icon]) => <Link key={label} href={href}><span><Icon size={23}/></span><strong>{label}</strong></Link>)}
    </section>

    <section className="menu-list profile-menu">
      {menu.map(([label, href, Icon]) => <Link className="menu-item" key={label} href={href}><Icon size={20}/><span>{label}</span><ChevronRight size={17}/></Link>)}
      {profile.role === "ADMIN" && <Link className="menu-item admin-menu-link" href="/admin"><ShieldCheck size={20}/><span>Administração</span><ChevronRight size={17}/></Link>}
      <button className="menu-item danger" type="button" onClick={logout} disabled={busy}><LockKeyhole size={20}/><span>{busy ? "Saindo..." : "Sair da conta"}</span></button>
    </section>
    <p className="profile-version">Ventora Wind Energy · v1.0</p>
  </div>;
}

export function ProfileSubpage({ section }: { section: string }) {
  const { profile, referral, showToast } = useApp();
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const titles: Record<string, string> = {
    dados: "Dados pessoais",
    seguranca: "Segurança",
    convites: "Convidar pessoas",
    equipe: "Minha equipe",
    recompensas: "Recompensas por convite",
    suporte: "Atendimento ao cliente",
    intercambio: "Intercâmbio",
    "creditos-semanais": "Créditos semanais",
    cupom: "Cupons",
    metas: "Central de tarefas",
    sobre: "Sobre a Ventora",
  };

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const r = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, phone }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não foi possível salvar.");
      showToast("Dados atualizados.");
      window.location.reload();
    } catch (e) { showToast(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }

  function referralUrl() {
    if (typeof window === "undefined") return `/cadastro?ref=${referral.inviteCode}`;
    return `${window.location.origin}/cadastro?ref=${referral.inviteCode}`;
  }
  async function copyInvite() {
    await navigator.clipboard.writeText(referral.inviteCode);
    setCopied(true); showToast("Código de convite copiado."); setTimeout(() => setCopied(false), 1600);
  }
  async function shareInvite() {
    const url = referralUrl();
    const text = `Entre na Ventora com meu código ${referral.inviteCode}: ${url}`;
    if (navigator.share) await navigator.share({ title: "Convite Ventora", text, url }).catch(() => {});
    else { await navigator.clipboard.writeText(text); showToast("Link de convite copiado."); }
  }

  return <div className="profile-wrap">
    <div className="subpage-back"><Link href="/perfil">← Voltar ao perfil</Link></div>
    <div className="page-head"><div><span>VENTORA</span><h1>{titles[section] || "Perfil"}</h1></div></div>
    <section className="profile-feature-card">
      {section === "dados" ? <form className="profile-form" onSubmit={saveProfile}>
        <label>Nome completo<input value={name} onChange={e=>setName(e.target.value)} minLength={3} maxLength={120} required/></label>
        <label>Telefone<input value={phone} onChange={e=>setPhone(e.target.value)} maxLength={32}/></label>
        <label>E-mail<input value={profile.email} disabled/></label>
        <button className="primary wide" disabled={busy}>{busy ? "Salvando..." : "Salvar alterações"}</button>
      </form> : section === "seguranca" ? <div className="feature-copy"><ShieldCheck size={34}/><h2>Senha e acesso</h2><p>Use uma senha que você consiga lembrar. Se precisar trocar, use a recuperação segura da conta.</p><Link className="primary" href="/recuperar-senha">Alterar minha senha</Link></div>
      : section === "convites" ? <div className="referral-program">
        <div className="referral-hero"><span className="profile-badge"><UserPlus size={14}/> PROGRAMA ATIVO</span><h2>Convide pessoas para a Ventora</h2><p>Quando alguém cria a conta pelo seu código, ela aparece na sua equipe. O bônus só é liberado conforme as regras configuradas na plataforma.</p></div>
        <div className="referral-code-card"><span>SEU CÓDIGO</span><strong>{referral.inviteCode || "—"}</strong><div className="referral-actions"><button type="button" onClick={copyInvite}><Copy size={17}/>{copied ? "Copiado" : "Copiar código"}</button><button type="button" className="primary" onClick={shareInvite}><Share2 size={17}/>Compartilhar</button></div></div>
        <div className="referral-stat-grid"><div><UsersRound/><span>Convidados</span><strong>{referral.invitedCount}</strong></div><div><BadgeCheck/><span>Qualificados</span><strong>{referral.qualifiedCount}</strong></div><div><Gift/><span>Bônus</span><strong>{money(referral.totalBonus)}</strong></div></div>
      </div>
      : section === "equipe" ? <div className="referral-program"><div className="referral-hero"><span>SUA REDE</span><h2>{referral.invitedCount} pessoa{referral.invitedCount === 1 ? "" : "s"} indicada{referral.invitedCount === 1 ? "" : "s"}</h2><p>Aqui aparecem as contas cadastradas usando seu código.</p></div>{referral.referrals.length === 0 ? <div className="empty"><h3>Sua equipe começa no primeiro convite</h3><p>Compartilhe seu código para acompanhar as indicações aqui.</p><Link className="primary" href="/perfil/convites">Convidar agora</Link></div> : <div className="referral-list">{referral.referrals.map(member=><div className="referral-member" key={member.id}><span className="avatar small">{member.name.charAt(0).toUpperCase()}</span><div><strong>{member.name}</strong><small>Entrou em {new Date(member.joinedAt).toLocaleDateString("pt-BR")}</small></div><span className={`status-label ${member.qualified ? "ok" : "wait"}`}>{member.qualified ? "Qualificado" : "Em andamento"}</span></div>)}</div>}</div>
      : section === "recompensas" ? <div className="referral-program"><div className="referral-hero"><span>RECOMPENSAS</span><h2>{money(referral.totalBonus)} em bônus de convite</h2><p>O valor é calculado pelo servidor e só é liberado uma vez por convidado elegível.</p></div><div className="referral-stat-grid two"><div><BadgeCheck/><span>Bônus liberados</span><strong>{referral.qualifiedCount}</strong></div><div><Wallet/><span>Total recebido</span><strong>{money(referral.totalBonus)}</strong></div></div><Link className="primary wide" href="/perfil/convites">Convidar pessoas</Link></div>
      : section === "suporte" ? <div className="feature-copy"><Headphones size={34}/><h2>Atendimento Ventora</h2><p>Defina aqui o canal oficial de atendimento ao cliente antes do lançamento público.</p></div>
      : section === "sobre" ? <div className="feature-copy"><Wind size={34}/><h2>Energia em movimento.</h2><p>A Ventora reúne conta, carteira, projetos eólicos, participações e indicações em uma única experiência.</p></div>
      : <div className="feature-copy"><Settings size={34}/><h2>{titles[section] || "Em preparação"}</h2><p>Este módulo acompanha a mesma estrutura da plataforma principal e está pronto para receber as regras definitivas da operação.</p></div>}
    </section>
  </div>;
}
