import { describe, expect, it } from 'vitest';

import router from './index';

function allowedStages(routeName: string): string[] {
  const route = router.getRoutes().find((candidate) => candidate.name === routeName);
  return route?.meta.allowedStages as string[];
}

describe('workflow route stage allowlists', () => {
  it('keeps analysis available from confirmation through result pending', () => {
    expect(allowedStages('WorkflowAnalysis')).toEqual([
      'CONFIRMED',
      'ANALYSIS_GENERATED',
      'PLAN_GENERATED',
      'PENDING_RESULT',
    ]);
  });

  it('opens plan generation only once an authoritative report exists', () => {
    expect(allowedStages('WorkflowPlans')).toEqual([
      'ANALYSIS_GENERATED',
      'PLAN_GENERATED',
      'PENDING_RESULT',
    ]);
  });

  it('opens plan detail only once an authoritative plan exists', () => {
    expect(allowedStages('WorkflowPlanDetail')).toEqual([
      'PLAN_GENERATED',
      'PENDING_RESULT',
    ]);
  });

  it('keeps the match workspace readable for all authoritative downstream stages', () => {
    expect(allowedStages('WorkflowMatchWorkspace')).toEqual([
      'CONFIRMED',
      'ANALYSIS_GENERATED',
      'PLAN_GENERATED',
      'PENDING_RESULT',
    ]);
  });
});
