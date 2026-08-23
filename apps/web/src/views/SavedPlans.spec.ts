import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useOcrWorkflowStore } from '@/stores/ocrWorkflow';
import { useSimulatedPlanStore } from '@/stores/simulatedPlan';
import type { OcrWorkflowAggregate } from '@/types/ocrWorkflow';
import type { SimulatedPlan } from '@/types/simulatedPlan';
import { readPendingWrite, savePendingWrite } from '@/workflow/workflowSession';

import SavedPlans from './SavedPlans.vue';

const WORKFLOW_ID = 'workflow-550e8400-e29b-41d4-a716-446655440001';
const SNAPSHOT_ID = 'snapshot-001';
const REPORT_ID = 'analysis-001';
const PLAN_ID = 'sim-plan-001';

function workflow(
  stage: OcrWorkflowAggregate['currentStage'] = 'ANALYSIS_GENERATED',
  currentPlanId: string | null = null,
): OcrWorkflowAggregate {
  return {
    workflowId: WORKFLOW_ID,
    currentStage: stage,
    version: currentPlanId === null ? 4 : 5,
    screenshotTaskId: 'screenshot-001',
    currentOcrTaskId: null,
    confirmedSnapshotId: SNAPSHOT_ID,
    currentReportId: REPORT_ID,
    currentPlanId,
    createdAt: '2026-08-24T00:00:00Z',
    updatedAt: '2026-08-24T00:00:00Z',
  };
}

function plan(overrides: Partial<SimulatedPlan> = {}): SimulatedPlan {
  return {
    planId: PLAN_ID,
    planType: 'SIMULATED_ONLY',
    planStatus: 'GENERATED',
    reportId: REPORT_ID,
    snapshotId: SNAPSHOT_ID,
    currency: 'CNY',
    budgetAmount: 20,
    strategyParameters: null,
    statusFlow: ['GENERATED'],
    items: [{
      planItemId: 'detail-item-001',
      matchId: 'match-001',
      playType: 'WIN_DRAW_LOSS',
      selection: 'HOME_WIN',
      odds: 2.1,
      stakeAmount: 2,
      itemStatus: 'GENERATED',
    }],
    snapshot: {
      planSnapshotId: 'plan-snapshot-001',
      snapshotId: SNAPSHOT_ID,
      reportId: REPORT_ID,
      inputSourceType: 'USER_SCREENSHOT_CONFIRMED',
      engineType: 'MOCK_RULE_ENGINE',
      sourceReportStatus: 'GENERATED',
      strategyParameters: null,
      selectionCount: 1,
      snapshotStatus: 'GENERATED',
      capturedAt: '2026-08-24T00:02:00Z',
    },
    complianceNotice: 'Non-official simulation only.',
    operatorNote: null,
    createdAt: '2026-08-24T00:02:00Z',
    updatedAt: '2026-08-24T00:02:00Z',
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
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
  const confirmedSnapshot = {
    snapshotId: SNAPSHOT_ID,
    ocrTaskId: 'ocr-001',
    sourceType: 'USER_SCREENSHOT_CONFIRMED' as const,
    snapshotStatus: 'CONFIRMED' as const,
    analysisAllowed: true,
    riskPreference: 'BALANCED',
    budgetAmount: 20,
    currency: 'CNY',
    matches: [],
    markets: [],
    workflowId: WORKFLOW_ID,
    confirmedRevision: 1,
    authorityType: 'SERVER_CONFIRMED_V2' as const,
    schemaVersion: 'CONFIRMED_SNAPSHOT_V2' as const,
  };
  useOcrWorkflowStore().$patch({
    status: 'READY',
    activeWorkflowId: WORKFLOW_ID,
    workflow: aggregate,
    confirmedSnapshot,
    snapshotsById: { [SNAPSHOT_ID]: confirmedSnapshot },
  });
}

function mountPage(pinia: ReturnType<typeof createPinia>, planId?: string) {
  return mount(SavedPlans, {
    props: { planId },
    global: {
      plugins: [pinia],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  });
}

describe('SavedPlans authoritative requests', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('generates from only reportId, restores detail, then saves explicitly with a different UUID', async () => {
    const pinia = createPinia();
    activate(pinia);
    let saved = false;
    let pendingSeenBeforeGenerate = false;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/strategies/simulate' && init?.method === 'POST') {
        pendingSeenBeforeGenerate = readPendingWrite(WORKFLOW_ID)?.operationType === 'GENERATE_PLAN';
        return ok(plan({
          items: [{
            planItemId: 'post-item-must-not-win',
            matchId: 'rogue',
            playType: 'WIN_DRAW_LOSS',
            selection: 'DRAW',
            odds: 1,
            stakeAmount: 1,
            itemStatus: 'GENERATED',
          }],
        }), 201);
      }
      if (url === '/api/simulated-plans' && init?.method === 'POST') {
        saved = true;
        return ok(plan({
          planStatus: 'PENDING_RESULT',
          statusFlow: ['GENERATED', 'SAVED', 'PENDING_RESULT'],
          operatorNote: 'wait for public result',
        }), 200);
      }
      if (url === `/api/ocr/workflows/${WORKFLOW_ID}`) {
        return ok(workflow(saved ? 'PENDING_RESULT' : 'PLAN_GENERATED', PLAN_ID));
      }
      if (url === `/api/simulated-plans/${PLAN_ID}`) {
        return ok(saved
          ? plan({
              planStatus: 'PENDING_RESULT',
              statusFlow: ['GENERATED', 'SAVED', 'PENDING_RESULT'],
              operatorNote: 'wait for public result',
            })
          : plan());
      }
      return Promise.reject(new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountPage(pinia);
    await wrapper.get('[data-testid="generate-plan-button"]').trigger('click');
    await flushPromises();

    const generateCall = fetchMock.mock.calls.find(([url]) => String(url) === '/api/strategies/simulate');
    expect(pendingSeenBeforeGenerate).toBe(true);
    expect(JSON.parse(String(generateCall?.[1]?.body))).toEqual({ reportId: REPORT_ID });
    expect(wrapper.text()).toContain('detail-item-001');
    expect(wrapper.text()).not.toContain('post-item-must-not-win');
    expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/simulated-plans')).toBe(false);

    await wrapper.get('[data-testid="operator-note-input"]').setValue('  wait for public result  ');
    await wrapper.get('[data-testid="save-plan-button"]').trigger('click');
    await flushPromises();

    const saveCall = fetchMock.mock.calls.find(([url]) => String(url) === '/api/simulated-plans');
    expect(JSON.parse(String(saveCall?.[1]?.body))).toEqual({
      generatedPlanId: PLAN_ID,
      operatorNote: 'wait for public result',
    });
    const generateKey = (generateCall?.[1]?.headers as Record<string, string>)['Idempotency-Key'];
    const saveKey = (saveCall?.[1]?.headers as Record<string, string>)['Idempotency-Key'];
    expect(generateKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(saveKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(saveKey).not.toBe(generateKey);
    expect(wrapper.text()).toContain('PENDING_RESULT');
  });

  it('hydrates workflow currentPlanId by detail GET only and never uses list order as authority', async () => {
    const pinia = createPinia();
    activate(pinia, workflow('PLAN_GENERATED', PLAN_ID));
    useSimulatedPlanStore().setSavedPlans([
      plan({ planId: 'sim-plan-unrelated', items: [] }),
    ]);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method ?? 'GET').toBe('GET');
      expect(String(input)).toBe(`/api/simulated-plans/${PLAN_ID}`);
      return ok(plan());
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountPage(pinia, PLAN_ID);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('detail-item-001');
    expect(wrapper.get('[data-testid="operator-note-input"]').element).toHaveProperty('disabled', false);
    const planStore = useSimulatedPlanStore();
    expect(planStore.getPlan(PLAN_ID)?.planId).toBe(PLAN_ID);
    expect(Object.keys(planStore.$state).sort()).toEqual(['plansById', 'savedPlans']);
  });

  it('rejects a deep-link planId that is not workflow.currentPlanId without fetching detail', async () => {
    const pinia = createPinia();
    activate(pinia, workflow('PLAN_GENERATED', PLAN_ID));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountPage(pinia, 'sim-plan-other');
    await flushPromises();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('planId');
    expect(wrapper.text()).toContain('不匹配');
  });

  it('fails closed when the same component changes from the current planId to another planId', async () => {
    const pinia = createPinia();
    activate(pinia, workflow('PLAN_GENERATED', PLAN_ID));
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      expect(String(input)).toBe(`/api/simulated-plans/${PLAN_ID}`);
      return ok(plan());
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountPage(pinia, PLAN_ID);
    await flushPromises();
    expect(wrapper.text()).toContain('detail-item-001');

    await wrapper.setProps({ planId: 'sim-plan-other' });
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).not.toContain('detail-item-001');
    expect(wrapper.text()).toContain('planId');
    expect(wrapper.text()).toContain('不匹配');

    await wrapper.setProps({ planId: PLAN_ID });
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('detail-item-001');
  });

  it('ignores a delayed legal plan response after props switch to an illegal planId', async () => {
    const pinia = createPinia();
    activate(pinia, workflow('PLAN_GENERATED', PLAN_ID));
    const delayedPlan = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      expect(String(input)).toBe(`/api/simulated-plans/${PLAN_ID}`);
      return delayedPlan.promise;
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountPage(pinia, PLAN_ID);
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await wrapper.setProps({ planId: 'sim-plan-other' });
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('不匹配');
    expect(wrapper.text()).not.toContain('detail-item-001');

    delayedPlan.resolve(await ok(plan()));
    await flushPromises();
    expect(useSimulatedPlanStore().getPlan(PLAN_ID)).toBeNull();
    expect(wrapper.text()).toContain('不匹配');
    expect(wrapper.text()).not.toContain('detail-item-001');
  });

  it.each(['PLAN_ALREADY_GENERATED', 'PLAN_ALREADY_SAVED'])(
    'recovers %s from currentPlanId detail without a second POST',
    async (errorCode) => {
      const pinia = createPinia();
      activate(pinia);
      const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/api/strategies/simulate') {
          return apiError(errorCode, { currentPlanId: PLAN_ID });
        }
        if (url === `/api/simulated-plans/${PLAN_ID}`) return ok(plan());
        if (url === `/api/ocr/workflows/${WORKFLOW_ID}`) return ok(workflow('PLAN_GENERATED', PLAN_ID));
        return Promise.reject(new Error(`Unexpected request: ${init?.method} ${url}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const wrapper = mountPage(pinia);
      await wrapper.get('[data-testid="generate-plan-button"]').trigger('click');
      await flushPromises();

      expect(fetchMock.mock.calls.filter(([url]) => String(url) === '/api/strategies/simulate')).toHaveLength(1);
      expect(wrapper.text()).toContain('detail-item-001');
      expect(readPendingWrite(WORKFLOW_ID)).toBeNull();
    },
  );

  it('keeps an unknown generate response for explicit same-key replay and never POSTs on remount', async () => {
    const pinia = createPinia();
    activate(pinia);
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('response lost'))));
    const first = mountPage(pinia);
    await first.get('[data-testid="generate-plan-button"]').trigger('click');
    await flushPromises();
    const originalKey = readPendingWrite(WORKFLOW_ID)?.idempotencyKey;
    expect(readPendingWrite(WORKFLOW_ID)?.recoveryState).toBe('SAME_KEY_REQUIRED');
    first.unmount();

    const secondFetch = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/strategies/simulate') return ok(plan(), 201);
      if (String(input) === `/api/ocr/workflows/${WORKFLOW_ID}`) {
        return ok(workflow('PLAN_GENERATED', PLAN_ID));
      }
      return ok(plan());
    });
    vi.stubGlobal('fetch', secondFetch);
    const second = mountPage(pinia);
    await flushPromises();
    expect(secondFetch).not.toHaveBeenCalled();

    await second.get('[data-testid="generate-plan-button"]').trigger('click');
    await flushPromises();
    const replay = secondFetch.mock.calls.find(([url]) => String(url) === '/api/strategies/simulate');
    expect((replay?.[1]?.headers as Record<string, string>)['Idempotency-Key']).toBe(originalKey);
  });

  it('keeps an unknown save response on PLAN_GENERATED and only replays it after an explicit click', async () => {
    const pinia = createPinia();
    activate(pinia, workflow('PLAN_GENERATED', PLAN_ID));
    const originalKey = '550e8400-e29b-41d4-a716-446655440099';
    savePendingWrite({
      operationType: 'SAVE_PLAN',
      workflowId: WORKFLOW_ID,
      idempotencyKey: originalKey,
      request: { generatedPlanId: PLAN_ID, operatorNote: 'wait' },
      recoveryState: 'SAME_KEY_REQUIRED',
      errorCode: 'UNKNOWN_RESPONSE',
    });
    let saved = false;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `/api/simulated-plans/${PLAN_ID}`) {
        return ok(saved
          ? plan({ planStatus: 'PENDING_RESULT', statusFlow: ['GENERATED', 'SAVED', 'PENDING_RESULT'] })
          : plan());
      }
      if (url === '/api/simulated-plans' && init?.method === 'POST') {
        saved = true;
        return ok(plan({ planStatus: 'PENDING_RESULT' }));
      }
      if (url === `/api/ocr/workflows/${WORKFLOW_ID}`) {
        return ok(workflow('PENDING_RESULT', PLAN_ID));
      }
      return Promise.reject(new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountPage(pinia);
    await flushPromises();
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === '/api/simulated-plans')).toHaveLength(0);
    expect(readPendingWrite(WORKFLOW_ID)?.idempotencyKey).toBe(originalKey);

    await wrapper.get('[data-testid="save-plan-button"]').trigger('click');
    await flushPromises();
    const replay = fetchMock.mock.calls.find(([url]) => String(url) === '/api/simulated-plans');
    expect((replay?.[1]?.headers as Record<string, string>)['Idempotency-Key']).toBe(originalKey);
  });

  it('keeps MALFORMED_RESPONSE on the same generate key', async () => {
    const pinia = createPinia();
    activate(pinia);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('malformed'); },
    } as unknown as Response)));

    const wrapper = mountPage(pinia);
    await wrapper.get('[data-testid="generate-plan-button"]').trigger('click');
    await flushPromises();

    expect(readPendingWrite(WORKFLOW_ID)).toMatchObject({
      recoveryState: 'SAME_KEY_REQUIRED',
      errorCode: 'MALFORMED_RESPONSE',
    });
  });

  it('keeps the original generate key when workflow refresh fails after plan POST succeeded', async () => {
    const pinia = createPinia();
    activate(pinia);
    let mutationKey = '';
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/strategies/simulate') {
        mutationKey = (init?.headers as Record<string, string>)['Idempotency-Key'];
        return ok(plan(), 201);
      }
      if (url === `/api/ocr/workflows/${WORKFLOW_ID}`) {
        return apiError('WORKFLOW_REFRESH_UNAVAILABLE', {}, 503);
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountPage(pinia);
    await wrapper.get('[data-testid="generate-plan-button"]').trigger('click');
    await flushPromises();

    expect(readPendingWrite(WORKFLOW_ID)).toMatchObject({
      idempotencyKey: mutationKey,
      recoveryState: 'SAME_KEY_REQUIRED',
      errorCode: 'UNKNOWN_RESPONSE',
    });
  });

  it('keeps the original save key when workflow refresh fails after save POST succeeded', async () => {
    const pinia = createPinia();
    activate(pinia, workflow('PLAN_GENERATED', PLAN_ID));
    let mutationKey = '';
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `/api/simulated-plans/${PLAN_ID}`) return ok(plan());
      if (url === '/api/simulated-plans' && init?.method === 'POST') {
        mutationKey = (init.headers as Record<string, string>)['Idempotency-Key'];
        return ok(plan({ planStatus: 'PENDING_RESULT' }));
      }
      if (url === `/api/ocr/workflows/${WORKFLOW_ID}`) {
        return apiError('WORKFLOW_REFRESH_UNAVAILABLE', {}, 503);
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountPage(pinia);
    await flushPromises();
    await wrapper.get('[data-testid="save-plan-button"]').trigger('click');
    await flushPromises();

    expect(readPendingWrite(WORKFLOW_ID)).toMatchObject({
      idempotencyKey: mutationKey,
      recoveryState: 'SAME_KEY_REQUIRED',
      errorCode: 'UNKNOWN_RESPONSE',
    });
  });

  it('does not redisplay plan A when save detail resolves after route switches to illegal B', async () => {
    const pinia = createPinia();
    activate(pinia, workflow('PLAN_GENERATED', PLAN_ID));
    const delayedSavedDetail = deferred<Response>();
    let detailCalls = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `/api/simulated-plans/${PLAN_ID}`) {
        detailCalls += 1;
        return detailCalls === 1 ? ok(plan()) : delayedSavedDetail.promise;
      }
      if (url === '/api/simulated-plans' && init?.method === 'POST') {
        return ok(plan({ planStatus: 'PENDING_RESULT' }));
      }
      if (url === `/api/ocr/workflows/${WORKFLOW_ID}`) {
        return ok(workflow('PENDING_RESULT', PLAN_ID));
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountPage(pinia, PLAN_ID);
    await flushPromises();
    await wrapper.get('[data-testid="save-plan-button"]').trigger('click');
    await flushPromises();
    expect(detailCalls).toBe(2);

    await wrapper.setProps({ planId: 'sim-plan-other' });
    await flushPromises();
    expect(wrapper.text()).toContain('不匹配');
    expect(wrapper.text()).not.toContain('detail-item-001');

    delayedSavedDetail.resolve(await ok(plan({
      planStatus: 'PENDING_RESULT',
      statusFlow: ['GENERATED', 'SAVED', 'PENDING_RESULT'],
    })));
    await flushPromises();

    expect(wrapper.text()).toContain('不匹配');
    expect(wrapper.text()).not.toContain('detail-item-001');
    expect(readPendingWrite(WORKFLOW_ID)).toBeNull();
  });

  it.each([
    ['SAME_KEY_REQUIRED', 'UNKNOWN_RESPONSE', true],
    ['NEW_KEY_REQUIRED', 'OPERATION_INTERRUPTED', false],
  ] as const)(
    'restores %s SAVE_PLAN note and submits the exact pending request with key policy',
    async (recoveryState, errorCode, reusesKey) => {
      const pinia = createPinia();
      activate(pinia, workflow('PLAN_GENERATED', PLAN_ID));
      const originalKey = '550e8400-e29b-41d4-a716-446655440055';
      savePendingWrite({
        operationType: 'SAVE_PLAN',
        workflowId: WORKFLOW_ID,
        idempotencyKey: originalKey,
        request: { generatedPlanId: PLAN_ID, operatorNote: 'pending frozen note' },
        recoveryState,
        errorCode,
      });
      const expectedBody = JSON.stringify(readPendingWrite(WORKFLOW_ID)?.request);
      const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
        if (String(input) === `/api/simulated-plans/${PLAN_ID}`) {
          return ok(plan({ operatorNote: 'server old note' }));
        }
        return Promise.reject(new TypeError('stop after capture'));
      });
      vi.stubGlobal('fetch', fetchMock);

      const wrapper = mountPage(pinia, PLAN_ID);
      await flushPromises();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(wrapper.get('[data-testid="operator-note-input"]').element).toHaveProperty(
        'value',
        'pending frozen note',
      );
      expect(wrapper.get('[data-testid="operator-note-input"]').element).toHaveProperty('disabled', true);
      expect(wrapper.text()).toContain('恢复将提交冻结备注');
      expect(wrapper.text()).toContain('需先完成恢复');

      await wrapper.get('[data-testid="save-plan-button"]').trigger('click');
      await flushPromises();
      const call = fetchMock.mock.calls.find(([url]) => String(url) === '/api/simulated-plans');
      expect(String(call?.[1]?.body)).toBe(expectedBody);
      const submittedKey = (call?.[1]?.headers as Record<string, string>)['Idempotency-Key'];
      if (reusesKey) expect(submittedKey).toBe(originalKey);
      else expect(submittedKey).not.toBe(originalKey);
    },
  );

  it('clears proven SAVE_PLAN pending and keeps the final server note in PENDING_RESULT', async () => {
    const pinia = createPinia();
    activate(pinia, workflow('PENDING_RESULT', PLAN_ID));
    savePendingWrite({
      operationType: 'SAVE_PLAN',
      workflowId: WORKFLOW_ID,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440044',
      request: { generatedPlanId: PLAN_ID, operatorNote: 'pending old note' },
      recoveryState: 'NEW_KEY_REQUIRED',
      errorCode: 'OPERATION_INTERRUPTED',
    });
    vi.stubGlobal('fetch', vi.fn(() => ok(plan({
      planStatus: 'PENDING_RESULT',
      statusFlow: ['GENERATED', 'SAVED', 'PENDING_RESULT'],
      operatorNote: 'server final note',
    }))));

    const wrapper = mountPage(pinia, PLAN_ID);
    await flushPromises();

    expect(readPendingWrite(WORKFLOW_ID)).toBeNull();
    expect(wrapper.get('[data-testid="operator-note-input"]').element).toHaveProperty(
      'value',
      'server final note',
    );
  });

  it('clears a cross-page GENERATE_ANALYSIS pending write once currentReportId proves completion', async () => {
    const pinia = createPinia();
    activate(pinia);
    savePendingWrite({
      operationType: 'GENERATE_ANALYSIS',
      workflowId: WORKFLOW_ID,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440077',
      request: {
        snapshotId: SNAPSHOT_ID,
        engineMode: 'MOCK_RULE_ENGINE',
        analysisOptions: null,
      },
      recoveryState: 'SAME_KEY_REQUIRED',
      errorCode: 'UNKNOWN_RESPONSE',
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    mountPage(pinia);
    await flushPromises();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(readPendingWrite(WORKFLOW_ID)).toBeNull();
  });

  it.each(['FAILED', 'OPERATION_INTERRUPTED'])('%s requires explicit generate retry with a new key', async (errorCode) => {
    const pinia = createPinia();
    activate(pinia);
    let attempts = 0;
    const keys: string[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/strategies/simulate') {
        attempts += 1;
        keys.push((init?.headers as Record<string, string>)['Idempotency-Key']);
        if (attempts === 1) return apiError(errorCode);
        return ok(plan(), 201);
      }
      if (String(input) === `/api/ocr/workflows/${WORKFLOW_ID}`) {
        return ok(workflow('PLAN_GENERATED', PLAN_ID));
      }
      return ok(plan());
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountPage(pinia);
    await wrapper.get('[data-testid="generate-plan-button"]').trigger('click');
    await flushPromises();
    expect(readPendingWrite(WORKFLOW_ID)).toMatchObject({ recoveryState: 'NEW_KEY_REQUIRED', errorCode });

    await wrapper.get('[data-testid="generate-plan-button"]').trigger('click');
    await flushPromises();
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
  });
});
