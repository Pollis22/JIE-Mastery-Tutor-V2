// Single source of truth for Stripe plan configuration
// This file is shared between frontend and backend

export type PlanId = 'starter' | 'standard' | 'pro' | 'elite';

export interface PlanConfig {
  id: PlanId;
  name: string;
  monthlyPrice: number;
  voiceMinutes: number;
  displayName: string;
}

export const PLANS: Record<PlanId, PlanConfig> = {
  starter: {
    id: 'starter',
    name: 'Starter Family',
    monthlyPrice: 19.99,
    voiceMinutes: 60,
    displayName: 'Starter Family Plan',
  },
  standard: {
    id: 'standard',
    name: 'Standard Family',
    monthlyPrice: 59.99,
    voiceMinutes: 240,
    displayName: 'Standard Family Plan',
  },
  pro: {
    id: 'pro',
    name: 'Pro Family',
    monthlyPrice: 99.99,
    voiceMinutes: 600,
    displayName: 'Pro Family Plan',
  },
  elite: {
    id: 'elite',
    name: 'Elite Family',
    monthlyPrice: 199.99,
    voiceMinutes: 1800,
    displayName: 'Elite Family Plan',
  },
};

export const VALID_PLAN_IDS: PlanId[] = ['starter', 'standard', 'pro', 'elite'];

export function isValidPlanId(plan: string): plan is PlanId {
  return VALID_PLAN_IDS.includes(plan as PlanId);
}
