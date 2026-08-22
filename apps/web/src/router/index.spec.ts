import { describe, expect, it } from 'vitest';

import LegacyWorkflowEntry from '@/views/LegacyWorkflowEntry.vue';

import router from './index';

describe('router', () => {
  it('exposes static public pages and workflow-scoped product pages', () => {
    const routeNames = router.getRoutes().map((route) => route.name);

    expect(routeNames).toEqual(
      expect.arrayContaining([
        'MarketingHome',
        'Dashboard',
        'OfficialSourceHub',
        'ScreenshotUpload',
        'OcrReviewWizard',
        'WorkflowOcr',
        'WorkflowOcrReview',
        'MatchWorkspace',
        'WorkflowMatchWorkspace',
        'StrategySimulator',
        'WorkflowAnalysis',
        'SavedPlans',
        'WorkflowPlans',
        'WorkflowPlanDetail',
        'ReviewCenter',
        'StrategyLab',
        'ModelSettings',
        'AboutCompliance',
      ]),
    );
    expect(router.getRoutes().find((route) => route.name === 'MarketingHome')?.path).toBe('/');
    expect(router.getRoutes().find((route) => route.name === 'Dashboard')?.path).toBe('/dashboard');
    expect(router.getRoutes().find((route) => route.name === 'WorkflowOcrReview')?.path)
      .toBe('/workflows/:workflowId/ocr-review');
    expect(router.getRoutes().find((route) => route.name === 'WorkflowAnalysis')?.path)
      .toBe('/workflows/:workflowId/analysis');
    expect(router.getRoutes().find((route) => route.path === '/')?.redirect).toBeUndefined();
  });

  it('routes old workflow pages through the legacy session entry instead of direct stores', () => {
    const legacyReview = router.getRoutes().find((route) => route.name === 'OcrReviewWizard');
    const legacyMatch = router.getRoutes().find((route) => route.name === 'MatchWorkspace');

    expect(legacyReview?.components?.default).toBe(LegacyWorkflowEntry);
    expect(legacyMatch?.components?.default).toBe(LegacyWorkflowEntry);
    expect(legacyReview?.props.default).toEqual({
      targetName: 'WorkflowOcrReview',
      title: '人工确认',
    });
  });

  it('keeps stage gates on workflow child routes', () => {
    expect(router.getRoutes().find((route) => route.name === 'WorkflowOcrReview')?.meta.allowedStages)
      .toEqual(['WAITING_USER_CONFIRMATION', 'CONFIRMED']);
    expect(router.getRoutes().find((route) => route.name === 'WorkflowMatchWorkspace')?.meta.allowedStages)
      .toEqual(['CONFIRMED']);
  });
});
