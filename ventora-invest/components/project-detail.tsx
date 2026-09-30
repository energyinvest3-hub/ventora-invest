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
} from "lucide-react";
import { useState } from "react";
import { useApp } from "./app-provider";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ProjectDetail({ id }: { id: string }) {
  const { projects, participate } = useApp();
  const project = projects.find((item) => item.id === id);
  const [units, setUnits] = useState(1);
  const [busy, setBusy] = useState(false);

  if (!project)
    return (
      <div className="empty">
        <h1>Projeto não encontrado</h1>
        <Link href="/projetos">Voltar</Link>
      </div>
    );

  const dailyProjected = project.projectedScenario / project.termDays;
  const multiple = project.projectedScenario / project.unitValue;

  return (
    <>
      <Link className="back" href="/projetos">
        <ArrowLeft size={17} /> Voltar aos projetos
      </Link>
      <div className="detail-grid">
        <div className="detail-image">
          <Image
            src={project.image}
            fill
            alt={project.name}
            priority
            sizes="(max-width:900px) 100vw, 55vw"
          />
        </div>
        <section className="detail-panel">
          <span className="detail-tag">
            <Wind size={15} /> PROJETO EÓLICO
          </span>
          <h1>{project.name}</h1>
          <p className="location">
            <MapPin size={16} /> {project.city} · {project.region}
          </p>

          <div className="detail-stats four-stats">
            <div>
              <small>Valor por unidade</small>
              <strong>{brl(project.unitValue)}</strong>
            </div>
            <div>
              <small>Prazo</small>
              <strong>{project.termDays} dias</strong>
            </div>
            <div>
              <small>Projetado / dia</small>
              <strong>{brl(dailyProjected)}</strong>
            </div>
            <div>
              <small>Projeção total</small>
              <strong>{brl(project.projectedScenario)}</strong>
            </div>
          </div>

          <div className="project-detail-projection">
            <TrendingUp size={19} />
            <div>
              <span>Projeção no período</span>
              <strong>{multiple.toFixed(2)}x por unidade</strong>
            </div>
          </div>

          <div className="notice">
            <Info size={18} />
            <p>
              Os valores acima são projeções do cenário do projeto. Confira as condições, premissas e riscos antes de confirmar uma participação.
            </p>
          </div>

          <div className="quantity">
            <span>Quantidade</span>
            <div>
              <button onClick={() => setUnits(Math.max(1, units - 1))}>
                <Minus size={16} />
              </button>
              <strong>{units}</strong>
              <button onClick={() => setUnits(units + 1)}>
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div className="summary">
            <div>
              <span>Total aplicado</span>
              <strong>{brl(project.unitValue * units)}</strong>
            </div>
            <div>
              <span>Projeção diária</span>
              <strong>{brl(dailyProjected * units)}</strong>
            </div>
            <div>
              <span>Projeção total no período</span>
              <strong>{brl(project.projectedScenario * units)}</strong>
            </div>
          </div>

          <button
            className="primary wide"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await participate(project.id, units);
              setBusy(false);
            }}
          >
            {busy ? "Processando..." : "Participar"}
          </button>
          <div className="trust-row">
            <ShieldCheck size={17} /> Operações validadas no servidor e vinculadas à sua conta.
          </div>
        </section>
      </div>
    </>
  );
}
