"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowUpRight, Leaf, MapPin, ShieldCheck, Wind, X } from "lucide-react";
import { ProjectImage } from "./project-image";
import type { WindProject } from "@/lib/types";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Props = { projects: WindProject[]; onClose: () => void };

export function FeaturedPromoModal({ projects, onClose }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const elements = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter(el => el.getClientRects().length > 0);
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div className="vp8-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="vp8-modal" role="dialog" aria-modal="true" aria-labelledby="vp8-title" aria-describedby="vp8-desc" ref={dialogRef}>
        <button ref={closeRef} type="button" className="vp8-close" onClick={onClose} aria-label="Fechar oferta especial">
          <X size={21} strokeWidth={2} />
        </button>

        <div className="vp8-hero">
          <div className="vp8-hero-image" aria-hidden="true" />
          <div className="vp8-hero-shade" aria-hidden="true" />
          <div className="vp8-hero-content">
            <div className="vp8-brand"><Wind size={28} strokeWidth={1.5} /><span><strong>VENTORA</strong><small>ENERGIA EM MOVIMENTO</small></span></div>
            <span className="vp8-eyebrow">CONDIÇÕES ESPECIAIS · SEM DATA DE ENCERRAMENTO</span>
            <h2 id="vp8-title">Oferta especial <em>por tempo ilimitado</em></h2>
            <p id="vp8-desc">Conheça os três parques eólicos em destaque e explore as condições atuais de participação.</p>
            <div className="vp8-trust"><span><Leaf size={17} /> Energia renovável</span><span><ShieldCheck size={17} /> Informações transparentes</span></div>
          </div>
        </div>

        <div className="vp8-content">
          <div className="vp8-section-title"><div><small>SELECIONADOS PARA VOCÊ</small><h3>Parques em destaque</h3></div><span>{projects.length} projetos</span></div>
          <div className="vp8-grid">
            {projects.map((project) => (
              <Link className="vp8-project" href={`/projetos/${project.id}`} key={project.id} onClick={onClose}>
                <div className="vp8-thumb">
                  <ProjectImage projectId={project.id} src={project.image} alt={`Parque eólico ${project.name}`} sizes="(max-width: 650px) 80vw, 250px" />
                  <span className="vp8-thumb-tag">Em destaque</span>
                </div>
                <div className="vp8-project-info">
                  <strong className="vp8-project-name">{project.name}</strong>
                  <span className="vp8-location"><MapPin size={13} /> {project.city} · {project.region}</span>
                  <div className="vp8-project-price"><div><small>PARTICIPAÇÃO DESDE</small><strong>{brl(project.unitValue)}</strong></div><span className="vp8-project-arrow"><ArrowUpRight size={19}/></span></div>
                </div>
              </Link>
            ))}
          </div>
          <Link href="/projetos" className="vp8-cta" onClick={onClose}><Wind size={22}/><strong>Ver parques em destaque</strong><ArrowUpRight size={22}/></Link>
          <p className="vp8-disclaimer">Valores exibidos conforme o catálogo atual, sujeitos às condições de cada projeto. Não há percentual de desconto ou preço anterior informado, nem garantia de retorno.</p>
          <button type="button" className="vp8-dismiss" onClick={onClose}>Agora não</button>
        </div>
      </section>
    </div>
  );
}
