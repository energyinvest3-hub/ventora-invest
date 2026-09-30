import type { WindProject } from "./types";

export const windProjects: WindProject[] = [
  { id:"ventos-sertao", name:"Ventos do Sertão", city:"Mossoró", region:"RN", image:"/wind-vales.png", unitValue:50, termDays:15, projectedScenario:78, availableUnits:420, capacityMw:18, status:"available", featured:true },
  { id:"atlas-litoral", name:"Atlas Litoral", city:"Aracati", region:"CE", image:"/wind-litoral.png", unitValue:120, termDays:20, projectedScenario:174, availableUnits:260, capacityMw:32, status:"available", featured:true },
  { id:"serra-azul", name:"Serra Azul Wind", city:"Caetité", region:"BA", image:"/wind-serra.png", unitValue:250, termDays:20, projectedScenario:352, availableUnits:176, capacityMw:44, status:"available", featured:true },
  { id:"pampa-wind", name:"Pampa Wind", city:"Santana do Livramento", region:"RS", image:"/wind-campos.png", unitValue:490, termDays:25, projectedScenario:676, availableUnits:92, capacityMw:61, status:"closing" },
  { id:"nordeste-prime", name:"Nordeste Prime", city:"Parnaíba", region:"PI", image:"/wind-hero.png", unitValue:890, termDays:30, projectedScenario:1190, availableUnits:64, capacityMw:86, status:"available" },
  { id:"offshore-one", name:"Offshore One", city:"Costa Brasileira", region:"BR", image:"/wind-offshore.png", unitValue:1490, termDays:35, projectedScenario:1950, availableUnits:38, capacityMw:120, status:"closing" }
];

export const profile = { name:"Investidor Demo", email:"demo@ventora.energy" };
