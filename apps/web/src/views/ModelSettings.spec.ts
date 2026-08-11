import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import ModelSettings from './ModelSettings.vue';

describe('ModelSettings', () => {
  it('shows engine defaults, provider status, and compliance guardrails without exposing secrets', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url === '/api/engine-settings') {
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

        if (url === '/api/model-providers') {
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
                    credentialStatus: 'MISSING',
                    connectionStatus: 'UNTESTED'
                  },
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

        if (url === '/api/strategy-parameter-defaults') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                code: 200,
                msg: 'success',
                data: strategyDefaults()
              })
          });
        }

        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      })
    );

    const wrapper = mount(ModelSettings);
    await flushPromises();

    expect(wrapper.text()).toContain('MOCK_RULE_ENGINE');
    expect(wrapper.text()).toContain('RULE_REVIEW_ONLY');
    expect(wrapper.text()).toContain('OpenAI');
    expect(wrapper.text()).toContain('DeepSeek');
    expect(wrapper.text()).toContain('MISSING');
    expect(wrapper.text()).toContain('CONFIGURED');
    expect(wrapper.text()).toContain('API Key 前端不可见');
    expect(wrapper.text()).toContain('USER_SCREENSHOT_CONFIRMED');
    expect(wrapper.text()).toContain('默认策略参数');
    expect((wrapper.get('[data-testid="default-budget-input"]').element as HTMLInputElement).value).toBe('20');
    expect((wrapper.get('[data-testid="default-risk-select"]').element as HTMLSelectElement).value).toBe('BALANCED');
    expect(wrapper.text()).not.toContain('unit-test-secret');
  });

  it('updates engine settings and strategy parameter defaults from the settings page', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });

        if (url === '/api/engine-settings' && init?.method === 'PUT') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                code: 200,
                msg: 'success',
                data: {
                  defaultEngineMode: 'MOCK_RULE_ENGINE',
                  analysisEngineMode: 'OPENAI_COMPATIBLE',
                  reviewInsightMode: 'RULE_REVIEW_WITH_LLM_INSIGHT'
                }
              })
          });
        }

        if (url === '/api/strategy-parameter-defaults' && init?.method === 'PUT') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                code: 200,
                msg: 'success',
                data: {
                  ...strategyDefaults(),
                  budgetAmount: 32,
                  targetTicketCount: 4,
                  riskPreference: 'AGGRESSIVE',
                  enableEntertainmentTicket: false
                }
              })
          });
        }

        if (url === '/api/engine-settings') {
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

        if (url === '/api/model-providers') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                code: 200,
                msg: 'success',
                data: []
              })
          });
        }

        if (url === '/api/strategy-parameter-defaults') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                code: 200,
                msg: 'success',
                data: strategyDefaults()
              })
          });
        }

        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      })
    );

    const wrapper = mount(ModelSettings);
    await flushPromises();

    await wrapper.get('[data-testid="analysis-default-engine-select"]').setValue('OPENAI_COMPATIBLE');
    await wrapper.get('[data-testid="review-default-engine-select"]').setValue('RULE_REVIEW_WITH_LLM_INSIGHT');
    await wrapper.get('[data-testid="save-engine-settings-button"]').trigger('click');
    await flushPromises();

    await wrapper.get('[data-testid="default-budget-input"]').setValue(32);
    await wrapper.get('[data-testid="default-ticket-count-input"]').setValue(4);
    await wrapper.get('[data-testid="default-risk-select"]').setValue('AGGRESSIVE');
    await wrapper.get('[data-testid="default-entertainment-toggle"]').setValue(false);
    await wrapper.get('[data-testid="save-strategy-defaults-button"]').trigger('click');
    await flushPromises();

    const engineUpdate = requests.find((request) => request.url === '/api/engine-settings' && request.init?.method === 'PUT');
    expect(engineUpdate?.init?.body).toBe(
      JSON.stringify({
        analysisEngineMode: 'OPENAI_COMPATIBLE',
        reviewInsightMode: 'RULE_REVIEW_WITH_LLM_INSIGHT'
      })
    );

    const strategyUpdate = requests.find(
      (request) => request.url === '/api/strategy-parameter-defaults' && request.init?.method === 'PUT'
    );
    expect(JSON.parse(String(strategyUpdate?.init?.body))).toMatchObject({
      budgetAmount: 32,
      targetTicketCount: 4,
      riskPreference: 'AGGRESSIVE',
      enableEntertainmentTicket: false
    });
    expect(wrapper.text()).toContain('设置已保存');
  });
});

function strategyDefaults() {
  return {
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
  };
}
