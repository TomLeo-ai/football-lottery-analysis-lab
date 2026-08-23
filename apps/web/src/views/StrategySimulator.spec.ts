import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAnalysisReportStore } from '@/stores/analysisReport';
import { useOcrWorkflowStore } from '@/stores/ocrWorkflow';
import type { AnalysisReport } from '@/types/analysis';
import type { OcrWorkflowAggregate, UserConfirmedSnapshot } from '@/types/ocrWorkflow';
import { readPendingWrite, savePendingWrite } from '@/workflow/workflowSession';

import StrategySimulator from './StrategySimulator.vue';

const WORKFLOW_ID = 'workflow-550e8400-e29b-41d4-a716-446655440001';
const SNAPSHOT_ID = 'snapshot-001';
const REPORT_ID = 'analysis-001';

const optionKeys = [
  'allowLowReturnTicket',
  'defensiveTicketRatio',
  'enableEntertainmentTicket',
  'entertainmentTicketMaxCost',
  'entertainmentTicketRatio',
  'mainTicketRatio',
  'maxParlayLegs',
  'maxTicketCount',
  'minPayoutRequirement',
  'minTicketCount',
  'targetTicketCount',
  'upsetCoverageLevel',
].sort();

function snapshot(): UserConfirmedSnapshot {
  return {
    snapshotId: SNAPSHOT_ID,
    ocrTaskId: 'ocr-001',
    sourceType: 'USER_SCREENSHOT_CONFIRMED',
    snapshotStatus: 'CONFIRMED',
    analysisAllowed: true,
    riskPreference: 'BALANCED',
    budgetAmount: 20,
    currency: 'CNY',
    matches: [{
      matchId: 'match-secret-001',
      matchDate: '2026-08-24',
      league: 'Secret League',
      homeTeam: 'Secret Home',
      awayTeam: 'Secret Away',
      kickoffTime: '2026-08-24T20:00:00+08:00',
    }],
    markets: [{
      marketId: 'market-secret-001',
      matchId: 'match-secret-001',
      playType: 'WIN_DRAW_LOSS',
      selection: 'HOME_WIN',
      odds: 2.1,
    }],
    workflowId: WORKFLOW_ID,
    confirmedRevision: 3,
    authorityType: 'SERVER_CONFIRMED_V2',
    schemaVersion: 'CONFIRMED_SNAPSHOT_V2',
  };
}

function workflow(
  stage: OcrWorkflowAggregate['currentStage'] = 'CONFIRMED',
  currentReportId: string | null = null,
): OcrWorkflowAggregate {
  return {
    workflowId: WORKFLOW_ID,
    currentStage: stage,
    version: currentReportId === null ? 3 : 4,
    screenshotTaskId: 'screenshot-001',
    currentOcrTaskId: null,
    confirmedSnapshotId: SNAPSHOT_ID,
    currentReportId,
    currentPlanId: null,
    createdAt: '2026-08-24T00:00:00Z',
    updatedAt: '2026-08-24T00:00:00Z',
  };
}

function report(overrides: Partial<AnalysisReport> = {}): AnalysisReport {
  return {
    reportId: REPORT_ID,
    workflowId: WORKFLOW_ID,
    snapshotId: SNAPSHOT_ID,
    authorityType: 'SERVER_CONFIRMED_V2',
    schemaVersion: 'ANALYSIS_REPORT_V2',
    strategyDefaultsVersion: 'STRATEGY_DEFAULTS_V2',
    authorityRevision: 3,
    inputSourceType: 'USER_SCREENSHOT_CONFIRMED',
    engineType: 'MOCK_RULE_ENGINE',
    reportStatus: 'GENERATED',
    strategyParameters: null,
    probabilityAnalysis: [],
    riskWarnings: [],
    simulatedSelections: [],
    complianceNotice: 'Non-official simulation only.',
    generatedAt: '2026-08-24T00:01:00Z',
    ...overrides,
  };
}

function ok<T>(data: T, status = 200) {
  return Promise.resolve({
    ok: true,
    status,
    json: async () => ({ code: status, msg: 'success', data }),
  } as Response);
}

function apiError(errorCode: string, recovery: Record<string, unknown> = {}, status = 409) {
  return Promise.resolve({
    ok: false,
    status,
    json: async () => ({
      code: status,
      msg: 'failed',
      data: null,
      error: { errorCode, message: errorCode, recovery },
    }),
  } as Response);
}

function activate(pinia: ReturnType<typeof createPinia>, aggregate = workflow()) {
  setActivePinia(pinia);
  const store = useOcrWorkflowStore();
  store.$patch({
    status: 'READY',
    activeWorkflowId: WORKFLOW_ID,
    workflow: aggregate,
    confirmedSnapshot: snapshot(),
    snapshotsById: { [SNAPSHOT_ID]: snapshot() },
  });
}

function mountPage(pinia: ReturnType<typeof createPinia>) {
  return mount(StrategySimulator, {
    global: {
      plugins: [pinia],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  });
}

describe('StrategySimulator authoritative requests', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('persists first and sends the exact Mock body with only 12 non-authority options', async () => {
    const pinia = createPinia();
    activate(pinia);
    const reportStore = useAnalysisReportStore();
    let pendingSeenBeforeFetch = false;
    let pendingSeenBeforeRefresh = false;
    let cacheEmptyBeforeRefresh = false;
    const requestOrder: string[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/analysis/generate' && init?.method === 'POST') {
        requestOrder.push('POST');
        pendingSeenBeforeFetch = readPendingWrite(WORKFLOW_ID)?.operationType === 'GENERATE_ANALYSIS';
        return ok(report({ complianceNotice: 'POST response must not be cached.' }), 201);
      }
      if (url === `/api/ocr/workflows/${WORKFLOW_ID}`) {
        requestOrder.push('REFRESH');
        pendingSeenBeforeRefresh = readPendingWrite(WORKFLOW_ID) !== null;
        cacheEmptyBeforeRefresh = reportStore.getReport(REPORT_ID) === null;
        return ok(workflow('ANALYSIS_GENERATED', REPORT_ID));
      }
      if (url === `/api/analysis/reports/${REPORT_ID}`) {
        requestOrder.push('DETAIL');
        return ok(report({ complianceNotice: 'Authoritative detail.' }));
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountPage(pinia);
    expect(wrapper.get('[data-testid="analysis-engine-select"]').element).toHaveProperty('disabled', false);
    expect(wrapper.get('[data-testid="option-target"]').element).toHaveProperty('disabled', false);
    await wrapper.get('[data-testid="generate-analysis-button"]').trigger('click');
    await flushPromises();

    const call = fetchMock.mock.calls.find(([url]) => String(url) === '/api/analysis/generate');
    const body = JSON.parse(String(call?.[1]?.body));
    expect(pendingSeenBeforeFetch).toBe(true);
    expect(Object.keys(body).sort()).toEqual(['analysisOptions', 'engineMode', 'snapshotId']);
    expect(body).toMatchObject({ snapshotId: SNAPSHOT_ID, engineMode: 'MOCK_RULE_ENGINE' });
    expect(Object.keys(body.analysisOptions).sort()).toEqual(optionKeys);
    expect((call?.[1]?.headers as Record<string, string>)['Idempotency-Key']).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
    expect(JSON.stringify(body)).not.toMatch(
      /sourceType|analysisAllowed|riskPreference|budgetAmount|currency|preferredPlayTypes|excludedPlayTypes|exactScorePolicy|matches|markets|status/i,
    );
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('engine-settings'))).toBe(false);
    expect(pendingSeenBeforeRefresh).toBe(true);
    expect(cacheEmptyBeforeRefresh).toBe(true);
    expect(requestOrder).toEqual(['POST', 'REFRESH', 'DETAIL']);
    expect(reportStore.getReport(REPORT_ID)?.complianceNotice).toBe('Authoritative detail.');
    expect(readPendingWrite(WORKFLOW_ID)).toBeNull();
  });

  it('sends exactly six top-level keys for an explicit LLM selection and fixed prompt', async () => {
    const pinia = createPinia();
    activate(pinia);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/analysis/generate' && init?.method === 'POST') {
        return ok(report({
          engineType: 'OPENAI_COMPATIBLE',
          providerKey: 'openai',
          modelId: 'gpt-explicit',
          promptVersion: 'danche-prediction-v1',
        }), 201);
      }
      if (url === `/api/ocr/workflows/${WORKFLOW_ID}`) {
        return ok(workflow('ANALYSIS_GENERATED', REPORT_ID));
      }
      if (url === `/api/analysis/reports/${REPORT_ID}`) return ok(report({
        engineType: 'OPENAI_COMPATIBLE',
        providerKey: 'openai',
        modelId: 'gpt-explicit',
        promptVersion: 'danche-prediction-v1',
      }));
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountPage(pinia);
    expect(wrapper.get('[data-testid="analysis-engine-select"]').element).toHaveProperty('value', 'MOCK_RULE_ENGINE');
    expect(wrapper.text()).not.toContain('USE_GLOBAL');
    await wrapper.get('[data-testid="analysis-engine-select"]').setValue('OPENAI_COMPATIBLE');
    await wrapper.get('[data-testid="analysis-provider-input"]').setValue('openai');
    await wrapper.get('[data-testid="analysis-model-input"]').setValue('gpt-explicit');
    await wrapper.get('[data-testid="generate-analysis-button"]').trigger('click');
    await flushPromises();

    const call = fetchMock.mock.calls.find(([url]) => String(url) === '/api/analysis/generate');
    const body = JSON.parse(String(call?.[1]?.body));
    expect(Object.keys(body).sort()).toEqual([
      'analysisOptions',
      'engineMode',
      'modelId',
      'promptVersion',
      'providerKey',
      'snapshotId',
    ]);
    expect(body).toMatchObject({
      providerKey: 'openai',
      modelId: 'gpt-explicit',
      promptVersion: 'danche-prediction-v1',
    });
    expect(Object.keys(body.analysisOptions).sort()).toEqual(optionKeys);
  });

  it('hydrates currentReportId by GET only and checks its lineage', async () => {
    const pinia = createPinia();
    activate(pinia, workflow('ANALYSIS_GENERATED', REPORT_ID));
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method ?? 'GET').toBe('GET');
      expect(String(input)).toBe(`/api/analysis/reports/${REPORT_ID}`);
      return ok(report());
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountPage(pinia);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain(REPORT_ID);
    const reportStore = useAnalysisReportStore();
    expect(reportStore.getReport(REPORT_ID)?.workflowId).toBe(WORKFLOW_ID);
    expect(Object.keys(reportStore.$state)).toEqual(['reportsById']);
  });

  it('keeps an unknown response for explicit same-key replay and never POSTs on remount', async () => {
    const pinia = createPinia();
    activate(pinia);
    const firstFetch = vi.fn(() => Promise.reject(new TypeError('network lost after send')));
    vi.stubGlobal('fetch', firstFetch);
    const first = mountPage(pinia);
    await first.get('[data-testid="generate-analysis-button"]').trigger('click');
    await flushPromises();
    const pending = readPendingWrite(WORKFLOW_ID);
    const originalKey = pending?.idempotencyKey;
    expect(pending?.recoveryState).toBe('SAME_KEY_REQUIRED');
    first.unmount();

    const secondFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/analysis/generate') return ok(report(), 201);
      if (String(input) === `/api/ocr/workflows/${WORKFLOW_ID}`) {
        return ok(workflow('ANALYSIS_GENERATED', REPORT_ID));
      }
      return ok(report());
    });
    vi.stubGlobal('fetch', secondFetch);
    const second = mountPage(pinia);
    await flushPromises();
    expect(secondFetch).not.toHaveBeenCalled();
    await second.get('[data-testid="generate-analysis-button"]').trigger('click');
    await flushPromises();

    const replay = secondFetch.mock.calls.find(([url]) => String(url) === '/api/analysis/generate');
    expect((replay?.[1]?.headers as Record<string, string>)['Idempotency-Key']).toBe(originalKey);
  });

  it('recovers ANALYSIS_ALREADY_GENERATED by currentReportId detail without another POST', async () => {
    const pinia = createPinia();
    activate(pinia);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/analysis/generate') {
        return apiError('ANALYSIS_ALREADY_GENERATED', { currentReportId: REPORT_ID });
      }
      if (url === `/api/analysis/reports/${REPORT_ID}`) return ok(report());
      if (url === `/api/ocr/workflows/${WORKFLOW_ID}`) return ok(workflow('ANALYSIS_GENERATED', REPORT_ID));
      return Promise.reject(new Error(`Unexpected request: ${url} ${init?.method}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountPage(pinia);
    await wrapper.get('[data-testid="generate-analysis-button"]').trigger('click');
    await flushPromises();

    expect(fetchMock.mock.calls.filter(([url]) => String(url) === '/api/analysis/generate')).toHaveLength(1);
    expect(wrapper.text()).toContain(REPORT_ID);
    expect(readPendingWrite(WORKFLOW_ID)).toBeNull();
  });

  it.each(['FAILED', 'OPERATION_INTERRUPTED'])('%s requires an explicit retry with a new key', async (errorCode) => {
    const pinia = createPinia();
    activate(pinia);
    let attempts = 0;
    const keys: string[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/analysis/generate') {
        attempts += 1;
        keys.push((init?.headers as Record<string, string>)['Idempotency-Key']);
        if (attempts === 1) return apiError(errorCode);
        return ok(report(), 201);
      }
      if (String(input) === `/api/ocr/workflows/${WORKFLOW_ID}`) {
        return ok(workflow('ANALYSIS_GENERATED', REPORT_ID));
      }
      return ok(report());
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountPage(pinia);
    await wrapper.get('[data-testid="generate-analysis-button"]').trigger('click');
    await flushPromises();
    expect(readPendingWrite(WORKFLOW_ID)).toMatchObject({ recoveryState: 'NEW_KEY_REQUIRED', errorCode });
    expect(attempts).toBe(1);

    await wrapper.get('[data-testid="generate-analysis-button"]').trigger('click');
    await flushPromises();
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('keeps the same pending key when refresh returns a different currentReportId', async () => {
    const pinia = createPinia();
    activate(pinia);
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === '/api/analysis/generate') return ok(report(), 201);
      if (String(input) === `/api/ocr/workflows/${WORKFLOW_ID}`) {
        return ok(workflow('ANALYSIS_GENERATED', 'analysis-other'));
      }
      return Promise.reject(new Error(`Unexpected detail request: ${String(input)}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountPage(pinia);
    await wrapper.get('[data-testid="generate-analysis-button"]').trigger('click');
    await flushPromises();

    expect(readPendingWrite(WORKFLOW_ID)).toMatchObject({
      operationType: 'GENERATE_ANALYSIS',
      recoveryState: 'SAME_KEY_REQUIRED',
    });
    expect(useAnalysisReportStore().getReport(REPORT_ID)).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/analysis/reports/'))).toBe(false);
  });

  it('keeps the original key when report detail fails after analysis POST succeeded', async () => {
    const pinia = createPinia();
    activate(pinia);
    let mutationKey = '';
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/analysis/generate') {
        mutationKey = (init?.headers as Record<string, string>)['Idempotency-Key'];
        return ok(report(), 201);
      }
      if (url === `/api/ocr/workflows/${WORKFLOW_ID}`) {
        return ok(workflow('ANALYSIS_GENERATED', REPORT_ID));
      }
      if (url === `/api/analysis/reports/${REPORT_ID}`) {
        return apiError('REPORT_DETAIL_UNAVAILABLE', {}, 503);
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountPage(pinia);
    await wrapper.get('[data-testid="generate-analysis-button"]').trigger('click');
    await flushPromises();

    expect(readPendingWrite(WORKFLOW_ID)).toMatchObject({
      idempotencyKey: mutationKey,
      recoveryState: 'SAME_KEY_REQUIRED',
      errorCode: 'UNKNOWN_RESPONSE',
    });
    expect(useAnalysisReportStore().getReport(REPORT_ID)).toBeNull();
  });

  it('keeps MALFORMED_RESPONSE on the same key for an explicit replay', async () => {
    const pinia = createPinia();
    activate(pinia);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('malformed'); },
    } as unknown as Response)));

    const wrapper = mountPage(pinia);
    await wrapper.get('[data-testid="generate-analysis-button"]').trigger('click');
    await flushPromises();

    expect(readPendingWrite(WORKFLOW_ID)).toMatchObject({
      recoveryState: 'SAME_KEY_REQUIRED',
      errorCode: 'MALFORMED_RESPONSE',
    });
  });

  it('does not clear another page pending write while restoring currentReportId', async () => {
    const pinia = createPinia();
    activate(pinia, workflow('ANALYSIS_GENERATED', REPORT_ID));
    savePendingWrite({
      operationType: 'GENERATE_PLAN',
      workflowId: WORKFLOW_ID,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440088',
      request: { reportId: REPORT_ID },
      recoveryState: 'SAME_KEY_REQUIRED',
      errorCode: 'UNKNOWN_RESPONSE',
    });
    vi.stubGlobal('fetch', vi.fn(() => ok(report())));

    mountPage(pinia);
    await flushPromises();

    expect(readPendingWrite(WORKFLOW_ID)?.operationType).toBe('GENERATE_PLAN');
  });

  it.each([
    ['SAME_KEY_REQUIRED', 'UNKNOWN_RESPONSE', true],
    ['NEW_KEY_REQUIRED', 'OPERATION_INTERRUPTED', false],
  ] as const)(
    'restores %s LLM pending form and submits the exact request with the required key policy',
    async (recoveryState, errorCode, reusesKey) => {
      const pinia = createPinia();
      activate(pinia);
      const originalKey = '550e8400-e29b-41d4-a716-446655440066';
      savePendingWrite({
        operationType: 'GENERATE_ANALYSIS',
        workflowId: WORKFLOW_ID,
        idempotencyKey: originalKey,
        request: {
          snapshotId: SNAPSHOT_ID,
          engineMode: 'OPENAI_COMPATIBLE',
          providerKey: 'deepseek-explicit',
          modelId: 'model-frozen-v1',
          promptVersion: 'danche-prediction-v1',
          analysisOptions: {
            targetTicketCount: 4,
            minTicketCount: 2,
            maxTicketCount: 5,
            mainTicketRatio: 0.5,
            defensiveTicketRatio: 0.3,
            entertainmentTicketRatio: 0.2,
            enableEntertainmentTicket: false,
            entertainmentTicketMaxCost: 1.5,
            maxParlayLegs: 3,
            minPayoutRequirement: 1.8,
            allowLowReturnTicket: true,
            upsetCoverageLevel: 'STRONG',
          },
        },
        recoveryState,
        errorCode,
      });
      const persisted = readPendingWrite(WORKFLOW_ID);
      const expectedBody = JSON.stringify(persisted?.request);
      const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => (
        Promise.reject(new TypeError('stop after capture'))
      ));
      vi.stubGlobal('fetch', fetchMock);

      const wrapper = mountPage(pinia);
      await flushPromises();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(wrapper.get('[data-testid="analysis-engine-select"]').element).toHaveProperty(
        'value',
        'OPENAI_COMPATIBLE',
      );
      expect(wrapper.get('[data-testid="analysis-provider-input"]').element).toHaveProperty(
        'value',
        'deepseek-explicit',
      );
      expect(wrapper.get('[data-testid="analysis-model-input"]').element).toHaveProperty(
        'value',
        'model-frozen-v1',
      );
      expect(wrapper.get('[data-testid="option-target"]').element).toHaveProperty('value', '4');
      expect(wrapper.get('[data-testid="option-upset"]').element).toHaveProperty('value', 'STRONG');
      expect(wrapper.get('[data-testid="option-entertainment-enabled"]').element).toHaveProperty('checked', false);
      expect(wrapper.text()).toContain('danche-prediction-v1');
      const frozenControlIds = [
        'analysis-engine-select',
        'analysis-provider-input',
        'analysis-model-input',
        'option-target',
        'option-min',
        'option-max',
        'option-main-ratio',
        'option-defensive-ratio',
        'option-entertainment-ratio',
        'option-entertainment-cost',
        'option-max-legs',
        'option-min-payout',
        'option-upset',
        'option-entertainment-enabled',
        'option-low-return',
      ];
      frozenControlIds.forEach((testId) => {
        expect(wrapper.get(`[data-testid="${testId}"]`).element).toHaveProperty('disabled', true);
      });
      expect(wrapper.text()).toContain('恢复将提交冻结请求');
      expect(wrapper.text()).toContain('需先完成恢复');

      await wrapper.get('[data-testid="generate-analysis-button"]').trigger('click');
      await flushPromises();

      const call = fetchMock.mock.calls[0];
      expect(String(call?.[1]?.body)).toBe(expectedBody);
      const submittedKey = (call?.[1]?.headers as Record<string, string>)['Idempotency-Key'];
      if (reusesKey) expect(submittedKey).toBe(originalKey);
      else expect(submittedKey).not.toBe(originalKey);
    },
  );
});
