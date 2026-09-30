"use client";
import { useMemo, useState } from "react";
import { Activity, ArrowDownLeft, Gift, Search, ShieldCheck, Users, Wallet, Wind } from "lucide-react";

type Row = Record<string, unknown>;
type AdminData = Record<string, Row[]>;
type Tab = "Usuários" | "Carteiras" | "Projetos" | "Participações" | "Depósitos" | "Transações" | "Indicações" | "Auditoria";

const tabKey: Record<Tab,string> = {
  "Usuários":"profiles",
  "Carteiras":"wallets",
  "Projetos":"wind_projects",
  "Participações":"user_projects",
  "Depósitos":"deposits",
  "Transações":"transactions",
  "Indicações":"referrals",
  "Auditoria":"admin_audit_logs",
};
const tabs = Object.keys(tabKey) as Tab[];

function money(v: unknown) {
  return new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" }).format(Number(v || 0));
}
function sum(rows:Row[], key:string){ return rows.reduce((n,r)=>n+Number(r[key]||0),0); }
function primary(row:Row, tab:Tab){
  if(tab==="Usuários") return String(row.name || row.email || row.id || "Usuário");
  if(tab==="Carteiras") return String(row.email || row.user_id || "Carteira");
  if(tab==="Projetos") return String(row.name || row.slug || "Projeto");
  if(tab==="Participações") return String(row.project_slug || row.id || "Participação");
  if(tab==="Depósitos") return String(row.gateway_id || row.id || "Depósito PIX");
  if(tab==="Transações") return String(row.description || row.type || "Transação");
  if(tab==="Indicações") return String(row.referred_name || row.referred_id || "Indicação");
  return String(row.action || row.id || "Auditoria");
}
function detail(row:Row, tab:Tab){
  if(tab==="Usuários") return `${String(row.email||"")} · ${String(row.role||"USER")}`;
  if(tab==="Carteiras") return `Saldo ${money(row.balance)} · ganhos ${money(row.total_earned)}`;
  if(tab==="Projetos") return `${String(row.city||"")} / ${String(row.region||"")} · ${money(row.unit_value)}`;
  if(tab==="Participações") return `${Number(row.quantity||0)} unidade(s) · ${money(row.amount_invested)}`;
  if(tab==="Depósitos") return `${money(row.amount)} · ${String(row.provider_status||row.status||"")}`;
  if(tab==="Transações") return `${String(row.type||"")} · ${money(row.amount)}`;
  if(tab==="Indicações") return `${row.qualified ? "Qualificado" : "Em andamento"} · ${money(row.reward_amount)}`;
  return `${String(row.actor_email||"")} · ${String(row.created_at||"")}`;
}

export function AdminPage({records}:{records:AdminData}){
  const [tab,setTab]=useState<Tab>("Usuários");
  const [query,setQuery]=useState("");
  const rows=records[tabKey[tab]]||[];
  const filtered=useMemo(()=>{const q=query.trim().toLowerCase(); return !q?rows:rows.filter(r=>JSON.stringify(r).toLowerCase().includes(q));},[rows,query]);
  const profiles=records.profiles||[], wallets=records.wallets||[], projects=records.wind_projects||[], holdings=records.user_projects||[], deposits=records.deposits||[], tx=records.transactions||[], refs=records.referrals||[];
  return <div className="admin-page">
    <div className="page-head"><div><span>PAINEL ADMINISTRATIVO</span><h1>Controle da Ventora</h1><p>Usuários, carteiras, projetos, participações e indicações em um só lugar.</p></div></div>
    <section className="admin-security-strip"><ShieldCheck size={21}/><div><strong>Administrador autenticado</strong><span>O acesso é validado no banco pelo UUID da conta administrativa.</span></div></section>
    <div className="admin-kpi-grid">
      <div className="admin-kpi"><span><Users/></span><small>Usuários</small><strong>{profiles.length}</strong><em>{holdings.length} participações</em></div>
      <div className="admin-kpi"><span><Wallet/></span><small>Saldo nas carteiras</small><strong>{money(sum(wallets,"balance"))}</strong><em>{wallets.length} carteiras</em></div>
      <div className="admin-kpi"><span><Wind/></span><small>Total aplicado</small><strong>{money(sum(holdings,"amount_invested"))}</strong><em>{projects.length} projetos</em></div>
      <div className="admin-kpi"><span><ArrowDownLeft/></span><small>Depósitos confirmados</small><strong>{money(sum(deposits.filter(r=>r.status==="completed"),"amount"))}</strong><em>{deposits.filter(r=>r.status==="completed").length} PIX pagos</em></div>
      <div className="admin-kpi"><span><Activity/></span><small>Transações</small><strong>{tx.length}</strong><em>histórico financeiro</em></div>
      <div className="admin-kpi"><span><Gift/></span><small>Indicações</small><strong>{refs.length}</strong><em>{refs.filter(r=>Boolean(r.qualified)).length} qualificadas</em></div>
    </div>
    <div className="admin-tabs">{tabs.map(t=><button key={t} className={tab===t?"active":""} onClick={()=>{setTab(t);setQuery("")}}>{t}</button>)}</div>
    <section className="admin-table-card">
      <div className="admin-table-head"><div><span>{tab.toUpperCase()}</span><h2>{tab}</h2></div><label><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={`Buscar em ${tab.toLowerCase()}`}/></label></div>
      {!filtered.length ? <div className="empty"><h3>Nenhum registro</h3><p>Não há registros para os filtros atuais.</p></div> : <div className="admin-list">{filtered.map((row,i)=><article key={String(row.id||i)}><div><strong>{primary(row,tab)}</strong><small>{detail(row,tab)}</small></div><span>{String(row.status || row.created_at || "")}</span></article>)}</div>}
    </section>
  </div>;
}
