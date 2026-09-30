"use client";
import { createContext, useContext, useMemo, useState } from "react";
import { windProjects } from "@/lib/data";
import type { Holding } from "@/lib/types";

type Profile = { name: string; email: string; phone?: string };
type AppState = { balance: number; futureBalance: number; holdings: Holding[]; toast: string | null };
type AppContextType = AppState & { projects: typeof windProjects; profile: Profile; participate: (projectId:string, units:number)=>Promise<void>; showToast:(message:string)=>void };
const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({children, profile, initialBalance, initialHoldings}:{children:React.ReactNode;profile:Profile;initialBalance:number;initialHoldings:Holding[]}){
  const projected = initialHoldings.reduce((sum,h)=>{
    const p=windProjects.find(x=>x.id===h.projectId); return sum + (p?.projectedScenario ?? 0)*h.units;
  },0);
  const [state,setState]=useState<AppState>({balance:initialBalance,futureBalance:projected,holdings:initialHoldings,toast:null});
  const showToast=(message:string)=>{setState(s=>({...s,toast:message})); window.setTimeout(()=>setState(s=>({...s,toast:null})),3200)};
  const participate=async(projectId:string,units:number)=>{
    const response=await fetch("/api/participate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId,units})});
    const data=await response.json();
    if(!response.ok){showToast(data.error || "Não foi possível concluir.");return;}
    showToast("Participação registrada com sucesso."); window.location.reload();
  };
  const value=useMemo(()=>({...state,projects:windProjects,profile,participate,showToast}),[state,profile]);
  return <AppContext.Provider value={value}>{children}{state.toast&&<div className="toast">{state.toast}</div>}</AppContext.Provider>;
}
export function useApp(){const ctx=useContext(AppContext);if(!ctx)throw new Error("useApp outside provider");return ctx;}
