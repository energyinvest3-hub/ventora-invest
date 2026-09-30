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
  totalReceived: number;
  startedAt: string;
  status: "active" | "finished" | "cancelled";
};

export type WalletSummary = {
  balance: number;
  totalDeposited: number;
  totalWithdrawn: number;
  totalEarned: number;
};

export type WalletTransaction = {
  id: string;
  type: "deposit" | "purchase" | "credit" | "withdrawal" | "refund" | "bonus";
  amount: number;
  description: string;
  status: "pending" | "completed" | "failed" | "cancelled";
  createdAt: string;
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
