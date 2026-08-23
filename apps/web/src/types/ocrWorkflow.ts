import type {
  CandidateBatch,
  DraftEvidence,
  PlayType,
  Selection,
  SourceDeclaration,
} from '@football-lottery-analysis-lab/ocr-core';

export type OcrDraftRiskPreference = 'LOW' | 'BALANCED' | 'AGGRESSIVE';

export interface ScreenshotTask {
  taskId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  sampleLabel: string;
  status: 'WAITING_LOCAL_OCR';
  serverOcrEnabled: boolean;
  privacyPolicy: string;
  createdAt: string;
}

export interface OcrExtractedField {
  fieldName: string;
  fieldValue: string;
  confidence: number;
  sourceRegion: string;
}

export interface OcrTask {
  ocrTaskId: string;
  screenshotTaskId: string;
  ocrProvider: string;
  rawText?: string;
  status: 'WAITING_USER_CONFIRMATION';
  analysisAllowed: boolean;
  fields: OcrExtractedField[];
  parsedAt?: string;
}

export interface ConfirmedMatch {
  matchId: string;
  matchDate: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: string;
}

export interface ConfirmedMarket {
  marketId: string;
  matchId: string;
  playType: string;
  selection: string;
  odds: number;
}

export interface UserConfirmedSnapshot {
  snapshotId: string;
  ocrTaskId: string;
  sourceType: 'USER_SCREENSHOT_CONFIRMED';
  snapshotStatus: 'CONFIRMED';
  analysisAllowed: boolean;
  riskPreference: string;
  budgetAmount: number;
  currency: string;
  matches: ConfirmedMatch[];
  markets: ConfirmedMarket[];
  confirmedAt?: string;
  workflowId?: string | null;
  confirmedRevision?: number | null;
  authorityType?: 'SERVER_CONFIRMED_V2' | null;
  schemaVersion?: 'CONFIRMED_SNAPSHOT_V2' | 'LEGACY_V1';
}

export type WorkflowStage =
  | 'WAITING_LOCAL_OCR'
  | 'WAITING_USER_CONFIRMATION'
  | 'CONFIRMED'
  | 'ANALYSIS_GENERATED'
  | 'PLAN_GENERATED'
  | 'PENDING_RESULT'
  | 'ABANDONED';

export interface OcrWorkflowAggregate {
  workflowId: string;
  currentStage: WorkflowStage;
  version: number;
  screenshotTaskId: string | null;
  currentOcrTaskId: string | null;
  confirmedSnapshotId: string | null;
  currentReportId: string | null;
  currentPlanId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOcrWorkflowRequest {
  sourceDeclaration: 'FICTIONAL_SAMPLE' | 'USER_OWNED_AUTHORIZED';
  sourcePolicyVersion: 'SOURCE_POLICY_V2';
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
  byteSize: number;
  width: number;
  height: number;
}

export interface OcrCandidateBoundingBoxRequest {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrCandidateFieldRequest {
  fieldId: string;
  scope: 'MATCH' | 'MARKET';
  fieldName: 'league' | 'homeTeam' | 'awayTeam' | 'matchDate' | 'kickoffTime' | 'selection' | 'odds';
  value: string;
  matchRef?: string;
  confidence?: number;
  boundingBox?: OcrCandidateBoundingBoxRequest;
}

export interface ParseOcrCandidatesRequest {
  expectedVersion: number;
  entryMode: 'OCR' | 'MANUAL_BLANK';
  replaceDraft: boolean;
  ocrEngine?: string;
  ocrEngineVersion?: string;
  languages: string[];
  processedWidth: number;
  processedHeight: number;
  candidateFields: OcrCandidateFieldRequest[];
}

export interface SaveOcrReviewDraftRequest {
  expectedRevision: number;
  riskPreference: OcrDraftRiskPreference;
  budgetAmount: number;
  currency: 'CNY';
  matches: DraftMatchRequest[];
  markets: DraftMarketRequest[];
}

export interface DraftMatchRequest {
  matchId: string;
  matchDate: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: string;
}

export interface DraftMarketRequest {
  marketId: string;
  matchId: string;
  playType: PlayType;
  selection: Selection;
  odds: number;
}

export interface OcrReviewDraftResponse {
  ocrTaskId: string;
  workflowId: string;
  revision: number;
  draftStatus: 'ACTIVE' | 'SUPERSEDED';
  riskPreference: OcrDraftRiskPreference | null;
  budgetAmount: number | null;
  currency: 'CNY' | null;
  matches: DraftMatchRequest[];
  markets: DraftMarketRequest[];
  schemaVersion: 'OCR_REVIEW_DRAFT_V2';
  updatedAt: string;
}

export interface ConfirmOcrReviewDraftRequest {
  expectedRevision: number;
}

export interface CreateScreenshotTaskPayload {
  fileName: string;
  contentType: string;
  fileSize: number;
  sampleLabel: string;
}

export interface ParseLocalOcrPayload {
  screenshotTaskId: string;
  ocrProvider: string;
  rawText: string;
  fields: OcrExtractedField[];
}

export interface ConfirmOcrReviewPayload {
  ocrTaskId: string;
  riskPreference: string;
  budgetAmount: number;
  currency: string;
  matches: ConfirmedMatch[];
  markets: ConfirmedMarket[];
}

export type LocalReviewDraftStatus = 'LOCAL_EDITING';

export interface LocalReviewDraftMatch {
  draftMatchKey: string;
  matchDate: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: string;
  evidence: Partial<Record<'matchDate' | 'league' | 'homeTeam' | 'awayTeam' | 'kickoffTime', DraftEvidence>>;
}

export interface LocalReviewDraftMarket {
  draftMarketKey: string;
  draftMatchKey: string;
  playType: PlayType;
  selection: Selection;
  odds: string;
  evidence: Partial<Record<'matchRef' | 'playType' | 'selection' | 'odds', DraftEvidence>>;
}

export interface LocalReviewDraft {
  status: LocalReviewDraftStatus;
  sourceDeclaration: SourceDeclaration | null;
  analysisAllowed: false;
  budgetAmount: number;
  currency: 'CNY';
  riskPreference: OcrDraftRiskPreference;
  candidateBatch: CandidateBatch;
  meanConfidence: number | null;
  matches: LocalReviewDraftMatch[];
  markets: LocalReviewDraftMarket[];
}

export type ReviewDraftIssueCode =
  | 'BUDGET_INVALID'
  | 'CURRENCY_INVALID'
  | 'DUPLICATE_DRAFT_KEY'
  | 'FORMAL_SERVER_ID_FORBIDDEN'
  | 'KICKOFF_INVALID'
  | 'MATCH_DATE_INVALID'
  | 'MARKET_PER_MATCH'
  | 'MATCH_MARKET_REQUIRED'
  | 'ODDS_INVALID'
  | 'ORPHAN_MARKET_MATCH'
  | 'PLAY_TYPE_INVALID'
  | 'RISK_INVALID'
  | 'SELECTION_INVALID'
  | 'TEAM_REQUIRED'
  | 'UUID_INVALID'
  | 'LOW_CONFIDENCE_EVIDENCE';

export interface ReviewDraftIssue {
  path: string;
  code: ReviewDraftIssueCode;
  message: string;
}

export interface ReviewDraftValidationResult {
  valid: boolean;
  issues: ReviewDraftIssue[];
  warnings: ReviewDraftIssue[];
}

