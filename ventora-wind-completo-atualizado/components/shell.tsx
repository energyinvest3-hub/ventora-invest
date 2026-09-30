"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Wind, WalletCards, UserRound, BriefcaseBusiness, ShieldCheck } from "lucide-react";
import { Brand } from "./brand";

const nav=[
  ["/","Visão geral",LayoutDashboard],
  ["/projetos","Parques eólicos",Wind],
  ["/meus-projetos","Meus ativos",BriefcaseBusiness],
  ["/carteira","Carteira",WalletCards],
  ["/perfil","Perfil",UserRound],
] as const;

export function AppShell({children}:{children:React.ReactNode}){
  const path=usePathname();
  return <div className="app-shell">
    <aside className="sidebar">
      <Brand/>
      <div className="side-label">SEU ESPAÇO VENTORA</div>
      <nav>{nav.map(([href,label,Icon])=><Link key={href} href={href} className={path===href?"active":""}><Icon size={19}/><span>{label}</span></Link>)}</nav>
      <div className="side-note"><Wind size={24}/><strong>Energia em movimento.</strong><p>Conheça projetos eólicos em um ambiente demonstrativo e transparente.</p></div>
      <small className="side-safe"><ShieldCheck size={14}/> Ambiente demonstrativo</small>
    </aside>
    <main className="main">{children}</main>
    <nav className="mobile-nav">{nav.slice(0,5).map(([href,label,Icon])=><Link key={href} href={href} className={path===href?"active":""}><Icon size={19}/><small>{label.split(' ')[0]}</small></Link>)}</nav>
  </div>
}
