import { describe, expect, it } from 'vitest';

import router from './index';

describe('router', () => {
  it('exposes all first-release workflow pages', () => {
    const routeNames = router.getRoutes().map((route) => route.name);

    expect(routeNames).toEqual(
      expect.arrayContaining([
        'MarketingHome',
        'Dashboard',
        'OfficialSourceHub',
        'ScreenshotUpload',
        'OcrReviewWizard',
        'MatchWorkspace',
        'StrategySimulator',
        'SavedPlans',
        'ReviewCenter',
        'StrategyLab',
        'ModelSettings',
        'AboutCompliance'
      ])
    );
    expect(router.getRoutes().find((route) => route.name === 'MarketingHome')?.path).toBe('/');
    expect(router.getRoutes().find((route) => route.name === 'Dashboard')?.path).toBe('/dashboard');
    expect(router.getRoutes().find((route) => route.name === 'ModelSettings')?.path).toBe('/model-settings');
    expect(router.getRoutes().find((route) => route.path === '/')?.redirect).toBeUndefined();
  });
});
