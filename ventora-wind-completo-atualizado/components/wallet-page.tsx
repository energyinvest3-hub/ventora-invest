"use client";
import { WalletCards, ShieldCheck, Ban, Info } from "lucide-react";
import { useApp } from "./app-provider";
const brl=(n:number)=>n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export function WalletPage(){const {balance,futureBalance,holdings,showToast}=useApp(); const total=holdings.reduce((s,h)=>s+h.amount,0); return <><div className="page-head"><div><span>FINANCEIRO</span><h1>Carteira</h1><p>Estrutura pronta para integração posterior com um provedor validado.</p></div></div>
<div className="wallet-page-grid"><section className="balance-panel"><div><WalletCards/><span>Saldo disponível</span></div><h2>{brl(balance)}</h2><div className="balance-breakdown"><p><span>Total demonstrativo</span><strong>{brl(total)}</strong></p><p><span>Cenário futuro</span><strong>{brl(futureBalance)}</strong></p></div><button onClick={()=>showToast("Função financeira real desativada nesta versão demonstrativa.")}>Adicionar saldo</button></section>
<section className="compliance-card"><ShieldCheck/><h3>Produção exige integração adequada</h3><p>Para aceitar dinheiro real, implemente KYC/AML quando aplicável, contratos, política de riscos, conciliação, segurança e um provedor de pagamento autorizado para o seu caso de uso.</p><div><Ban size={16}/> Sem PIX real nesta entrega</div><div><Info size={16}/> Sem saques automáticos</div></section></div>
<div className="legal-note strong">Este projeto foi entregue em modo demonstrativo. Não transforme a interface em promessa de retorno ou oferta financeira sem validação jurídica e regulatória.</div></>}
