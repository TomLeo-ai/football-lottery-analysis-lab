import { requestJson } from '@/api/http';
import type {
  ConfirmOcrReviewDraftRequest,
  CreateOcrWorkflowRequest,
  DraftMarketRequest,
  DraftMatchRequest,
  OcrCandidateFieldRequest,
  OcrReviewDraftResponse,
  OcrTask,
  OcrWorkflowAggregate,
  ParseOcrCandidatesRequest,
  SaveOcrReviewDraftRequest,
  UserConfirmedSnapshot,
} from '@/types/ocrWorkflow';

const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

function idempotencyHeaders(idempotencyKey: string): Record<string, string> {
  return { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey };
}

export function normalizeCreateOcrWorkflowRequest(
  request: CreateOcrWorkflowRequest,
): CreateOcrWorkflowRequest {
  return {
    sourceDeclaration: request.sourceDeclaration,
    sourcePolicyVersion: request.sourcePolicyVersion,
    contentType: request.contentType,
    byteSize: request.byteSize,
    width: request.width,
    height: request.height,
  };
}

function normalizeCandidateField(field: OcrCandidateFieldRequest): OcrCandidateFieldRequest {
  return {
    fieldId: field.fieldId,
    scope: field.scope,
    fieldName: field.fieldName,
    value: field.value,
    ...(field.matchRef === undefined ? {} : { matchRef: field.matchRef }),
    ...(field.confidence === undefined ? {} : { confidence: field.confidence }),
    ...(field.boundingBox === undefined ? {} : {
      boundingBox: {
        x: field.boundingBox.x,
        y: field.boundingBox.y,
        width: field.boundingBox.width,
        height: field.boundingBox.height,
      },
    }),
  };
}

export function normalizeParseOcrCandidatesRequest(
  request: ParseOcrCandidatesRequest,
): ParseOcrCandidatesRequest {
  return {
    expectedVersion: request.expectedVersion,
    entryMode: request.entryMode,
    replaceDraft: request.replaceDraft,
    ...(request.ocrEngine === undefined ? {} : { ocrEngine: request.ocrEngine }),
    ...(request.ocrEngineVersion === undefined ? {} : { ocrEngineVersion: request.ocrEngineVersion }),
    languages: [...request.languages],
    processedWidth: request.processedWidth,
    processedHeight: request.processedHeight,
    candidateFields: request.candidateFields.map(normalizeCandidateField),
  };
}

function normalizeMatch(match: DraftMatchRequest): DraftMatchRequest {
  return {
    matchId: match.matchId,
    matchDate: match.matchDate,
    league: match.league,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    kickoffTime: match.kickoffTime,
  };
}

function normalizeMarket(market: DraftMarketRequest): DraftMarketRequest {
  return {
    marketId: market.marketId,
    matchId: market.matchId,
    playType: market.playType,
    selection: market.selection,
    odds: market.odds,
  };
}

export function normalizeSaveOcrReviewDraftRequest(
  request: SaveOcrReviewDraftRequest,
): SaveOcrReviewDraftRequest {
  return {
    expectedRevision: request.expectedRevision,
    riskPreference: request.riskPreference,
    budgetAmount: request.budgetAmount,
    currency: request.currency,
    matches: request.matches.map(normalizeMatch),
    markets: request.markets.map(normalizeMarket),
  };
}

export function createOcrWorkflow(
  request: CreateOcrWorkflowRequest,
  idempotencyKey: string,
): Promise<OcrWorkflowAggregate> {
  return requestJson<OcrWorkflowAggregate>('/api/ocr/workflows', {
    method: 'POST',
    headers: idempotencyHeaders(idempotencyKey),
    body: normalizeCreateOcrWorkflowRequest(request),
  });
}

export function getOcrWorkflow(workflowId: string): Promise<OcrWorkflowAggregate> {
  return requestJson<OcrWorkflowAggregate>(`/api/ocr/workflows/${encodeURIComponent(workflowId)}`);
}

export function parseOcrCandidates(
  workflowId: string,
  request: ParseOcrCandidatesRequest,
  idempotencyKey: string,
): Promise<OcrTask> {
  return requestJson<OcrTask>(`/api/ocr/workflows/${encodeURIComponent(workflowId)}/ocr-candidates`, {
    method: 'POST',
    headers: idempotencyHeaders(idempotencyKey),
    body: normalizeParseOcrCandidatesRequest(request),
  });
}

export function saveOcrReviewDraft(
  ocrTaskId: string,
  request: SaveOcrReviewDraftRequest,
  idempotencyKey: string,
): Promise<OcrReviewDraftResponse> {
  return requestJson<OcrReviewDraftResponse>(`/api/ocr/review-drafts/${encodeURIComponent(ocrTaskId)}`, {
    method: 'PUT',
    headers: idempotencyHeaders(idempotencyKey),
    body: normalizeSaveOcrReviewDraftRequest(request),
  });
}

export function confirmOcrReviewDraft(
  ocrTaskId: string,
  request: ConfirmOcrReviewDraftRequest,
  idempotencyKey: string,
): Promise<UserConfirmedSnapshot> {
  return requestJson<UserConfirmedSnapshot>(`/api/ocr/review-drafts/${encodeURIComponent(ocrTaskId)}/confirm`, {
    method: 'POST',
    headers: idempotencyHeaders(idempotencyKey),
    body: {
      expectedRevision: request.expectedRevision,
    },
  });
}

export function getConfirmedSnapshot(snapshotId: string): Promise<UserConfirmedSnapshot> {
  return requestJson<UserConfirmedSnapshot>(`/api/ocr/snapshots/${encodeURIComponent(snapshotId)}`);
}

export function abandonOcrWorkflow(workflowId: string, idempotencyKey: string): Promise<void> {
  return requestJson<void>(`/api/ocr/workflows/${encodeURIComponent(workflowId)}`, {
    method: 'DELETE',
    headers: idempotencyHeaders(idempotencyKey),
  });
}

