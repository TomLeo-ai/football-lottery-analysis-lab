import {
  createWorker as createTesseractWorker,
  OEM,
  type LoggerMessage,
  type WorkerOptions,
} from 'tesseract.js';
import {
  type NormalizedOcrLine,
  type NormalizedOcrWord,
  type PixelRect,
} from '@football-lottery-analysis-lab/ocr-core';

import {
  resolveOcrAssetManifest,
  validateResolvedOcrAssetManifest,
  type ResolvedOcrAssetManifest,
} from './ocrAssetManifest';

const LANGUAGES = ['eng', 'chi_sim'];
const RECOGNIZE_OPTIONS = Object.freeze({});
const RECOGNIZE_OUTPUT = Object.freeze({ text: true, blocks: true } as const);
const MAX_BLOCKS = 4_096;
const MAX_PARAGRAPHS = 4_096;
const MAX_LINES = 4_096;
const MAX_WORDS = 65_536;
const CACHE_PROBE_DATABASE = 'football-lab-ocr-cache-probe-v1';
const CACHE_PROBE_STORE = 'capability';
const CACHE_PROBE_KEY = 'probe';
const CACHE_PROBE_VALUE = 1;
const CACHE_PROBE_TIMEOUT_MS = 500;

export type TesseractOcrErrorCode =
  | 'OCR_ASSET_UNAVAILABLE'
  | 'OCR_RECOGNITION_FAILED'
  | 'OCR_EMPTY_RESULT'
  | 'OCR_DISPOSED';

const ERROR_MESSAGES: Readonly<Record<TesseractOcrErrorCode, string>> = Object.freeze({
  OCR_ASSET_UNAVAILABLE: 'OCR assets are unavailable.',
  OCR_RECOGNITION_FAILED: 'OCR recognition failed.',
  OCR_EMPTY_RESULT: 'OCR returned no readable text.',
  OCR_DISPOSED: 'OCR adapter has been disposed.',
});

export class TesseractOcrError extends Error {
  readonly code: TesseractOcrErrorCode;

  constructor(code: TesseractOcrErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'TesseractOcrError';
    this.code = code;
  }
}

export interface BrowserOcrResult {
  readonly text: string;
  readonly lines: readonly NormalizedOcrLine[];
  readonly meanConfidence: number;
}

export interface OcrProgressEvent {
  readonly status: string;
  readonly progress: number;
}

export type OcrWarningCode = 'OCR_CACHE_UNAVAILABLE';

export interface OcrWarning {
  readonly code: OcrWarningCode;
  readonly message: string;
}

export interface TesseractWorkerPort {
  recognize(
    canvas: HTMLCanvasElement,
    options: Record<string, never>,
    output: { readonly text: true; readonly blocks: true },
  ): unknown;
  terminate(): unknown;
}

export type TesseractWorkerFactory = (
  languages: string[],
  oem: OEM,
  options: Partial<WorkerOptions>,
) => TesseractWorkerPort | PromiseLike<TesseractWorkerPort>;

export interface TesseractOcrDependencies {
  readonly createWorker?: TesseractWorkerFactory;
  readonly oemLstmOnly?: OEM;
  readonly probeCacheAvailable?: () => boolean | PromiseLike<boolean>;
  readonly onProgress?: (progress: OcrProgressEvent) => void;
  readonly onWarning?: (warning: OcrWarning) => void;
  readonly baseUrl?: string;
  readonly resolveAssetManifest?: (baseUrl: string) => ResolvedOcrAssetManifest;
}

const CACHE_WARNING: OcrWarning = Object.freeze({
  code: 'OCR_CACHE_UNAVAILABLE',
  message: 'Public OCR model caching is unavailable; recognition will continue in memory.',
});

function defaultCreateWorker(
  languages: string[],
  oem: OEM,
  options: Partial<WorkerOptions>,
): Promise<TesseractWorkerPort> {
  return createTesseractWorker(languages, oem, options);
}

function readIndexedDbFactory(): IDBFactory | undefined {
  try {
    return globalThis.indexedDB;
  } catch {
    return undefined;
  }
}

export function probeIndexedDbCacheAvailable(
  indexedDb: IDBFactory | undefined = readIndexedDbFactory(),
): Promise<boolean> {
  if (indexedDb === undefined) return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    let database: IDBDatabase | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const cleanup = (): void => {
      if (timeoutId !== undefined) {
        try {
          globalThis.clearTimeout(timeoutId);
        } catch {
          // Cleanup remains best-effort.
        }
        timeoutId = undefined;
      }
      if (database !== undefined) {
        try {
          database.close();
        } catch {
          // Cleanup remains best-effort.
        }
        database = undefined;
      }
      try {
        const deleteRequest = indexedDb.deleteDatabase(CACHE_PROBE_DATABASE);
        try {
          deleteRequest.onerror = () => undefined;
          deleteRequest.onblocked = () => undefined;
        } catch {
          // Deletion was still requested; event hooks are optional cleanup.
        }
      } catch {
        // A failed cleanup cannot make the cache capability probe succeed.
      }
    };

    const finish = (available: boolean): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(available);
    };

    try {
      timeoutId = globalThis.setTimeout(() => finish(false), CACHE_PROBE_TIMEOUT_MS);
      const request = indexedDb.open(CACHE_PROBE_DATABASE, 1);
      request.onblocked = () => finish(false);
      request.onerror = () => finish(false);
      request.onupgradeneeded = () => {
        try {
          const upgradeDatabase = request.result;
          if (!upgradeDatabase.objectStoreNames.contains(CACHE_PROBE_STORE)) {
            upgradeDatabase.createObjectStore(CACHE_PROBE_STORE);
          }
        } catch {
          finish(false);
        }
      };
      request.onsuccess = () => {
        try {
          database = request.result;
          if (settled) {
            cleanup();
            return;
          }
          const transaction = database.transaction(CACHE_PROBE_STORE, 'readwrite');
          transaction.onerror = () => finish(false);
          transaction.onabort = () => finish(false);
          transaction.oncomplete = () => finish(true);
          const store = transaction.objectStore(CACHE_PROBE_STORE);
          store.put(CACHE_PROBE_VALUE, CACHE_PROBE_KEY);
          store.delete(CACHE_PROBE_KEY);
        } catch {
          finish(false);
        }
      };
    } catch {
      finish(false);
    }
  });
}

function readOwnData(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) throw new Error('malformed');
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) throw new Error('malformed');
  return descriptor.value;
}

function readDenseArray(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value)) throw new Error('malformed');
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (
    lengthDescriptor === undefined
    || !Object.hasOwn(lengthDescriptor, 'value')
    || typeof lengthDescriptor.value !== 'number'
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
    || lengthDescriptor.value > maximum
  ) {
    throw new Error('malformed');
  }
  const result: unknown[] = [];
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) throw new Error('malformed');
    result.push(descriptor.value);
  }
  return result;
}

function readCanvasSize(canvas: HTMLCanvasElement): { width: number; height: number } {
  let width: unknown;
  let height: unknown;
  try {
    width = canvas.width;
    height = canvas.height;
  } catch {
    throw new TesseractOcrError('OCR_RECOGNITION_FAILED');
  }
  if (
    typeof width !== 'number'
    || typeof height !== 'number'
    || !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width <= 0
    || height <= 0
  ) {
    throw new TesseractOcrError('OCR_RECOGNITION_FAILED');
  }
  return { width, height };
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error('malformed');
  }
  return value / 100;
}

function readBoundingBox(value: unknown, canvasSize: { width: number; height: number }): PixelRect {
  const x0 = readOwnData(value, 'x0');
  const y0 = readOwnData(value, 'y0');
  const x1 = readOwnData(value, 'x1');
  const y1 = readOwnData(value, 'y1');
  if (
    typeof x0 !== 'number'
    || typeof y0 !== 'number'
    || typeof x1 !== 'number'
    || typeof y1 !== 'number'
    || !Number.isFinite(x0)
    || !Number.isFinite(y0)
    || !Number.isFinite(x1)
    || !Number.isFinite(y1)
    || x0 < 0
    || y0 < 0
    || x1 <= x0
    || y1 <= y0
    || x1 > canvasSize.width
    || y1 > canvasSize.height
  ) {
    throw new Error('malformed');
  }
  return Object.freeze({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
}

function mapWord(value: unknown, canvasSize: { width: number; height: number }): NormalizedOcrWord {
  const text = readOwnData(value, 'text');
  if (typeof text !== 'string' || text.trim().length === 0) throw new Error('malformed');
  const confidence = normalizeConfidence(readOwnData(value, 'confidence'));
  const boundingBox = readBoundingBox(readOwnData(value, 'bbox'), canvasSize);
  return Object.freeze({ text, confidence, boundingBox });
}

function mapPageResult(
  rawResult: unknown,
  canvasSize: { width: number; height: number },
): BrowserOcrResult | null {
  const page = readOwnData(rawResult, 'data');
  const text = readOwnData(page, 'text');
  if (typeof text !== 'string') throw new Error('malformed');
  if (text.trim().length === 0) return null;
  const meanConfidence = normalizeConfidence(readOwnData(page, 'confidence'));
  const rawBlocks = readOwnData(page, 'blocks');
  const lines: NormalizedOcrLine[] = [];
  let totalParagraphs = 0;
  let totalLines = 0;
  let totalWords = 0;

  if (rawBlocks !== null) {
    for (const block of readDenseArray(rawBlocks, MAX_BLOCKS)) {
      const paragraphs = readDenseArray(readOwnData(block, 'paragraphs'), MAX_PARAGRAPHS);
      totalParagraphs += paragraphs.length;
      if (totalParagraphs > MAX_PARAGRAPHS) throw new Error('malformed');
      for (const paragraph of paragraphs) {
        const rawLines = readDenseArray(readOwnData(paragraph, 'lines'), MAX_LINES);
        totalLines += rawLines.length;
        if (totalLines > MAX_LINES) throw new Error('malformed');
        for (const rawLine of rawLines) {
          const rawWords = readDenseArray(readOwnData(rawLine, 'words'), MAX_WORDS);
          totalWords += rawWords.length;
          if (totalWords > MAX_WORDS) throw new Error('malformed');
          const words = Object.freeze(rawWords.map((word) => mapWord(word, canvasSize)));
          lines.push(Object.freeze({ words }));
        }
      }
    }
  }

  return Object.freeze({
    text,
    lines: Object.freeze(lines),
    meanConfidence,
  });
}

function toProgressEvent(message: unknown): OcrProgressEvent | null {
  try {
    const status = readOwnData(message, 'status');
    const progress = readOwnData(message, 'progress');
    if (typeof status !== 'string' || status.length === 0) return null;
    if (typeof progress !== 'number' || !Number.isFinite(progress)) return null;
    return Object.freeze({
      status,
      progress: Math.min(1, Math.max(0, progress)),
    });
  } catch {
    return null;
  }
}

function isWorkerPort(value: unknown): value is TesseractWorkerPort {
  try {
    if (typeof value !== 'object' || value === null) return false;
    return typeof Reflect.get(value, 'recognize') === 'function'
      && typeof Reflect.get(value, 'terminate') === 'function';
  } catch {
    return false;
  }
}

export class TesseractOcrAdapter {
  private readonly createWorker: TesseractWorkerFactory;
  private readonly oemLstmOnly: OEM;
  private readonly probeCacheAvailable: () => boolean | PromiseLike<boolean>;
  private readonly onProgress?: (progress: OcrProgressEvent) => void;
  private readonly onWarning?: (warning: OcrWarning) => void;
  private readonly assets: ResolvedOcrAssetManifest | null;
  private workerPromise?: Promise<TesseractWorkerPort>;
  private terminationPromise?: Promise<void>;
  private disposed = false;

  constructor(dependencies: TesseractOcrDependencies = {}) {
    this.createWorker = dependencies.createWorker ?? defaultCreateWorker;
    this.oemLstmOnly = dependencies.oemLstmOnly ?? OEM.LSTM_ONLY;
    this.probeCacheAvailable = dependencies.probeCacheAvailable ?? probeIndexedDbCacheAvailable;
    this.onProgress = dependencies.onProgress;
    this.onWarning = dependencies.onWarning;

    try {
      const baseUrl = dependencies.baseUrl ?? import.meta.env.BASE_URL;
      if (dependencies.resolveAssetManifest === undefined) {
        this.assets = resolveOcrAssetManifest(baseUrl);
      } else {
        this.assets = validateResolvedOcrAssetManifest(
          baseUrl,
          dependencies.resolveAssetManifest(baseUrl),
        );
      }
    } catch {
      this.assets = null;
    }
  }

  async recognize(canvas: HTMLCanvasElement): Promise<BrowserOcrResult> {
    if (this.disposed) throw new TesseractOcrError('OCR_DISPOSED');
    const canvasSize = readCanvasSize(canvas);
    const workerAlreadyStarted = this.workerPromise !== undefined;
    if (workerAlreadyStarted) await this.warnIfCacheUnavailable();
    const worker = await this.getWorker();
    if (this.disposed) throw new TesseractOcrError('OCR_DISPOSED');

    let rawResult: unknown;
    try {
      rawResult = await worker.recognize(canvas, RECOGNIZE_OPTIONS, RECOGNIZE_OUTPUT);
    } catch {
      if (this.disposed) throw new TesseractOcrError('OCR_DISPOSED');
      throw new TesseractOcrError('OCR_RECOGNITION_FAILED');
    }
    if (this.disposed) throw new TesseractOcrError('OCR_DISPOSED');

    let result: BrowserOcrResult | null;
    try {
      result = mapPageResult(rawResult, canvasSize);
    } catch {
      throw new TesseractOcrError('OCR_RECOGNITION_FAILED');
    }
    if (result === null) throw new TesseractOcrError('OCR_EMPTY_RESULT');
    return result;
  }

  terminate(): Promise<void> {
    if (this.terminationPromise !== undefined) return this.terminationPromise;
    this.disposed = true;
    const pendingWorker = this.workerPromise;
    this.terminationPromise = (async () => {
      if (pendingWorker === undefined) return;
      try {
        const worker = await pendingWorker;
        await worker.terminate();
      } catch {
        // Cleanup is best-effort and must not expose worker internals.
      }
    })();
    return this.terminationPromise;
  }

  private getWorker(): Promise<TesseractWorkerPort> {
    if (this.workerPromise !== undefined) return this.workerPromise;
    if (this.assets === null) {
      this.workerPromise = Promise.reject(new TesseractOcrError('OCR_ASSET_UNAVAILABLE'));
      return this.workerPromise;
    }

    this.workerPromise = this.initializeWorker(this.assets);
    return this.workerPromise;
  }

  private async initializeWorker(assets: ResolvedOcrAssetManifest): Promise<TesseractWorkerPort> {
    const cacheAvailable = await this.probeCache();
    if (!cacheAvailable) this.emitWarning();
    if (this.disposed) throw new TesseractOcrError('OCR_DISPOSED');

    let worker: unknown;
    try {
      const logger = (message: LoggerMessage): void => this.emitProgress(message);
      worker = await this.createWorker([...LANGUAGES], this.oemLstmOnly, {
        workerPath: assets.workerPath,
        corePath: assets.corePath,
        langPath: assets.langPath,
        cachePath: assets.cachePath,
        cacheMethod: cacheAvailable ? 'write' : 'none',
        gzip: true,
        legacyCore: false,
        legacyLang: false,
        workerBlobURL: false,
        logger,
      });
    } catch {
      throw new TesseractOcrError('OCR_ASSET_UNAVAILABLE');
    }
    if (!isWorkerPort(worker)) throw new TesseractOcrError('OCR_ASSET_UNAVAILABLE');
    return worker;
  }

  private async probeCache(): Promise<boolean> {
    try {
      return await this.probeCacheAvailable() === true;
    } catch {
      return false;
    }
  }

  private async warnIfCacheUnavailable(): Promise<void> {
    if (!await this.probeCache()) this.emitWarning();
  }

  private emitProgress(message: unknown): void {
    const event = toProgressEvent(message);
    if (event === null || this.onProgress === undefined) return;
    try {
      this.onProgress(event);
    } catch {
      // Consumer callbacks cannot interrupt the worker lifecycle.
    }
  }

  private emitWarning(): void {
    if (this.onWarning === undefined) return;
    try {
      this.onWarning(CACHE_WARNING);
    } catch {
      // Consumer callbacks cannot interrupt the worker lifecycle.
    }
  }
}
