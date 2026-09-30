"use client";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BriefcaseBusiness,
  TrendingUp,
  Wind,
} from "lucide-react";
import { useApp } from "./app-provider";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function HoldingsPage() {
  const { holdings, projects } = useApp();

  const totalInvested = holdings.reduce((sum, holding) => sum + holding.amount, 0);
  const totalReceived = holdings.reduce(
    (sum, holding) => sum + holding.totalReceived,
    0,
  );
  const projectedRemaining = holdings.reduce((sum, holding) => {
    if (holding.status !== "active") return sum;
    const project = projects.find((item) => item.id === holding.projectId);
    const projectedTotal = (project?.projectedScenario ?? 0) * holding.units;
    return sum + Math.max(0, projectedTotal - holding.totalReceived);
  }, 0);
  const activeProjects = new Set(
    holdings.filter((holding) => holding.status === "active").map((holding) => holding.projectId),
  ).size;

  return (
    <>
      <div className="page-head">
        <div>
          <span>SUA JORNADA EÓLICA</span>
          <h1>Meus ativos</h1>
          <p>Cada projeto, cada etapa. Tudo por aqui.</p>
        </div>
      </div>

      <section className="holdings-summary-grid" aria-label="Resumo dos ativos">
        <SummaryCard
          icon={<BriefcaseBusiness size={22} />}
          label="Investimento total"
          value={brl(totalInvested)}
          tone="orange"
        />
        <SummaryCard
          icon={<ArrowDownLeft size={22} />}
          label="Créditos recebidos"
          value={brl(totalReceived)}
          tone="green"
        />
        <SummaryCard
          icon={<TrendingUp size={22} />}
          label="Créditos previstos"
          value={brl(projectedRemaining)}
          tone="orange"
        />
        <SummaryCard
          icon={<Wind size={22} />}
          label="Projetos ativos"
          value={String(activeProjects)}
          tone="orange"
        />
      </section>

      {!holdings.length ? (
        <div className="empty holdings-empty">
          <WindEmpty />
          <h2>Você ainda não possui ativos</h2>
          <p>Explore os projetos disponíveis para começar.</p>
          <Link className="primary" href="/projetos">
            Explorar projetos
          </Link>
        </div>
      ) : (
        <div className="holding-list upgraded">
          {holdings.map((holding) => {
            const project = projects.find((item) => item.id === holding.projectId);
            if (!project) return null;
            const projectedTotal = project.projectedScenario * holding.units;
            const projectedRemainingForHolding = Math.max(
              0,
              projectedTotal - holding.totalReceived,
            );
            return (
              <article key={holding.id}>
                <Image
                  src={project.image}
                  width={150}
                  height={108}
                  alt={project.name}
                />
                <div className="holding-main">
                  <small>{project.city} · {project.region}</small>
                  <h3>{project.name}</h3>
                  <p>{holding.units} unidade(s) · {brl(holding.amount)}</p>
                  <div className="holding-metrics">
                    <span>
                      <small>Recebido</small>
                      <strong>{brl(holding.totalReceived)}</strong>
                    </span>
                    <span>
                      <small>Previsto restante</small>
                      <strong>{brl(projectedRemainingForHolding)}</strong>
                    </span>
                    <span>
                      <small>Projeção total</small>
                      <strong>{brl(projectedTotal)}</strong>
                    </span>
                  </div>
                </div>
                <Link href={`/projetos/${project.id}`}>
                  Detalhes <ArrowUpRight size={16} />
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "green" | "orange";
}) {
  return (
    <article className={`holdings-summary-card ${tone}`}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function WindEmpty() {
  return (
    <svg width="70" height="70" viewBox="0 0 70 70" aria-hidden="true">
      <circle cx="35" cy="35" r="31" fill="#eafaf7" />
      <path
        d="M35 20v33M35 28l-16-8M35 28l16-8M35 28l-2 18"
        stroke="#0d8f84"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
