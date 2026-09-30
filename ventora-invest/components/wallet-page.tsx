"use client";
import { WalletCards, ShieldCheck, Ban, Info } from "lucide-react";
import { useApp } from "./app-provider";
const brl=(n:number)=>n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export function WalletPage(){const {balance,futureBalance,holdings,showToast}=useApp(); const total=holdings.reduce((s,h)=>s+h.amount,0); return <><div className="page-head"><div><span>FINANCEIRO</span><h1>Carteira</h1><p>Acompanhe seu saldo e suas movimentações pela Ventora.</p></div></div>
<div className="wallet-page-grid"><section className="balance-panel"><div><WalletCards/><span>Saldo disponível</span></div><h2>{brl(balance)}</h2><div className="balance-breakdown"><p><span>Total aplicado</span><strong>{brl(total)}</strong></p><p><span>Saldo futuro</span><strong>{brl(futureBalance)}</strong></p></div><button onClick={()=>showToast("A recarga PIX será conectada na etapa do gateway de pagamento.")}>Adicionar saldo</button></section>
<section className="compliance-card"><ShieldCheck/><h3>Segurança financeira</h3><p>As movimentações devem ser processadas por integrações de pagamento configuradas no backend e conciliadas com a carteira.</p><div><Ban size={16}/> PIX aguardando integração do gateway</div><div><Info size={16}/> Saques dependem da configuração operacional</div></section></div>
<div className="legal-note strong">Valores projetados devem ser apresentados com premissas, riscos e documentação aplicável. Resultados futuros não são garantidos.</div></>}
