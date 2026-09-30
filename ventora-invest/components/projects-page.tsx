"use client";
import { useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { useApp } from "./app-provider";
import { ProjectCard } from "./project-card";
export function ProjectsPage(){
 const {projects}=useApp(); const [q,setQ]=useState(""); const [region,setRegion]=useState("Todos");
 const regions=["Todos",...Array.from(new Set(projects.map(p=>p.region)))];
 const filtered=useMemo(()=>projects.filter(p=>(region==="Todos"||p.region===region)&&`${p.name} ${p.city}`.toLowerCase().includes(q.toLowerCase())),[projects,q,region]);
 return <><div className="page-head"><div><span>CATÁLOGO EÓLICO</span><h1>Parques eólicos</h1><p>Explore os projetos eólicos disponíveis na plataforma.</p></div></div>
 <div className="catalog-tools"><label><Search size={18}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar por projeto ou cidade"/></label><div><SlidersHorizontal size={17}/> Filtrar por região</div></div>
 <div className="chips">{regions.map(r=><button key={r} className={r===region?"active":""} onClick={()=>setRegion(r)}>{r}</button>)}</div>
 <div className="project-grid">{filtered.map(p=><ProjectCard key={p.id} project={p}/>)}</div>
 <p className="legal-note">Imagens e números demonstrativos. Não representam rentabilidade garantida, oferta pública ou recomendação de investimento.</p></>
}
