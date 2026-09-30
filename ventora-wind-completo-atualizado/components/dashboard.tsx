"use client";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Eye, EyeOff, Wind, TrendingUp, ShieldCheck, Plus, Gauge, Leaf } from "lucide-react";
import { useState } from "react";
import { useApp } from "./app-provider";
import { ProjectCard } from "./project-card";
const brl=(n:number)=>n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

export function Dashboard(){
  const {profile,projects,holdings,balance,futureBalance,showToast}=useApp();
  const [visible,setVisible]=useState(true);
  const total=holdings.reduce((s,h)=>s+h.amount,0);
  return <>
    <div className="page-head"><div><span>VENTORA WIND PLATFORM</span><h1>Olá, {profile.name.split(' ')[0]}. 👋</h1><p>Uma nova leitura sobre energia renovável e projetos eólicos.</p></div><div className="demo-pill"><ShieldCheck size={16}/> DEMO</div></div>
    <div className="hero-grid">
      <section className="wallet-card">
        <div className="wallet-top"><span>MINHA CARTEIRA</span><button onClick={()=>setVisible(v=>!v)}>{visible?<Eye size={18}/>:<EyeOff size={18}/>}</button></div>
        <small>Saldo disponível</small><h2>{visible?brl(balance):"R$ ••••"}</h2>
        <div className="wallet-metrics"><div><small>Total demonstrativo</small><strong>{visible?brl(total):"••••"}</strong></div><div><small>Cenário futuro</small><strong>{visible?brl(futureBalance):"••••"}</strong></div></div>
        <div className="wallet-actions"><button onClick={()=>showToast("Depósitos reais estão desativados nesta versão. Configure um provedor regulado antes de produção.")}><Plus size={18}/> Adicionar saldo</button><Link href="/carteira">Ver carteira <ArrowUpRight size={17}/></Link></div>
        <Wind className="wallet-art" size={210}/>
      </section>
      <section className="story-card"><Image src="/wind-hero.png" fill priority alt="Parque eólico ao amanhecer"/><div className="story-overlay"></div><div className="story-copy"><span><Leaf size={14}/> ENERGIA EM MOVIMENTO</span><h2>O vento muda.<br/>A visão também.</h2><p>Explore parques eólicos com uma identidade moderna e transparente.</p><Link href="/projetos">Explorar projetos <ArrowUpRight size={17}/></Link></div></section>
    </div>
    <div className="stats"><div><Gauge/><span>Capacidade exibida</span><strong>{projects.reduce((s,p)=>s+p.capacityMw,0)} MW</strong></div><div><Wind/><span>Projetos ativos</span><strong>{projects.filter(p=>p.status!=="paused").length}</strong></div><div><TrendingUp/><span>Participações demo</span><strong>{holdings.length}</strong></div></div>
    <div className="section-title"><div><span>DESTAQUES</span><h2>Parques eólicos em evidência</h2><p>Projetos e valores abaixo são ilustrativos e não representam promessa de retorno.</p></div><Link href="/projetos">Ver todos <ArrowUpRight size={17}/></Link></div>
    <div className="project-grid">{projects.filter(p=>p.featured).map(p=><ProjectCard key={p.id} project={p}/>)}</div>
    <div className="transparency"><ShieldCheck/><div><strong>Transparência primeiro</strong><p>Antes de lançar qualquer oferta real, substitua dados demonstrativos por informações verificadas, riscos, documentação e regras aplicáveis.</p></div></div>
  </>
}
