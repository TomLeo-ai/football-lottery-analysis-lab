import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAnalysisReportStore } from '@/stores/analysisReport';

import SavedPlans from './SavedPlans.vue';

describe('SavedPlans', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  it('generates and saves a simulated plan from the current analysis report', async () => {
    const analysisStore = useAnalysisReportStore();
    analysisStore.setReport({
      reportId: 'analysis-demo-001',
      snapshotId: 'snapshot-demo-001',
      inputSourceType: 'USER_SCREENSHOT_CONFIRMED',
      engineType: 'MOCK_RULE_ENGINE',
      reportStatus: 'GENERATED',
      strategyParameters: {
        budgetAmount: 30,
        currency: 'CNY',
        targetTicketCount: 4,
        minTicketCount: 3,
        maxTicketCount: 5,
        riskPreference: 'AGGRESSIVE',
        mainTicketRatio: 0.5,
        defensiveTicketRatio: 0.3,
        entertainmentTicketRatio: 0.2,
        enableEntertainmentTicket: true,
        entertainmentTicketMaxCost: 2,
        maxParlayLegs: 3,
        preferredPlayTypes: ['WIN_DRAW_LOSS'],
        excludedPlayTypes: ['EXACT_SCORE'],
        exactScorePolicy: 'DISABLED',
        minPayoutRequirement: null,
        allowLowReturnTicket: true,
        upsetCoverageLevel: 'STRONG'
      },
      probabilityAnalysis: [],
      riskWarnings: [
        {
          riskCode: 'INFO_RISK',
          riskLevel: 'MEDIUM',
          message: '仅基于用户确认快照，缺少公开赛果交叉验证。'
        }
      ],
      simulatedSelections: [
        {
          matchId: 'demo-match-001',
          playType: 'WIN_DRAW_LOSS',
          selection: 'HOME_WIN',
          odds: 2.05,
          stakeAmount: 10,
          note: '模拟选择，用于生成待保存方案。'
        }
      ],
      complianceNotice: '非官方，仅模拟分析/复盘，不构成确定性建议。',
      generatedAt: '2026-06-25T18:00:00+08:00'
    });

    const generatedPlan = {
      planId: 'sim-plan-000001',
      planType: 'SIMULATED_ONLY',
      planStatus: 'GENERATED',
      reportId: 'analysis-demo-001',
      budgetAmount: 30,
      currency: 'CNY',
      strategyParameters: {
        budgetAmount: 30,
        currency: 'CNY',
        targetTicketCount: 4,
        minTicketCount: 3,
        maxTicketCount: 5,
        riskPreference: 'AGGRESSIVE',
        mainTicketRatio: 0.5,
        defensiveTicketRatio: 0.3,
        entertainmentTicketRatio: 0.2,
        enableEntertainmentTicket: true,
        entertainmentTicketMaxCost: 2,
        maxParlayLegs: 3,
        preferredPlayTypes: ['WIN_DRAW_LOSS'],
        excludedPlayTypes: ['EXACT_SCORE'],
        exactScorePolicy: 'DISABLED',
        minPayoutRequirement: null,
        allowLowReturnTicket: true,
        upsetCoverageLevel: 'STRONG'
      },
      statusFlow: ['GENERATED'],
      items: [
        {
          planItemId: 'sim-item-000001',
          matchId: 'demo-match-001',
          playType: 'WIN_DRAW_LOSS',
          selection: 'HOME_WIN',
          odds: 2.05,
          stakeAmount: 10,
          itemStatus: 'GENERATED'
        }
      ],
      snapshot: {
        snapshotId: 'snapshot-demo-001',
        reportId: 'analysis-demo-001',
        inputSourceType: 'USER_SCREENSHOT_CONFIRMED',
        engineType: 'MOCK_RULE_ENGINE',
        sourceReportStatus: 'GENERATED',
        strategyParameters: {
          budgetAmount: 30,
          currency: 'CNY',
          targetTicketCount: 4,
          minTicketCount: 3,
          maxTicketCount: 5,
          riskPreference: 'AGGRESSIVE',
          mainTicketRatio: 0.5,
          defensiveTicketRatio: 0.3,
          entertainmentTicketRatio: 0.2,
          enableEntertainmentTicket: true,
          entertainmentTicketMaxCost: 2,
          maxParlayLegs: 3,
          preferredPlayTypes: ['WIN_DRAW_LOSS'],
          excludedPlayTypes: ['EXACT_SCORE'],
          exactScorePolicy: 'DISABLED',
          minPayoutRequirement: null,
          allowLowReturnTicket: true,
          upsetCoverageLevel: 'STRONG'
        },
        selectionCount: 1,
        snapshotStatus: 'GENERATED'
      },
      complianceNotice: '非官方，仅模拟保存与复盘流程验证。',
      createdAt: '2026-06-25T18:05:00+08:00',
      updatedAt: '2026-06-25T18:05:00+08:00'
    };

    const savedPlan = {
      ...generatedPlan,
      planStatus: 'PENDING_RESULT',
      statusFlow: ['GENERATED', 'SAVED', 'PENDING_RESULT'],
      updatedAt: '2026-06-25T18:06:00+08:00'
    };

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/simulated-plans' && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ code: 200, msg: 'success', data: [] })
        });
      }

      if (url === '/api/strategies/simulate' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ code: 200, msg: 'success', data: generatedPlan })
        });
      }

      if (url === '/api/simulated-plans' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ code: 200, msg: 'success', data: savedPlan })
        });
      }

      return Promise.reject(new Error(`Unexpected request: ${method} ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mount(SavedPlans, {
      global: {
        plugins: [pinia],
        stubs: {
          RouterLink: {
            template: '<a><slot /></a>'
          }
        }
      }
    });

    await flushPromises();
    await wrapper.get('button[data-testid="generate-save-plan-button"]').trigger('click');
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith('/api/strategies/simulate', expect.any(Object));
    const simulateRequest = fetchMock.mock.calls.find(
      ([input, init]) => String(input) === '/api/strategies/simulate' && init?.method === 'POST'
    );
    expect(JSON.parse(String(simulateRequest?.[1]?.body))).toMatchObject({
      budgetAmount: 30,
      currency: 'CNY',
      strategyParameters: {
        budgetAmount: 30,
        targetTicketCount: 4,
        riskPreference: 'AGGRESSIVE',
        excludedPlayTypes: ['EXACT_SCORE']
      }
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/simulated-plans', expect.objectContaining({ method: 'POST' }));
    expect(wrapper.text()).toContain('PENDING_RESULT');
    expect(wrapper.text()).toContain('GENERATED -> SAVED -> PENDING_RESULT');
    expect(wrapper.text()).toContain('模拟方案');
    expect(wrapper.text()).not.toContain('\u5fc5\u4e2d');
    expect(wrapper.text()).not.toContain('\u7a33\u8d5a');
  });
});
