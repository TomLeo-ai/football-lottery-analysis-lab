import { OEM, type WorkerOptions } from 'tesseract.js';
import { describe, expect, it, vi } from 'vitest';

import {
  resolveOcrAssetManifest,
  type ResolvedOcrAssetManifest,
} from './ocrAssetManifest';
import {
  TesseractOcrAdapter,
  TesseractOcrError,
  type TesseractOcrDependencies,
  type TesseractWorkerPort,
} from './tesseractOcrAdapter';

interface PageFixture {
  result: unknown;
  page: {
    blocks: unknown[] | null;
    confidence: unknown;
    text: unknown;
  };
  words: Array<{
    bbox: { x0: number; y0: number; x1: number; y1: number };
    confidence: unknown;
    text: unknown;
  }>;
}

function createCanvas(width = 400, height = 200): HTMLCanvasElement {
  return { width, height } as HTMLCanvasElement;
}

function createPageFixture(): PageFixture {
  const words = [
    {
      symbols: [],
      choices: [],
      text: 'HOME:',
      confidence: 92,
      bbox: { x0: 10, y0: 20, x1: 70, y1: 40 },
      font_name: '',
    },
    {
      symbols: [],
      choices: [],
      text: 'Team',
      confidence: 84.5,
      bbox: { x0: 75, y0: 20, x1: 125, y1: 40 },
      font_name: '',
    },
    {
      symbols: [],
      choices: [],
      text: 'A',
      confidence: 100,
      bbox: { x0: 130, y0: 20, x1: 145, y1: 40 },
      font_name: '',
    },
  ];
  const line = {
    words,
    text: 'HOME: Team A',
    confidence: 90,
    baseline: { x0: 10, y0: 40, x1: 145, y1: 40 },
    rowAttributes: { ascenders: 10, descenders: 2, rowHeight: 20 },
    bbox: { x0: 10, y0: 20, x1: 145, y1: 40 },
  };
  const paragraph = {
    lines: [line],
    text: 'HOME: Team A',
    confidence: 90,
    bbox: { x0: 10, y0: 20, x1: 145, y1: 40 },
    is_ltr: true,
  };
  const page = {
    blocks: null as unknown[] | null,
    confidence: 87.5 as unknown,
    oem: 'LSTM_ONLY',
    osd: '',
    psm: '3',
    text: 'HOME: Team A\n' as unknown,
    version: '7.0.0',
    hocr: null,
    tsv: null,
    box: null,
    unlv: null,
    sd: null,
    imageColor: null,
    imageGrey: null,
    imageBinary: null,
    rotateRadians: null,
    pdf: null,
    debug: null,
  };
  const block = {
    paragraphs: [paragraph],
    text: 'HOME: Team A',
    confidence: 90,
    bbox: { x0: 10, y0: 20, x1: 145, y1: 40 },
    blocktype: 'FLOWING_TEXT',
    page,
  };
  page.blocks = [block];
  return {
    result: { jobId: 'job-1', data: page },
    page,
    words,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createHarness(
  fixture = createPageFixture(),
  overrides: Partial<TesseractOcrDependencies> = {},
) {
  const recognize = vi.fn(async (
    _canvas: HTMLCanvasElement,
    _options: Record<string, never>,
    _output: { text: true; blocks: true },
  ) => fixture.result);
  const terminate = vi.fn(async () => ({ terminated: true }));
  const worker: TesseractWorkerPort = { recognize, terminate };
  const createWorker = vi.fn(async (
    _languages: string[],
    _oem: OEM,
    _options: Partial<WorkerOptions>,
  ) => worker);
  const probeCacheAvailable = vi.fn(async () => true);
  const dependencies: TesseractOcrDependencies = {
    createWorker,
    probeCacheAvailable,
    baseUrl: '/',
    ...overrides,
  };

  return {
    fixture,
    recognize,
    terminate,
    worker,
    createWorker,
    probeCacheAvailable,
    dependencies,
  };
}

type IndexedDbProbeOutcome =
  | 'open throws'
  | 'request error'
  | 'transaction abort'
  | 'success';

function createIndexedDbProbeFake(outcome: IndexedDbProbeOutcome) {
  type EventCallback = () => void;
  const put = vi.fn();
  const deleteEntry = vi.fn();
  const objectStore = vi.fn(() => ({ put, delete: deleteEntry }));
  const transactionRecord: {
    oncomplete: EventCallback | null;
    onerror: EventCallback | null;
    onabort: EventCallback | null;
    objectStore: typeof objectStore;
  } = {
    oncomplete: null,
    onerror: null,
    onabort: null,
    objectStore,
  };
  const createObjectStore = vi.fn();
  const transaction = vi.fn(() => transactionRecord);
  const close = vi.fn();
  const database = {
    objectStoreNames: { contains: vi.fn(() => false) },
    createObjectStore,
    transaction,
    close,
  };
  const request: {
    result: typeof database;
    onsuccess: EventCallback | null;
    onerror: EventCallback | null;
    onblocked: EventCallback | null;
    onupgradeneeded: EventCallback | null;
  } = {
    result: database,
    onsuccess: null,
    onerror: null,
    onblocked: null,
    onupgradeneeded: null,
  };
  const open = vi.fn((_name: string, _version?: number) => {
    if (outcome === 'open throws') throw new Error('private-upstream-detail');
    queueMicrotask(() => {
      if (outcome === 'request error') {
        request.onerror?.();
        return;
      }
      request.onupgradeneeded?.();
      request.onsuccess?.();
      queueMicrotask(() => {
        if (outcome === 'transaction abort') transactionRecord.onabort?.();
        else transactionRecord.oncomplete?.();
      });
    });
    return request as unknown as IDBOpenDBRequest;
  });
  const deleteDatabase = vi.fn((_name: string) => ({} as IDBOpenDBRequest));

  return {
    indexedDb: { open, deleteDatabase } as unknown as IDBFactory,
    open,
    deleteDatabase,
    createObjectStore,
    transaction,
    objectStore,
    put,
    deleteEntry,
    close,
  };
}

async function expectOcrError(
  action: () => Promise<unknown>,
  code: TesseractOcrError['code'],
  forbidden = 'private-upstream-detail',
): Promise<TesseractOcrError> {
  let error: unknown;
  try {
    await action();
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(TesseractOcrError);
  expect(error).toMatchObject({ code });
  expect((error as Error).message).not.toContain(forbidden);
  expect('cause' in (error as object)).toBe(false);
  return error as TesseractOcrError;
}

describe('resolveOcrAssetManifest', () => {
  it('resolves the checked manifest under root and subpath bases without an external URL', () => {
    expect(resolveOcrAssetManifest('/')).toEqual({
      workerPath: '/ocr/tesseract/7.0.0/worker/worker.min.js',
      corePath: '/ocr/tesseract/7.0.0/core/',
      langPath: '/ocr/tesseract/7.0.0/lang/4.0.0_best_int/',
      cachePath: 'football-lab-ocr/tesseract-7.0.0/4.0.0_best_int',
    });
    expect(resolveOcrAssetManifest('/lab/')).toEqual({
      workerPath: '/lab/ocr/tesseract/7.0.0/worker/worker.min.js',
      corePath: '/lab/ocr/tesseract/7.0.0/core/',
      langPath: '/lab/ocr/tesseract/7.0.0/lang/4.0.0_best_int/',
      cachePath: 'football-lab-ocr/tesseract-7.0.0/4.0.0_best_int',
    });
  });

  it.each([
    'https://example.invalid/lab/',
    'http://example.invalid/lab/',
    '//example.invalid/lab/',
    'lab/',
    '/lab\\escape/',
    '/lab%2fescape/',
    '/lab?query/',
    '/lab#hash/',
    '/lab//nested/',
    '/lab/../escape/',
    '/lab/./nested/',
  ])('rejects unsafe or ambiguous base URL %s', (baseUrl) => {
    expect(() => resolveOcrAssetManifest(baseUrl)).toThrow('OCR asset manifest is unavailable');
  });

  it.each([
    ['schemaVersion', 'OCR_ASSET_MANIFEST_V2'],
    ['tesseractVersion', '6.0.1'],
    ['coreVersion', '6.0.1'],
    ['languageDataVersion', 'latest'],
    ['cachePath', '../private-cache'],
    ['workerPath', 'https://cdn.invalid/worker.js'],
    ['workerPath', '/off-base/worker.js'],
    ['corePath', 'ocr/tesseract/7.0.0/core'],
    ['langPath', 'ocr/tesseract/7.0.0/lang/%2e%2e/'],
  ])('rejects a tampered manifest %s', (key, value) => {
    const manifest = {
      schemaVersion: 'OCR_ASSET_MANIFEST_V1',
      tesseractVersion: '7.0.0',
      coreVersion: '7.0.0',
      languageDataVersion: '1.0.0/4.0.0_best_int',
      cachePath: 'football-lab-ocr/tesseract-7.0.0/4.0.0_best_int',
      workerPath: 'ocr/tesseract/7.0.0/worker/worker.min.js',
      corePath: 'ocr/tesseract/7.0.0/core/',
      langPath: 'ocr/tesseract/7.0.0/lang/4.0.0_best_int/',
      [key]: value,
    };

    expect(() => resolveOcrAssetManifest('/', manifest)).toThrow('OCR asset manifest is unavailable');
  });
});

describe('TesseractOcrAdapter', () => {
  it('lazily creates and reuses one v7 worker with exact same-origin options and output requests', async () => {
    const harness = createHarness();
    const adapter = new TesseractOcrAdapter(harness.dependencies);
    const canvas = createCanvas();

    expect(harness.createWorker).not.toHaveBeenCalled();
    await adapter.recognize(canvas);
    await adapter.recognize(canvas);

    expect(harness.createWorker).toHaveBeenCalledTimes(1);
    const [languages, oem, options] = harness.createWorker.mock.calls[0] ?? [];
    expect(languages).toEqual(['eng', 'chi_sim']);
    expect(oem).toBe(OEM.LSTM_ONLY);
    expect(options).toEqual({
      workerPath: '/ocr/tesseract/7.0.0/worker/worker.min.js',
      corePath: '/ocr/tesseract/7.0.0/core/',
      langPath: '/ocr/tesseract/7.0.0/lang/4.0.0_best_int/',
      cachePath: 'football-lab-ocr/tesseract-7.0.0/4.0.0_best_int',
      cacheMethod: 'write',
      gzip: true,
      legacyCore: false,
      legacyLang: false,
      workerBlobURL: false,
      logger: expect.any(Function),
    });
    expect(harness.recognize).toHaveBeenCalledTimes(2);
    expect(harness.recognize.mock.calls[0]).toEqual([
      canvas,
      {},
      { text: true, blocks: true },
    ]);
    expect(harness.createWorker.mock.calls.flat().join(' ')).not.toMatch(/https?:|jsdelivr|unpkg/i);
  });

  it.each([
    ['unavailable', async () => false],
    ['probe failure', async () => { throw new Error('private-upstream-detail'); }],
  ])('continues with same-origin assets and no persistence when cache is %s', async (_label, probe) => {
    const warnings: unknown[] = [];
    const harness = createHarness(createPageFixture(), {
      probeCacheAvailable: vi.fn(probe),
      onWarning: (warning) => warnings.push(warning),
    });
    const adapter = new TesseractOcrAdapter(harness.dependencies);

    await adapter.recognize(createCanvas());

    expect(harness.createWorker).toHaveBeenCalledTimes(1);
    expect(harness.createWorker.mock.calls[0]?.[2]).toMatchObject({
      cacheMethod: 'none',
      workerPath: '/ocr/tesseract/7.0.0/worker/worker.min.js',
      corePath: '/ocr/tesseract/7.0.0/core/',
      langPath: '/ocr/tesseract/7.0.0/lang/4.0.0_best_int/',
    });
    expect(warnings).toEqual([{
      code: 'OCR_CACHE_UNAVAILABLE',
      message: 'Public OCR model caching is unavailable; recognition will continue in memory.',
    }]);
    expect(Object.isFrozen(warnings[0])).toBe(true);
  });

  it('warns on later cache loss without replacing the initialized worker', async () => {
    const warnings: unknown[] = [];
    const probeCacheAvailable = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const harness = createHarness(createPageFixture(), {
      probeCacheAvailable,
      onWarning: (warning) => warnings.push(warning),
    });
    const adapter = new TesseractOcrAdapter(harness.dependencies);

    await adapter.recognize(createCanvas());
    const second = await adapter.recognize(createCanvas());

    expect(second.text).toBe('HOME: Team A\n');
    expect(probeCacheAvailable).toHaveBeenCalledTimes(2);
    expect(harness.createWorker).toHaveBeenCalledTimes(1);
    expect(harness.recognize).toHaveBeenCalledTimes(2);
    expect(warnings).toHaveLength(1);
  });

  it.each([
    'open throws',
    'request error',
    'transaction abort',
  ] as const)('uses production IndexedDB probe fail-closed for %s', async (outcome) => {
    const indexedDb = createIndexedDbProbeFake(outcome);
    const warnings: unknown[] = [];
    const harness = createHarness(createPageFixture(), {
      onWarning: (warning) => warnings.push(warning),
    });
    vi.stubGlobal('indexedDB', indexedDb.indexedDb);

    try {
      const adapter = new TesseractOcrAdapter({
        ...harness.dependencies,
        probeCacheAvailable: undefined,
      });
      const result = await adapter.recognize(createCanvas());

      expect(result.text).toBe('HOME: Team A\n');
      expect(indexedDb.open).toHaveBeenCalledWith('football-lab-ocr-cache-probe-v1', 1);
      expect(indexedDb.deleteDatabase).toHaveBeenCalledWith('football-lab-ocr-cache-probe-v1');
      expect(harness.createWorker.mock.calls[0]?.[2]).toMatchObject({ cacheMethod: 'none' });
      expect(warnings).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uses production IndexedDB probe write cache only after fixed put and delete complete', async () => {
    const indexedDb = createIndexedDbProbeFake('success');
    const warnings: unknown[] = [];
    const harness = createHarness(createPageFixture(), {
      onWarning: (warning) => warnings.push(warning),
    });
    vi.stubGlobal('indexedDB', indexedDb.indexedDb);

    try {
      const adapter = new TesseractOcrAdapter({
        ...harness.dependencies,
        probeCacheAvailable: undefined,
      });
      await adapter.recognize(createCanvas());

      expect(indexedDb.open).toHaveBeenCalledWith('football-lab-ocr-cache-probe-v1', 1);
      expect(indexedDb.createObjectStore).toHaveBeenCalledWith('capability');
      expect(indexedDb.transaction).toHaveBeenCalledWith('capability', 'readwrite');
      expect(indexedDb.objectStore).toHaveBeenCalledWith('capability');
      expect(indexedDb.put).toHaveBeenCalledWith(1, 'probe');
      expect(indexedDb.deleteEntry).toHaveBeenCalledWith('probe');
      expect(indexedDb.close).toHaveBeenCalledTimes(1);
      expect(indexedDb.deleteDatabase).toHaveBeenCalledWith('football-lab-ocr-cache-probe-v1');
      expect(harness.createWorker.mock.calls[0]?.[2]).toMatchObject({ cacheMethod: 'write' });
      expect(warnings).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('bounds safe progress, ignores malformed logger messages, and isolates callback failures', async () => {
    const progress: unknown[] = [];
    const onProgress = vi.fn((event: unknown) => {
      progress.push(event);
      throw new Error('consumer callback failure');
    });
    const harness = createHarness(createPageFixture(), { onProgress });
    const adapter = new TesseractOcrAdapter(harness.dependencies);

    const result = await adapter.recognize(createCanvas());
    const logger = harness.createWorker.mock.calls[0]?.[2]?.logger;
    expect(logger).toBeTypeOf('function');
    logger?.({
      jobId: 'job-1',
      workerId: 'worker-1',
      userJobId: 'user-job-1',
      status: 'recognizing text',
      progress: 1.25,
    });
    logger?.({
      jobId: 'job-1',
      workerId: 'worker-1',
      userJobId: 'user-job-1',
      status: 'starting',
      progress: -0.5,
    });
    expect(() => logger?.({ progress: Number.NaN } as never)).not.toThrow();
    const hostile = new Proxy({}, {
      getOwnPropertyDescriptor: () => { throw new Error('private-upstream-detail'); },
    });
    expect(() => logger?.(hostile as never)).not.toThrow();

    expect(result.text).toBe('HOME: Team A\n');
    expect(progress).toEqual([
      { status: 'recognizing text', progress: 1 },
      { status: 'starting', progress: 0 },
    ]);
    expect(progress.every((event) => Object.isFrozen(event))).toBe(true);
  });

  it('maps only detached line and word evidence from the cyclic v7 Page result', async () => {
    const fixture = createPageFixture();
    const harness = createHarness(fixture);
    const adapter = new TesseractOcrAdapter(harness.dependencies);

    const result = await adapter.recognize(createCanvas());

    expect(result).toEqual({
      text: 'HOME: Team A\n',
      meanConfidence: 0.875,
      lines: [{
        words: [
          { text: 'HOME:', confidence: 0.92, boundingBox: { x: 10, y: 20, width: 60, height: 20 } },
          { text: 'Team', confidence: 0.845, boundingBox: { x: 75, y: 20, width: 50, height: 20 } },
          { text: 'A', confidence: 1, boundingBox: { x: 130, y: 20, width: 15, height: 20 } },
        ],
      }],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.lines)).toBe(true);
    expect(Object.isFrozen(result.lines[0])).toBe(true);
    expect(Object.isFrozen(result.lines[0]?.words)).toBe(true);
    expect(Object.isFrozen(result.lines[0]?.words[0])).toBe(true);
    expect(Object.isFrozen(result.lines[0]?.words[0]?.boundingBox)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('paragraphs');
    expect(JSON.stringify(result)).not.toContain('page');

    fixture.words[0]!.text = 'MUTATED';
    fixture.words[0]!.bbox.x0 = 300;
    fixture.page.text = 'MUTATED';
    expect(result.text).toBe('HOME: Team A\n');
    expect(result.lines[0]?.words[0]).toEqual({
      text: 'HOME:',
      confidence: 0.92,
      boundingBox: { x: 10, y: 20, width: 60, height: 20 },
    });
  });

  it('returns no invented line evidence when v7 blocks are null but text is non-empty', async () => {
    const fixture = createPageFixture();
    fixture.page.blocks = null;
    const adapter = new TesseractOcrAdapter(createHarness(fixture).dependencies);

    const result = await adapter.recognize(createCanvas());

    expect(result).toEqual({ text: 'HOME: Team A\n', lines: [], meanConfidence: 0.875 });
    expect(Object.isFrozen(result.lines)).toBe(true);
  });

  it.each([
    ['missing word text', (fixture: PageFixture) => {
      delete (fixture.words[0] as { text?: unknown }).text;
    }],
    ['invalid word confidence', (fixture: PageFixture) => { fixture.words[0]!.confidence = 101; }],
    ['negative bounding box', (fixture: PageFixture) => { fixture.words[0]!.bbox.x0 = -1; }],
    ['zero-area bounding box', (fixture: PageFixture) => { fixture.words[0]!.bbox.x1 = fixture.words[0]!.bbox.x0; }],
    ['out-of-canvas bounding box', (fixture: PageFixture) => { fixture.words[0]!.bbox.x1 = 401; }],
  ])('fails closed for %s instead of inventing OCR evidence', async (_label, mutate) => {
    const fixture = createPageFixture();
    mutate(fixture);
    const adapter = new TesseractOcrAdapter(createHarness(fixture).dependencies);

    await expectOcrError(
      () => adapter.recognize(createCanvas()),
      'OCR_RECOGNITION_FAILED',
    );
  });

  it('returns the stable empty-result error without leaking raw text', async () => {
    const fixture = createPageFixture();
    fixture.page.text = '  \n\t';
    const adapter = new TesseractOcrAdapter(createHarness(fixture).dependencies);

    const error = await expectOcrError(
      () => adapter.recognize(createCanvas()),
      'OCR_EMPTY_RESULT',
    );

    expect(error.message).toBe('OCR returned no readable text.');
  });

  it('maps manifest and worker initialization failures to the stable asset error', async () => {
    const manifestFailure = new TesseractOcrAdapter({
      baseUrl: '/',
      resolveAssetManifest: () => { throw new Error('private-upstream-detail'); },
    });
    await expectOcrError(
      () => manifestFailure.recognize(createCanvas()),
      'OCR_ASSET_UNAVAILABLE',
    );

    const harness = createHarness();
    harness.createWorker.mockRejectedValueOnce(new Error('private-upstream-detail'));
    const workerFailure = new TesseractOcrAdapter(harness.dependencies);
    const error = await expectOcrError(
      () => workerFailure.recognize(createCanvas()),
      'OCR_ASSET_UNAVAILABLE',
    );
    expect(error.message).toBe('OCR assets are unavailable.');
  });

  it.each([
    ['recognize rejection', () => Promise.reject(new Error('private-upstream-detail'))],
    ['hostile result proxy', () => Promise.resolve(new Proxy({}, {
      getOwnPropertyDescriptor: () => { throw new Error('private-upstream-detail'); },
    }))],
    ['hostile result thenable', () => {
      const result = {};
      Object.defineProperty(result, 'then', {
        get: () => { throw new Error('private-upstream-detail'); },
      });
      return result;
    }],
  ])('stably wraps external %s', async (_label, recognizeResult) => {
    const harness = createHarness();
    harness.recognize.mockImplementationOnce(recognizeResult as never);
    const adapter = new TesseractOcrAdapter(harness.dependencies);

    const error = await expectOcrError(
      () => adapter.recognize(createCanvas()),
      'OCR_RECOGNITION_FAILED',
    );
    expect(error.message).toBe('OCR recognition failed.');
  });

  it('terminates one initialized worker exactly once and never recreates it', async () => {
    const harness = createHarness();
    const adapter = new TesseractOcrAdapter(harness.dependencies);
    await adapter.recognize(createCanvas());

    await Promise.all([adapter.terminate(), adapter.terminate()]);

    expect(harness.terminate).toHaveBeenCalledTimes(1);
    await expectOcrError(
      () => adapter.recognize(createCanvas()),
      'OCR_DISPOSED',
    );
    expect(harness.createWorker).toHaveBeenCalledTimes(1);
  });

  it('waits for in-flight initialization and terminates the late worker once', async () => {
    const deferred = createDeferred<TesseractWorkerPort>();
    const harness = createHarness();
    harness.createWorker.mockImplementationOnce(() => deferred.promise);
    const adapter = new TesseractOcrAdapter(harness.dependencies);

    const recognition = adapter.recognize(createCanvas());
    await vi.waitFor(() => expect(harness.createWorker).toHaveBeenCalledTimes(1));
    const termination = adapter.terminate();
    deferred.resolve(harness.worker);

    await expectOcrError(() => recognition, 'OCR_DISPOSED');
    await termination;
    await adapter.terminate();
    expect(harness.terminate).toHaveBeenCalledTimes(1);
    expect(harness.recognize).not.toHaveBeenCalled();
  });

  it.each(['success', 'rejection'] as const)(
    'prioritizes disposal over late active-recognition %s',
    async (settlement) => {
      const fixture = createPageFixture();
      const deferred = createDeferred<unknown>();
      const harness = createHarness(fixture);
      const adapter = new TesseractOcrAdapter(harness.dependencies);
      const canvas = createCanvas();
      await adapter.recognize(canvas);
      harness.recognize.mockImplementationOnce(() => deferred.promise);
      let returned: unknown;
      let normalizationReads = 0;
      const lateResult = new Proxy(fixture.result as object, {
        getOwnPropertyDescriptor(target, property) {
          normalizationReads += 1;
          return Reflect.getOwnPropertyDescriptor(target, property);
        },
      });

      const recognition = adapter.recognize(canvas);
      await vi.waitFor(() => expect(harness.recognize).toHaveBeenCalledTimes(2));
      const termination = adapter.terminate();
      await vi.waitFor(() => expect(harness.terminate).toHaveBeenCalledTimes(1));
      if (settlement === 'success') {
        deferred.resolve(lateResult);
      } else {
        deferred.reject(new Error('private-upstream-detail'));
      }

      const error = await expectOcrError(async () => {
        returned = await recognition;
        return returned;
      }, 'OCR_DISPOSED');
      await termination;

      expect(error.message).toBe('OCR adapter has been disposed.');
      expect(returned).toBeUndefined();
      expect(normalizationReads).toBe(0);
      expect(harness.terminate).toHaveBeenCalledTimes(1);
    },
  );

  it('accepts an injected, already-resolved same-origin manifest without resolving again', async () => {
    const assets: ResolvedOcrAssetManifest = Object.freeze({
      workerPath: '/lab/ocr/tesseract/7.0.0/worker/worker.min.js',
      corePath: '/lab/ocr/tesseract/7.0.0/core/',
      langPath: '/lab/ocr/tesseract/7.0.0/lang/4.0.0_best_int/',
      cachePath: 'football-lab-ocr/tesseract-7.0.0/4.0.0_best_int',
    });
    const resolveAssetManifest = vi.fn((_baseUrl: string) => assets);
    const harness = createHarness(createPageFixture(), {
      baseUrl: '/lab/',
      resolveAssetManifest,
    });
    const adapter = new TesseractOcrAdapter(harness.dependencies);

    await adapter.recognize(createCanvas());
    await adapter.recognize(createCanvas());

    expect(resolveAssetManifest).toHaveBeenCalledOnce();
    expect(resolveAssetManifest).toHaveBeenCalledWith('/lab/');
    expect(harness.createWorker.mock.calls[0]?.[2]).toMatchObject(assets);
  });
});
