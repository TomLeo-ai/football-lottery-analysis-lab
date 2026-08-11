import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useOcrWorkflowStore } from '@/stores/ocrWorkflow';

import StrategySimulator from './StrategySimulator.vue';

describe('StrategySimulator', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  it('generates a mock analysis report only from a confirmed snapshot', async () => {
    const ocrStore = useOcrWorkflowStore();
    ocrStore.setConfirmedSnapshot({
      snapshotId: 'snapshot-demo-001',
      ocrTaskId: 'ocr-demo-001',
      sourceType: 'USER_SCREENSHOT_CONFIRMED',
      snapshotStatus: 'CONFIRMED',
      analysisAllowed: true,
      riskPreference: 'BALANCED',
      budgetAmount: 20,
      currency: 'CNY',
      matches: [
        {
          matchId: 'demo-match-001',
          matchDate: '2026-07-01',
          league: 'Fictional Coastal League',
          homeTeam: 'Northport United',
          awayTeam: 'Lakeside City',
          kickoffTime: '2026-07-01T19:30:00+08:00'
        }
      ],
      markets: [
        {
          marketId: 'demo-market-001',
          matchId: 'demo-match-001',
          playType: 'WIN_DRAW_LOSS',
          selection: 'HOME_WIN',
          odds: 2.05
        }
      ]
    });

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/strategy-parameter-defaults' && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 200,
              msg: 'success',
              data: {
                budgetAmount: 20,
                currency: 'CNY',
                targetTicketCount: 5,
                minTicketCount: 5,
                maxTicketCount: 6,
                riskPreference: 'BALANCED',
                mainTicketRatio: 0.6,
                defensiveTicketRatio: 0.3,
                entertainmentTicketRatio: 0.1,
                enableEntertainmentTicket: true,
                entertainmentTicketMaxCost: 2,
                maxParlayLegs: 4,
                preferredPlayTypes: ['WIN_DRAW_LOSS', 'HANDICAP_WIN_DRAW_LOSS'],
                excludedPlayTypes: [],
                exactScorePolicy: 'ENTERTAINMENT_ONLY',
                minPayoutRequirement: null,
                allowLowReturnTicket: false,
                upsetCoverageLevel: 'BALANCED'
              }
            })
        });
      }

      if (url === '/api/engine-settings' && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 200,
              msg: 'success',
              data: {
                defaultEngineMode: 'MOCK_RULE_ENGINE',
                analysisEngineMode: 'MOCK_RULE_ENGINE',
                reviewInsightMode: 'RULE_REVIEW_ONLY'
              }
            })
        });
      }

      if (url === '/api/model-providers' && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 200,
              msg: 'success',
              data: [
                {
                  providerKey: 'openai',
                  displayName: 'OpenAI',
                  baseUrl: 'https://api.openai.com/v1',
                  defaultModel: 'gpt-4o-mini',
                  apiKeyEnvName: 'OPENAI_API_KEY',
                  enabled: true,
                  credentialStatus: 'CONFIGURED',
                  connectionStatus: 'UNTESTED'
                }
              ]
            })
        });
      }

      if (url === '/api/analysis/generate' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 200,
              msg: 'success',
              data: {
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
                  enableEntertainmentTicket: false,
                  entertainmentTicketMaxCost: 2,
                  maxParlayLegs: 3,
                  preferredPlayTypes: ['WIN_DRAW_LOSS'],
                  excludedPlayTypes: ['EXACT_SCORE'],
                  exactScorePolicy: 'DISABLED',
                  minPayoutRequirement: null,
                  allowLowReturnTicket: true,
                  upsetCoverageLevel: 'STRONG'
                },
                probabilityAnalysis: [
                  {
                    matchId: 'demo-match-001',
                    homeTeam: 'Northport United',
                    awayTeam: 'Lakeside City',
                    selection: 'HOME_WIN',
                    probabilityBand: 'MEDIUM',
                    rationale: '主队方向略占优，但仍需保留不确定性。'
                  }
                ],
                riskWarnings: [
                  {
                    riskCode: 'INFO_RISK',
                    riskLevel: 'MEDIUM_HIGH',
                    message: '仅基于用户确认快照，缺少真实临场信息。'
                  }
                ],
                simulatedSelections: [
                  {
                    matchId: 'demo-match-001',
                    playType: 'WIN_DRAW_LOSS',
                    selection: 'HOME_WIN',
                    odds: 2.05,
                    stakeAmount: 30,
                    note: '模拟选择，用于后续方案阶段。'
                  }
                ],
                complianceNotice: '非官方，仅模拟分析/复盘，不构成确定性建议。',
                generatedAt: '2026-06-25T18:00:00+08:00'
              }
            })
        });
      }

      return Promise.reject(new Error(`Unexpected request: ${method} ${url}`));
    });

    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mount(StrategySimulator, {
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

    expect(wrapper.text()).toContain('本轮参数');

    await wrapper.get('[data-testid="strategy-budget-input"]').setValue('30');
    await wrapper.get('[data-testid="strategy-target-count-input"]').setValue('4');
    await wrapper.get('[data-testid="strategy-min-count-input"]').setValue('3');
    await wrapper.get('[data-testid="strategy-max-count-input"]').setValue('5');
    await wrapper.get('[data-testid="strategy-risk-select"]').setValue('AGGRESSIVE');
    await wrapper.get('[data-testid="strategy-main-ratio-input"]').setValue('0.5');
    await wrapper.get('[data-testid="strategy-defensive-ratio-input"]').setValue('0.3');
    await wrapper.get('[data-testid="strategy-entertainment-ratio-input"]').setValue('0.2');
    await wrapper.get('[data-testid="strategy-entertainment-toggle"]').setValue(false);
    await wrapper.get('[data-testid="strategy-entertainment-cost-input"]').setValue('2');
    await wrapper.get('[data-testid="strategy-max-parlay-input"]').setValue('3');
    await wrapper.get('[data-testid="strategy-preferred-play-types-input"]').setValue('WIN_DRAW_LOSS');
    await wrapper.get('[data-testid="strategy-excluded-play-types-input"]').setValue('EXACT_SCORE');
    await wrapper.get('[data-testid="strategy-exact-score-policy-select"]').setValue('DISABLED');
    await wrapper.get('[data-testid="strategy-low-return-toggle"]').setValue(true);
    await wrapper.get('[data-testid="strategy-upset-coverage-select"]').setValue('STRONG');

    await wrapper.get('button[data-testid="generate-analysis-button"]').trigger('click');
    await flushPromises();

    const analysisRequest = fetchMock.mock.calls.find(
      ([input, init]) => String(input) === '/api/analysis/generate' && init?.method === 'POST'
    );
    expect(analysisRequest).toBeTruthy();
    const payload = JSON.parse(String(analysisRequest?.[1]?.body));

    expect(payload.engineMode).toBe('MOCK_RULE_ENGINE');
    expect(payload.strategyParameters).toMatchObject({
      budgetAmount: 30,
      targetTicketCount: 4,
      minTicketCount: 3,
      maxTicketCount: 5,
      riskPreference: 'AGGRESSIVE',
      maxParlayLegs: 3,
      excludedPlayTypes: ['EXACT_SCORE'],
      exactScorePolicy: 'DISABLED',
      upsetCoverageLevel: 'STRONG'
    });

    expect(wrapper.text()).toContain('实际使用参数');
    expect(wrapper.text()).toContain('AGGRESSIVE');
    expect(wrapper.text()).toContain('EXACT_SCORE');
    expect(wrapper.text()).toContain('MOCK_RULE_ENGINE');
    expect(wrapper.text()).toContain('USER_SCREENSHOT_CONFIRMED');
    expect(wrapper.text()).toContain('风险提示');
    expect(wrapper.text()).toContain('非官方');
    expect(wrapper.text()).not.toContain('\u5fc5\u4e2d');
    expect(wrapper.text()).not.toContain('\u7a33\u8d5a');
  });

  it('submits provider, model, and prompt metadata when the large-model engine is selected', async () => {
    const ocrStore = useOcrWorkflowStore();
    ocrStore.setConfirmedSnapshot({
      snapshotId: 'snapshot-llm-001',
      ocrTaskId: 'ocr-llm-001',
      sourceType: 'USER_SCREENSHOT_CONFIRMED',
      snapshotStatus: 'CONFIRMED',
      analysisAllowed: true,
      riskPreference: 'BALANCED',
      budgetAmount: 20,
      currency: 'CNY',
      matches: [
        {
          matchId: 'demo-match-001',
          matchDate: '2026-07-01',
          league: 'Fictional Coastal League',
          homeTeam: 'Northport United',
          awayTeam: 'Lakeside City',
          kickoffTime: '2026-07-01T19:30:00+08:00'
        }
      ],
      markets: [
        {
          marketId: 'demo-market-001',
          matchId: 'demo-match-001',
          playType: 'WIN_DRAW_LOSS',
          selection: 'HOME_WIN',
          odds: 2.05
        }
      ]
    });

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/strategy-parameter-defaults' && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 200,
              msg: 'success',
              data: {
                budgetAmount: 20,
                currency: 'CNY',
                targetTicketCount: 5,
                minTicketCount: 5,
                maxTicketCount: 6,
                riskPreference: 'BALANCED',
                mainTicketRatio: 0.6,
                defensiveTicketRatio: 0.3,
                entertainmentTicketRatio: 0.1,
                enableEntertainmentTicket: true,
                entertainmentTicketMaxCost: 2,
                maxParlayLegs: 4,
                preferredPlayTypes: ['WIN_DRAW_LOSS'],
                excludedPlayTypes: ['EXACT_SCORE'],
                exactScorePolicy: 'DISABLED',
                minPayoutRequirement: null,
                allowLowReturnTicket: false,
                upsetCoverageLevel: 'BALANCED'
              }
            })
        });
      }

      if (url === '/api/engine-settings' && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 200,
              msg: 'success',
              data: {
                defaultEngineMode: 'MOCK_RULE_ENGINE',
                analysisEngineMode: 'MOCK_RULE_ENGINE',
                reviewInsightMode: 'RULE_REVIEW_ONLY'
              }
            })
        });
      }

      if (url === '/api/model-providers' && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 200,
              msg: 'success',
              data: [
                {
                  providerKey: 'openai',
                  displayName: 'OpenAI',
                  baseUrl: 'https://api.openai.com/v1',
                  defaultModel: 'gpt-4o-mini',
                  apiKeyEnvName: 'OPENAI_API_KEY',
                  enabled: true,
                  credentialStatus: 'CONFIGURED',
                  connectionStatus: 'UNTESTED'
                },
                {
                  providerKey: 'deepseek',
                  displayName: 'DeepSeek',
                  baseUrl: 'https://api.deepseek.com',
                  defaultModel: 'deepseek-v4-pro',
                  apiKeyEnvName: 'DEEPSEEK_API_KEY',
                  enabled: true,
                  credentialStatus: 'MISSING',
                  connectionStatus: 'UNTESTED'
                }
              ]
            })
        });
      }

      if (url === '/api/analysis/generate' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 200,
              msg: 'success',
              data: {
                reportId: 'analysis-llm-001',
                snapshotId: 'snapshot-llm-001',
                inputSourceType: 'USER_SCREENSHOT_CONFIRMED',
                engineType: 'OPENAI_COMPATIBLE',
                reportStatus: 'GENERATED',
                providerKey: 'openai',
                modelId: 'gpt-custom',
                promptVersion: 'danche-prediction-v1',
                safetyStatus: 'PASSED',
                llmAuditId: null,
                llmOutput: {
                  ticketGroups: [
                    {
                      ticketType: 'MAIN'
                    }
                  ],
                  finalDecision: {
                    summary: 'structured output accepted'
                  }
                },
                strategyParameters: {
                  budgetAmount: 20,
                  currency: 'CNY',
                  targetTicketCount: 5,
                  minTicketCount: 5,
                  maxTicketCount: 6,
                  riskPreference: 'BALANCED',
                  mainTicketRatio: 0.6,
                  defensiveTicketRatio: 0.3,
                  entertainmentTicketRatio: 0.1,
                  enableEntertainmentTicket: true,
                  entertainmentTicketMaxCost: 2,
                  maxParlayLegs: 4,
                  preferredPlayTypes: ['WIN_DRAW_LOSS'],
                  excludedPlayTypes: ['EXACT_SCORE'],
                  exactScorePolicy: 'DISABLED',
                  minPayoutRequirement: null,
                  allowLowReturnTicket: false,
                  upsetCoverageLevel: 'BALANCED'
                },
                probabilityAnalysis: [],
                riskWarnings: [],
                simulatedSelections: [],
                complianceNotice: '非官方模拟分析结果，仅用于技术研究和流程验证，不构成购彩建议。',
                generatedAt: '2026-06-27T22:00:00+08:00'
              }
            })
        });
      }

      return Promise.reject(new Error(`Unexpected request: ${method} ${url}`));
    });

    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mount(StrategySimulator, {
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

    await wrapper.get('[data-testid="analysis-engine-select"]').setValue('OPENAI_COMPATIBLE');
    await wrapper.get('[data-testid="analysis-provider-select"]').setValue('openai');
    await wrapper.get('[data-testid="analysis-model-input"]').setValue('gpt-custom');
    await wrapper.get('[data-testid="analysis-prompt-version-input"]').setValue('danche-prediction-v1');

    expect(wrapper.text()).toContain('OpenAI');
    expect(wrapper.text()).toContain('CONFIGURED');
    expect(wrapper.text()).toContain('OPENAI_API_KEY');
    expect(wrapper.text()).toContain('API Key 前端不可见');

    await wrapper.get('button[data-testid="generate-analysis-button"]').trigger('click');
    await flushPromises();

    const analysisRequest = fetchMock.mock.calls.find(
      ([input, init]) => String(input) === '/api/analysis/generate' && init?.method === 'POST'
    );
    expect(analysisRequest).toBeTruthy();
    const payload = JSON.parse(String(analysisRequest?.[1]?.body));

    expect(payload).toMatchObject({
      engineMode: 'OPENAI_COMPATIBLE',
      providerKey: 'openai',
      modelId: 'gpt-custom',
      promptVersion: 'danche-prediction-v1'
    });

    expect(wrapper.text()).toContain('OPENAI_COMPATIBLE');
    expect(wrapper.text()).toContain('gpt-custom');
    expect(wrapper.text()).toContain('PASSED');
    expect(wrapper.text()).toContain('danche-prediction-v1');
    expect(wrapper.text()).toContain('ticketGroups: 1');
  });

  it('uses global analysis engine settings when the global option is selected', async () => {
    const ocrStore = useOcrWorkflowStore();
    ocrStore.setConfirmedSnapshot({
      snapshotId: 'snapshot-global-001',
      ocrTaskId: 'ocr-global-001',
      sourceType: 'USER_SCREENSHOT_CONFIRMED',
      snapshotStatus: 'CONFIRMED',
      analysisAllowed: true,
      riskPreference: 'BALANCED',
      budgetAmount: 20,
      currency: 'CNY',
      matches: [
        {
          matchId: 'demo-match-001',
          matchDate: '2026-07-01',
          league: 'Fictional Coastal League',
          homeTeam: 'Northport United',
          awayTeam: 'Lakeside City',
          kickoffTime: '2026-07-01T19:30:00+08:00'
        }
      ],
      markets: [
        {
          marketId: 'demo-market-001',
          matchId: 'demo-match-001',
          playType: 'WIN_DRAW_LOSS',
          selection: 'HOME_WIN',
          odds: 2.05
        }
      ]
    });

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/strategy-parameter-defaults' && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 200,
              msg: 'success',
              data: {
                budgetAmount: 20,
                currency: 'CNY',
                targetTicketCount: 2,
                minTicketCount: 1,
                maxTicketCount: 3,
                riskPreference: 'BALANCED',
                mainTicketRatio: 0.7,
                defensiveTicketRatio: 0.2,
                entertainmentTicketRatio: 0.1,
                enableEntertainmentTicket: true,
                entertainmentTicketMaxCost: 4,
                maxParlayLegs: 2,
                preferredPlayTypes: ['WIN_DRAW_LOSS'],
                excludedPlayTypes: [],
                exactScorePolicy: 'ENTERTAINMENT_ONLY',
                minPayoutRequirement: 1.5,
                allowLowReturnTicket: false,
                upsetCoverageLevel: 'BALANCED'
              }
            })
        });
      }

      if (url === '/api/engine-settings' && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 200,
              msg: 'success',
              data: {
                defaultEngineMode: 'MOCK_RULE_ENGINE',
                analysisEngineMode: 'OPENAI_COMPATIBLE',
                reviewInsightMode: 'RULE_REVIEW_ONLY'
              }
            })
        });
      }

      if (url === '/api/model-providers' && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 200,
              msg: 'success',
              data: [
                {
                  providerKey: 'deepseek',
                  displayName: 'DeepSeek',
                  baseUrl: 'https://api.deepseek.com',
                  defaultModel: 'deepseek-v4-pro',
                  apiKeyEnvName: 'DEEPSEEK_API_KEY',
                  enabled: true,
                  credentialStatus: 'CONFIGURED',
                  connectionStatus: 'UNTESTED'
                }
              ]
            })
        });
      }

      if (url === '/api/analysis/generate' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 200,
              msg: 'success',
              data: {
                reportId: 'analysis-global-001',
                snapshotId: 'snapshot-global-001',
                inputSourceType: 'USER_SCREENSHOT_CONFIRMED',
                engineType: 'OPENAI_COMPATIBLE',
                reportStatus: 'GENERATED',
                providerKey: 'deepseek',
                modelId: 'deepseek-v4-pro',
                promptVersion: 'danche-prediction-v1',
                safetyStatus: 'PASSED',
                llmAuditId: 'llm-audit-global',
                llmOutput: {
                  ticketGroups: [],
                  finalDecision: {
                    summary: 'global setting used large model'
                  }
                },
                strategyParameters: {
                  budgetAmount: 20,
                  currency: 'CNY',
                  targetTicketCount: 2,
                  minTicketCount: 1,
                  maxTicketCount: 3,
                  riskPreference: 'BALANCED',
                  mainTicketRatio: 0.7,
                  defensiveTicketRatio: 0.2,
                  entertainmentTicketRatio: 0.1,
                  enableEntertainmentTicket: true,
                  entertainmentTicketMaxCost: 4,
                  maxParlayLegs: 2,
                  preferredPlayTypes: ['WIN_DRAW_LOSS'],
                  excludedPlayTypes: [],
                  exactScorePolicy: 'ENTERTAINMENT_ONLY',
                  minPayoutRequirement: 1.5,
                  allowLowReturnTicket: false,
                  upsetCoverageLevel: 'BALANCED'
                },
                probabilityAnalysis: [],
                riskWarnings: [],
                simulatedSelections: [],
                complianceNotice: '非官方模拟分析结果，仅用于技术研究和流程验证，不构成购彩建议。',
                generatedAt: '2026-06-30T10:00:00+08:00'
              }
            })
        });
      }

      return Promise.reject(new Error(`Unexpected request: ${method} ${url}`));
    });

    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mount(StrategySimulator, {
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

    expect(wrapper.get('[data-testid="analysis-engine-select"]').element).toHaveProperty('value', 'USE_GLOBAL');

    await wrapper.get('button[data-testid="generate-analysis-button"]').trigger('click');
    await flushPromises();

    const analysisRequest = fetchMock.mock.calls.find(
      ([input, init]) => String(input) === '/api/analysis/generate' && init?.method === 'POST'
    );
    expect(analysisRequest).toBeTruthy();
    const payload = JSON.parse(String(analysisRequest?.[1]?.body));

    expect(payload).toMatchObject({
      engineMode: 'OPENAI_COMPATIBLE',
      providerKey: 'deepseek',
      modelId: 'deepseek-v4-pro',
      promptVersion: 'danche-prediction-v1'
    });
  });
});
