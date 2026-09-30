"use client";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, MapPin, Wind, ShieldCheck, Info, Plus, Minus } from "lucide-react";
import { useState } from "react";
import { useApp } from "./app-provider";
const brl=(n:number)=>n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export function ProjectDetail({id}:{id:string}){
 const {projects,buyDemo}=useApp(); const p=projects.find(x=>x.id===id); const [units,setUnits]=useState(1);
 if(!p) return <div className="empty"><h1>Projeto não encontrado</h1><Link href="/projetos">Voltar</Link></div>;
 return <><Link className="back" href="/projetos"><ArrowLeft size={17}/> Voltar aos projetos</Link>
 <div className="detail-grid"><div className="detail-image"><Image src={p.image} fill alt={p.name} priority sizes="(max-width:900px) 100vw, 55vw"/></div>
 <section className="detail-panel"><span className="detail-tag"><Wind size={15}/> PROJETO EÓLICO · DEMO</span><h1>{p.name}</h1><p className="location"><MapPin size={16}/>{p.city} · {p.region}</p>
 <div className="detail-stats"><div><small>Valor por unidade</small><strong>{brl(p.unitValue)}</strong></div><div><small>Prazo ilustrativo</small><strong>{p.termDays} dias</strong></div><div><small>Capacidade</small><strong>{p.capacityMw} MW</strong></div></div>
 <div className="notice"><Info size={18}/><p>O “cenário projetado” abaixo é apenas um dado de demonstração de interface. Em produção, use premissas verificáveis, risco explícito e documentação adequada.</p></div>
 <div className="quantity"><span>Quantidade</span><div><button onClick={()=>setUnits(Math.max(1,units-1))}><Minus size={16}/></button><strong>{units}</strong><button onClick={()=>setUnits(units+1)}><Plus size={16}/></button></div></div>
 <div className="summary"><div><span>Total demonstrativo</span><strong>{brl(p.unitValue*units)}</strong></div><div><span>Cenário ilustrativo</span><strong>{brl(p.projectedScenario*units)}</strong></div></div>
 <button className="primary wide" onClick={()=>buyDemo(p.id,units)}>Participar em modo demo</button>
 <div className="trust-row"><ShieldCheck size={17}/> Nenhuma cobrança é realizada nesta versão.</div></section></div></>
}
