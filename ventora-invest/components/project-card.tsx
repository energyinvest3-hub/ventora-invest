"use client";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Layers3, MapPin, Wind } from "lucide-react";
import type { WindProject } from "@/lib/types";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ProjectCard({ project }: { project: WindProject }) {
  const dailyProjected = project.termDays > 0
    ? project.projectedScenario / project.termDays
    : 0;
  const multiple = project.unitValue > 0
    ? project.projectedScenario / project.unitValue
    : 0;

  return (
    <article className="project-card upgraded-project-card">
      <Link href={`/projetos/${project.id}`} className="project-image">
        <Image
          src={project.image}
          fill
          alt={`Parque eólico ${project.name}`}
          sizes="(max-width:768px) 100vw, 33vw"
        />
        <span className={`status ${project.status}`}>
          {project.status === "closing" ? "Últimas unidades" : "Disponível"}
        </span>
      </Link>

      <div className="project-body">
        <div className="project-kicker">
          <MapPin size={14} /> {project.city} · {project.region}
        </div>
        <h3>{project.name}</h3>
        <p>
          <Wind size={15} /> Capacidade ilustrativa: {project.capacityMw} MW
        </p>

        <div className="project-return-grid">
          <div>
            <small>Participação desde</small>
            <strong>{brl(project.unitValue)}</strong>
          </div>
          <div>
            <small>Retorno projetado / dia</small>
            <strong className="positive">{brl(dailyProjected)}</strong>
          </div>
        </div>

        <div className="project-period-total">
          <span>Projeção no período · {multiple.toFixed(2)}x</span>
          <strong>{brl(project.projectedScenario)}</strong>
        </div>

        <div className="project-footer enhanced">
          <span>
            <Layers3 size={14} /> {project.availableUnits} unidades disponíveis
          </span>
          <Link href={`/projetos/${project.id}`}>
            Ver detalhes <ArrowUpRight size={16} />
          </Link>
        </div>
      </div>
    </article>
  );
}
