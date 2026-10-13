"use client";
import { createContext, useContext, useMemo, useState, useEffect } from "react";
import type {
  Holding,
  Profile,
  ReferralSummary,
  WalletSummary,
  WalletTransaction,
  WindProject,
} from "@/lib/types";

type AppState = {
  balance: number;
  futureBalance: number;
  holdings: Holding[];
  toast: string | null;
};

type AppContextType = AppState & {
  projects: WindProject[];
  profile: Profile;
  referral: ReferralSummary;
  wallet: WalletSummary;
  transactions: WalletTransaction[];
  participate: (projectId: string, units: number) => Promise<void>;
  showToast: (message: string) => void;
};

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({
  children,
  profile,
  referral,
  initialWallet,
  initialHoldings,
  initialProjects,
  initialTransactions,
}: {
  children: React.ReactNode;
  profile: Profile;
  referral: ReferralSummary;
  initialWallet: WalletSummary;
  initialHoldings: Holding[];
  initialProjects: WindProject[];
  initialTransactions: WalletTransaction[];
}) {
  const projectedRemaining = initialHoldings.reduce((sum, holding) => {
    if (holding.status !== "active") return sum;
    const project = initialProjects.find((item) => item.id === holding.projectId);
    const projectedTotal = holding.projectedTotalAtPurchase || (project?.projectedScenario ?? 0) * holding.units;
    return sum + Math.max(0, projectedTotal - holding.totalReceived);
  }, 0);

  useEffect(() => {
    let stopped = false;
    let running = false;
    const reconcile = async () => {
      if (running || document.visibilityState === "hidden") return;
      running = true;
      try {
        const response = await fetch("/api/payments/pushinpay/reconcile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          cache: "no-store",
        });
        if (!response.ok) return;
        const result = await response.json();
        if (!stopped && Number(result?.credited || 0) > 0) window.location.reload();
      } catch { /* webhook continua como caminho principal */ }
      finally { running = false; }
    };
    void reconcile();
    const interval = window.setInterval(() => void reconcile(), 70000);
    const onVisible = () => { if (document.visibilityState === "visible") void reconcile(); };
    window.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; window.clearInterval(interval); window.removeEventListener("visibilitychange", onVisible); };
  }, []);

  const [state, setState] = useState<AppState>({
    balance: initialWallet.balance,
    futureBalance: projectedRemaining,
    holdings: initialHoldings,
    toast: null,
  });

  const showToast = (message: string) => {
    setState((current) => ({ ...current, toast: message }));
    window.setTimeout(
      () => setState((current) => ({ ...current, toast: null })),
      3200,
    );
  };

  const participate = async (projectId: string, units: number) => {
    const response = await fetch("/api/participate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, units }),
    });
    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || "Não foi possível concluir.");
      return;
    }
    showToast("Participação registrada com sucesso.");
    window.location.reload();
  };

  const value = useMemo(
    () => ({
      ...state,
      projects: initialProjects,
      profile,
      referral,
      wallet: initialWallet,
      transactions: initialTransactions,
      participate,
      showToast,
    }),
    [state, initialProjects, profile, referral, initialWallet, initialTransactions],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      {state.toast && <div className="toast">{state.toast}</div>}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp outside provider");
  return ctx;
}
