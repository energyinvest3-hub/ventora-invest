"use client";
import { createContext, useContext, useMemo, useState } from "react";
import { windProjects, profile } from "@/lib/data";
import type { Holding } from "@/lib/types";

type AppState = {
  balance: number;
  futureBalance: number;
  holdings: Holding[];
  toast: string | null;
};

type AppContextType = AppState & {
  projects: typeof windProjects;
  profile: typeof profile;
  buyDemo: (projectId:string, units:number)=>void;
  showToast: (message:string)=>void;
};

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({children}:{children:React.ReactNode}){
  const [state,setState]=useState<AppState>({
    balance: 0,
    futureBalance: 0,
    holdings: [],
    toast: null,
  });
  const showToast=(message:string)=>{
    setState(s=>({...s,toast:message}));
    window.setTimeout(()=>setState(s=>({...s,toast:null})),3000);
  };
  const buyDemo=(projectId:string,units:number)=>{
    const p=windProjects.find(x=>x.id===projectId); if(!p) return;
    const amount=p.unitValue*units;
    setState(s=>({...s,
      holdings:[...s.holdings,{id:crypto.randomUUID(),projectId,units,amount,startedAt:new Date().toISOString(),status:"active"}],
      futureBalance:s.futureBalance+p.projectedScenario*units
    }));
    showToast("Participação demonstrativa adicionada. Nenhuma cobrança foi realizada.");
  };
  const value=useMemo(()=>({...state,projects:windProjects,profile,buyDemo,showToast}),[state]);
  return <AppContext.Provider value={value}>{children}{state.toast&&<div className="toast">{state.toast}</div>}</AppContext.Provider>
}

export function useApp(){ const ctx=useContext(AppContext); if(!ctx) throw new Error("useApp outside provider"); return ctx; }
