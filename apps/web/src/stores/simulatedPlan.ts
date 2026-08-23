import { defineStore } from 'pinia';

import type { SimulatedPlan } from '@/types/simulatedPlan';

interface SimulatedPlanState {
  savedPlans: SimulatedPlan[];
  plansById: Record<string, SimulatedPlan>;
}

export const useSimulatedPlanStore = defineStore('simulatedPlan', {
  state: (): SimulatedPlanState => ({
    savedPlans: [],
    plansById: {},
  }),
  actions: {
    cachePlan(plan: SimulatedPlan) {
      this.plansById[plan.planId] = plan;
    },
    getPlan(planId: string): SimulatedPlan | null {
      return this.plansById[planId] ?? null;
    },
    setSavedPlans(plans: SimulatedPlan[]) {
      this.savedPlans = plans;
      plans.forEach((plan) => this.cachePlan(plan));
    },
    upsertSavedPlan(plan: SimulatedPlan) {
      const existingIndex = this.savedPlans.findIndex((item) => item.planId === plan.planId);
      if (existingIndex >= 0) {
        this.savedPlans.splice(existingIndex, 1, plan);
      } else {
        this.savedPlans.unshift(plan);
      }
      this.cachePlan(plan);
    },
  },
});
