import { createOcrWorkflow, normalizeCreateOcrWorkflowRequest } from '@/api/ocrWorkflow';
import type { CreateOcrWorkflowRequest, OcrWorkflowAggregate } from '@/types/ocrWorkflow';

export const WORKFLOW_ID_KEY = 'football-lab:v2:workflowId';
export const PENDING_CREATE_KEY = 'football-lab:v2:pendingCreate';

export interface PendingCreateWorkflow {
  idempotencyKey: string;
  request: CreateOcrWorkflowRequest;
}

export type CreateWorkflowSender = (
  request: CreateOcrWorkflowRequest,
  idempotencyKey: string,
) => Promise<OcrWorkflowAggregate>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]);
}

function isWorkflowId(value: unknown): value is string {
  return typeof value === 'string' && /^workflow-[0-9a-f-]{36}$/i.test(value);
}

function isCreateRequest(value: unknown): value is CreateOcrWorkflowRequest {
  if (!isRecord(value)) return false;
  if (!hasExactKeys(value, ['sourceDeclaration', 'sourcePolicyVersion', 'contentType', 'byteSize', 'width', 'height'])) {
    return false;
  }
  return (
    (value.sourceDeclaration === 'FICTIONAL_SAMPLE' || value.sourceDeclaration === 'USER_OWNED_AUTHORIZED')
    && value.sourcePolicyVersion === 'SOURCE_POLICY_V2'
    && ['image/png', 'image/jpeg', 'image/webp'].includes(String(value.contentType))
    && typeof value.byteSize === 'number'
    && Number.isFinite(value.byteSize)
    && typeof value.width === 'number'
    && Number.isFinite(value.width)
    && typeof value.height === 'number'
    && Number.isFinite(value.height)
  );
}

function isPendingCreate(value: unknown): value is PendingCreateWorkflow {
  if (!isRecord(value)) return false;
  if (!hasExactKeys(value, ['idempotencyKey', 'request'])) return false;
  return typeof value.idempotencyKey === 'string'
    && UUID_PATTERN.test(value.idempotencyKey)
    && isCreateRequest(value.request);
}

export function saveWorkflowId(workflowId: string): void {
  if (!isWorkflowId(workflowId)) return;
  storage()?.setItem(WORKFLOW_ID_KEY, workflowId);
}

export function readWorkflowId(): string | null {
  const session = storage();
  const value = session?.getItem(WORKFLOW_ID_KEY) ?? null;
  if (value === null) return null;
  if (!isWorkflowId(value)) {
    session?.removeItem(WORKFLOW_ID_KEY);
    return null;
  }
  return value;
}

export function clearWorkflowId(): void {
  storage()?.removeItem(WORKFLOW_ID_KEY);
}

export function savePendingCreate(pending: PendingCreateWorkflow): void {
  storage()?.setItem(PENDING_CREATE_KEY, JSON.stringify({
    idempotencyKey: pending.idempotencyKey,
    request: normalizeCreateOcrWorkflowRequest(pending.request),
  }));
}

export function readPendingCreate(): PendingCreateWorkflow | null {
  const session = storage();
  const value = session?.getItem(PENDING_CREATE_KEY) ?? null;
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isPendingCreate(parsed)) {
      session?.removeItem(PENDING_CREATE_KEY);
      return null;
    }
    return {
      idempotencyKey: parsed.idempotencyKey,
      request: normalizeCreateOcrWorkflowRequest(parsed.request),
    };
  } catch {
    session?.removeItem(PENDING_CREATE_KEY);
    return null;
  }
}

export function clearPendingCreate(): void {
  storage()?.removeItem(PENDING_CREATE_KEY);
}

export async function createWorkflowWithPendingSession(
  request: CreateOcrWorkflowRequest,
  idempotencyKey: string,
  sender: CreateWorkflowSender = createOcrWorkflow,
): Promise<OcrWorkflowAggregate> {
  const pending = {
    idempotencyKey,
    request: normalizeCreateOcrWorkflowRequest(request),
  };
  savePendingCreate(pending);
  const workflow = await sender(pending.request, pending.idempotencyKey);
  saveWorkflowId(workflow.workflowId);
  clearPendingCreate();
  return workflow;
}

export async function replayPendingCreate(
  sender: CreateWorkflowSender = createOcrWorkflow,
): Promise<OcrWorkflowAggregate | null> {
  const pending = readPendingCreate();
  if (pending === null) return null;
  const workflow = await sender(pending.request, pending.idempotencyKey);
  saveWorkflowId(workflow.workflowId);
  clearPendingCreate();
  return workflow;
}
