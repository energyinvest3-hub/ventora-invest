"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, CheckCircle2, ShieldCheck, WalletCards } from "lucide-react";
import { useApp } from "./app-provider";

const brl = (n:number) => n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
type PixType = "cpf"|"email"|"phone"|"random";

export function WithdrawalPage(){
  const {balance,showToast}=useApp();
  const [amount,setAmount]=useState("");
  const [pixKeyType,setPixKeyType]=useState<PixType>("cpf");
  const [pixKey,setPixKey]=useState("");
  const [document,setDocument]=useState("");
  const [accepted,setAccepted]=useState(false);
  const [busy,setBusy]=useState(false);
  const [withdrawAllowed,setWithdrawAllowed]=useState(false);
  useEffect(()=>{
    const check=()=>{
      const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Sao_Paulo",weekday:"short",hour:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
      const weekday=parts.find(p=>p.type==="weekday")?.value || "";
      const hour=Number(parts.find(p=>p.type==="hour")?.value ?? "-1");
      setWithdrawAllowed(!["Sat","Sun"].includes(weekday) && hour===9);
    };
    check();
    const timer=window.setInterval(check,30000);
    return ()=>window.clearInterval(timer);
  },[]);
  const [done,setDone]=useState<string|null>(null);
  const numericAmount=Number(amount.replace(",","."));
  const feeAmount=Number.isFinite(numericAmount) ? Math.round(numericAmount*0.04*100)/100 : 0;
  const netAmount=Number.isFinite(numericAmount) ? Math.round((numericAmount-feeAmount)*100)/100 : 0;
  const doc=document.replace(/\D/g,"");
  const valid=Number.isFinite(numericAmount)&&numericAmount>=1.05&&numericAmount<=balance&&withdrawAllowed&&pixKey.trim().length>=3&&[11,14].includes(doc.length)&&accepted;

  async function submit(){
    if(!valid||busy)return;
    setBusy(true);
    try{
      const response=await fetch("/api/payments/pushinpay/withdraw",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({amount:numericAmount,pixKeyType,pixKey,receiverNationalRegistration:doc}),
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||"Não foi possível solicitar o saque.");
      setDone(result.message||"Saque enviado para processamento.");
    }catch(error){
      showToast(error instanceof Error?error.message:"Não foi possível solicitar o saque.");
    }finally{setBusy(false)}
  }

  if(done)return <div className="withdraw-page">
    <Link href="/carteira" className="withdraw-back"><ArrowLeft size={17}/> Voltar à carteira</Link>
    <section className="withdraw-success"><CheckCircle2 size={44}/><span>SAQUE PIX</span><h1>Solicitação recebida</h1><p>{done}</p><Link href="/carteira" className="withdraw-primary">Ver carteira <ArrowUpRight size={17}/></Link></section>
  </div>;

  return <div className="withdraw-page">
    <Link href="/carteira" className="withdraw-back"><ArrowLeft size={17}/> Voltar à carteira</Link>
    <header><span>SAQUE VIA PIX</span><h1>Solicitar saque</h1><p>Saques de segunda a sexta, das 9h às 10h (horário de Brasília). Taxa de 4% descontada do valor solicitado.</p></header>
    <section className="withdraw-card">
      <div className="withdraw-balance"><WalletCards size={22}/><div><small>Saldo disponível</small><strong>{brl(balance)}</strong></div></div>
      <label className="withdraw-field"><span>Valor do saque</span><div className="withdraw-money"><b>R$</b><input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00"/></div></label>
      <div className="ventora-withdrawal-rules" role="note">
        <strong>Horário de saque: segunda a sexta, das 9h às 10h (Brasília)</strong>
        <p>{withdrawAllowed ? "Período de solicitação aberto." : "Solicitações indisponíveis neste horário ou em fins de semana."}</p>
        <p>Taxa de saque: <strong>4%</strong> (deduzida do valor solicitado).</p>
        {Number.isFinite(numericAmount) && numericAmount>0 && <p>Valor solicitado: <strong>{brl(numericAmount)}</strong> · Taxa: <strong>{brl(feeAmount)}</strong> · Você recebe: <strong>{brl(netAmount)}</strong></p>}
        <small>Valor mínimo solicitado: R$ 1,05. O valor líquido é enviado por PIX; o total solicitado é debitado da carteira.</small>
      </div>
      {numericAmount>balance&&<p className="withdraw-error">Saldo insuficiente para este valor.</p>}
      <label className="withdraw-field"><span>Tipo de chave PIX</span><select value={pixKeyType} onChange={e=>setPixKeyType(e.target.value as PixType)}><option value="cpf">CPF</option><option value="email">E-mail</option><option value="phone">Telefone</option><option value="random">Chave aleatória</option></select></label>
      <label className="withdraw-field"><span>Chave PIX</span><input value={pixKey} onChange={e=>setPixKey(e.target.value)} placeholder={pixKeyType==="phone"?"+5511999999999":"Informe sua chave PIX"}/></label>
      <label className="withdraw-field"><span>CPF/CNPJ do titular da chave</span><input inputMode="numeric" value={document} onChange={e=>setDocument(e.target.value)} placeholder="Somente números"/></label>
      <label className="withdraw-confirm"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>Confirmo meus dados PIX, o desconto de 4% no valor a receber e que não repetirei a solicitação enquanto estiver em processamento.</span></label>
      <div className="withdraw-info"><ShieldCheck size={19}/><p>O valor é reservado antes do envio. Se a PushinPay recusar o saque definitivamente, ele volta automaticamente para a carteira.</p></div>
      <button className="withdraw-primary" type="button" disabled={!valid||busy} onClick={submit}>{busy?"Enviando...":<>Solicitar saque <ArrowUpRight size={17}/></>}</button>
    </section>
  </div>;
}
