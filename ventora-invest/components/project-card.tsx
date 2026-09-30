"use client";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, MapPin, Wind } from "lucide-react";
import type { WindProject } from "@/lib/types";
const brl=(n:number)=>n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export function ProjectCard({project}:{project:WindProject}){
  return <article className="project-card">
    <Link href={`/projetos/${project.id}`} className="project-image">
      <Image src={project.image} fill alt={`Parque eólico ${project.name}`} sizes="(max-width:768px) 100vw, 33vw"/>
      <span className={`status ${project.status}`}>{project.status==="closing"?"Últimas unidades":"Disponível"}</span>
    </Link>
    <div className="project-body">
      <div className="project-kicker"><MapPin size={14}/>{project.city} · {project.region}</div>
      <h3>{project.name}</h3>
      <p><Wind size={15}/> Capacidade ilustrativa: {project.capacityMw} MW</p>
      <div className="project-numbers"><div><small>Participação desde</small><strong>{brl(project.unitValue)}</strong></div><div><small>Prazo do projeto</small><strong>{project.termDays} dias</strong></div></div>
      <div className="project-footer"><span>{project.availableUnits} unidades disponíveis</span><Link href={`/projetos/${project.id}`}>Ver detalhes <ArrowUpRight size={16}/></Link></div>
    </div>
  </article>
}
