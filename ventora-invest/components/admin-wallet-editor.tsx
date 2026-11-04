"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, CircleAlert, ShieldCheck, WalletCards, X } from "lucide-react";

export type WalletEditorTarget = {
  userId: string;
  name: string;
  email: string;
  currentBalance: number;
};

type Mode = "credit" | "debit" | "set";
const money = (v: number) => new Intl.NumberFormat("pt-BR", {style:"currency",currency:"BRL"}).format(v);

function centsFromInput(raw: string): number | null {
  const clean = raw.trim().replace(",", ".");
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(clean)) return null;
  const value = Number(clean);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export function AdminWalletEditor({target,onClose,onDone}:{
  target: WalletEditorTarget;
  onClose:()=>void;
  onDone:(data:{newBalance:number;delta:number;alreadyApplied?:boolean})=>void;
}) {
  const [mode,setMode] = useState<Mode>("credit");
  const [amount,setAmount] = useState("");
  const [reason,setReason] = useState("");
  const [step,setStep] = useState<"edit"|"review">("edit");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const requestId = useRef<string>("");
  const oldCents = Math.round(target.currentBalance*100);
  const valueCents = centsFromInput(amount);
  const preview = useMemo(()=>{
    if (valueCents===null) return null;
    const targetCents = mode==="credit" ? oldCents + valueCents : mode==="debit" ? oldCents-valueCents : valueCents;
    return {deltaCents:targetCents-oldCents,targetCents};
  },[mode,oldCents,valueCents]);
  const reasonClean = reason.trim();
  const issue = !amount.trim() ? "Informe um valor." : valueCents===null ? "Use um valor em reais com até duas casas decimais." :
    valueCents > 5000000 ? "Limite de R$ 50.000,00 por ajuste." :
    mode!=="set" && valueCents===0 ? "Informe um valor maior que zero." :
    preview===null ? "Valor inválido." : preview.targetCents<0 ? "Não é possível retirar mais que o saldo disponível." :
    Math.abs(preview.deltaCents)>5000000 ? "Limite de R$ 50.000,00 por ajuste." :
    preview.deltaCents===0 ? "O saldo final é igual ao atual." :
    reasonClean.length<8 ? "Escreva um motivo de pelo menos 8 caracteres." :
    reasonClean.length>240 ? "O motivo deve ter até 240 caracteres." : "";

  useEffect(()=>{
    const handle=(event:KeyboardEvent)=>{if(event.key==="Escape" && !busy) onClose();};
    document.addEventListener("keydown",handle);
    const original=document.body.style.overflow;
    document.body.style.overflow="hidden";
    return ()=>{document.removeEventListener("keydown",handle);document.body.style.overflow=original;};
  },[onClose,busy]);

  async function submit() {
    if (busy||issue||valueCents===null||preview===null)return;
    if (!requestId.current) requestId.current=crypto.randomUUID();
    setBusy(true);setError("");
    try {
      const response=await fetch("/api/admin/wallet-adjust",{
        method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",
        body:JSON.stringify({
          userId:target.userId,mode,amount:(valueCents/100).toFixed(2),
          expectedBalance:(oldCents/100).toFixed(2),reason:reasonClean,requestId:requestId.current
        })
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(String(data.error||"Não foi possível salvar o ajuste."));
      onDone({newBalance:Number(data.newBalance),delta:Number(data.delta),alreadyApplied:Boolean(data.alreadyApplied)});
    }catch(err){setError(err instanceof Error?err.message:"Falha ao concluir ajuste.");}
    finally{setBusy(false);}
  }

  return <div className="vw11-overlay" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}>
    <section role="dialog" aria-modal="true" aria-labelledby="vw11-title" className="vw11-dialog">
      <div className="vw11-dialog-head">
        <div className="vw11-brandmark"><WalletCards size={23}/></div>
        <div><span>GESTÃO FINANCEIRA · VENTORA</span><h2 id="vw11-title">Ajustar carteira</h2></div>
        <button className="vw11-close" type="button" aria-label="Fechar" disabled={busy} onClick={onClose}><X size={20}/></button>
      </div>
      <div className="vw11-person"><div className="vw11-avatar">{target.name.slice(0,1).toUpperCase()}</div><div><strong>{target.name}</strong><span>{target.email}</span></div></div>
      <div className="vw11-balance"><span>Saldo disponível agora</span><strong>{money(target.currentBalance)}</strong></div>
      {step==="edit" ? <>
        <div className="vw11-modes" role="group" aria-label="Tipo de ajuste">
          <button type="button" className={mode==="credit"?"selected":""} onClick={()=>{setMode("credit");setError("");}}><ArrowDownRight size={19}/>Adicionar</button>
          <button type="button" className={mode==="debit"?"selected":""} onClick={()=>{setMode("debit");setError("");}}><ArrowUpRight size={19}/>Retirar</button>
          <button type="button" className={mode==="set"?"selected":""} onClick={()=>{setMode("set");setError("");}}><WalletCards size={17}/>Definir saldo</button>
        </div>
        <label className="vw11-label">{mode==="set"?"Novo saldo total":"Valor do ajuste"}
          <div className="vw11-money-field"><span>R$</span><input autoFocus inputMode="decimal" type="text" value={amount} onChange={event=>{setAmount(event.target.value);setError("");}} placeholder="0,00"/></div>
        </label>
        <label className="vw11-label">Motivo do ajuste <small>(obrigatório · auditoria)</small>
          <textarea rows={3} maxLength={240} value={reason} onChange={event=>{setReason(event.target.value);setError("");}} placeholder="Ex.: Correção de crédito administrativo autorizado"/>
        </label>
        <div className="vw11-preview"><div><span>Saldo atual</span><strong>{money(target.currentBalance)}</strong></div><div><span>{mode==="set"?"Diferença":"Movimentação"}</span><strong className={preview&&preview.deltaCents<0?"minus":"plus"}>{preview ? `${preview.deltaCents>0?"+":""}${money(preview.deltaCents/100)}`:"—"}</strong></div><div className="vw11-final"><span>Saldo após ajuste</span><strong>{preview&&preview.targetCents>=0?money(preview.targetCents/100):"—"}</strong></div></div>
        {issue && <p className="vw11-hint" role="status"><CircleAlert size={15}/>{issue}</p>}
        {error&&<p className="vw11-error" role="alert">{error}</p>}
        <div className="vw11-actions"><button type="button" onClick={onClose} className="vw11-secondary">Cancelar</button><button type="button" disabled={Boolean(issue)} className="vw11-primary" onClick={()=>{setError("");setStep("review");}}>Revisar ajuste <ArrowUpRight size={17}/></button></div>
      </> : <>
        <div className="vw11-review"><ShieldCheck size={24}/><strong>Confirme a movimentação</strong><p>Esta operação altera o saldo real de <b>{target.name}</b>. O histórico registrará o ajuste administrativo, sem gerar depósito ou pagamento PIX.</p><div><span>Saldo anterior</span><strong>{money(oldCents/100)}</strong></div><div><span>Movimentação</span><strong>{preview?money(preview.deltaCents/100):"—"}</strong></div><div><span>Saldo final</span><strong>{preview?money(preview.targetCents/100):"—"}</strong></div><div><span>Motivo</span><strong>{reasonClean}</strong></div></div>
        {error&&<p className="vw11-error" role="alert">{error}</p>}
        <div className="vw11-actions"><button type="button" disabled={busy} className="vw11-secondary" onClick={()=>{setStep("edit");setError("");}}>Voltar</button><button type="button" disabled={busy||Boolean(issue)} className="vw11-primary" onClick={submit}>{busy?"Salvando...":<><CheckCircle2 size={18}/> Confirmar ajuste</>}</button></div>
      </>}
      <div className="vw11-foot"><ShieldCheck size={14}/> Operação restrita ao administrador · registrada em auditoria</div>
    </section>
  </div>;
}
