import {
  type CandidateBatch,
  type DraftSeedResult,
  type MappingResult,
  type NormalizedOcrLine,
  type ProcessedImageTransform,
} from '@football-lottery-analysis-lab/ocr-core';
import { describe, expect, it, vi } from 'vitest';

import { type ProcessedCanvasResult } from './imageWorkspace';
import {
  OcrRunController,
  OcrRunControllerError,
  type OcrRunAdapter,
  type OcrRunControllerDependencies,
  type OcrCandidateDraftSeed,
} from './ocrRunController';
import { type BrowserOcrResult } from './tesseractOcrAdapter';

const TRANSFORM: ProcessedImageTransform = Object.freeze({
  schemaVersion: 'IMAGE_TRANSFORM_V1',
  sourceSize: Object.freeze({ width: 640, height: 480 }),
  normalizedSize: Object.freeze({ width: 640, height: 480 }),
  rotation: 0,
  crop: null,
  redactions: Object.freeze([]),
  processedSize: Object.freeze({ width: 640, height: 480 }),
});

function createInput(): ProcessedCanvasResult {
  return Object.freeze({
    canvas: { width: 640, height: 480 } as HTMLCanvasElement,
    transform: TRANSFORM,
  });
}

function createLines(homeTeam = 'Team A'): readonly NormalizedOcrLine[] {
  return Object.freeze([
    Object.freeze({
      words: Object.freeze([
        Object.freeze({ text: 'MATCH', confidence: 0.99 }),
        Object.freeze({ text: 'REF:', confidence: 0.99 }),
        Object.freeze({ text: 'ALPHA', confidence: 0.99 }),
      ]),
    }),
    Object.freeze({
      words: Object.freeze([
        Object.freeze({ text: 'HOME:', confidence: 0.91 }),
        ...homeTeam.split(' ').map((text) => Object.freeze({ text, confidence: 0.91 })),
      ]),
    }),
  ]);
}

function createOcrResult(homeTeam = 'Team A'): BrowserOcrResult {
  return Object.freeze({
    text: `raw-private-text-${homeTeam}`,
    lines: createLines(homeTeam),
    meanConfidence: 0.91,
  });
}

function createCandidateBatch(): CandidateBatch {
  return {
    schemaVersion: 'OCR_CANDIDATE_V2',
    processedImage: TRANSFORM,
    fields: [],
  };
}

function createMappingResult(): MappingResult {
  return { valid: true, value: createCandidateBatch(), issues: [] };
}

function createDraftResult(): DraftSeedResult {
  return { valid: true, value: { matches: [], markets: [] } };
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

function createAdapter(
  recognize: OcrRunAdapter['recognize'],
): OcrRunAdapter & { terminate: ReturnType<typeof vi.fn> } {
  return {
    recognize,
    terminate: vi.fn(async () => undefined),
  };
}

function createSuccessfulDependencies(
  adapters: OcrRunAdapter[],
  overrides: Partial<OcrRunControllerDependencies> = {},
): OcrRunControllerDependencies {
  let adapterIndex = 0;
  return {
    createAdapter: vi.fn(() => {
      const adapter = adapters[adapterIndex];
      adapterIndex += 1;
      if (adapter === undefined) throw new Error('unexpected adapter creation');
      return adapter;
    }),
    mapCandidates: () => createMappingResult(),
    createDraftSeed: () => createDraftResult(),
    createUuid: () => '550e8400-e29b-41d4-a716-446655440001',
    ...overrides,
  };
}

async function expectControllerError(
  promise: Promise<unknown>,
  code: OcrRunControllerError['code'],
): Promise<void> {
  try {
    await promise;
    throw new Error('expected controller error');
  } catch (error) {
    expect(error).toBeInstanceOf(OcrRunControllerError);
    expect(error).toMatchObject({
      code,
      message: new OcrRunControllerError(code).message,
      name: 'OcrRunControllerError',
    });
    expect((error as Error).message).not.toContain('private');
  }
}

function expectDeepFrozen(value: unknown): void {
  if (typeof value !== 'object' || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(value)) expectDeepFrozen(nested);
}

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (typeof value !== 'object' || value === null) return keys;
  for (const [key, nested] of Object.entries(value)) {
    keys.add(key);
    collectKeys(nested, keys);
  }
  return keys;
}

describe('OcrRunController', () => {
  it('lazily creates one adapter, reuses it for sequential runs, and returns only frozen mapped drafts', async () => {
    const recognize = vi.fn(async () => createOcrResult());
    const adapter = createAdapter(recognize);
    let uuidIndex = 0;
    const dependencies = createSuccessfulDependencies([adapter], {
      mapCandidates: undefined,
      createDraftSeed: undefined,
      createUuid: () => {
        uuidIndex += 1;
        return `550e8400-e29b-41d4-a716-${String(uuidIndex).padStart(12, '0')}`;
      },
    });
    const controller = new OcrRunController(dependencies);

    expect(dependencies.createAdapter).not.toHaveBeenCalled();
    const results: OcrCandidateDraftSeed[] = [];
    for (let runIndex = 0; runIndex < 5; runIndex += 1) {
      results.push(await controller.run(createInput()));
    }

    expect(dependencies.createAdapter).toHaveBeenCalledTimes(1);
    expect(recognize).toHaveBeenCalledTimes(5);
    expect(adapter.terminate).not.toHaveBeenCalled();
    for (const result of results) {
      expect(result.meanConfidence).toBe(0.91);
      expect(result.candidateBatch.fields.find((field) => field.fieldName === 'homeTeam')?.fieldValue)
        .toBe('Team A');
      expect(result.draftSeed.matches[0]?.homeTeam).toBe('Team A');
      expect([...collectKeys(result)]).not.toContain('text');
      expect([...collectKeys(result)]).not.toContain('lines');
      expect([...collectKeys(result)]).not.toContain('canvas');
      expectDeepFrozen(result);
    }
    expect(new Set(results.map((result) => result.candidateBatch)).size).toBe(5);
    expect(JSON.stringify(results)).not.toContain('raw-private-text');
    expect(JSON.stringify(controller)).not.toContain('raw-private-text');
    expect(Object.getOwnPropertyNames(controller)).not.toEqual(
      expect.arrayContaining(['text', 'lines', 'canvas', 'file', 'blob']),
    );
  });

  it('cancels adapter initialization before either a late resolve or rejection can map or publish', async () => {
    for (const lateOutcome of ['resolve', 'reject'] as const) {
      const deferred = createDeferred<BrowserOcrResult>();
      const adapter = createAdapter(vi.fn(() => deferred.promise));
      const mapCandidates = vi.fn(() => createMappingResult());
      const onResult = vi.fn();
      const dependencies = createSuccessfulDependencies([adapter], { mapCandidates, onResult });
      const controller = new OcrRunController(dependencies);

      const pendingRun = controller.run(createInput());
      const cancellation = controller.cancel();
      expect(adapter.terminate).toHaveBeenCalledTimes(1);
      if (lateOutcome === 'resolve') deferred.resolve(createOcrResult());
      else deferred.reject(new Error('private-late-rejection'));

      await cancellation;
      await expectControllerError(pendingRun, 'OCR_CANCELLED');
      expect(mapCandidates).not.toHaveBeenCalled();
      expect(onResult).not.toHaveBeenCalled();
      expect(dependencies.createAdapter).toHaveBeenCalledTimes(1);
    }
  });

  it('cancels a warmed adapter during recognition without mapping or publishing the late result', async () => {
    const deferred = createDeferred<BrowserOcrResult>();
    const recognize = vi.fn()
      .mockResolvedValueOnce(createOcrResult('Warm Team'))
      .mockImplementationOnce(() => deferred.promise);
    const adapter = createAdapter(recognize);
    const mapCandidates = vi.fn(() => createMappingResult());
    const onResult = vi.fn();
    const controller = new OcrRunController(
      createSuccessfulDependencies([adapter], { mapCandidates, onResult }),
    );

    await controller.run(createInput());
    const pendingRun = controller.run(createInput());
    const cancellation = controller.cancel();
    deferred.resolve(createOcrResult('Late Team'));

    await cancellation;
    await expectControllerError(pendingRun, 'OCR_CANCELLED');
    expect(recognize).toHaveBeenCalledTimes(2);
    expect(mapCandidates).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(adapter.terminate).toHaveBeenCalledTimes(1);
  });

  it('replaces a pending input, suppresses its old token, and creates one new adapter for the next run', async () => {
    const deferred = createDeferred<BrowserOcrResult>();
    const oldAdapter = createAdapter(vi.fn(() => deferred.promise));
    const newAdapter = createAdapter(vi.fn(async () => createOcrResult('New Team')));
    const mapCandidates = vi.fn(() => createMappingResult());
    const onResult = vi.fn();
    const dependencies = createSuccessfulDependencies(
      [oldAdapter, newAdapter],
      { mapCandidates, onResult },
    );
    const controller = new OcrRunController(dependencies);

    const oldRun = controller.run(createInput());
    const replacement = controller.replaceInput();
    deferred.resolve(createOcrResult('Old Team'));
    await replacement;
    await expectControllerError(oldRun, 'OCR_CANCELLED');
    expect(mapCandidates).not.toHaveBeenCalled();
    expect(onResult).not.toHaveBeenCalled();

    await controller.run(createInput());
    expect(dependencies.createAdapter).toHaveBeenCalledTimes(2);
    expect(oldAdapter.terminate).toHaveBeenCalledTimes(1);
    expect(newAdapter.recognize).toHaveBeenCalledTimes(1);
  });

  it('disposes permanently and idempotently while a pending run remains a cancellation', async () => {
    for (const lateOutcome of ['resolve', 'reject'] as const) {
      const deferred = createDeferred<BrowserOcrResult>();
      const mapCandidates = vi.fn(() => createMappingResult());
      const onResult = vi.fn();
      let activeWorkers = 0;
      let terminated = false;
      const terminate = vi.fn(async () => {
        if (terminated) return;
        terminated = true;
        await Promise.resolve();
        activeWorkers -= 1;
      });
      const adapter: OcrRunAdapter = {
        recognize: vi.fn(() => deferred.promise),
        terminate,
      };
      const dependencies = createSuccessfulDependencies([], {
        createAdapter: vi.fn(() => {
          activeWorkers += 1;
          return adapter;
        }),
        mapCandidates,
        onResult,
      });
      const controller = new OcrRunController(dependencies);

      const pendingRun = controller.run(createInput());
      expect(activeWorkers).toBe(1);
      const firstDispose = controller.dispose();
      const secondDispose = controller.dispose();

      await Promise.all([firstDispose, secondDispose]);
      expect(activeWorkers).toBe(0);
      if (lateOutcome === 'resolve') deferred.resolve(createOcrResult());
      else deferred.reject(new Error('private-late-rejection'));

      await expectControllerError(pendingRun, 'OCR_CANCELLED');
      expect(activeWorkers).toBe(0);
      expect(mapCandidates).not.toHaveBeenCalled();
      expect(onResult).not.toHaveBeenCalled();
      await expectControllerError(controller.run(createInput()), 'OCR_DISPOSED');
      expect(terminate).toHaveBeenCalledTimes(1);
      expect(dependencies.createAdapter).toHaveBeenCalledTimes(1);
    }
  });

  it('detaches failed recognition and mapping adapters so each retry creates exactly one clean adapter', async () => {
    const failedAdapter = createAdapter(vi.fn(async () => {
      throw new Error('private-recognition-detail');
    }));
    const retryAdapter = createAdapter(vi.fn(async () => createOcrResult()));
    const recognitionDependencies = createSuccessfulDependencies([failedAdapter, retryAdapter]);
    const recognitionController = new OcrRunController(recognitionDependencies);

    await expectControllerError(recognitionController.run(createInput()), 'OCR_RUN_FAILED');
    await recognitionController.run(createInput());
    expect(failedAdapter.terminate).toHaveBeenCalledTimes(1);
    expect(recognitionDependencies.createAdapter).toHaveBeenCalledTimes(2);

    const firstMappingAdapter = createAdapter(vi.fn(async () => createOcrResult()));
    const mappingRetryAdapter = createAdapter(vi.fn(async () => createOcrResult()));
    const onResult = vi.fn();
    const mapCandidates = vi.fn()
      .mockReturnValueOnce({ valid: false, issues: [{ path: 'lines', code: 'PRIVATE', message: 'private' }] })
      .mockReturnValueOnce(createMappingResult());
    const mappingDependencies = createSuccessfulDependencies(
      [firstMappingAdapter, mappingRetryAdapter],
      { mapCandidates, onResult },
    );
    const mappingController = new OcrRunController(mappingDependencies);

    await expectControllerError(mappingController.run(createInput()), 'OCR_MAPPING_FAILED');
    expect(onResult).not.toHaveBeenCalled();
    await mappingController.run(createInput());
    expect(firstMappingAdapter.terminate).toHaveBeenCalledTimes(1);
    expect(mappingDependencies.createAdapter).toHaveBeenCalledTimes(2);
    expect(onResult).toHaveBeenCalledTimes(1);
  });

  it('checks the token again after synchronous mapping reentrantly cancels the run', async () => {
    const adapter = createAdapter(vi.fn(async () => createOcrResult()));
    const onResult = vi.fn();
    let controller!: OcrRunController;
    const mapCandidates = vi.fn(() => {
      void controller.cancel();
      return createMappingResult();
    });
    controller = new OcrRunController(
      createSuccessfulDependencies([adapter], { mapCandidates, onResult }),
    );

    await expectControllerError(controller.run(createInput()), 'OCR_CANCELLED');
    expect(mapCandidates).toHaveBeenCalledTimes(1);
    expect(onResult).not.toHaveBeenCalled();
    expect(adapter.terminate).toHaveBeenCalledTimes(1);
  });

  it('awaits a rejecting callback and treats it as a clean-retry run failure', async () => {
    const firstAdapter = createAdapter(vi.fn(async () => createOcrResult()));
    const retryAdapter = createAdapter(vi.fn(async () => createOcrResult()));
    let callbackCount = 0;
    const onResult = vi.fn(async (result: OcrCandidateDraftSeed) => {
      callbackCount += 1;
      expect([...collectKeys(result)]).not.toEqual(
        expect.arrayContaining(['text', 'lines', 'canvas', 'file', 'blob']),
      );
      expectDeepFrozen(result);
      if (callbackCount === 1) throw new Error('private-callback-detail');
    });
    const dependencies = createSuccessfulDependencies([firstAdapter, retryAdapter], { onResult });
    const controller = new OcrRunController(dependencies);

    await expectControllerError(controller.run(createInput()), 'OCR_RUN_FAILED');
    expect(firstAdapter.terminate).toHaveBeenCalledTimes(1);
    await controller.run(createInput());
    expect(dependencies.createAdapter).toHaveBeenCalledTimes(2);
    expect(onResult).toHaveBeenCalledTimes(2);
  });

  it('awaits a deferred callback and surfaces cancellation when its token changes before settlement', async () => {
    const callbackStarted = createDeferred<void>();
    const callbackSettlement = createDeferred<void>();
    const adapter = createAdapter(vi.fn(async () => createOcrResult()));
    const onResult = vi.fn(() => {
      callbackStarted.resolve();
      return callbackSettlement.promise;
    });
    const controller = new OcrRunController(
      createSuccessfulDependencies([adapter], { onResult }),
    );

    const pendingRun = controller.run(createInput());
    await callbackStarted.promise;
    const cancellation = controller.cancel();
    callbackSettlement.resolve();

    await cancellation;
    await expectControllerError(pendingRun, 'OCR_CANCELLED');
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(adapter.terminate).toHaveBeenCalledTimes(1);
  });

  it('bounds never-settling termination for cancellation and disposal', async () => {
    vi.useFakeTimers();
    try {
      for (const action of ['cancel', 'dispose'] as const) {
        const recognition = createDeferred<BrowserOcrResult>();
        const terminate = vi.fn(() => new Promise<void>(() => undefined));
        const adapter: OcrRunAdapter = {
          recognize: vi.fn(() => recognition.promise),
          terminate,
        };
        const mapCandidates = vi.fn(() => createMappingResult());
        const onResult = vi.fn();
        const controller = new OcrRunController(createSuccessfulDependencies([adapter], {
          mapCandidates,
          onResult,
          terminationTimeoutMs: 5,
        }));

        const pendingRun = controller.run(createInput());
        const cleanup = action === 'cancel' ? controller.cancel() : controller.dispose();
        const cleanupSettled = vi.fn();
        void cleanup.then(cleanupSettled);
        await vi.advanceTimersByTimeAsync(5);
        await Promise.resolve();

        expect(cleanupSettled).toHaveBeenCalledTimes(1);
        await cleanup;
        recognition.resolve(createOcrResult());
        await expectControllerError(pendingRun, 'OCR_CANCELLED');
        expect(mapCandidates).not.toHaveBeenCalled();
        expect(onResult).not.toHaveBeenCalled();
        expect(terminate).toHaveBeenCalledTimes(1);
        if (action === 'dispose') {
          await expectControllerError(controller.run(createInput()), 'OCR_DISPOSED');
        }
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('detaches synchronously so concurrent cancel, replacement, and disposal terminate once', async () => {
    const deferred = createDeferred<BrowserOcrResult>();
    const adapter = createAdapter(vi.fn(() => deferred.promise));
    const dependencies = createSuccessfulDependencies([adapter]);
    const controller = new OcrRunController(dependencies);

    const pendingRun = controller.run(createInput());
    const cancellation = controller.cancel();
    const replacement = controller.replaceInput();
    const disposal = controller.dispose();
    expect(adapter.terminate).toHaveBeenCalledTimes(1);
    deferred.reject(new Error('private-late-rejection'));

    await Promise.all([cancellation, replacement, disposal]);
    await expectControllerError(pendingRun, 'OCR_CANCELLED');
    await expectControllerError(controller.run(createInput()), 'OCR_DISPOSED');
    expect(adapter.terminate).toHaveBeenCalledTimes(1);
    expect(dependencies.createAdapter).toHaveBeenCalledTimes(1);
  });
});
