import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearPendingWrite,
  createWorkflowWithPendingSession,
  pendingWriteStorageKey,
  readPendingWrite,
  savePendingWrite,
} from './workflowSession';

const WORKFLOW_ID = 'workflow-550e8400-e29b-41d4-a716-446655440000';
const OTHER_WORKFLOW_ID = 'workflow-550e8400-e29b-41d4-a716-446655440001';
const OPERATION_KEY = '550e8400-e29b-41d4-a716-446655440010';

const analysisOptions = {
  targetTicketCount: 3,
  minTicketCount: 2,
  maxTicketCount: 4,
  mainTicketRatio: 0.6,
  defensiveTicketRatio: 0.3,
  entertainmentTicketRatio: 0.1,
  enableEntertainmentTicket: true,
  entertainmentTicketMaxCost: 2,
  maxParlayLegs: 2,
  minPayoutRequirement: null,
  allowLowReturnTicket: false,
  upsetCoverageLevel: 'BALANCED',
} as const;

describe('workflow pending sessions', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('keeps the existing create workflow request durable until the response succeeds', async () => {
    const sender = async () => {
      expect(sessionStorage.getItem('football-lab:v2:pendingCreate')).not.toBeNull();
      return {
        workflowId: WORKFLOW_ID,
        currentStage: 'WAITING_LOCAL_OCR' as const,
        version: 0,
        screenshotTaskId: null,
        currentOcrTaskId: null,
        confirmedSnapshotId: null,
        currentReportId: null,
        currentPlanId: null,
        createdAt: '2026-08-24T00:00:00Z',
        updatedAt: '2026-08-24T00:00:00Z',
      };
    };

    await createWorkflowWithPendingSession({
      sourceDeclaration: 'FICTIONAL_SAMPLE',
      sourcePolicyVersion: 'SOURCE_POLICY_V2',
      contentType: 'image/png',
      byteSize: 1024,
      width: 100,
      height: 100,
    }, OPERATION_KEY, sender);

    expect(sessionStorage.getItem('football-lab:v2:pendingCreate')).toBeNull();
  });

  it('stores a workflow-scoped normalized analysis write without authority or sensitive content', () => {
    savePendingWrite({
      operationType: 'GENERATE_ANALYSIS',
      workflowId: WORKFLOW_ID,
      idempotencyKey: OPERATION_KEY,
      request: {
        snapshotId: 'snapshot-001',
        engineMode: 'MOCK_RULE_ENGINE',
        analysisOptions,
        sourceType: 'USER_SCREENSHOT_CONFIRMED',
        budgetAmount: 30,
        matches: [{ homeTeam: 'secret-home' }],
        markets: [{ selection: 'HOME_WIN' }],
        rawText: 'secret-ocr',
        apiKey: 'secret-key',
      } as never,
      recoveryState: 'SAME_KEY_REQUIRED',
      errorCode: null,
    });

    const raw = sessionStorage.getItem(pendingWriteStorageKey(WORKFLOW_ID));
    expect(raw).not.toBeNull();
    expect(raw).not.toMatch(/sourceType|budgetAmount|matches|markets|rawText|apiKey|secret/i);
    expect(readPendingWrite(WORKFLOW_ID)).toEqual({
      operationType: 'GENERATE_ANALYSIS',
      workflowId: WORKFLOW_ID,
      idempotencyKey: OPERATION_KEY,
      request: {
        snapshotId: 'snapshot-001',
        engineMode: 'MOCK_RULE_ENGINE',
        analysisOptions,
      },
      recoveryState: 'SAME_KEY_REQUIRED',
      errorCode: null,
    });
    expect(readPendingWrite(OTHER_WORKFLOW_ID)).toBeNull();
  });

  it('round-trips exact generate-plan and trimmed save-plan writes', () => {
    savePendingWrite({
      operationType: 'GENERATE_PLAN',
      workflowId: WORKFLOW_ID,
      idempotencyKey: OPERATION_KEY,
      request: { reportId: 'analysis-001', snapshotId: 'rogue' } as never,
      recoveryState: 'SAME_KEY_REQUIRED',
      errorCode: 'UNKNOWN_RESPONSE',
    });
    expect(readPendingWrite(WORKFLOW_ID)?.request).toEqual({ reportId: 'analysis-001' });

    savePendingWrite({
      operationType: 'SAVE_PLAN',
      workflowId: WORKFLOW_ID,
      idempotencyKey: OPERATION_KEY,
      request: {
        generatedPlanId: 'sim-plan-001',
        operatorNote: '  wait for public result  ',
        items: [{ matchId: 'rogue' }],
      } as never,
      recoveryState: 'NEW_KEY_REQUIRED',
      errorCode: 'OPERATION_INTERRUPTED',
    });
    expect(readPendingWrite(WORKFLOW_ID)).toMatchObject({
      operationType: 'SAVE_PLAN',
      request: {
        generatedPlanId: 'sim-plan-001',
        operatorNote: 'wait for public result',
      },
      recoveryState: 'NEW_KEY_REQUIRED',
      errorCode: 'OPERATION_INTERRUPTED',
    });
  });

  it.each([
    ['invalid UUID', { idempotencyKey: 'not-a-uuid' }],
    ['extra envelope key', { rogue: true }],
    ['invalid request shape', { request: { reportId: 'analysis-001', snapshotId: 'rogue' } }],
  ])('removes corrupted pending write: %s', (_label, override) => {
    const key = pendingWriteStorageKey(WORKFLOW_ID);
    sessionStorage.setItem(key, JSON.stringify({
      operationType: 'GENERATE_PLAN',
      workflowId: WORKFLOW_ID,
      idempotencyKey: OPERATION_KEY,
      request: { reportId: 'analysis-001' },
      recoveryState: 'SAME_KEY_REQUIRED',
      errorCode: null,
      ...override,
    }));

    expect(readPendingWrite(WORKFLOW_ID)).toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it('clears only the requested workflow pending write', () => {
    savePendingWrite({
      operationType: 'GENERATE_PLAN',
      workflowId: WORKFLOW_ID,
      idempotencyKey: OPERATION_KEY,
      request: { reportId: 'analysis-001' },
      recoveryState: 'SAME_KEY_REQUIRED',
      errorCode: null,
    });
    clearPendingWrite(WORKFLOW_ID);
    expect(readPendingWrite(WORKFLOW_ID)).toBeNull();
  });
});
