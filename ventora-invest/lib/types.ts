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
  status: "available" | "closing" | "paused" | "finished";
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

export type Profile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "USER" | "ADMIN";
  inviteCode: string;
};

export type ReferralMember = {
  id: string;
  name: string;
  joinedAt: string;
  qualified: boolean;
  rewardAmount: number;
};

export type ReferralSummary = {
  active: boolean;
  inviteCode: string;
  rewardAmount: number;
  minPurchaseAmount: number;
  invitedCount: number;
  qualifiedCount: number;
  totalBonus: number;
  referrals: ReferralMember[];
};
