"use client";

import { useMemo, useState } from "react";
import {
  Search,
  SlidersHorizontal,
  Wind,
  MapPin,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useApp } from "./app-provider";
import { ProjectCard } from "./project-card";

type Tab = "Todos" | "Disponíveis" | "Destaques" | "Encerrando";

export function ProjectsPage() {
  const { projects } = useApp();
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("Todos");
  const [tab, setTab] = useState<Tab>("Todos");

  const regions = ["Todos", ...Array.from(new Set(projects.map((project) => project.region)))];

  const filtered = useMemo(() => {
    return projects.filter((project) => {
      const matchesRegion = region === "Todos" || project.region === region;
      const haystack = `${project.name} ${project.city} ${project.region}`.toLowerCase();
      const matchesQuery = haystack.includes(query.toLowerCase());
      const matchesTab =
        tab === "Todos" ||
        (tab === "Disponíveis" && project.status === "available") ||
        (tab === "Destaques" && project.featured) ||
        (tab === "Encerrando" && project.status === "closing");
      return matchesRegion && matchesQuery && matchesTab;
    });
  }, [projects, query, region, tab]);

  return (
    <div className="v2-catalog">
      <header className="v2-catalog-hero">
        <div>
          <span className="v2-eyebrow"><Sparkles size={14} /> CATÁLOGO EÓLICO</span>
          <h1>Encontre seu próximo projeto.</h1>
          <p>Explore parques eólicos, compare valores, períodos, capacidade e cenários projetados.</p>
        </div>
        <div className="v2-catalog-count">
          <Wind size={24} />
          <div><strong>{projects.length}</strong><span>projetos cadastrados</span></div>
        </div>
      </header>

      <section className="v2-catalog-toolbar">
        <label className="v2-search">
          <Search size={19} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por projeto, cidade ou região"
            aria-label="Buscar projetos"
          />
        </label>
        <span className="v2-filter-label"><SlidersHorizontal size={17} /> Filtrar catálogo</span>
      </section>

      <div className="v2-region-scroll" aria-label="Regiões">
        {regions.map((item) => (
          <button
            key={item}
            type="button"
            className={region === item ? "active" : ""}
            onClick={() => setRegion(item)}
          >
            {item === "Todos" ? <Wind size={14} /> : <MapPin size={14} />}
            {item}
          </button>
        ))}
      </div>

      <div className="v2-catalog-tabs">
        <div>
          {(["Todos", "Disponíveis", "Destaques", "Encerrando"] as Tab[]).map((item) => (
            <button
              key={item}
              type="button"
              className={tab === item ? "active" : ""}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <span>{filtered.length} resultado{filtered.length === 1 ? "" : "s"}</span>
      </div>

      {filtered.length ? (
        <div className="v2-project-grid">
          {filtered.map((project) => <ProjectCard key={project.id} project={project} />)}
        </div>
      ) : (
        <section className="v2-empty-catalog">
          <Wind size={38} />
          <h2>Nenhum projeto encontrado</h2>
          <p>Altere os filtros ou pesquise por outra cidade ou região.</p>
          <button type="button" onClick={() => { setQuery(""); setRegion("Todos"); setTab("Todos"); }}>
            Limpar filtros
          </button>
        </section>
      )}

      <section className="v2-catalog-bottom">
        <div>
          <strong>Quer acompanhar seus ativos?</strong>
          <p>Veja suas participações, valores recebidos e projeções em um painel dedicado.</p>
        </div>
        <Link href="/meus-projetos">Ir para Meus ativos <ArrowUpRight size={17} /></Link>
      </section>

      <p className="v2-legal-note">
        Imagens e cenários apresentados na plataforma são informativos. Projeções não constituem garantia de resultado.
      </p>
    </div>
  );
}
