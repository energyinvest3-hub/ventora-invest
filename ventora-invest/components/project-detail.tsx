"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Info,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  TrendingUp,
  Wind,
  Clock3,
  Gauge,
  Layers3,
  ArrowUpRight,
} from "lucide-react";
import { useState } from "react";
import { useApp } from "./app-provider";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ProjectDetail({ id }: { id: string }) {
  const { projects, participate, balance } = useApp();
  const project = projects.find((item) => item.id === id);
  const [units, setUnits] = useState(1);
  const [busy, setBusy] = useState(false);

  if (!project) {
    return (
      <div className="v2-empty-catalog">
        <Wind size={40} />
        <h1>Projeto não encontrado</h1>
        <Link href="/projetos">Voltar ao catálogo</Link>
      </div>
    );
  }

  const dailyProjected = project.projectedScenario / project.termDays;
  const multiple = project.projectedScenario / project.unitValue;
  const total = project.unitValue * units;
  const maxUnits = Math.max(1, project.availableUnits);
  const closed = project.status === "paused" || project.status === "finished";

  return (
    <div className="v2-detail">
      <Link className="v2-back" href="/projetos">
        <ArrowLeft size={17} /> Voltar aos projetos
      </Link>

      <div className="v2-detail-grid">
        <section className="v2-detail-visual">
          <div className="v2-detail-image">
            <Image
              src={project.image}
              fill
              alt={project.name}
              priority
              sizes="(max-width: 900px) 100vw, 55vw"
            />
            <div className="v2-detail-image-shade" />
            <span className="v2-detail-location"><MapPin size={15} /> {project.city} · {project.region}</span>
          </div>

          <div className="v2-detail-highlights">
            <article><Gauge size={21} /><div><small>Capacidade</small><strong>{project.capacityMw} MW</strong></div></article>
            <article><Clock3 size={21} /><div><small>Período</small><strong>{project.termDays} dias</strong></div></article>
            <article><Layers3 size={21} /><div><small>Disponibilidade</small><strong>{project.availableUnits} unidades</strong></div></article>
          </div>

          <section className="v2-about-project">
            <span>VISÃO GERAL</span>
            <h2>Sobre este projeto</h2>
            <p>
              Projeto eólico apresentado na plataforma Ventora com informações de localização,
              capacidade, período e cenário projetado organizadas para facilitar sua análise.
            </p>
            <div>
              <span><ShieldCheck size={17} /> Dados vinculados à sua conta</span>
              <span><Wind size={17} /> Energia eólica</span>
            </div>
          </section>
        </section>

        <section className="v2-detail-panel">
          <span className="v2-detail-tag"><Wind size={15} /> PROJETO EÓLICO</span>
          <h1>{project.name}</h1>
          <p className="v2-detail-subtitle">Confira os dados do projeto antes de confirmar sua participação.</p>

          <div className="v2-detail-stats">
            <div><small>Valor por unidade</small><strong>{brl(project.unitValue)}</strong></div>
            <div><small>Projeção média / dia</small><strong className="positive">{brl(dailyProjected)}</strong></div>
            <div><small>Cenário no período</small><strong>{brl(project.projectedScenario)}</strong></div>
            <div><small>Relação projetada</small><strong>{multiple.toFixed(2)}x</strong></div>
          </div>

          <div className="v2-projection-box">
            <TrendingUp size={20} />
            <div><span>Cenário projetado por unidade</span><strong>{brl(project.projectedScenario)} ao final do período</strong></div>
          </div>

          <div className="v2-notice">
            <Info size={18} />
            <p>Os valores exibidos são cenários projetados e não representam garantia de resultado. Consulte os termos e riscos antes de participar.</p>
          </div>

          <div className="v2-quantity">
            <div><span>Quantidade de unidades</span><small>{project.availableUnits} disponíveis</small></div>
            <div>
              <button type="button" onClick={() => setUnits(Math.max(1, units - 1))}><Minus size={16} /></button>
              <strong>{units}</strong>
              <button type="button" onClick={() => setUnits(Math.min(maxUnits, units + 1))}><Plus size={16} /></button>
            </div>
          </div>

          <div className="v2-summary">
            <div><span>Total aplicado</span><strong>{brl(total)}</strong></div>
            <div><span>Projeção média diária</span><strong>{brl(dailyProjected * units)}</strong></div>
            <div><span>Cenário total no período</span><strong>{brl(project.projectedScenario * units)}</strong></div>
          </div>

          <div className="v2-balance-line">
            <span>Seu saldo disponível</span><strong>{brl(balance)}</strong>
          </div>

          <button
            className="v2-participate"
            disabled={busy || closed}
            onClick={async () => {
              setBusy(true);
              await participate(project.id, units);
              setBusy(false);
            }}
          >
            {closed ? "Projeto indisponível" : busy ? "Processando..." : <>Participar agora <ArrowUpRight size={18} /></>}
          </button>

          <div className="v2-trust-row">
            <ShieldCheck size={17} /> Operação validada no servidor e vinculada à sua conta.
          </div>
        </section>
      </div>
    </div>
  );
}
