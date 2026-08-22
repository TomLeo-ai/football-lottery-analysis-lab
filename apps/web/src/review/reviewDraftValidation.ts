import {
  PLAY_TYPES,
  SELECTIONS,
  type CandidateBatch,
  type DraftEvidence,
  type DraftSeed,
  type OcrCandidateField,
  type PixelRect,
  type ProcessedImageTransform,
  type SourceDeclaration,
} from '@football-lottery-analysis-lab/ocr-core';

import type {
  LocalReviewDraft,
  LocalReviewDraftMarket,
  LocalReviewDraftMatch,
  ReviewDraftIssue,
  ReviewDraftValidationResult,
} from '@/types/ocrWorkflow';
import type { RiskPreference } from '@/types/strategyParameter';

const DEFAULT_BUDGET_AMOUNT = 20;
const DEFAULT_CURRENCY = 'CNY';
const DEFAULT_RISK: RiskPreference = 'BALANCED';
const MAX_TEXT_LENGTH = 128;
const LOW_CONFIDENCE_THRESHOLD = 0.6;
const VALID_RISKS = new Set<RiskPreference>(['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE']);
const VALID_SELECTIONS = new Set<string>(SELECTIONS);
const VALID_PLAY_TYPES = new Set<string>(PLAY_TYPES);
const FORBIDDEN_SERVER_ID_KEYS = new Set(['matchId', 'marketId', 'snapshotId', 'ocrTaskId', 'screenshotTaskId']);

type CreateUuid = () => string;

export interface BuildLocalReviewDraftInput {
  candidateBatch: CandidateBatch;
  draftSeed: DraftSeed;
  sourceDeclaration: SourceDeclaration;
  meanConfidence: number | null;
}

function cloneRect(rect: PixelRect): PixelRect {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

function cloneTransform(transform: ProcessedImageTransform): ProcessedImageTransform {
  return {
    schemaVersion: transform.schemaVersion,
    sourceSize: { ...transform.sourceSize },
    normalizedSize: { ...transform.normalizedSize },
    rotation: transform.rotation,
    crop: transform.crop === null ? null : cloneRect(transform.crop),
    redactions: transform.redactions.map(cloneRect),
    processedSize: { ...transform.processedSize },
  };
}

function cloneEvidence(evidence: DraftEvidence): DraftEvidence {
  return {
    fieldId: evidence.fieldId,
    confidence: evidence.confidence,
    ...(evidence.boundingBox === undefined ? {} : { boundingBox: cloneRect(evidence.boundingBox) }),
  };
}

function cloneEvidenceRecord<T extends string>(
  evidence: Partial<Record<T, DraftEvidence>>,
): Partial<Record<T, DraftEvidence>> {
  const copy: Partial<Record<T, DraftEvidence>> = {};
  for (const [key, value] of Object.entries(evidence) as Array<[T, DraftEvidence]>) {
    copy[key] = cloneEvidence(value);
  }
  return copy;
}

function cloneCandidateField(field: OcrCandidateField): OcrCandidateField {
  return {
    fieldId: field.fieldId,
    entityType: field.entityType,
    entityKey: field.entityKey,
    fieldName: field.fieldName,
    fieldValue: field.fieldValue,
    confidence: field.confidence,
    ...(field.boundingBox === undefined ? {} : { boundingBox: cloneRect(field.boundingBox) }),
  };
}

function cloneCandidateBatch(batch: CandidateBatch): CandidateBatch {
  return {
    schemaVersion: batch.schemaVersion,
    processedImage: cloneTransform(batch.processedImage),
    fields: batch.fields.map(cloneCandidateField),
  };
}

export function cloneLocalReviewDraft(draft: LocalReviewDraft): LocalReviewDraft {
  return {
    status: draft.status,
    sourceDeclaration: draft.sourceDeclaration,
    analysisAllowed: false,
    budgetAmount: draft.budgetAmount,
    currency: draft.currency,
    riskPreference: draft.riskPreference,
    candidateBatch: cloneCandidateBatch(draft.candidateBatch),
    meanConfidence: draft.meanConfidence,
    matches: draft.matches.map((match) => ({
      draftMatchKey: match.draftMatchKey,
      matchDate: match.matchDate,
      league: match.league,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      kickoffTime: match.kickoffTime,
      evidence: cloneEvidenceRecord(match.evidence),
    })),
    markets: draft.markets.map((market) => ({
      draftMarketKey: market.draftMarketKey,
      draftMatchKey: market.draftMatchKey,
      playType: market.playType as LocalReviewDraftMarket['playType'],
      selection: market.selection as LocalReviewDraftMarket['selection'],
      odds: market.odds,
      evidence: cloneEvidenceRecord(market.evidence),
    })),
  };
}

export function buildLocalReviewDraft(input: BuildLocalReviewDraftInput): LocalReviewDraft {
  return {
    status: 'LOCAL_EDITING',
    sourceDeclaration: input.sourceDeclaration,
    analysisAllowed: false,
    budgetAmount: DEFAULT_BUDGET_AMOUNT,
    currency: DEFAULT_CURRENCY,
    riskPreference: DEFAULT_RISK,
    candidateBatch: cloneCandidateBatch(input.candidateBatch),
    meanConfidence: input.meanConfidence,
    matches: input.draftSeed.matches.map((match): LocalReviewDraftMatch => ({
      draftMatchKey: match.draftMatchKey,
      matchDate: match.matchDate,
      league: match.league,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      kickoffTime: match.kickoffTime,
      evidence: cloneEvidenceRecord(match.evidence),
    })),
    markets: input.draftSeed.markets.map((market): LocalReviewDraftMarket => ({
      draftMarketKey: market.draftMarketKey,
      draftMatchKey: market.draftMatchKey,
      playType: market.playType as LocalReviewDraftMarket['playType'],
      selection: market.selection as LocalReviewDraftMarket['selection'],
      odds: market.odds,
      evidence: cloneEvidenceRecord(market.evidence),
    })),
  };
}

function defaultCreateUuid(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (typeof randomUuid !== 'function') throw new Error('crypto.randomUUID is unavailable');
  return randomUuid.call(globalThis.crypto);
}

export function addDraftMatch(draft: LocalReviewDraft, createUuid: CreateUuid = defaultCreateUuid): LocalReviewDraft {
  draft.matches.push({
    draftMatchKey: createUuid(),
    matchDate: '',
    league: '',
    homeTeam: '',
    awayTeam: '',
    kickoffTime: '',
    evidence: {},
  });
  return draft;
}

export function updateDraftMatch(
  draft: LocalReviewDraft,
  draftMatchKey: string,
  changes: Partial<Omit<LocalReviewDraftMatch, 'draftMatchKey' | 'evidence'>>,
): LocalReviewDraft {
  const match = draft.matches.find((entry) => entry.draftMatchKey === draftMatchKey);
  if (match !== undefined) Object.assign(match, changes);
  return draft;
}

export function moveDraftMatch(
  draft: LocalReviewDraft,
  draftMatchKey: string,
  direction: 'UP' | 'DOWN',
): LocalReviewDraft {
  const index = draft.matches.findIndex((match) => match.draftMatchKey === draftMatchKey);
  if (index < 0) return draft;
  const target = direction === 'UP' ? index - 1 : index + 1;
  if (target < 0 || target >= draft.matches.length) return draft;
  const [match] = draft.matches.splice(index, 1);
  draft.matches.splice(target, 0, match);
  return draft;
}

export function removeDraftMatch(draft: LocalReviewDraft, draftMatchKey: string): LocalReviewDraft {
  draft.matches = draft.matches.filter((match) => match.draftMatchKey !== draftMatchKey);
  draft.markets = draft.markets.filter((market) => market.draftMatchKey !== draftMatchKey);
  return draft;
}

export function addWinDrawLossMarket(
  draft: LocalReviewDraft,
  draftMatchKey: string,
  createUuid: CreateUuid = defaultCreateUuid,
): LocalReviewDraft {
  draft.markets.push({
    draftMarketKey: createUuid(),
    draftMatchKey,
    playType: 'WIN_DRAW_LOSS',
    selection: 'HOME_WIN',
    odds: '2',
    evidence: {},
  });
  return draft;
}

export function updateDraftMarket(
  draft: LocalReviewDraft,
  draftMarketKey: string,
  changes: Partial<Omit<LocalReviewDraftMarket, 'draftMarketKey' | 'evidence'>>,
): LocalReviewDraft {
  const market = draft.markets.find((entry) => entry.draftMarketKey === draftMarketKey);
  if (market !== undefined) Object.assign(market, changes);
  return draft;
}

export function removeDraftMarket(draft: LocalReviewDraft, draftMarketKey: string): LocalReviewDraft {
  draft.markets = draft.markets.filter((market) => market.draftMarketKey !== draftMarketKey);
  return draft;
}

function issue(path: string, code: ReviewDraftIssue['code'], message: string): ReviewDraftIssue {
  return { path, code, message };
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    && value !== '00000000-0000-0000-0000-000000000000';
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validOffsetDateTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time);
}

function validText(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_TEXT_LENGTH;
}

function validOdds(value: string): boolean {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(value)) return false;
  const numberValue = Number(value);
  return Number.isFinite(numberValue)
    && numberValue >= 1.01
    && numberValue <= 1000
    && (!value.includes('.') || !value.endsWith('0'));
}

function containsFormalServerId(value: object): boolean {
  return Reflect.ownKeys(value).some((key) => typeof key === 'string' && FORBIDDEN_SERVER_ID_KEYS.has(key));
}

function collectEvidenceWarnings(
  path: string,
  evidence: Partial<Record<string, DraftEvidence>>,
  warnings: ReviewDraftIssue[],
): void {
  for (const [fieldName, entry] of Object.entries(evidence)) {
    if (entry === undefined) continue;
    if (entry.confidence < LOW_CONFIDENCE_THRESHOLD) {
      warnings.push(issue(`${path}.evidence.${fieldName}`, 'LOW_CONFIDENCE_EVIDENCE', '低置信度证据需要人工核对。'));
    }
  }
}

export function validateReviewDraft(draft: LocalReviewDraft): ReviewDraftValidationResult {
  const issues: ReviewDraftIssue[] = [];
  const warnings: ReviewDraftIssue[] = [];
  const matchKeys = new Set<string>();
  const marketKeys = new Set<string>();
  const marketCountByMatch = new Map<string, number>();

  if (containsFormalServerId(draft)) {
    issues.push(issue('$', 'FORMAL_SERVER_ID_FORBIDDEN', '本地草稿不能包含服务端正式 ID。'));
  }
  if (!Number.isFinite(draft.budgetAmount) || draft.budgetAmount <= 0) {
    issues.push(issue('budgetAmount', 'BUDGET_INVALID', '预算必须大于 0。'));
  }
  if (draft.currency !== DEFAULT_CURRENCY) {
    issues.push(issue('currency', 'CURRENCY_INVALID', '本地草稿暂只支持 CNY。'));
  }
  if (!VALID_RISKS.has(draft.riskPreference)) {
    issues.push(issue('riskPreference', 'RISK_INVALID', '风险偏好不受支持。'));
  }

  draft.matches.forEach((match, index) => {
    const path = `matches[${index}]`;
    const normalizedKey = match.draftMatchKey.toLowerCase();
    if (containsFormalServerId(match)) {
      issues.push(issue(path, 'FORMAL_SERVER_ID_FORBIDDEN', '比赛草稿不能包含服务端正式 ID。'));
    }
    if (!validUuid(match.draftMatchKey)) {
      issues.push(issue(`${path}.draftMatchKey`, 'UUID_INVALID', '比赛草稿键必须是浏览器 UUID。'));
    }
    if (matchKeys.has(normalizedKey)) {
      issues.push(issue(`${path}.draftMatchKey`, 'DUPLICATE_DRAFT_KEY', '比赛草稿键重复。'));
    }
    matchKeys.add(normalizedKey);
    if (!validDate(match.matchDate)) issues.push(issue(`${path}.matchDate`, 'MATCH_DATE_INVALID', '比赛日期无效。'));
    if (!validText(match.league)) issues.push(issue(`${path}.league`, 'TEAM_REQUIRED', '联赛不能为空。'));
    if (!validText(match.homeTeam)) issues.push(issue(`${path}.homeTeam`, 'TEAM_REQUIRED', '主队不能为空。'));
    if (!validText(match.awayTeam)) issues.push(issue(`${path}.awayTeam`, 'TEAM_REQUIRED', '客队不能为空。'));
    if (!validOffsetDateTime(match.kickoffTime)) issues.push(issue(`${path}.kickoffTime`, 'KICKOFF_INVALID', '开赛时间必须包含时区。'));
    collectEvidenceWarnings(path, match.evidence, warnings);
  });

  draft.markets.forEach((market, index) => {
    const path = `markets[${index}]`;
    const normalizedMarketKey = market.draftMarketKey.toLowerCase();
    const normalizedMatchKey = market.draftMatchKey.toLowerCase();
    if (containsFormalServerId(market)) {
      issues.push(issue(path, 'FORMAL_SERVER_ID_FORBIDDEN', '市场草稿不能包含服务端正式 ID。'));
    }
    if (!validUuid(market.draftMarketKey) || !validUuid(market.draftMatchKey)) {
      issues.push(issue(path, 'UUID_INVALID', '玩法草稿键必须是浏览器 UUID。'));
    }
    if (marketKeys.has(normalizedMarketKey)) {
      issues.push(issue(`${path}.draftMarketKey`, 'DUPLICATE_DRAFT_KEY', '玩法草稿键重复。'));
    }
    marketKeys.add(normalizedMarketKey);
    marketCountByMatch.set(normalizedMatchKey, (marketCountByMatch.get(normalizedMatchKey) ?? 0) + 1);
    if (!matchKeys.has(normalizedMatchKey)) {
      issues.push(issue(`${path}.draftMatchKey`, 'ORPHAN_MARKET_MATCH', '玩法必须引用一个本地比赛草稿。'));
    }
    if (!VALID_PLAY_TYPES.has(market.playType)) {
      issues.push(issue(`${path}.playType`, 'PLAY_TYPE_INVALID', '当前阶段只支持 WIN_DRAW_LOSS。'));
    }
    if (!VALID_SELECTIONS.has(market.selection)) {
      issues.push(issue(`${path}.selection`, 'SELECTION_INVALID', '选择项不属于胜平负三项。'));
    }
    if (!validOdds(market.odds)) {
      issues.push(issue(`${path}.odds`, 'ODDS_INVALID', '赔率必须是 1.01 到 1000 的规范数字，最多四位小数。'));
    }
    collectEvidenceWarnings(path, market.evidence, warnings);
  });

  for (const matchKey of matchKeys) {
    const count = marketCountByMatch.get(matchKey) ?? 0;
    if (count === 0) {
      issues.push(issue(`matches.${matchKey}.markets`, 'MATCH_MARKET_REQUIRED', '每场比赛需要一个胜平负玩法。'));
    } else if (count > 1) {
      issues.push(issue(`matches.${matchKey}.markets`, 'MARKET_PER_MATCH', '每场比赛最多一个胜平负玩法。'));
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings,
  };
}
