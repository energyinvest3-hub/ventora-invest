"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  QrCode,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useApp } from "./app-provider";

type Deposit = {
  id: string;
  identifier: string;
  amount: number;
  status: "pending" | "completed" | "cancelled";
  providerStatus?: string;
  pixCode: string;
  qrCodeDataUrl: string;
  reversalPending?: boolean;
};

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function paymentRequest(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Não foi possível concluir o pagamento.");
  return result;
}

export function DepositPage() {
  const { showToast } = useApp();
  const [amount, setAmount] = useState("100");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deposit, setDeposit] = useState<Deposit | null>(null);

  const numericAmount = Number(String(amount).replace(",", "."));
  const valid = Number.isFinite(numericAmount) && numericAmount >= 1 && numericAmount <= 100000;

  useEffect(() => {
    const saved = window.sessionStorage.getItem("ventora_pushinpay_pending");
    if (!saved || deposit) return;
    paymentRequest("/api/payments/pushinpay/status", { id: saved })
      .then((result) => {
        if (result.deposit) setDeposit(result.deposit as Deposit);
      })
      .catch(() => window.sessionStorage.removeItem("ventora_pushinpay_pending"));
  }, [deposit]);

  useEffect(() => {
    if (!deposit || deposit.status !== "pending") return;
    let stopped = false;

    const check = async () => {
      try {
        const result = await paymentRequest("/api/payments/pushinpay/status", { id: deposit.id });
        const next = result.deposit as Deposit | undefined;
        if (stopped || !next) return;
        setDeposit(next);

        if (next.status === "completed") {
          window.sessionStorage.removeItem("ventora_pushinpay_pending");
          showToast("PIX confirmado. Saldo liberado na sua carteira.");
        } else if (next.status === "cancelled") {
          window.sessionStorage.removeItem("ventora_pushinpay_pending");
        }
      } catch {
        // Webhook remains the primary source of truth; polling is only fallback/UX.
      }
    };

    void check();
    const timer = window.setInterval(check, 3500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [deposit?.id, deposit?.status, showToast]);

  async function createPix() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const result = await paymentRequest("/api/payments/pushinpay/deposit", {
        amount: Math.round(numericAmount * 100) / 100,
      });
      const created = result.deposit as Deposit;
      setDeposit(created);
      window.sessionStorage.setItem("ventora_pushinpay_pending", created.id);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Não foi possível gerar o PIX.");
    } finally {
      setBusy(false);
    }
  }

  async function copyPix() {
    if (!deposit?.pixCode) return;
    try {
      await navigator.clipboard.writeText(deposit.pixCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast("Não foi possível copiar automaticamente.");
    }
  }

  function reset() {
    window.sessionStorage.removeItem("ventora_pushinpay_pending");
    setDeposit(null);
    setCopied(false);
  }

  return (
    <div className="deposit-page">
      <Link href="/carteira" className="back"><ArrowLeft size={17}/> Voltar à carteira</Link>
      <div className="page-head">
        <div>
          <span>PIX</span>
          <h1>Adicionar saldo</h1>
          <p>Gere o QR Code e o código copia e cola. Após a confirmação do PIX, o valor entra automaticamente na sua carteira Ventora.</p>
        </div>
      </div>

      {deposit ? (
        <section className="pix-payment-card">
          <div className={`pix-state-icon ${deposit.status}`}>
            {deposit.status === "completed" ? <CheckCircle2 size={34}/> : deposit.status === "cancelled" ? <QrCode size={34}/> : <Clock3 size={34}/>}
          </div>
          <span className={`pix-state-pill ${deposit.status}`}>
            {deposit.status === "completed" ? "PIX CONFIRMADO" : deposit.status === "cancelled" ? "PIX CANCELADO" : "AGUARDANDO PAGAMENTO"}
          </span>
          <h2>{deposit.status === "completed" ? "Saldo liberado" : deposit.status === "cancelled" ? "Cobrança encerrada" : "Pague usando o QR Code ou copia e cola"}</h2>
          <strong className="pix-main-amount">{brl(deposit.amount)}</strong>

          {deposit.status === "pending" && (
            <>
              {deposit.qrCodeDataUrl && (
                <div className="pix-qr-wrap">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={deposit.qrCodeDataUrl} alt="QR Code PIX" width={280} height={280}/>
                </div>
              )}
              <div className="pix-copy-box">
                <span>PIX copia e cola</span>
                <code>{deposit.pixCode}</code>
              </div>
              <button type="button" className="primary wide pix-copy-button" onClick={copyPix}>
                {copied ? <Check size={18}/> : <Copy size={18}/>} {copied ? "Código copiado" : "Copiar código PIX"}
              </button>
              <p className="pix-waiting-note"><Clock3 size={16}/> A confirmação é automática. Você não precisa enviar comprovante.</p>
            </>
          )}

          {deposit.status === "completed" && (
            <a className="primary wide" href="/carteira">Ver saldo atualizado</a>
          )}
          {deposit.status === "cancelled" && (
            <button type="button" className="primary wide" onClick={reset}>Gerar outro PIX</button>
          )}
          {deposit.status === "pending" && (
            <button type="button" className="pix-secondary-button" onClick={reset}>Gerar outro PIX</button>
          )}

          {deposit.reversalPending && (
            <div className="pix-warning"><ShieldCheck size={18}/> Este pagamento recebeu uma atualização posterior e foi marcado para revisão administrativa.</div>
          )}
          <small className="pix-reference">Referência: {deposit.identifier}</small>
        </section>
      ) : (
        <section className="deposit-create-card">
          <div className="deposit-icon"><Wallet size={28}/></div>
          <h2>Quanto você quer adicionar?</h2>
          <p>Escolha um valor ou digite outro valor. O PIX é criado na hora.</p>
          <div className="quick-amounts">
            {[50,100,200,500,1000].map((value) => (
              <button key={value} type="button" className={numericAmount === value ? "active" : ""} onClick={() => setAmount(String(value))}>
                {brl(value)}
              </button>
            ))}
          </div>
          <label className="deposit-amount-field">
            Outro valor
            <div><span>R$</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9,.]/g,""))} placeholder="100,00"/></div>
          </label>
          {!valid && amount && <p className="deposit-error">Informe um valor entre R$ 1,00 e R$ 100.000,00.</p>}

          <div className="pushinpay-role-notice">
            <ShieldCheck size={19}/>
            <p><strong>Processamento do pagamento:</strong> a PUSHIN PAY atua exclusivamente como processadora de pagamentos e não possui responsabilidade pela entrega, suporte, conteúdo, qualidade ou cumprimento das obrigações relacionadas aos produtos ou serviços oferecidos pela Ventora.</p>
          </div>

          <button type="button" className="primary wide deposit-submit" disabled={!valid || busy} onClick={createPix}>
            {busy ? "Gerando PIX..." : "Gerar PIX"}
          </button>
        </section>
      )}
    </div>
  );
}
