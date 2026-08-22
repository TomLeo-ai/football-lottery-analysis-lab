import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { useOcrWorkflowStore } from '@/stores/ocrWorkflow';
import type { OcrTask, OcrWorkflowAggregate, UserConfirmedSnapshot } from '@/types/ocrWorkflow';
import { WORKFLOW_ID_KEY } from '@/workflow/workflowSession';

const WORKFLOW_A = 'workflow-550e8400-e29b-41d4-a716-446655440001';
const WORKFLOW_B = 'workflow-550e8400-e29b-41d4-a716-446655440002';

function workflow(
  workflowId: string,
  overrides: Partial<OcrWorkflowAggregate> = {},
): OcrWorkflowAggregate {
  return {
    workflowId,
    currentStage: 'WAITING_USER_CONFIRMATION',
    version: 1,
    screenshotTaskId: 'screenshot-001',
    currentOcrTaskId: 'ocr-001',
    confirmedSnapshotId: null,
    currentReportId: null,
    currentPlanId: null,
    createdAt: '2026-08-23T00:00:00Z',
    updatedAt: '2026-08-23T00:00:00Z',
    ...overrides,
  };
}

function snapshot(workflowId: string): UserConfirmedSnapshot {
  return {
    snapshotId: 'snapshot-001',
    ocrTaskId: 'ocr-001',
    sourceType: 'USER_SCREENSHOT_CONFIRMED',
    snapshotStatus: 'CONFIRMED',
    analysisAllowed: true,
    riskPreference: 'BALANCED',
    budgetAmount: 20,
    currency: 'CNY',
    matches: [],
    markets: [],
    workflowId,
    confirmedRevision: 1,
    authorityType: 'SERVER_CONFIRMED_V2',
    schemaVersion: 'CONFIRMED_SNAPSHOT_V2',
  };
}

function reviewDraft(): OcrTask {
  return {
    ocrTaskId: 'ocr-001',
    screenshotTaskId: 'screenshot-001',
    ocrProvider: 'TESSERACT_BROWSER',
    status: 'WAITING_USER_CONFIRMATION',
    analysisAllowed: false,
    fields: [],
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('ocrWorkflow store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    sessionStorage.clear();
  });

  it('hydrates an explicit workflow and its owned confirmed snapshot', async () => {
    const store = useOcrWorkflowStore();
    const confirmedWorkflow = workflow(WORKFLOW_A, {
      currentStage: 'CONFIRMED',
      confirmedSnapshotId: 'snapshot-001',
      currentOcrTaskId: null,
    });

    await store.hydrateWorkflow(WORKFLOW_A, {
      fetchWorkflow: async () => confirmedWorkflow,
      fetchSnapshot: async () => snapshot(WORKFLOW_A),
    });

    expect(store.status).toBe('READY');
    expect(store.activeWorkflowId).toBe(WORKFLOW_A);
    expect(store.workflow).toEqual(confirmedWorkflow);
    expect(store.confirmedSnapshot?.snapshotId).toBe('snapshot-001');
    expect(sessionStorage.getItem(WORKFLOW_ID_KEY)).toBe(WORKFLOW_A);
  });

  it('does not fall back to a session workflow when an explicit workflow id is invalid', async () => {
    sessionStorage.setItem(WORKFLOW_ID_KEY, WORKFLOW_B);
    const store = useOcrWorkflowStore();

    await expect(store.hydrateWorkflow('not-a-workflow')).rejects.toThrow('工作流 ID 无效');

    expect(store.status).toBe('ERROR');
    expect(store.workflow).toBeNull();
    expect(store.activeWorkflowId).toBe('not-a-workflow');
    expect(sessionStorage.getItem(WORKFLOW_ID_KEY)).toBe(WORKFLOW_B);
  });

  it('preserves the current review draft only when it belongs to the hydrated workflow', async () => {
    const store = useOcrWorkflowStore();
    const draft = reviewDraft();
    store.setReviewDraft(draft);

    await store.hydrateWorkflow(WORKFLOW_A, {
      fetchWorkflow: async () => workflow(WORKFLOW_A, { currentOcrTaskId: 'ocr-001' }),
    });
    expect(store.reviewDraft).toEqual(draft);

    await store.hydrateWorkflow(WORKFLOW_B, {
      fetchWorkflow: async () => workflow(WORKFLOW_B, { currentOcrTaskId: 'ocr-999' }),
    });
    expect(store.reviewDraft).toBeNull();
  });

  it('suppresses stale hydration responses from another workflow', async () => {
    const store = useOcrWorkflowStore();
    const first = createDeferred<OcrWorkflowAggregate>();
    const second = createDeferred<OcrWorkflowAggregate>();

    const firstHydration = store.hydrateWorkflow(WORKFLOW_A, {
      fetchWorkflow: async () => first.promise,
    });
    const secondHydration = store.hydrateWorkflow(WORKFLOW_B, {
      fetchWorkflow: async () => second.promise,
    });

    second.resolve(workflow(WORKFLOW_B));
    await expect(secondHydration).resolves.toMatchObject({ workflowId: WORKFLOW_B });
    first.resolve(workflow(WORKFLOW_A));
    await expect(firstHydration).resolves.toBeNull();

    expect(store.status).toBe('READY');
    expect(store.activeWorkflowId).toBe(WORKFLOW_B);
    expect(store.workflow?.workflowId).toBe(WORKFLOW_B);
  });

  it('blocks a confirmed snapshot that belongs to another workflow', async () => {
    const store = useOcrWorkflowStore();

    await expect(store.hydrateWorkflow(WORKFLOW_A, {
      fetchWorkflow: async () => workflow(WORKFLOW_A, {
        currentStage: 'CONFIRMED',
        confirmedSnapshotId: 'snapshot-001',
      }),
      fetchSnapshot: async () => snapshot(WORKFLOW_B),
    })).rejects.toThrow('工作流与确认快照不匹配');

    expect(store.status).toBe('ERROR');
    expect(store.confirmedSnapshot).toBeNull();
  });
});
