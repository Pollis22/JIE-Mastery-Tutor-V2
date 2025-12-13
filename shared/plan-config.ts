/**
 * Single source of truth for all plan pricing and details
 * Used across pricing page, profile, settings, and all billing pages
 */

export interface PlanDetails {
  id: string;
  name: string;
  minutes: number;
  price: number;
  color: string;
}

export const PLAN_CONFIG: Record<string, PlanDetails> = {
  'starter': {
    id: 'starter',
    name: 'Starter Plan',
    minutes: 60,
    price: 19.99,
    color: 'bg-gray-500'
  },
  'single': {
    id: 'single',
    name: 'Starter Plan',
    minutes: 60,
    price: 19.99,
    color: 'bg-gray-500'
  },
  'standard': {
    id: 'standard',
    name: 'Standard Plan',
    minutes: 240,
    price: 59.99,
    color: 'bg-blue-500'
  },
  'pro': {
    id: 'pro',
    name: 'Pro Plan',
    minutes: 600,
    price: 99.99,
    color: 'bg-purple-500'
  },
  'all': {
    id: 'all',
    name: 'Pro Plan',
    minutes: 600,
    price: 99.99,
    color: 'bg-purple-500'
  },
  'elite': {
    id: 'elite',
    name: 'Elite Plan',
    minutes: 1800,
    price: 199.99,
    color: 'bg-amber-500'
  }
};

export function getPlanDetails(plan: string | null | undefined): PlanDetails {
  const normalizedPlan = (plan || '').toLowerCase();
  return PLAN_CONFIG[normalizedPlan] || PLAN_CONFIG['starter'];
}

export function getPlanName(plan: string | null | undefined): string {
  return getPlanDetails(plan).name;
}

export function getPlanPrice(plan: string | null | undefined): number {
  return getPlanDetails(plan).price;
}

export function getPlanMinutes(plan: string | null | undefined): number {
  return getPlanDetails(plan).minutes;
}

export function getPlanColor(plan: string | null | undefined): string {
  return getPlanDetails(plan).color;
}
