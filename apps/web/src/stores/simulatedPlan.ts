import { defineStore } from 'pinia';

import type { SimulatedPlan } from '@/types/simulatedPlan';

interface SimulatedPlanState {
  generatedPlan: SimulatedPlan | null;
  savedPlans: SimulatedPlan[];
  currentPlan: SimulatedPlan | null;
}

export const useSimulatedPlanStore = defineStore('simulatedPlan', {
  state: (): SimulatedPlanState => ({
    generatedPlan: null,
    savedPlans: [],
    currentPlan: null
  }),
  actions: {
    setGeneratedPlan(plan: SimulatedPlan) {
      this.generatedPlan = plan;
    },
    setSavedPlans(plans: SimulatedPlan[]) {
      this.savedPlans = plans;
      this.currentPlan = plans[0] ?? null;
    },
    upsertSavedPlan(plan: SimulatedPlan) {
      const existingIndex = this.savedPlans.findIndex((item) => item.planId === plan.planId);
      if (existingIndex >= 0) {
        this.savedPlans.splice(existingIndex, 1, plan);
      } else {
        this.savedPlans.unshift(plan);
      }
      this.currentPlan = plan;
    },
    setCurrentPlan(plan: SimulatedPlan) {
      this.currentPlan = plan;
    }
  }
});
