"use client";
import { createContext, useContext, useMemo, useState } from "react";
import type { Holding, Profile, ReferralSummary, WindProject } from "@/lib/types";

type AppState = { balance: number; futureBalance: number; holdings: Holding[]; toast: string | null };
type AppContextType = AppState & {
  projects: WindProject[];
  profile: Profile;
  referral: ReferralSummary;
  participate: (projectId: string, units: number) => Promise<void>;
  showToast: (message: string) => void;
};

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({
  children,
  profile,
  referral,
  initialBalance,
  initialHoldings,
  initialProjects,
}: {
  children: React.ReactNode;
  profile: Profile;
  referral: ReferralSummary;
  initialBalance: number;
  initialHoldings: Holding[];
  initialProjects: WindProject[];
}) {
  const projected = initialHoldings.reduce((sum, holding) => {
    const project = initialProjects.find((item) => item.id === holding.projectId);
    return sum + (project?.projectedScenario ?? 0) * holding.units;
  }, 0);

  const [state, setState] = useState<AppState>({
    balance: initialBalance,
    futureBalance: projected,
    holdings: initialHoldings,
    toast: null,
  });

  const showToast = (message: string) => {
    setState((current) => ({ ...current, toast: message }));
    window.setTimeout(() => setState((current) => ({ ...current, toast: null })), 3200);
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
    () => ({ ...state, projects: initialProjects, profile, referral, participate, showToast }),
    [state, initialProjects, profile, referral],
  );

  return <AppContext.Provider value={value}>{children}{state.toast && <div className="toast">{state.toast}</div>}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp outside provider");
  return ctx;
}
