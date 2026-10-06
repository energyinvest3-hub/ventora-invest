"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  Layers3,
  MapPin,
  Wind,
  Clock3,
  TrendingUp,
} from "lucide-react";
import type { WindProject } from "@/lib/types";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ProjectCard({ project }: { project: WindProject }) {
  const dailyProjected =
    project.termDays > 0 ? project.projectedScenario / project.termDays : 0;
  const multiple =
    project.unitValue > 0 ? project.projectedScenario / project.unitValue : 0;
  const closed = project.status === "paused" || project.status === "finished";

  return (
    <article className="v2-project-card">
      <Link href={`/projetos/${project.id}`} className="v2-project-image">
        <Image
          src={project.image}
          fill
          alt={`Parque eólico ${project.name}`}
          sizes="(max-width: 760px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
        <div className="v2-project-image-shade" />
        <span className={`v2-status ${project.status}`}>
          <span />
          {project.status === "closing"
            ? "Últimas unidades"
            : project.status === "paused"
              ? "Pausado"
              : project.status === "finished"
                ? "Encerrado"
                : "Disponível"}
        </span>
        {project.featured && <span className="v2-featured-badge">DESTAQUE</span>}
        <span className="v2-image-location">
          <MapPin size={13} /> {project.city} · {project.region}
        </span>
      </Link>

      <div className="v2-project-body">
        <div className="v2-project-kicker">
          <span><Wind size={14} /> PARQUE EÓLICO</span>
          <span><Clock3 size={14} /> {project.termDays} dias</span>
        </div>

        <Link href={`/projetos/${project.id}`} className="v2-project-title-link">
          <h3>{project.name}</h3>
        </Link>

        <p className="v2-project-capacity">
          Capacidade ilustrativa <strong>{project.capacityMw} MW</strong>
        </p>

        <div className="v2-project-metrics">
          <div>
            <small>Participação desde</small>
            <strong>{brl(project.unitValue)}</strong>
          </div>
          <div>
            <small>Projeção média / dia</small>
            <strong className="positive">{brl(dailyProjected)}</strong>
          </div>
        </div>

        <div className="v2-project-projection">
          <div>
            <span><TrendingUp size={14} /> Cenário no período</span>
            <small>{multiple.toFixed(2)}x por unidade</small>
          </div>
          <strong>{brl(project.projectedScenario)}</strong>
        </div>

        <Link
          className={`v2-project-button ${closed ? "disabled" : ""}`}
          href={`/projetos/${project.id}`}
          aria-disabled={closed}
        >
          {closed ? "Projeto indisponível" : "Ver projeto"}
          <ArrowUpRight size={17} />
        </Link>

        <div className="v2-project-foot">
          <span><Layers3 size={13} /> {project.availableUnits} unidades disponíveis</span>
          <span>Informações do projeto</span>
        </div>
      </div>
    </article>
  );
}
