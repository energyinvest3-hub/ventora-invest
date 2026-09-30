"use client";
import Image from "next/image";
import Link from "next/link";
import { BriefcaseBusiness, ArrowUpRight } from "lucide-react";
import { useApp } from "./app-provider";
const brl=(n:number)=>n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export function HoldingsPage(){const {holdings,projects}=useApp(); const total=holdings.reduce((s,h)=>s+h.amount,0); return <><div className="page-head"><div><span>SUA JORNADA EÓLICA</span><h1>Meus ativos</h1><p>Acompanhe suas participações e o histórico de cada projeto.</p></div></div>
<div className="mini-stat"><BriefcaseBusiness/><div><small>Total aplicado</small><strong>{brl(total)}</strong></div><span>{holdings.length} participações</span></div>
{!holdings.length?<div className="empty"><WindEmpty/><h2>Você ainda não possui ativos</h2><p>Explore os projetos disponíveis para começar.</p><Link className="primary" href="/projetos">Explorar projetos</Link></div>:<div className="holding-list">{holdings.map(h=>{const p=projects.find(x=>x.id===h.projectId)!;return <article key={h.id}><Image src={p.image} width={120} height={90} alt={p.name}/><div><small>{p.city} · {p.region}</small><h3>{p.name}</h3><p>{h.units} unidade(s) · {brl(h.amount)}</p></div><Link href={`/projetos/${p.id}`}>Detalhes <ArrowUpRight size={16}/></Link></article>})}</div>}
</>}
function WindEmpty(){return <svg width="70" height="70" viewBox="0 0 70 70"><circle cx="35" cy="35" r="31" fill="#eafaf7"/><path d="M35 20v33M35 28l-16-8M35 28l16-8M35 28l-2 18" stroke="#0d8f84" strokeWidth="3" strokeLinecap="round"/></svg>}
