"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Eye,
  EyeOff,
  History,
  Plus,
  WalletCards,
} from "lucide-react";
import { useApp } from "./app-provider";
import type { WalletTransaction } from "@/lib/types";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

type Filter = "all" | "in" | "out" | "credit" | "bonus" | "purchase";

export function WalletPage() {
  const {
    balance,
    futureBalance,
    holdings,
    wallet,
    transactions,
    showToast,
  } = useApp();
  const [visible, setVisible] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/payments/pushinpay/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
    })
      .then(async (response) => response.ok ? response.json() : null)
      .then((result) => {
        if (!cancelled && Number(result?.credited || 0) > 0) {
          window.location.reload();
        }
      })
      .catch(() => { /* webhook is the primary path */ });
    return () => { cancelled = true; };
  }, []);

  const totalInvested = holdings.reduce((sum, holding) => sum + holding.amount, 0);
  const totalReceivedFromHoldings = holdings.reduce(
    (sum, holding) => sum + holding.totalReceived,
    0,
  );
  const totalReceived = Math.max(wallet.totalEarned, totalReceivedFromHoldings);

  const filtered = useMemo(() => {
    if (filter === "all") return transactions;
    if (filter === "in")
      return transactions.filter((item) =>
        ["deposit", "credit", "refund", "bonus"].includes(item.type),
      );
    if (filter === "out")
      return transactions.filter((item) =>
        ["purchase", "withdrawal"].includes(item.type),
      );
    if (filter === "credit") return transactions.filter((item) => item.type === "credit");
    if (filter === "bonus") return transactions.filter((item) => item.type === "bonus");
    return transactions.filter((item) => item.type === "purchase");
  }, [transactions, filter]);

  return (
    <>
      <div className="page-head">
        <div>
          <span>TUDO SOB CONTROLE</span>
          <h1>Minha carteira</h1>
          <p>Sua movimentação, com clareza e simplicidade.</p>
        </div>
      </div>

      <section className="wallet-energy-layout">
        <article className="wallet-energy-card">
          <div className="wallet-energy-topline">
            <span>● MINHA CARTEIRA</span>
            <button
              type="button"
              aria-label={visible ? "Ocultar valores" : "Mostrar valores"}
              onClick={() => setVisible((value) => !value)}
            >
              {visible ? <Eye size={20} /> : <EyeOff size={20} />}
            </button>
          </div>
          <small>Saldo disponível</small>
          <h2>{visible ? brl(balance) : "R$ ••••"}</h2>

          <div className="wallet-energy-inline">
            <div>
              <span>Rendimentos acumulados</span>
              <strong>{visible ? brl(totalReceived) : "R$ ••••"}</strong>
            </div>
            <div>
              <span>Total aplicado</span>
              <strong>{visible ? brl(totalInvested) : "R$ ••••"}</strong>
            </div>
          </div>

          <div className="wallet-future-box">
            <div>
              <span>Saldo futuro</span>
              <strong>{visible ? brl(futureBalance) : "R$ ••••"}</strong>
            </div>
            <small>Projeção restante dos projetos ativos</small>
          </div>

          <div className="wallet-energy-actions">
            <Link href="/carteira/adicionar" className="light">
              <Plus size={18} /> Adicionar saldo
            </Link>
            <button
              type="button"
              className="dark"
              onClick={() =>
                showToast("O fluxo de saque será habilitado quando o gateway estiver configurado.")
              }
            >
              <ArrowUpRight size={18} /> Sacar
            </button>
          </div>
        </article>

        <div className="wallet-side-metrics">
          <WalletMetric
            icon={<WalletCards size={22} />}
            label="Total aplicado"
            value={visible ? brl(totalInvested) : "R$ ••••"}
            tone="orange"
          />
          <WalletMetric
            icon={<ArrowDownLeft size={22} />}
            label="Total recebido"
            value={visible ? brl(totalReceived) : "R$ ••••"}
            tone="green"
          />
          <WalletMetric
            icon={<ArrowUpRight size={22} />}
            label="Total sacado"
            value={visible ? brl(wallet.totalWithdrawn) : "R$ ••••"}
            tone="orange"
          />
        </div>
      </section>

      <section className="wallet-history-section">
        <div className="wallet-history-title">
          <div>
            <History size={22} />
            <h2>Histórico de movimentações</h2>
          </div>
        </div>
        <div className="wallet-history-filters">
          {([
            ["all", "Todos"],
            ["in", "Entradas"],
            ["out", "Saídas"],
            ["credit", "Créditos"],
            ["bonus", "Bônus"],
            ["purchase", "Participações"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={filter === key ? "active" : ""}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {!filtered.length ? (
          <div className="wallet-history-empty">Nenhuma movimentação neste filtro.</div>
        ) : (
          <div className="wallet-history-list">
            {filtered.map((item) => (
              <TransactionRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      <div className="legal-note strong">
        Valores projetados são estimativas do cenário exibido em cada projeto e não representam garantia de resultado.
      </div>
    </>
  );
}

function WalletMetric({
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
    <article className={`wallet-side-card ${tone}`}>
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
    </article>
  );
}

function TransactionRow({ item }: { item: WalletTransaction }) {
  const incoming = ["deposit", "credit", "refund", "bonus"].includes(item.type);
  const labels: Record<WalletTransaction["type"], string> = {
    deposit: "Entrada",
    purchase: "Participação",
    credit: "Crédito",
    withdrawal: "Saque",
    refund: "Estorno",
    bonus: "Bônus",
  };
  return (
    <article>
      <span className={incoming ? "transaction-icon in" : "transaction-icon out"}>
        {incoming ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
      </span>
      <div>
        <strong>{item.description || labels[item.type]}</strong>
        <small>{labels[item.type]} · {date(item.createdAt)}</small>
      </div>
      <div className="transaction-value">
        <strong className={incoming ? "positive" : "negative"}>
          {incoming ? "+" : "-"}{brl(item.amount)}
        </strong>
        <small>{item.status === "completed" ? "Concluído" : item.status}</small>
      </div>
    </article>
  );
}
