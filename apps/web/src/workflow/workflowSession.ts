import { createOcrWorkflow, normalizeCreateOcrWorkflowRequest } from '@/api/ocrWorkflow';
import { normalizeAnalysisGeneratePayload } from '@/api/analysis';
import {
  normalizeSimulatedPlanSavePayload,
  normalizeStrategySimulationPayload,
} from '@/api/simulatedPlans';
import type { AnalysisGeneratePayload, AnalysisOptions } from '@/types/analysis';
import type { CreateOcrWorkflowRequest, OcrWorkflowAggregate } from '@/types/ocrWorkflow';
import type {
  SimulatedPlanSavePayload,
  StrategySimulationPayload,
} from '@/types/simulatedPlan';

export const WORKFLOW_ID_KEY = 'football-lab:v2:workflowId';
export const PENDING_CREATE_KEY = 'football-lab:v2:pendingCreate';
export const PENDING_WRITE_PREFIX = 'football-lab:v2:pendingWrite';

export interface PendingCreateWorkflow {
  idempotencyKey: string;
  request: CreateOcrWorkflowRequest;
}

export type PendingWriteRecoveryState = 'SAME_KEY_REQUIRED' | 'NEW_KEY_REQUIRED';
export type PendingWriteOperationType = 'GENERATE_ANALYSIS' | 'GENERATE_PLAN' | 'SAVE_PLAN';

interface PendingWriteBase {
  workflowId: string;
  idempotencyKey: string;
  recoveryState: PendingWriteRecoveryState;
  errorCode: string | null;
}

export type PendingWriteOperation =
  | (PendingWriteBase & {
      operationType: 'GENERATE_ANALYSIS';
      request: AnalysisGeneratePayload;
    })
  | (PendingWriteBase & {
      operationType: 'GENERATE_PLAN';
      request: StrategySimulationPayload;
    })
  | (PendingWriteBase & {
      operationType: 'SAVE_PLAN';
      request: SimulatedPlanSavePayload;
    });

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

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

const ANALYSIS_OPTION_KEYS = [
  'targetTicketCount',
  'minTicketCount',
  'maxTicketCount',
  'mainTicketRatio',
  'defensiveTicketRatio',
  'entertainmentTicketRatio',
  'enableEntertainmentTicket',
  'entertainmentTicketMaxCost',
  'maxParlayLegs',
  'minPayoutRequirement',
  'allowLowReturnTicket',
  'upsetCoverageLevel',
] as const;

function isAnalysisOptions(value: unknown): value is AnalysisOptions | null {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  if (Object.keys(value).some((key) => !ANALYSIS_OPTION_KEYS.includes(key as never))) return false;
  const numberKeys = [
    'targetTicketCount',
    'minTicketCount',
    'maxTicketCount',
    'mainTicketRatio',
    'defensiveTicketRatio',
    'entertainmentTicketRatio',
    'entertainmentTicketMaxCost',
    'maxParlayLegs',
  ];
  if (numberKeys.some((key) => value[key] !== undefined && !isFiniteNumber(value[key]))) return false;
  if (value.minPayoutRequirement !== undefined
    && value.minPayoutRequirement !== null
    && !isFiniteNumber(value.minPayoutRequirement)) return false;
  if (value.enableEntertainmentTicket !== undefined
    && typeof value.enableEntertainmentTicket !== 'boolean') return false;
  if (value.allowLowReturnTicket !== undefined && typeof value.allowLowReturnTicket !== 'boolean') return false;
  return value.upsetCoverageLevel === undefined
    || ['NONE', 'LIGHT', 'BALANCED', 'STRONG'].includes(String(value.upsetCoverageLevel));
}

function isAnalysisRequest(value: unknown): value is AnalysisGeneratePayload {
  if (!isRecord(value) || !isNonBlankString(value.snapshotId)) return false;
  if (value.engineMode === 'MOCK_RULE_ENGINE') {
    return hasExactKeys(value, ['snapshotId', 'engineMode', 'analysisOptions'])
      && isAnalysisOptions(value.analysisOptions);
  }
  return value.engineMode === 'OPENAI_COMPATIBLE'
    && hasExactKeys(value, [
      'snapshotId',
      'engineMode',
      'providerKey',
      'modelId',
      'promptVersion',
      'analysisOptions',
    ])
    && isNonBlankString(value.providerKey)
    && isNonBlankString(value.modelId)
    && value.promptVersion === 'danche-prediction-v1'
    && isAnalysisOptions(value.analysisOptions);
}

function isGeneratePlanRequest(value: unknown): value is StrategySimulationPayload {
  return isRecord(value)
    && hasExactKeys(value, ['reportId'])
    && isNonBlankString(value.reportId);
}

function isSavePlanRequest(value: unknown): value is SimulatedPlanSavePayload {
  return isRecord(value)
    && hasExactKeys(value, ['generatedPlanId', 'operatorNote'])
    && isNonBlankString(value.generatedPlanId)
    && typeof value.operatorNote === 'string'
    && value.operatorNote === value.operatorNote.trim();
}

function isPendingWrite(value: unknown): value is PendingWriteOperation {
  if (!isRecord(value)) return false;
  if (!hasExactKeys(value, [
    'operationType',
    'workflowId',
    'idempotencyKey',
    'request',
    'recoveryState',
    'errorCode',
  ])) return false;
  if (!isWorkflowId(value.workflowId)
    || typeof value.idempotencyKey !== 'string'
    || !UUID_PATTERN.test(value.idempotencyKey)
    || !['SAME_KEY_REQUIRED', 'NEW_KEY_REQUIRED'].includes(String(value.recoveryState))
    || !(value.errorCode === null || typeof value.errorCode === 'string')) return false;
  if (value.operationType === 'GENERATE_ANALYSIS') return isAnalysisRequest(value.request);
  if (value.operationType === 'GENERATE_PLAN') return isGeneratePlanRequest(value.request);
  if (value.operationType === 'SAVE_PLAN') return isSavePlanRequest(value.request);
  return false;
}

export function pendingWriteStorageKey(workflowId: string): string {
  return `${PENDING_WRITE_PREFIX}:${workflowId}`;
}

function normalizePendingWrite(pending: PendingWriteOperation): PendingWriteOperation {
  const base = {
    workflowId: pending.workflowId,
    idempotencyKey: pending.idempotencyKey,
    recoveryState: pending.recoveryState,
    errorCode: pending.errorCode,
  };
  if (pending.operationType === 'GENERATE_ANALYSIS') {
    return {
      ...base,
      operationType: pending.operationType,
      request: normalizeAnalysisGeneratePayload(pending.request),
    };
  }
  if (pending.operationType === 'GENERATE_PLAN') {
    return {
      ...base,
      operationType: pending.operationType,
      request: normalizeStrategySimulationPayload(pending.request),
    };
  }
  return {
    ...base,
    operationType: pending.operationType,
    request: normalizeSimulatedPlanSavePayload(pending.request),
  };
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

export function savePendingWrite(pending: PendingWriteOperation): void {
  const normalized = normalizePendingWrite(pending);
  if (!isPendingWrite(normalized)) return;
  storage()?.setItem(pendingWriteStorageKey(normalized.workflowId), JSON.stringify(normalized));
}

export function readPendingWrite(workflowId: string): PendingWriteOperation | null {
  if (!isWorkflowId(workflowId)) return null;
  const session = storage();
  const key = pendingWriteStorageKey(workflowId);
  const value = session?.getItem(key) ?? null;
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isPendingWrite(parsed) || parsed.workflowId !== workflowId) {
      session?.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    session?.removeItem(key);
    return null;
  }
}

export function clearPendingWrite(workflowId: string): void {
  if (!isWorkflowId(workflowId)) return;
  storage()?.removeItem(pendingWriteStorageKey(workflowId));
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
