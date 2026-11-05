"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, Clock3, Copy, ReceiptText, ShieldCheck, X, XCircle } from "lucide-react";

type Row=Record<string,unknown>;
type Action="complete"|"cancel";
const brl=(v:unknown)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v||0));
const date=(v:unknown)=>{try{return new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short",timeZone:"America/Sao_Paulo"}).format(new Date(String(v)));}catch{return String(v||"");}};
const canProcess=(r:Row)=>r.status==="pending"&&r.provider_status==="manual_pending"&&!r.cashout_id;
const label=(r:Row)=>r.status==="completed"?"Concluído":r.status==="cancelled"?"Cancelado":r.status==="review"?"Em revisão":"Pendente";

export function AdminWithdrawals({rows}:{rows:Row[]}){
  const router=useRouter();
  const [filter,setFilter]=useState<"pending"|"all"|"review">("pending");
  const [target,setTarget]=useState<Row|null>(null);
  const [action,setAction]=useState<Action>("complete");
  const [reference,setReference]=useState("");
  const [reason,setReason]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const pending=rows.filter(canProcess).length;
  const reviewing=rows.filter(r=>r.status==="review").length;
  const selected=useMemo(()=>filter==="pending"?rows.filter(canProcess):filter==="review"?rows.filter(r=>r.status==="review"):rows,[filter,rows]);

  function open(row:Row,type:Action){
    setTarget(row);setAction(type);setReference("");setReason("");setConfirmed(false);setError("");
  }
  async function process(){
    if(!target||busy||!confirmed)return;
    if(action==="complete"&&reference.trim().length<8){setError("Informe a referência do comprovante do PIX já enviado.");return;}
    if(action==="cancel"&&reason.trim().length<8){setError("Informe o motivo do cancelamento.");return;}
    setBusy(true);setError("");
    try{
      const res=await fetch("/api/admin/withdrawals",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({id:target.id,action,paymentReference:reference.trim(),reason:reason.trim()}),cache:"no-store"});
      const body=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(String(body.error||"Operação não realizada."));
      setSuccess(action==="complete"?"Pagamento externo registrado como concluído.":"Saque cancelado e valor reservado devolvido à carteira.");
      setTarget(null);router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"Operação não realizada.");}
    finally{setBusy(false);}
  }
  return <div className="vm13-admin">
    <div className="vm13-overview">
      <div className="vm13-overview-main"><span>GESTÃO DE SAQUES</span><h3>Solicitações para pagamento manual</h3><p>O cliente faz o pedido. Você confere a chave PIX, realiza a transferência fora do site e registra o resultado aqui.</p></div>
      <div className="vm13-stats"><div><strong>{pending}</strong><span>Aguardando pagamento</span></div><div><strong>{reviewing}</strong><span>Revisão de saques antigos</span></div></div>
    </div>
    {success&&<div role="status" className="vm13-success"><Check size={18}/>{success}</div>}
    <div className="vm13-filters">
      <button type="button" className={filter==="pending"?"active":""} onClick={()=>setFilter("pending")}>Pendentes ({pending})</button>
      <button type="button" className={filter==="all"?"active":""} onClick={()=>setFilter("all")}>Todos ({rows.length})</button>
      <button type="button" className={filter==="review"?"active":""} onClick={()=>setFilter("review")}>Em revisão ({reviewing})</button>
    </div>
    {!selected.length?<div className="vm13-empty"><Clock3 size={30}/><strong>Nenhum saque nesta lista</strong><p>Quando um cliente solicitar um saque, ele aparecerá aqui com os dados para pagamento.</p></div>
    :<div className="vm13-list">{selected.map(w=><article key={String(w.id)} className="vm13-item">
       <div className="vm13-person"><span className="vm13-avatar">{String(w.user_name||"U").slice(0,1).toUpperCase()}</span>
        <div><strong>{String(w.user_name||"Usuário")}</strong><small>{String(w.user_email||"")}</small><small>Solicitado em {date(w.created_at)}</small></div></div>
       <div className="vm13-values"><strong>{brl(w.amount)}</strong><small>Taxa 4%: {brl(w.fee_amount)} · PIX líquido: <b>{brl(w.net_amount)}</b></small>
         <div className="vm13-pix"><span>{String(w.pix_key_type||"").toUpperCase()}: {String(w.pix_key||"")}</span>
           <button type="button" title="Copiar chave PIX" aria-label="Copiar chave PIX" onClick={()=>void navigator.clipboard?.writeText(String(w.pix_key||""))}><Copy size={14}/></button></div>
         <small>CPF/CNPJ do titular: {String(w.receiver_national_registration||"")}</small>
         {Boolean(w.manual_payment_reference)&&<small>Referência do comprovante: {String(w.manual_payment_reference)}</small>}
       </div>
       <div className="vm13-actions"><span className={`vm13-status vm13-status-${String(w.status||"")}`}>{label(w)}</span>
         {canProcess(w)?<div className="vm13-buttons"><button type="button" className="vm13-complete" onClick={()=>open(w,"complete")}><Check size={16}/> Concluído</button><button type="button" className="vm13-cancel" onClick={()=>open(w,"cancel")}><XCircle size={16}/> Cancelar</button></div>
          :w.status==="review"?<small className="vm13-review-hint">Confira o histórico e o gateway antes de resolver este saque antigo.</small>:null}
       </div>
    </article>)}</div>}
    {target&&<div className="vm13-backdrop" role="presentation"><div className="vm13-modal" role="dialog" aria-modal="true" aria-label={action==="complete"?"Concluir saque pago":"Cancelar saque"}>
      <button className="vm13-close" aria-label="Fechar" onClick={()=>!busy&&setTarget(null)} type="button"><X size={20}/></button>
      <div className="vm13-modal-icon">{action==="complete"?<ReceiptText size={23}/>:<XCircle size={23}/>}</div>
      <h3>{action==="complete"?"Confirmar PIX já pago":"Cancelar solicitação"}</h3>
      <p>{action==="complete"?"Este botão não envia dinheiro. Registre a conclusão somente depois de fazer e conferir o PIX fora da plataforma.":"O saque não foi pago. Ao cancelar, todo o valor solicitado volta para a carteira do cliente."}</p>
      <div className="vm13-summary"><span>{String(target.user_name||"Usuário")}</span><strong>{action==="complete"?brl(target.net_amount):brl(target.amount)}</strong>
        <small>{action==="complete"?"Líquido a ser pago ao cliente":"Valor integral do estorno"}</small></div>
      <label className="vm13-modal-field">{action==="complete"?"Referência do comprovante PIX (obrigatória)":"Motivo do cancelamento (obrigatório)"}
       <input autoFocus disabled={busy} value={action==="complete"?reference:reason} maxLength={action==="complete"?160:240}
         onChange={e=>action==="complete"?setReference(e.target.value):setReason(e.target.value)}
         placeholder={action==="complete"?"ID da transação ou referência do comprovante":"Ex.: Solicitação cancelada antes do pagamento"}/></label>
      <label className="vm13-attest"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>
       <span>{action==="complete"?"Confirmo que já enviei o PIX fora da plataforma, conferi o comprovante e não estou enviando novamente pelo site.":"Confirmo que nenhum pagamento foi realizado para este saque e que o estorno é devido."}</span></label>
      {error&&<p role="alert" className="vm13-error">{error}</p>}
      <button className={action==="complete"?"vm13-submit":"vm13-submit warn"} type="button" disabled={busy||!confirmed||((action==="complete"?reference:reason).trim().length<8)} onClick={()=>void process()}>
        {busy?"Registrando...":action==="complete"?"Registrar como concluído":"Cancelar e devolver saldo"}<ArrowUpRight size={17}/></button>
    </div></div>}
  </div>;
}
