export type WindProject = {
  id: string;
  name: string;
  city: string;
  region: string;
  image: string;
  unitValue: number;
  termDays: number;
  projectedScenario: number;
  availableUnits: number;
  capacityMw: number;
  status: "available" | "closing" | "paused";
  featured?: boolean;
};

export type Holding = {
  id: string;
  projectId: string;
  units: number;
  amount: number;
  startedAt: string;
  status: "active" | "finished";
};
