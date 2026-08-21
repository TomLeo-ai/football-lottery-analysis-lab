import {
  createDraftSeed as createCoreDraftSeed,
  mapNormalizedOcr,
  type CandidateBatch,
  type CandidateValidationResult,
  type CreateUuid,
  type DraftEvidence,
  type DraftMarket,
  type DraftMatch,
  type DraftSeed,
  type DraftSeedResult,
  type MappingResult,
  type OcrCandidateField,
  type PixelRect,
  type ProcessedImageTransform,
} from '@football-lottery-analysis-lab/ocr-core';

import { type ProcessedCanvasResult } from './imageWorkspace';
import {
  TesseractOcrAdapter,
  type BrowserOcrResult,
} from './tesseractOcrAdapter';

export type OcrRunControllerErrorCode =
  | 'OCR_CANCELLED'
  | 'OCR_MAPPING_FAILED'
  | 'OCR_RUN_FAILED'
  | 'OCR_DISPOSED';

const ERROR_MESSAGES: Readonly<Record<OcrRunControllerErrorCode, string>> = Object.freeze({
  OCR_CANCELLED: 'OCR run was cancelled.',
  OCR_MAPPING_FAILED: 'OCR result mapping failed.',
  OCR_RUN_FAILED: 'OCR run failed.',
  OCR_DISPOSED: 'OCR run controller has been disposed.',
});
const DEFAULT_TERMINATION_TIMEOUT_MS = 1_000;
const MAX_TERMINATION_TIMEOUT_MS = 60_000;

export class OcrRunControllerError extends Error {
  readonly code: OcrRunControllerErrorCode;

  constructor(code: OcrRunControllerErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'OcrRunControllerError';
    this.code = code;
  }
}

export interface OcrCandidateDraftSeed {
  readonly candidateBatch: CandidateBatch;
  readonly draftSeed: DraftSeed;
  readonly meanConfidence: number;
}

export interface OcrRunAdapter {
  recognize(canvas: HTMLCanvasElement): Promise<BrowserOcrResult>;
  terminate(): Promise<void>;
}

export interface OcrRunControllerDependencies {
  readonly createAdapter?: () => OcrRunAdapter;
  readonly mapCandidates?: (
    lines: unknown,
    processedImage: unknown,
    createUuid: CreateUuid,
  ) => MappingResult;
  readonly createDraftSeed?: (input: CandidateValidationResult) => DraftSeedResult;
  readonly createUuid?: CreateUuid;
  readonly onResult?: (result: OcrCandidateDraftSeed) => void | PromiseLike<void>;
  readonly terminationTimeoutMs?: number;
}

function defaultCreateAdapter(): OcrRunAdapter {
  return new TesseractOcrAdapter();
}

function defaultCreateUuid(): string {
  return globalThis.crypto.randomUUID();
}

function resolveTerminationTimeout(value: number | undefined): number {
  if (value === undefined) return DEFAULT_TERMINATION_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(value)
    || value <= 0
    || value > MAX_TERMINATION_TIMEOUT_MS
  ) {
    throw new OcrRunControllerError('OCR_RUN_FAILED');
  }
  return value;
}

function freezeRect(rect: PixelRect): PixelRect {
  return Object.freeze({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });
}

function freezeTransform(transform: ProcessedImageTransform): ProcessedImageTransform {
  return Object.freeze({
    schemaVersion: transform.schemaVersion,
    sourceSize: Object.freeze({
      width: transform.sourceSize.width,
      height: transform.sourceSize.height,
    }),
    normalizedSize: Object.freeze({
      width: transform.normalizedSize.width,
      height: transform.normalizedSize.height,
    }),
    rotation: transform.rotation,
    crop: transform.crop === null ? null : freezeRect(transform.crop),
    redactions: Object.freeze(transform.redactions.map(freezeRect)),
    processedSize: Object.freeze({
      width: transform.processedSize.width,
      height: transform.processedSize.height,
    }),
  });
}

function freezeCandidateField(field: OcrCandidateField): OcrCandidateField {
  return Object.freeze({
    fieldId: field.fieldId,
    entityType: field.entityType,
    entityKey: field.entityKey,
    fieldName: field.fieldName,
    fieldValue: field.fieldValue,
    confidence: field.confidence,
    ...(field.boundingBox === undefined ? {} : { boundingBox: freezeRect(field.boundingBox) }),
  });
}

function freezeCandidateBatch(candidateBatch: CandidateBatch): CandidateBatch {
  return Object.freeze({
    schemaVersion: candidateBatch.schemaVersion,
    processedImage: freezeTransform(candidateBatch.processedImage),
    fields: Object.freeze(candidateBatch.fields.map(freezeCandidateField)),
  });
}

function freezeEvidence(evidence: DraftEvidence): DraftEvidence {
  return Object.freeze({
    fieldId: evidence.fieldId,
    confidence: evidence.confidence,
    ...(evidence.boundingBox === undefined ? {} : { boundingBox: freezeRect(evidence.boundingBox) }),
  });
}

function freezeEvidenceRecord<T extends string>(
  evidence: Partial<Record<T, DraftEvidence>>,
): Partial<Record<T, DraftEvidence>> {
  const copy: Partial<Record<T, DraftEvidence>> = {};
  for (const [fieldName, value] of Object.entries(evidence) as Array<[T, DraftEvidence]>) {
    copy[fieldName] = freezeEvidence(value);
  }
  return Object.freeze(copy);
}

function freezeDraftMatch(match: DraftMatch): DraftMatch {
  return Object.freeze({
    draftMatchKey: match.draftMatchKey,
    matchDate: match.matchDate,
    league: match.league,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    kickoffTime: match.kickoffTime,
    evidence: freezeEvidenceRecord(match.evidence),
  });
}

function freezeDraftMarket(market: DraftMarket): DraftMarket {
  return Object.freeze({
    draftMarketKey: market.draftMarketKey,
    draftMatchKey: market.draftMatchKey,
    playType: market.playType,
    selection: market.selection,
    odds: market.odds,
    evidence: freezeEvidenceRecord(market.evidence),
  });
}

function freezeDraftSeed(draftSeed: DraftSeed): DraftSeed {
  const matches = draftSeed.matches.map(freezeDraftMatch);
  const markets = draftSeed.markets.map(freezeDraftMarket);
  Object.freeze(matches);
  Object.freeze(markets);
  return Object.freeze({ matches, markets });
}

function freezeResult(
  candidateBatch: CandidateBatch,
  draftSeed: DraftSeed,
  meanConfidence: number,
): OcrCandidateDraftSeed {
  return Object.freeze({
    candidateBatch: freezeCandidateBatch(candidateBatch),
    draftSeed: freezeDraftSeed(draftSeed),
    meanConfidence,
  });
}

export class OcrRunController {
  private readonly createAdapter: () => OcrRunAdapter;
  private readonly mapCandidates: NonNullable<OcrRunControllerDependencies['mapCandidates']>;
  private readonly createDraft: NonNullable<OcrRunControllerDependencies['createDraftSeed']>;
  private readonly createUuid: CreateUuid;
  private readonly onResult?: (result: OcrCandidateDraftSeed) => void | PromiseLike<void>;
  private readonly terminationTimeoutMs: number;
  private adapter: OcrRunAdapter | null = null;
  private inflightToken: number | null = null;
  private disposed = false;
  private token = 0;

  constructor(dependencies: OcrRunControllerDependencies = {}) {
    this.createAdapter = dependencies.createAdapter ?? defaultCreateAdapter;
    this.mapCandidates = dependencies.mapCandidates ?? mapNormalizedOcr;
    this.createDraft = dependencies.createDraftSeed ?? createCoreDraftSeed;
    this.createUuid = dependencies.createUuid ?? defaultCreateUuid;
    this.onResult = dependencies.onResult;
    this.terminationTimeoutMs = resolveTerminationTimeout(dependencies.terminationTimeoutMs);
  }

  async run(input: ProcessedCanvasResult): Promise<OcrCandidateDraftSeed> {
    const runToken = this.nextToken();
    if (this.disposed) throw new OcrRunControllerError('OCR_DISPOSED');

    if (this.inflightToken !== null) {
      const previousAdapter = this.detachAdapter();
      this.inflightToken = null;
      if (previousAdapter !== null) void this.terminateAdapter(previousAdapter);
    }

    let runAdapter: OcrRunAdapter;
    try {
      runAdapter = this.getAdapter();
    } catch {
      throw new OcrRunControllerError('OCR_RUN_FAILED');
    }
    this.inflightToken = runToken;

    let recognized: BrowserOcrResult;
    try {
      recognized = await runAdapter.recognize(input.canvas);
    } catch {
      if (!this.isCurrent(runToken)) throw new OcrRunControllerError('OCR_CANCELLED');
      throw await this.failRun(runToken, runAdapter, 'OCR_RUN_FAILED');
    }
    this.assertCurrent(runToken);

    let mapping: MappingResult;
    try {
      mapping = this.mapCandidates(recognized.lines, input.transform, this.createUuid);
    } catch {
      if (!this.isCurrent(runToken)) throw new OcrRunControllerError('OCR_CANCELLED');
      throw await this.failRun(runToken, runAdapter, 'OCR_MAPPING_FAILED');
    }
    this.assertCurrent(runToken);
    if (!mapping.valid) {
      throw await this.failRun(runToken, runAdapter, 'OCR_MAPPING_FAILED');
    }

    let draft: DraftSeedResult;
    try {
      draft = this.createDraft({ valid: true, value: mapping.value });
    } catch {
      if (!this.isCurrent(runToken)) throw new OcrRunControllerError('OCR_CANCELLED');
      throw await this.failRun(runToken, runAdapter, 'OCR_MAPPING_FAILED');
    }
    this.assertCurrent(runToken);
    if (!draft.valid) {
      throw await this.failRun(runToken, runAdapter, 'OCR_MAPPING_FAILED');
    }

    let result: OcrCandidateDraftSeed;
    try {
      result = freezeResult(mapping.value, draft.value, recognized.meanConfidence);
    } catch {
      if (!this.isCurrent(runToken)) throw new OcrRunControllerError('OCR_CANCELLED');
      throw await this.failRun(runToken, runAdapter, 'OCR_MAPPING_FAILED');
    }
    this.assertCurrent(runToken);

    if (this.onResult !== undefined) {
      this.assertCurrent(runToken);
      try {
        await this.onResult(result);
      } catch {
        if (!this.isCurrent(runToken)) throw new OcrRunControllerError('OCR_CANCELLED');
        throw await this.failRun(runToken, runAdapter, 'OCR_RUN_FAILED');
      }
    }
    this.assertCurrent(runToken);
    this.clearInflight(runToken);
    return result;
  }

  async cancel(): Promise<void> {
    this.nextToken();
    await this.cancelCurrent();
  }

  async replaceInput(): Promise<void> {
    this.nextToken();
    await this.cancelCurrent();
  }

  async dispose(): Promise<void> {
    this.nextToken();
    this.disposed = true;
    await this.cancelCurrent();
  }

  private nextToken(): number {
    this.token += 1;
    return this.token;
  }

  private getAdapter(): OcrRunAdapter {
    if (this.adapter === null) this.adapter = this.createAdapter();
    return this.adapter;
  }

  private detachAdapter(): OcrRunAdapter | null {
    const adapter = this.adapter;
    this.adapter = null;
    return adapter;
  }

  private async cancelCurrent(): Promise<void> {
    this.inflightToken = null;
    const adapter = this.detachAdapter();
    if (adapter !== null) await this.terminateAdapter(adapter);
  }

  private async terminateAdapter(adapter: OcrRunAdapter): Promise<void> {
    let termination: Promise<void>;
    try {
      termination = Promise.resolve(adapter.terminate()).catch(() => undefined);
    } catch {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timeoutId = globalThis.setTimeout(resolve, this.terminationTimeoutMs);
    });
    try {
      await Promise.race([termination, timeout]);
    } finally {
      if (timeoutId !== undefined) {
        try {
          globalThis.clearTimeout(timeoutId);
        } catch {
          // Timer cleanup is best-effort and never exposes runtime details.
        }
      }
    }
  }

  private isCurrent(runToken: number): boolean {
    return !this.disposed && this.token === runToken && this.inflightToken === runToken;
  }

  private assertCurrent(runToken: number): void {
    if (!this.isCurrent(runToken)) throw new OcrRunControllerError('OCR_CANCELLED');
  }

  private clearInflight(runToken: number): void {
    if (this.inflightToken === runToken) this.inflightToken = null;
  }

  private async failRun(
    runToken: number,
    runAdapter: OcrRunAdapter,
    code: 'OCR_MAPPING_FAILED' | 'OCR_RUN_FAILED',
  ): Promise<OcrRunControllerError> {
    this.clearInflight(runToken);
    if (this.adapter === runAdapter) {
      this.adapter = null;
      await this.terminateAdapter(runAdapter);
    }
    return new OcrRunControllerError(code);
  }
}
