"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  Eye,
  EyeOff,
  Wind,
  TrendingUp,
  ShieldCheck,
  Plus,
  Gauge,
  Leaf,
  MapPin,
  Clock3,
  Layers3,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "./app-provider";
import { ProjectCard } from "./project-card";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function Dashboard() {
  const { profile, projects, holdings, balance, futureBalance, wallet } = useApp();
  const [visible, setVisible] = useState(true);
  const [promoOpen, setPromoOpen] = useState(false);
  useEffect(() => {
    if (window.sessionStorage.getItem("ventora_promo_destaques_v7") !== "dismissed") setPromoOpen(true);
  }, []);
  useEffect(() => {
    if (!promoOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { window.sessionStorage.setItem("ventora_promo_destaques_v7", "dismissed"); setPromoOpen(false); }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [promoOpen]);
  const closePromo = () => {
    window.sessionStorage.setItem("ventora_promo_destaques_v7", "dismissed");
    setPromoOpen(false);
  };

  const total = holdings.reduce((sum, holding) => sum + holding.amount, 0);
  const totalCapacity = projects.reduce((sum, project) => sum + project.capacityMw, 0);
  const available = projects.filter((project) => project.status === "available");
  const showcase = projects
    .filter((project) => ["ventos-sertao", "atlas-litoral", "litoral-potiguar"].includes(project.id))
    .sort((a, b) => a.unitValue - b.unitValue)
    .slice(0, 3);
  const otherProjects = [...projects]
    .filter((project) => !showcase.some((highlight) => highlight.id === project.id))
    .sort((a, b) => a.unitValue - b.unitValue);
  const firstName = profile.name.split(" ")[0] || "Investidor";

  return (
    <div className="v2-dashboard">
      {promoOpen && showcase.length > 0 && (
        <div className="ventora-promo-overlay" onClick={closePromo}>
          <section className="ventora-promo-modal" role="dialog" aria-modal="true" aria-labelledby="ventora-promo-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="ventora-promo-close" autoFocus aria-label="Fechar promoção" onClick={closePromo}>×</button>
            <span className="ventora-promo-eyebrow">CONDIÇÕES ESPECIAIS · SEM DATA DE TÉRMINO</span>
            <h2 id="ventora-promo-title">Descontos nos parques em destaque</h2>
            <p>Confira as condições promocionais anunciadas para os três parques selecionados. A campanha não possui data de encerramento definida.</p>
            <div className="ventora-promo-projects">
              {showcase.map((project) => (
                <Link key={project.id} href={`/projetos/${project.id}`} onClick={closePromo} className="ventora-promo-project">
                  <span><strong>{project.name}</strong><small>Participação atualmente anunciada</small></span>
                  <span><strong>{brl(project.unitValue)}</strong><small>Ver condições ↗</small></span>
                </Link>
              ))}
            </div>
            <small className="ventora-promo-note">Estes são os valores vigentes no catálogo; nenhum percentual adicional de desconto foi informado. Consulte os detalhes, riscos e condições antes de participar.</small>
            <button type="button" className="ventora-promo-cta" onClick={closePromo}>Continuar na plataforma</button>
          </section>
        </div>
      )}
      <header className="v2-page-hero">
        <div>
          <span className="v2-eyebrow"><Sparkles size={14} /> VENTORA WIND PLATFORM</span>
          <h1>Olá, {firstName}. <span>Bem-vindo à Ventora.</span></h1>
          <p>Acompanhe sua carteira, seus ativos e novas oportunidades eólicas em um só lugar.</p>
        </div>
        <Link href="/projetos" className="v2-hero-cta">
          Explorar parques <ArrowUpRight size={18} />
        </Link>
      </header>

      <div className="v2-hero-grid">
        <section className="v2-wallet-card">
          <div className="v2-wallet-head">
            <span><span className="v2-live-dot" /> MINHA CARTEIRA</span>
            <button
              type="button"
              aria-label={visible ? "Ocultar valores" : "Mostrar valores"}
              onClick={() => setVisible((value) => !value)}
            >
              {visible ? <Eye size={19} /> : <EyeOff size={19} />}
            </button>
          </div>

          <p>Saldo disponível</p>
          <h2>{visible ? brl(balance) : "R$ •••••"}</h2>

          <div className="v2-wallet-metrics">
            <div>
              <small>Total aplicado</small>
              <strong>{visible ? brl(total) : "••••"}</strong>
            </div>
            <div>
              <small>Saldo futuro</small>
              <strong>{visible ? brl(futureBalance) : "••••"}</strong>
            </div>
            <div>
              <small>Total recebido</small>
              <strong>{visible ? brl(wallet.totalEarned) : "••••"}</strong>
            </div>
          </div>

          <div className="v2-wallet-actions">
            <Link href="/carteira/adicionar">
              <Plus size={18} /> Adicionar saldo
            </Link>
            <Link href="/carteira">
              Ver carteira <ArrowUpRight size={17} />
            </Link>
          </div>
          <Wind className="v2-wallet-art" size={240} strokeWidth={0.75} />
        </section>

        <section className="v2-story-card">
          <Image
            src="/wind-hero.png"
            fill
            priority
            alt="Parque eólico Ventora"
            sizes="(max-width: 900px) 100vw, 50vw"
          />
          <div className="v2-story-shade" />
          <div className="v2-story-copy">
            <span><Leaf size={14} /> ENERGIA EM MOVIMENTO</span>
            <h2>Projetos que transformam vento em oportunidade.</h2>
            <p>Explore parques eólicos nacionais e internacionais com informações organizadas e acompanhamento pela plataforma.</p>
            <Link href="/projetos">Conhecer projetos <ArrowUpRight size={17} /></Link>
          </div>
        </section>
      </div>

      <section className="v2-stats-grid" aria-label="Resumo da plataforma">
        <article>
          <span className="v2-stat-icon"><Gauge size={22} /></span>
          <div><small>Capacidade catalogada</small><strong>{totalCapacity.toLocaleString("pt-BR")} MW</strong><p>Somando todos os projetos</p></div>
        </article>
        <article>
          <span className="v2-stat-icon"><Wind size={22} /></span>
          <div><small>Parques disponíveis</small><strong>{available.length}</strong><p>Opções no catálogo</p></div>
        </article>
        <article>
          <span className="v2-stat-icon"><TrendingUp size={22} /></span>
          <div><small>Meus ativos</small><strong>{holdings.length}</strong><p>Participações cadastradas</p></div>
        </article>
      </section>

      <section className="v2-feature-strip">
        <div>
          <span><Wind size={17} /> CATÁLOGO VENTORA</span>
          <h2>Parques eólicos em destaque</h2>
          <p>Compare valores, períodos, capacidade e projeções de cada projeto.</p>
        </div>
        <Link href="/projetos">Ver catálogo completo <ArrowUpRight size={17} /></Link>
      </section>

      <div className="v2-project-grid">
        {showcase.map((project) => <ProjectCard key={project.id} project={project} />)}
      </div>

      {otherProjects.length > 0 && (
        <>
          <section className="v2-feature-strip" aria-label="Outros parques eólicos">
            <div>
              <span><Wind size={17} /> MAIS PROJETOS</span>
              <h2>Outros parques eólicos</h2>
              <p>Conheça os demais {otherProjects.length} projetos cadastrados, do menor para o maior valor.</p>
            </div>
            <Link href="/projetos">Ver todos <ArrowUpRight size={17} /></Link>
          </section>

          <div className="v2-project-grid">
            {otherProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </>
      )}

      <section className="v2-platform-benefits">
        <article>
          <MapPin size={22} />
          <div><strong>Diversificação geográfica</strong><p>Projetos distribuídos em diferentes regiões e perfis eólicos.</p></div>
        </article>
        <article>
          <Clock3 size={22} />
          <div><strong>Prazos visíveis</strong><p>Período e cenário projetado apresentados antes da participação.</p></div>
        </article>
        <article>
          <Layers3 size={22} />
          <div><strong>Ativos organizados</strong><p>Acompanhe suas participações e valores diretamente no painel.</p></div>
        </article>
      </section>

      <section className="v2-transparency">
        <ShieldCheck size={26} />
        <div>
          <strong>Transparência em cada etapa</strong>
          <p>Consulte valores, prazos, disponibilidade e informações do projeto antes de confirmar qualquer participação.</p>
        </div>
        <Link href="/perfil/termos" aria-label="Ver termos"><ArrowUpRight size={20} /></Link>
      </section>
    </div>
  );
}
