import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { useOcrWorkflowStore } from '@/stores/ocrWorkflow';
import type { OcrWorkflowAggregate, UserConfirmedSnapshot, WorkflowStage } from '@/types/ocrWorkflow';

const WORKFLOW_A = 'workflow-550e8400-e29b-41d4-a716-446655440001';
const WORKFLOW_B = 'workflow-550e8400-e29b-41d4-a716-446655440002';

function workflow(
  workflowId: string,
  currentStage: WorkflowStage,
  overrides: Partial<OcrWorkflowAggregate> = {},
): OcrWorkflowAggregate {
  return {
    workflowId,
    currentStage,
    version: 1,
    screenshotTaskId: 'screenshot-001',
    currentOcrTaskId: null,
    confirmedSnapshotId: null,
    currentReportId: null,
    currentPlanId: null,
    createdAt: '2026-08-24T00:00:00Z',
    updatedAt: '2026-08-24T00:00:00Z',
    ...overrides,
  };
}

function snapshot(
  workflowId: string,
  overrides: Partial<UserConfirmedSnapshot> = {},
): UserConfirmedSnapshot {
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
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('ocrWorkflow authoritative hydration', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    sessionStorage.clear();
  });

  it.each([
    ['CONFIRMED', null, null],
    ['ANALYSIS_GENERATED', 'analysis-001', null],
    ['PLAN_GENERATED', 'analysis-001', 'sim-plan-001'],
    ['PENDING_RESULT', 'analysis-001', 'sim-plan-001'],
  ] as const)('hydrates valid %s IDs and owned snapshot', async (stage, reportId, planId) => {
    const store = useOcrWorkflowStore();
    const aggregate = workflow(WORKFLOW_A, stage, {
      confirmedSnapshotId: 'snapshot-001',
      currentReportId: reportId,
      currentPlanId: planId,
    });

    await store.hydrateWorkflow(WORKFLOW_A, {
      fetchWorkflow: async () => aggregate,
      fetchSnapshot: async () => snapshot(WORKFLOW_A),
    });

    expect(store.status).toBe('READY');
    expect(store.workflow).toEqual(aggregate);
    expect(store.confirmedSnapshot?.snapshotId).toBe('snapshot-001');
  });

  it.each([
    ['CONFIRMED', null, null, null],
    ['CONFIRMED', 'snapshot-001', 'analysis-001', null],
    ['ANALYSIS_GENERATED', 'snapshot-001', null, null],
    ['ANALYSIS_GENERATED', 'snapshot-001', 'analysis-001', 'sim-plan-001'],
    ['PLAN_GENERATED', 'snapshot-001', 'analysis-001', null],
    ['PENDING_RESULT', 'snapshot-001', null, 'sim-plan-001'],
  ] as const)(
    'rejects invalid %s ID combination (%s, %s, %s)',
    async (stage, snapshotId, reportId, planId) => {
      const store = useOcrWorkflowStore();
      await expect(store.hydrateWorkflow(WORKFLOW_A, {
        fetchWorkflow: async () => workflow(WORKFLOW_A, stage, {
          confirmedSnapshotId: snapshotId,
          currentReportId: reportId,
          currentPlanId: planId,
        }),
        fetchSnapshot: async () => snapshot(WORKFLOW_A),
      })).rejects.toThrow(/阶段|ID|工作流/);
    },
  );

  it.each([
    ['missing workflowId', { workflowId: null }],
    ['legacy schema', { schemaVersion: 'LEGACY_V1' as const }],
    ['missing authority', { authorityType: null }],
    ['wrong source', { sourceType: 'LEGACY_SOURCE' as never }],
    ['wrong status', { snapshotStatus: 'DRAFT' as never }],
    ['analysis disallowed', { analysisAllowed: false }],
  ])('fails closed for non-v2 confirmed snapshot: %s', async (_label, overrides) => {
    const store = useOcrWorkflowStore();
    const aggregate = workflow(WORKFLOW_A, 'CONFIRMED', {
      confirmedSnapshotId: 'snapshot-001',
    });

    await expect(store.hydrateWorkflow(WORKFLOW_A, {
      fetchWorkflow: async () => aggregate,
      fetchSnapshot: async () => snapshot(WORKFLOW_A, overrides),
    })).rejects.toThrow(/快照|工作流|authority/i);
  });

  it('requires ABANDONED authority IDs to be null while allowing the tombstoned task reference', async () => {
    const store = useOcrWorkflowStore();
    await expect(store.hydrateWorkflow(WORKFLOW_A, {
      fetchWorkflow: async () => workflow(WORKFLOW_A, 'ABANDONED', {
        currentOcrTaskId: 'ocr-tombstone-reference',
        confirmedSnapshotId: 'snapshot-001',
        currentReportId: 'analysis-001',
        currentPlanId: 'sim-plan-001',
      }),
      fetchSnapshot: async () => snapshot(WORKFLOW_A),
    })).rejects.toThrow(/阶段|ID/);
  });

  it('refreshes without clearing current entities or switching to loading', async () => {
    const store = useOcrWorkflowStore();
    const current = workflow(WORKFLOW_A, 'CONFIRMED', { confirmedSnapshotId: 'snapshot-001' });
    await store.hydrateWorkflow(WORKFLOW_A, {
      fetchWorkflow: async () => current,
      fetchSnapshot: async () => snapshot(WORKFLOW_A),
    });
    const pending = deferred<OcrWorkflowAggregate>();

    const refresh = store.refreshActiveWorkflow({
      fetchWorkflow: async () => pending.promise,
      fetchSnapshot: async () => snapshot(WORKFLOW_A),
    });

    expect(store.status).toBe('READY');
    expect(store.workflow).toEqual(current);
    expect(store.confirmedSnapshot?.snapshotId).toBe('snapshot-001');

    const refreshed = workflow(WORKFLOW_A, 'ANALYSIS_GENERATED', {
      version: 2,
      confirmedSnapshotId: 'snapshot-001',
      currentReportId: 'analysis-001',
    });
    pending.resolve(refreshed);
    await refresh;
    expect(store.workflow).toEqual(refreshed);
  });

  it('does not let an old refresh overwrite a newer workflow hydration', async () => {
    const store = useOcrWorkflowStore();
    const initial = workflow(WORKFLOW_A, 'CONFIRMED', { confirmedSnapshotId: 'snapshot-001' });
    await store.hydrateWorkflow(WORKFLOW_A, {
      fetchWorkflow: async () => initial,
      fetchSnapshot: async () => snapshot(WORKFLOW_A),
    });
    const stale = deferred<OcrWorkflowAggregate>();
    const refresh = store.refreshActiveWorkflow({
      fetchWorkflow: async () => stale.promise,
      fetchSnapshot: async () => snapshot(WORKFLOW_A),
    });

    const newer = workflow(WORKFLOW_B, 'ANALYSIS_GENERATED', {
      confirmedSnapshotId: 'snapshot-001',
      currentReportId: 'analysis-002',
    });
    await store.hydrateWorkflow(WORKFLOW_B, {
      fetchWorkflow: async () => newer,
      fetchSnapshot: async () => snapshot(WORKFLOW_B),
    });
    stale.resolve(workflow(WORKFLOW_A, 'PENDING_RESULT', {
      confirmedSnapshotId: 'snapshot-001',
      currentReportId: 'analysis-stale',
      currentPlanId: 'sim-plan-stale',
    }));
    await refresh;

    expect(store.activeWorkflowId).toBe(WORKFLOW_B);
    expect(store.workflow).toEqual(newer);
    expect(store.confirmedSnapshot?.workflowId).toBe(WORKFLOW_B);
  });

  it('rejects a non-v2 snapshot during refresh without replacing current entities', async () => {
    const store = useOcrWorkflowStore();
    const initial = workflow(WORKFLOW_A, 'CONFIRMED', { confirmedSnapshotId: 'snapshot-001' });
    await store.hydrateWorkflow(WORKFLOW_A, {
      fetchWorkflow: async () => initial,
      fetchSnapshot: async () => snapshot(WORKFLOW_A),
    });

    await expect(store.refreshActiveWorkflow({
      fetchWorkflow: async () => workflow(WORKFLOW_A, 'CONFIRMED', {
        version: 2,
        confirmedSnapshotId: 'snapshot-002',
      }),
      fetchSnapshot: async () => snapshot(WORKFLOW_A, {
        snapshotId: 'snapshot-002',
        schemaVersion: 'LEGACY_V1',
      }),
    })).rejects.toThrow(/快照|authority/i);

    expect(store.workflow).toEqual(initial);
    expect(store.confirmedSnapshot?.snapshotId).toBe('snapshot-001');
  });
});
