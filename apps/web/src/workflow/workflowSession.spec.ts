import { beforeEach, describe, expect, it } from 'vitest';

import type { CreateOcrWorkflowRequest, OcrWorkflowAggregate } from '@/types/ocrWorkflow';

import {
  PENDING_CREATE_KEY,
  WORKFLOW_ID_KEY,
  createWorkflowWithPendingSession,
  readPendingCreate,
  readWorkflowId,
  replayPendingCreate,
} from './workflowSession';

const REQUEST: CreateOcrWorkflowRequest = {
  sourceDeclaration: 'FICTIONAL_SAMPLE',
  sourcePolicyVersion: 'SOURCE_POLICY_V2',
  contentType: 'image/png',
  byteSize: 1234,
  width: 1200,
  height: 800,
};

const WORKFLOW: OcrWorkflowAggregate = {
  workflowId: 'workflow-550e8400-e29b-41d4-a716-446655440000',
  currentStage: 'WAITING_LOCAL_OCR',
  version: 0,
  screenshotTaskId: 'screenshot-550e8400-e29b-41d4-a716-446655440001',
  currentOcrTaskId: null,
  confirmedSnapshotId: null,
  currentReportId: null,
  currentPlanId: null,
  createdAt: '2026-08-22T12:00:00+08:00',
  updatedAt: '2026-08-22T12:00:00+08:00',
};

describe('workflow session persistence', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('writes pending create synchronously before fetch and clears it after success', async () => {
    const sender = async (request: CreateOcrWorkflowRequest, idempotencyKey: string) => {
      expect(readPendingCreate()).toEqual({ request: REQUEST, idempotencyKey });
      expect(JSON.stringify(request)).toBe(JSON.stringify(REQUEST));
      return WORKFLOW;
    };

    await expect(createWorkflowWithPendingSession(
      REQUEST,
      '550e8400-e29b-41d4-a716-446655440002',
      sender,
    )).resolves.toEqual(WORKFLOW);

    expect(sessionStorage.getItem(PENDING_CREATE_KEY)).toBeNull();
    expect(readWorkflowId()).toBe(WORKFLOW.workflowId);
  });

  it('keeps pending create after a lost response and replays the same normalized request', async () => {
    const key = '550e8400-e29b-41d4-a716-446655440003';
    const lostResponse = new Error('network lost after server commit');
    const failingSender = async () => {
      throw lostResponse;
    };

    await expect(createWorkflowWithPendingSession(REQUEST, key, failingSender))
      .rejects.toThrow(lostResponse);
    const stored = sessionStorage.getItem(PENDING_CREATE_KEY);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored as string)).toEqual({ idempotencyKey: key, request: REQUEST });

    const replaySender = async (request: CreateOcrWorkflowRequest, idempotencyKey: string) => {
      expect(idempotencyKey).toBe(key);
      expect(JSON.stringify(request)).toBe(JSON.stringify(REQUEST));
      return WORKFLOW;
    };

    await expect(replayPendingCreate(replaySender)).resolves.toEqual(WORKFLOW);
    expect(sessionStorage.getItem(PENDING_CREATE_KEY)).toBeNull();
    expect(readWorkflowId()).toBe(WORKFLOW.workflowId);
  });

  it('rejects malformed session values instead of inferring hidden request data', () => {
    sessionStorage.setItem(WORKFLOW_ID_KEY, 'not-a-workflow-id');
    sessionStorage.setItem(PENDING_CREATE_KEY, JSON.stringify({
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440004',
      request: {
        ...REQUEST,
        hiddenName: 'private.png',
      },
    }));

    expect(readWorkflowId()).toBeNull();
    expect(readPendingCreate()).toBeNull();
    expect(sessionStorage.getItem(WORKFLOW_ID_KEY)).toBeNull();
    expect(sessionStorage.getItem(PENDING_CREATE_KEY)).toBeNull();
  });
});
