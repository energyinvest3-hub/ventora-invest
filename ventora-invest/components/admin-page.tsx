"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminWalletEditor, type WalletEditorTarget } from "./admin-wallet-editor";
import { AdminWithdrawals } from "./admin-withdrawals";
import { Activity, ArrowDownLeft, Gift, Search, ShieldCheck, Users, Wallet, Wind, Pencil, ArrowUpRight } from "lucide-react";

type Row = Record<string, unknown>;
type AdminData = Record<string, Row[]>;
type Tab = "Usuários" | "Carteiras" | "Projetos" | "Participações" | "Depósitos" | "Saques" | "Transações" | "Indicações" | "Auditoria";

const tabKey: Record<Tab,string> = {
  "Usuários":"profiles",
  "Carteiras":"wallets",
  "Projetos":"wind_projects",
  "Participações":"user_projects",
  "Depósitos":"deposits",
  "Saques":"withdrawals",
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
  if(tab==="Saques") return String(row.user_name || row.user_email || "Saque");
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
  if(tab==="Saques") return `${money(row.amount)} · ${String(row.status||"")}`;
  if(tab==="Transações") return `${String(row.type||"")} · ${money(row.amount)}`;
  if(tab==="Indicações") return `${row.qualified ? "Qualificado" : "Em andamento"} · ${money(row.reward_amount)}`;
  return `${String(row.actor_email||"")} · ${String(row.created_at||"")}`;
}

export function AdminPage({records}:{records:AdminData}){
  const router = useRouter();
  const [syncing,setSyncing]=useState(false);
  const [syncInfo,setSyncInfo]=useState("");
  const [walletEditor,setWalletEditor]=useState<WalletEditorTarget|null>(null);
  const [walletMessage,setWalletMessage]=useState("");
  const [walletFilter,setWalletFilter]=useState<"all"|"positive"|"zero">("all");
  useEffect(()=>{
    const update=()=>{if(document.visibilityState === "visible") router.refresh();};
    const timer=window.setInterval(update,20000);
    window.addEventListener("focus",update);
    return ()=>{window.clearInterval(timer);window.removeEventListener("focus",update);};
  },[router]);
  async function verifyPix(){
    if(syncing) return;
    setSyncing(true);
    setSyncInfo("Consultando transacoes e conferindo os IDs no gateway...");
    try{
      const response=await fetch("/api/cron/reconcile-pix",{
        method:"POST",headers:{"Content-Type":"application/json"},body:"{}",cache:"no-store"
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(String(result.error || `Erro HTTP ${response.status} no servidor.`));
      const statuses=Object.entries(result.providerStatuses || {})
        .map(([status,n])=>`${status}: ${n}`).join(", ");
      const issues=(Array.isArray(result.issues) ? result.issues : []) as {gatewayId:string;stage:string;code:string}[];
      const detail=issues.slice(0,5).map(item=>{
        const meanings:Record<string,string>={
          "HTTP_401":"Token PushinPay incorreto ou expirado no deploy",
          "HTTP_403":"Acesso negado pela PushinPay: permissao, conta ou IP autorizado",
          "HTTP_429":"Limite de consultas da PushinPay; espere antes de consultar novamente",
          "TRANSACAO_NAO_ENCONTRADA":"ID nao encontrado nesse token/conta PushinPay",
          "GATEWAY_RESPOSTA_INVALIDA":"A API retornou um formato inesperado",
          "GATEWAY_REDE":"Falha de rede ao conectar a PushinPay"
        };
        return `${item.gatewayId.slice(0,8)}…: ${meanings[item.code] || item.code} (${item.stage})`;
      }).join(" | ");
      setSyncInfo(`Verificados: ${result.checked}; creditados: ${result.credited}; falhas: ${result.failed}; nao encontrados: ${result.notFound}. `+
        `Status no gateway: ${statuses || "nenhum status retornado"}. `+
        (detail ? `Diagnostico: ${detail}. ` : "")+
        "Se o gateway responde created, compare os IDs com os PIX pagos na PushinPay; nao e seguro creditar apenas pelo valor.");
      router.refresh();
    }catch(error){setSyncInfo(error instanceof Error ? error.message : "Nao foi possivel verificar PIX.");}
    finally{setSyncing(false);}
  }

  const [tab,setTab]=useState<Tab>("Usuários");
  const [query,setQuery]=useState("");
  const profiles=records.profiles||[], wallets=records.wallets||[], projects=records.wind_projects||[], holdings=records.user_projects||[], deposits=records.deposits||[], tx=records.transactions||[], refs=records.referrals||[];

  const usersById=useMemo(()=>{
    const map=new Map<string,Row>();
    for(const user of profiles)
      map.set(String(user.id||""),user);
    return map;
  },[profiles]);

  const rawRows=records[tabKey[tab]]||[];

  const rows=useMemo<Row[]>(()=>tab!=="Carteiras" ? rawRows : rawRows.map(wallet=>{
    const user=usersById.get(String(wallet.user_id||""));
    const email=String(user?.email||"");
    return {
      ...wallet,
      display_name:String(user?.name||email.split("@")[0]||"Usuário sem nome"),
      display_email:email,
      display_phone:String(user?.phone||"")
    };
  }),[rawRows,tab,usersById]);

  const filtered=useMemo(()=>{
    const q=query.trim().toLocaleLowerCase("pt-BR");
    const byBalance=tab!=="Carteiras"||walletFilter==="all" ? rows : rows.filter(row=>
      walletFilter==="positive" ? Number(row.balance||0)>0 : Number(row.balance||0)===0
    );
    return !q ? byBalance : byBalance.filter(row=>
      JSON.stringify(row).toLocaleLowerCase("pt-BR").includes(q)
    );
  },[rows,query,tab,walletFilter]);
  return <div className="admin-page">
    <div className="page-head"><div><span>PAINEL ADMINISTRATIVO</span><h1>Controle da Ventora</h1><p>Usuários, carteiras, projetos, participações e indicações em um só lugar.</p></div></div>
    <section className="vw11-admin-intro">
      <div className="vw11-intro-icon"><ShieldCheck size={27}/></div>
      <div><span>CONSOLE ADMIN · VENTORA</span><h2>Gestão segura de contas e valores</h2><p>Busque clientes, acompanhe carteiras e faça correções com confirmação e auditoria.</p></div>
      <span className="vw11-intro-chip">Acesso restrito</span>
    </section>
    <section className="admin-security-strip"><ShieldCheck size={21}/><div><strong>Administrador autenticado</strong><span>O acesso é validado no banco pelo UUID da conta administrativa.</span></div></section>
    <div className="admin-kpi-grid">
      <div className="admin-kpi"><span><Users/></span><small>Usuários</small><strong>{profiles.length}</strong><em>{holdings.length} participações</em></div>
      <div className="admin-kpi"><span><Wallet/></span><small>Saldo nas carteiras</small><strong>{money(sum(wallets,"balance"))}</strong><em>{wallets.length} carteiras</em></div>
      <div className="admin-kpi"><span><Wind/></span><small>Total aplicado</small><strong>{money(sum(holdings,"amount_invested"))}</strong><em>{projects.length} projetos</em></div>
      <div className="admin-kpi"><span><ArrowDownLeft/></span><small>Depósitos confirmados</small><strong>{money(sum(deposits.filter(r=>r.status==="completed"),"amount"))}</strong><em>{deposits.filter(r=>r.status==="completed").length} PIX pagos</em></div>
      <div className="admin-kpi"><span><Activity/></span><small>Transações</small><strong>{tx.length}</strong><em>histórico financeiro</em></div>
      <div className="admin-kpi"><span><ShieldCheck/></span><small>Saques pendentes</small><strong>{(records.withdrawals||[]).filter(r=>r.status==="pending"&&r.provider_status==="manual_pending").length}</strong><em>pagamento manual</em></div>
      <div className="admin-kpi"><span><Gift/></span><small>Indicações</small><strong>{refs.length}</strong><em>{refs.filter(r=>Boolean(r.qualified)).length} qualificadas</em></div>
    </div>
    <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:12,margin:"18px 0"}}>
      <button type="button" className="primary" disabled={syncing} onClick={verifyPix}>
        {syncing ? "Consultando PushinPay..." : "Verificar pagamentos PIX agora"}
      </button>
      <button type="button" onClick={()=>router.refresh()}>Atualizar painel</button>
      {syncInfo && <small role="status" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",maxWidth:"100%"}}>{syncInfo}</small>}
    </div>
    {walletMessage && <div className="vw11-feedback" role="status"><ShieldCheck size={17}/>{walletMessage}</div>}
    <div className="admin-tabs">{tabs.map(t=><button key={t} className={tab===t?"active":""} onClick={()=>{setTab(t);setQuery("")}}>{t}</button>)}</div>
    <section className="admin-table-card">
      <div className="admin-table-head"><div><span>{tab.toUpperCase()}</span><h2>{tab}</h2></div><label><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={tab==="Carteiras" ? "Buscar nome, e-mail, telefone ou ID" : `Buscar em ${tab.toLowerCase()}`}/></label></div>
      {tab==="Carteiras" && <div className="vw11-wallet-toolbar">
        <div className="vw11-wallet-filters">
          {([ ["all","Todas"], ["positive","Com saldo"], ["zero","Zeradas"] ] as const).map(([value,label])=><button key={value} type="button" className={walletFilter===value?"active":""} onClick={()=>setWalletFilter(value)}>{label}</button>)}
        </div>
        <span>{filtered.length} carteira(s) encontrada(s)</span>
      </div>}
      {tab==="Saques" ? <AdminWithdrawals rows={filtered}/> : !filtered.length ? <div className="empty"><h3>Nenhum registro</h3><p>Não há registros para os filtros atuais.</p></div>
      : tab==="Carteiras" ? <div className="ventora-wallet-grid">
        {filtered.map((wallet,i)=><article className="ventora-wallet-user-card" key={String(wallet.user_id||i)}>
          <div className="ventora-wallet-user-head">
            <span className="ventora-wallet-avatar" aria-hidden="true">{String(wallet.display_name||"U").charAt(0).toUpperCase()}</span>
            <div className="ventora-wallet-identification">
              <strong>{String(wallet.display_name||"Usuário sem nome")}</strong>
              <small className="ventora-wallet-email">{String(wallet.display_email||"E-mail não disponível")}</small>
              {Boolean(wallet.display_phone) && <small>{String(wallet.display_phone)}</small>}
            </div>
          </div>
          <div className="ventora-wallet-amounts">
            <div><span>Saldo disponível</span><strong>{money(wallet.balance)}</strong></div>
            <div><span>Ganhos acumulados</span><strong>{money(wallet.total_earned)}</strong></div>
          </div>
          <small className="ventora-wallet-user-id" title={String(wallet.user_id||"")}>ID: {String(wallet.user_id||"").slice(0,8)}…</small>
          <div className="vw11-card-actions">
            <button type="button" className="vw11-adjust-button" onClick={()=>{
              setWalletMessage("");
              setWalletEditor({userId:String(wallet.user_id),name:String(wallet.display_name||"Usuário"),email:String(wallet.display_email||""),currentBalance:Number(wallet.balance||0)});
            }}><Pencil size={17}/> Ajustar saldo <ArrowUpRight size={17}/></button>
            <span>Histórico registrado</span>
          </div>
        </article>)}
      </div>
      : <div className="admin-list">{filtered.map((row,i)=><article key={String(row.id||i)}><div><strong>{primary(row,tab)}</strong><small>{detail(row,tab)}</small></div><span>{String(row.status || row.created_at || "")}</span></article>)}</div>}
    </section>
    {/* vw11-wallet-editor-marker */}
    {walletEditor && <AdminWalletEditor
      target={walletEditor}
      onClose={()=>setWalletEditor(null)}
      onDone={(result)=>{
        setWalletEditor(null);
        setWalletMessage(`Ajuste ${result.alreadyApplied?"já registrado":"concluído"}. Novo saldo: ${money(result.newBalance)} (${result.delta>=0?"+":""}${money(result.delta)}).`);
        router.refresh();
      }}
    />}
  </div>;
}
