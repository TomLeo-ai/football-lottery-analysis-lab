import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ReviewCenter from './ReviewCenter.vue';

describe('ReviewCenter', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  it('syncs mock public results and shows source metadata', async () => {
    const syncedStatus = {
      providerKey: 'mock-public-results',
      providerName: 'Mock Public Result Provider',
      providerType: 'MOCK',
      providerEnabled: true,
      syncStatus: 'SYNCED',
      snapshotCount: 1,
      lastFetchedAt: '2026-07-01T22:15:00+08:00',
      lastConfidence: 0.98,
      sourceName: 'Mock Public Result Provider',
      sourceUrl: 'https://example.com/mock-public-results',
      sourceLicense: 'Fictional sample for local tests only',
      dataPolicy: 'Mock provider uses fictional sample results only.',
      complianceNotice: '非官方 Mock 公开赛果源，仅用于模拟复盘流程验证。',
      snapshots: [
        {
          resultSnapshotId: 'result-snapshot-000001',
          matchId: 'demo-match-001',
          matchDate: '2026-07-01',
          league: 'Fictional Coastal League',
          homeTeam: 'Northport United',
          awayTeam: 'Lakeside City',
          kickoffTime: '2026-07-01T19:30:00+08:00',
          homeScore: 2,
          awayScore: 1,
          resultStatus: 'FINISHED',
          sourceName: 'Mock Public Result Provider',
          sourceUrl: 'https://example.com/mock-public-results',
          sourceLicense: 'Fictional sample for local tests only',
          fetchedAt: '2026-07-01T22:15:00+08:00',
          confidence: 0.98
        }
      ]
    };

    const initialStatus = {
      ...syncedStatus,
      syncStatus: 'IDLE',
      snapshotCount: 0,
      lastFetchedAt: null,
      lastConfidence: null,
      snapshots: []
    };

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/result-providers/status' && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ code: 200, msg: 'success', data: initialStatus })
        });
      }

      if (url === '/api/reviews/pending' && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ code: 200, msg: 'success', data: [] })
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

      if (url === '/api/result-providers/sync' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ code: 200, msg: 'success', data: syncedStatus })
        });
      }

      return Promise.reject(new Error(`Unexpected request: ${method} ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mount(ReviewCenter, {
      global: {
        plugins: [pinia]
      }
    });

    await flushPromises();
    await wrapper.get('button[data-testid="sync-result-provider-button"]').trigger('click');
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith('/api/result-providers/status');
    expect(fetchMock).toHaveBeenCalledWith('/api/result-providers/sync', expect.any(Object));
    expect(wrapper.text()).toContain('Mock Public Result Provider');
    expect(wrapper.text()).toContain('https://example.com/mock-public-results');
    expect(wrapper.text()).toContain('Fictional sample for local tests only');
    expect(wrapper.text()).toContain('0.98');
    expect(wrapper.text()).toContain('FINISHED');
    expect(wrapper.text()).not.toContain('\u4e2d\u56fd\u7ade\u5f69\u7f51');
    expect(wrapper.text()).not.toContain('\u4e2d\u56fd\u4f53\u80b2\u5f69\u7968');
  });

  it('matches and settles a pending simulated plan with review reasons', async () => {
    const pendingPlans = [
      {
        planId: 'sim-plan-000001',
        planStatus: 'PENDING_RESULT',
        reportId: 'analysis-review-001',
        itemCount: 1,
        updatedAt: '2026-06-26T10:00:00+08:00'
      }
    ];
    const matchResult = {
      planId: 'sim-plan-000001',
      matchStatus: 'MATCHED',
      matchConfidence: 0.98,
      candidates: [
        {
          candidateId: 'candidate-000001',
          planItemId: 'sim-item-000001',
          resultSnapshotId: 'result-snapshot-000001',
          matchId: 'demo-match-001',
          matchStatus: 'MATCHED',
          confidence: 0.98,
          sourceName: 'Mock Public Result Provider',
          sourceUrl: 'https://example.com/mock-public-results',
          sourceLicense: 'Fictional sample for local tests only',
          fetchedAt: '2026-07-01T22:15:00+08:00'
        }
      ]
    };
    const reviewRecord = {
      planId: 'sim-plan-000001',
      reviewStatus: 'MISS',
      matchStatus: 'MATCHED',
      matchConfidence: 0.98,
      failureReasons: ['DIRECTION_ERROR'],
      supportedFailureReasons: ['DIRECTION_ERROR', 'MATCH_POSTPONED_OR_CANCELLED'],
      supportedSettlementStatuses: ['HIT', 'MISS', 'PARTIAL_HIT', 'VOID', 'PENDING', 'NEEDS_REVIEW'],
      resultSource: {
        sourceName: 'Mock Public Result Provider',
        sourceUrl: 'https://example.com/mock-public-results',
        sourceLicense: 'Fictional sample for local tests only',
        fetchedAt: '2026-07-01T22:15:00+08:00',
        confidence: 0.98
      },
      itemSettlements: [
        {
          planItemId: 'sim-item-000001',
          matchId: 'demo-match-001',
          selection: 'AWAY_WIN',
          actualOutcome: 'HOME_WIN',
          settlementStatus: 'MISS',
          failureReason: 'DIRECTION_ERROR'
        }
      ],
      strategyRevisionRules: [
        {
          ruleCode: 'REVIEW_DIRECTION_WEIGHT',
          reasonCode: 'DIRECTION_ERROR',
          suggestion: '复盘方向判断权重，下一版策略降低单一方向依赖。'
        }
      ],
      reviewedAt: '2026-07-01T22:20:00+08:00'
    };

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/result-providers/status' && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 200,
              msg: 'success',
              data: {
                providerKey: 'mock-public-results',
                providerName: 'Mock Public Result Provider',
                providerType: 'MOCK',
                providerEnabled: true,
                syncStatus: 'SYNCED',
                snapshotCount: 1,
                lastFetchedAt: '2026-07-01T22:15:00+08:00',
                lastConfidence: 0.98,
                sourceName: 'Mock Public Result Provider',
                sourceUrl: 'https://example.com/mock-public-results',
                sourceLicense: 'Fictional sample for local tests only',
                dataPolicy: 'Mock provider uses fictional sample results only.',
                complianceNotice: '非官方 Mock 公开赛果源，仅用于模拟复盘流程验证。',
                snapshots: []
              }
            })
        });
      }

      if (url === '/api/reviews/pending' && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ code: 200, msg: 'success', data: pendingPlans })
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

      if (url === '/api/simulated-plans/sim-plan-000001/match-result' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ code: 200, msg: 'success', data: matchResult })
        });
      }

      if (url === '/api/simulated-plans/sim-plan-000001/settle' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ code: 200, msg: 'success', data: reviewRecord })
        });
      }

      return Promise.reject(new Error(`Unexpected request: ${method} ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mount(ReviewCenter, {
      global: {
        plugins: [pinia]
      }
    });

    await flushPromises();
    await wrapper.get('button[data-testid="match-settle-button"]').trigger('click');
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith('/api/reviews/pending');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/simulated-plans/sim-plan-000001/match-result',
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/simulated-plans/sim-plan-000001/settle', expect.any(Object));
    expect(wrapper.text()).toContain('MISS');
    expect(wrapper.text()).toContain('DIRECTION_ERROR');
    expect(wrapper.text()).toContain('REVIEW_DIRECTION_WEIGHT');
    expect(wrapper.text()).toContain('Mock Public Result Provider');
    expect(wrapper.text()).toContain('0.98');
  });

  it('submits review insight metadata and renders llm insight without changing rule settlement', async () => {
    const pendingPlans = [
      {
        planId: 'sim-plan-llm-001',
        planStatus: 'PENDING_RESULT',
        reportId: 'analysis-review-llm-001',
        itemCount: 1,
        updatedAt: '2026-06-27T10:00:00+08:00'
      }
    ];
    const matchResult = {
      planId: 'sim-plan-llm-001',
      matchStatus: 'MATCHED',
      matchConfidence: 0.98,
      candidates: [
        {
          candidateId: 'candidate-llm-001',
          planItemId: 'sim-item-llm-001',
          resultSnapshotId: 'result-snapshot-000001',
          matchId: 'demo-match-001',
          matchStatus: 'MATCHED',
          confidence: 0.98,
          sourceName: 'Mock Public Result Provider',
          sourceUrl: 'https://example.com/mock-public-results',
          sourceLicense: 'Fictional sample for local tests only',
          fetchedAt: '2026-07-01T22:15:00+08:00'
        }
      ]
    };
    const reviewRecord = {
      planId: 'sim-plan-llm-001',
      reviewStatus: 'MISS',
      matchStatus: 'MATCHED',
      matchConfidence: 0.98,
      reviewEngineType: 'RULE_REVIEW_WITH_LLM_INSIGHT',
      providerKey: 'openai',
      modelId: 'gpt-review-custom',
      promptVersion: 'danche-review-insight-v1',
      safetyStatus: 'PASSED',
      llmAuditId: null,
      llmInsight: {
        settlementAuthorityNotice: '规则引擎已完成结算并锁定状态，大模型只做解释。',
        ticketReviewNarratives: [
          {
            planItemId: 'sim-item-llm-001',
            narrative: '方向与实际赛果不一致，规则结算保持 MISS。'
          }
        ],
        failureClassifications: [
          {
            reasonCode: 'DIRECTION_ERROR',
            category: '方向错',
            explanation: '保存方案方向和赛果方向不一致。'
          }
        ],
        strategyRevisionSuggestions: [
          {
            ruleCode: 'REVIEW_DIRECTION_WEIGHT',
            suggestion: '降低单一方向依赖，保留防守项。'
          }
        ],
        nextRoundParameterSuggestions: {
          riskPreference: 'BALANCED',
          note: '只作为手动参考，不自动覆盖默认参数。'
        },
        doNotOverreactEvents: ['不要因单场方向错误直接放弃整套规则。'],
        complianceNotice: '非官方模拟复盘结果，仅用于技术研究和流程验证，不构成购彩建议。'
      },
      failureReasons: ['DIRECTION_ERROR'],
      supportedFailureReasons: ['DIRECTION_ERROR', 'MATCH_POSTPONED_OR_CANCELLED'],
      supportedSettlementStatuses: ['HIT', 'MISS', 'PARTIAL_HIT', 'VOID', 'PENDING', 'NEEDS_REVIEW'],
      resultSource: {
        sourceName: 'Mock Public Result Provider',
        sourceUrl: 'https://example.com/mock-public-results',
        sourceLicense: 'Fictional sample for local tests only',
        fetchedAt: '2026-07-01T22:15:00+08:00',
        confidence: 0.98
      },
      itemSettlements: [
        {
          planItemId: 'sim-item-llm-001',
          matchId: 'demo-match-001',
          selection: 'AWAY_WIN',
          actualOutcome: 'HOME_WIN',
          settlementStatus: 'MISS',
          failureReason: 'DIRECTION_ERROR'
        }
      ],
      strategyRevisionRules: [
        {
          ruleCode: 'REVIEW_DIRECTION_WEIGHT',
          reasonCode: 'DIRECTION_ERROR',
          suggestion: '复盘方向判断权重，下一版策略降低单一方向依赖。'
        }
      ],
      reviewedAt: '2026-07-01T22:20:00+08:00'
    };

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/result-providers/status' && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 200,
              msg: 'success',
              data: {
                providerKey: 'mock-public-results',
                providerName: 'Mock Public Result Provider',
                providerType: 'MOCK',
                providerEnabled: true,
                syncStatus: 'SYNCED',
                snapshotCount: 1,
                lastFetchedAt: '2026-07-01T22:15:00+08:00',
                lastConfidence: 0.98,
                sourceName: 'Mock Public Result Provider',
                sourceUrl: 'https://example.com/mock-public-results',
                sourceLicense: 'Fictional sample for local tests only',
                dataPolicy: 'Mock provider uses fictional sample results only.',
                complianceNotice: '非官方 Mock 公开赛果源，仅用于模拟复盘流程验证。',
                snapshots: []
              }
            })
        });
      }

      if (url === '/api/reviews/pending' && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ code: 200, msg: 'success', data: pendingPlans })
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

      if (url === '/api/simulated-plans/sim-plan-llm-001/match-result' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ code: 200, msg: 'success', data: matchResult })
        });
      }

      if (url === '/api/simulated-plans/sim-plan-llm-001/settle' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ code: 200, msg: 'success', data: reviewRecord })
        });
      }

      return Promise.reject(new Error(`Unexpected request: ${method} ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mount(ReviewCenter, {
      global: {
        plugins: [pinia]
      }
    });

    await flushPromises();

    await wrapper.get('[data-testid="review-engine-select"]').setValue('RULE_REVIEW_WITH_LLM_INSIGHT');
    await wrapper.get('[data-testid="review-provider-select"]').setValue('openai');
    await wrapper.get('[data-testid="review-model-input"]').setValue('gpt-review-custom');
    await wrapper.get('[data-testid="review-prompt-version-input"]').setValue('danche-review-insight-v1');

    expect(wrapper.text()).toContain('OpenAI');
    expect(wrapper.text()).toContain('CONFIGURED');
    expect(wrapper.text()).toContain('OPENAI_API_KEY');
    expect(wrapper.text()).toContain('结算结果由规则引擎生成');

    await wrapper.get('button[data-testid="match-settle-button"]').trigger('click');
    await flushPromises();

    const settleRequest = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input) === '/api/simulated-plans/sim-plan-llm-001/settle' && init?.method === 'POST'
    );
    expect(settleRequest).toBeTruthy();
    const payload = JSON.parse(String(settleRequest?.[1]?.body));
    expect(payload).toMatchObject({
      reviewEngineMode: 'RULE_REVIEW_WITH_LLM_INSIGHT',
      providerKey: 'openai',
      modelId: 'gpt-review-custom',
      promptVersion: 'danche-review-insight-v1'
    });

    expect(wrapper.text()).toContain('RULE_REVIEW_WITH_LLM_INSIGHT');
    expect(wrapper.text()).toContain('gpt-review-custom');
    expect(wrapper.text()).toContain('PASSED');
    expect(wrapper.text()).toContain('待审计落库');
    expect(wrapper.text()).toContain('方向错');
    expect(wrapper.text()).toContain('只作为手动参考');
    expect(wrapper.text()).toContain('不要因单场方向错误');
    expect(wrapper.text()).toContain('MISS');
    expect(wrapper.text()).not.toContain('\u5fc5\u4e2d');
    expect(wrapper.text()).not.toContain('\u7a33\u8d5a');
  });
});
