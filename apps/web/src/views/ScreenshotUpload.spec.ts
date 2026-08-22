import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ImageWorkspace from '@/components/ocr/ImageWorkspace.vue';
import type { OcrCandidateDraftSeed } from '@/ocr/ocrRunController';

import ScreenshotUpload from './ScreenshotUpload.vue';
import screenshotUploadSource from './ScreenshotUpload.vue?raw';

const testHarness = vi.hoisted(() => ({
  inspectImageFileHeader: vi.fn(),
  workspaceCreate: vi.fn(),
  ocrDependencies: [] as unknown[],
  adapterDependencies: [] as unknown[],
  adapterRecognize: vi.fn(),
  runController: null as MockRunController | null,
}));

vi.mock('@/ocr/browserImageFile', () => {
  class BrowserImageFileError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return {
    BrowserImageFileError,
    inspectImageFileHeader: testHarness.inspectImageFileHeader,
  };
});

vi.mock('@/ocr/imageWorkspace', () => {
  class ImageWorkspaceError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return {
    ImageWorkspaceError,
    ImageWorkspaceController: class {
      static create(file: File) {
        return testHarness.workspaceCreate(file);
      }
    },
  };
});

vi.mock('@/ocr/ocrRunController', () => {
  const OcrRunController = vi.fn(function MockOcrRunController(dependencies: unknown) {
    testHarness.ocrDependencies.push(dependencies);
    if (testHarness.runController === null) throw new Error('missing run controller');
    return testHarness.runController;
  });
  return {
    OcrRunController,
    OcrRunControllerError: class extends Error {
    constructor(readonly code: string) {
      super(code);
    }
    },
  };
});

vi.mock('@/ocr/tesseractOcrAdapter', () => ({
  TesseractOcrAdapter: class {
    readonly recognize = testHarness.adapterRecognize;
    readonly terminate = vi.fn(async () => undefined);

    constructor(dependencies: unknown) {
      testHarness.adapterDependencies.push(dependencies);
    }
  },
}));

interface MockWorkspaceController {
  snapshot: ReturnType<typeof vi.fn>;
  rotate: ReturnType<typeof vi.fn>;
  setCrop: ReturnType<typeof vi.fn>;
  addRedaction: ReturnType<typeof vi.fn>;
  removeRedaction: ReturnType<typeof vi.fn>;
  clearRedactions: ReturnType<typeof vi.fn>;
  renderForOcr: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

interface MockRunController {
  run: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
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

const TRANSFORM = Object.freeze({
  schemaVersion: 'IMAGE_TRANSFORM_V1' as const,
  sourceSize: Object.freeze({ width: 320, height: 180 }),
  normalizedSize: Object.freeze({ width: 320, height: 180 }),
  rotation: 0 as const,
  crop: null,
  redactions: Object.freeze([]),
  processedSize: Object.freeze({ width: 320, height: 180 }),
});

const OCR_RESULT: OcrCandidateDraftSeed = {
  candidateBatch: {
    schemaVersion: 'OCR_CANDIDATE_V2',
    processedImage: TRANSFORM,
    fields: [
      {
        fieldId: '550e8400-e29b-41d4-a716-446655440001',
        entityType: 'MATCH',
        entityKey: '550e8400-e29b-41d4-a716-446655440002',
        fieldName: 'league',
        fieldValue: 'Observed League 42',
        confidence: 0.88,
      },
      {
        fieldId: '550e8400-e29b-41d4-a716-446655440003',
        entityType: 'MATCH',
        entityKey: '550e8400-e29b-41d4-a716-446655440002',
        fieldName: 'homeTeam',
        fieldValue: 'Verifiable Rovers',
        confidence: 0.74,
      },
    ],
  },
  draftSeed: {
    matches: [
      {
        draftMatchKey: '550e8400-e29b-41d4-a716-446655440002',
        matchDate: '',
        league: 'Observed League 42',
        homeTeam: 'Verifiable Rovers',
        awayTeam: '',
        kickoffTime: '',
        evidence: {
          league: {
            fieldId: '550e8400-e29b-41d4-a716-446655440001',
            confidence: 0.88,
          },
          homeTeam: {
            fieldId: '550e8400-e29b-41d4-a716-446655440003',
            confidence: 0.74,
          },
        },
      },
    ],
    markets: [],
  },
  meanConfidence: 0.81,
};

function createWorkspaceController(previewUrl = 'blob:local-preview'): MockWorkspaceController {
  const snapshot = {
    previewUrl,
    normalizedWidth: 320,
    normalizedHeight: 180,
    rotation: 0,
    crop: null,
    redactions: [],
  };
  return {
    snapshot: vi.fn(() => snapshot),
    rotate: vi.fn(),
    setCrop: vi.fn(),
    addRedaction: vi.fn(),
    removeRedaction: vi.fn(),
    clearRedactions: vi.fn(),
    renderForOcr: vi.fn(() => ({ canvas: { width: 320, height: 180 }, transform: TRANSFORM })),
    dispose: vi.fn(),
  };
}

function createRunController(result: OcrCandidateDraftSeed = OCR_RESULT): MockRunController {
  return {
    run: vi.fn(async (input: { canvas: HTMLCanvasElement }) => {
      const dependencies = testHarness.ocrDependencies.at(-1) as {
        createAdapter?: () => unknown;
      } | undefined;
      const adapter = dependencies?.createAdapter?.() as {
        recognize?: (canvas: HTMLCanvasElement) => Promise<unknown>;
      } | undefined;
      if (adapter?.recognize === undefined) throw new Error('missing OCR adapter');
      await adapter.recognize(input.canvas);
      return result;
    }),
    cancel: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
  };
}

function mountPage(): { wrapper: VueWrapper; pinia: Pinia } {
  const pinia = createPinia();
  setActivePinia(pinia);
  return {
    wrapper: mount(ScreenshotUpload, { global: { plugins: [pinia] } }),
    pinia,
  };
}

async function declareUserOwnedSource(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('input[value="USER_OWNED_AUTHORIZED"]').setValue(true);
  for (const acknowledgement of wrapper.findAll('input[type="checkbox"]')) {
    await acknowledgement.setValue(true);
  }
}

async function selectFile(wrapper: VueWrapper, file: File): Promise<void> {
  const input = wrapper.get('input[type="file"]');
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: [file],
  });
  await input.trigger('change');
  await flushPromises();
}

async function beginFileSelection(wrapper: VueWrapper, file: File): Promise<void> {
  const input = wrapper.get('input[type="file"]');
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: [file],
  });
  await input.trigger('change');
}

describe('ScreenshotUpload', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    testHarness.inspectImageFileHeader.mockReset();
    testHarness.inspectImageFileHeader.mockResolvedValue({
      mimeType: 'image/png',
      width: 320,
      height: 180,
    });
    testHarness.workspaceCreate.mockReset();
    testHarness.ocrDependencies.length = 0;
    testHarness.adapterDependencies.length = 0;
    testHarness.adapterRecognize.mockReset();
    testHarness.adapterRecognize.mockResolvedValue({
      text: 'recognized local evidence',
      lines: [
        {
          words: [
            { text: 'MATCH', confidence: 0.9 },
            { text: 'REF:', confidence: 0.9 },
          ],
        },
      ],
      meanConfidence: 0.9,
    });
    testHarness.runController = createRunController();
  });

  it('contains no legacy HTTP workflow imports or mock provider', () => {
    for (const token of [
      '@/api/ocrWorkflow',
      'useOcrWorkflowStore',
      'BROWSER_LOCAL_MOCK',
      'createScreenshotTask',
      'parseLocalOcrResult',
      'rawText',
      'fileName',
      'Fictional Coastal League',
      'Northport United',
      'Lakeside City',
    ]) {
      expect(screenshotUploadSource).not.toContain(token);
    }
  });

  it('inspects and prepares a user file locally, then shows only real mapped candidates', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const workspace = createWorkspaceController();
    testHarness.workspaceCreate.mockResolvedValue(workspace);
    const { wrapper } = mountPage();
    expect(wrapper.get('input[type="file"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-testid="start-ocr"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('input[type="radio"]:checked').exists()).toBe(false);
    await declareUserOwnedSource(wrapper);

    const file = new File([new Uint8Array([137, 80, 78, 71])], 'private-selection.png', {
      type: 'image/png',
    });
    await selectFile(wrapper, file);
    await wrapper.get('[data-testid="start-ocr"]').trigger('click');
    await flushPromises();

    expect(testHarness.inspectImageFileHeader).toHaveBeenCalledWith(file);
    expect(testHarness.workspaceCreate).toHaveBeenCalledWith(file);
    expect(workspace.renderForOcr).toHaveBeenCalledTimes(1);
    const processedInput = workspace.renderForOcr.mock.results[0]?.value;
    expect(testHarness.adapterRecognize).toHaveBeenCalledTimes(1);
    expect(testHarness.adapterRecognize).toHaveBeenCalledWith(processedInput.canvas);
    expect(testHarness.ocrDependencies).toHaveLength(1);
    expect(testHarness.adapterDependencies).toHaveLength(1);
    expect(testHarness.adapterDependencies[0]).toEqual(expect.objectContaining({
      onProgress: expect.any(Function),
      onWarning: expect.any(Function),
    }));
    expect(wrapper.text()).toContain('Observed League 42');
    expect(wrapper.text()).toContain('Verifiable Rovers');
    expect(wrapper.text()).not.toContain('private-selection.png');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('[quality] invalidates deferred preparation on source changes and disposes its late workspace', async () => {
    const workspaceDeferred = createDeferred<MockWorkspaceController>();
    const lateWorkspace = createWorkspaceController('blob:late-policy-preview');
    testHarness.workspaceCreate.mockImplementation(() => workspaceDeferred.promise);
    const { wrapper, pinia } = mountPage();
    await declareUserOwnedSource(wrapper);
    await beginFileSelection(
      wrapper,
      new File(['old-policy'], 'old-policy.png', { type: 'image/png' }),
    );
    await flushPromises();
    expect(testHarness.workspaceCreate).toHaveBeenCalledTimes(1);

    await wrapper.get('input[value="FICTIONAL_SAMPLE"]').setValue(true);
    workspaceDeferred.resolve(lateWorkspace);
    await flushPromises();

    expect(lateWorkspace.dispose).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[aria-label="本地图片元数据"]').exists()).toBe(false);
    expect(wrapper.getComponent(ImageWorkspace).props('workspace')).toBeNull();
    expect(pinia.state.value.localOcrSession?.candidateBatch).toBeNull();
  });

  it('[quality] keeps a new preparation busy when an invalidated acknowledgement run rejects late', async () => {
    const oldWorkspaceDeferred = createDeferred<MockWorkspaceController>();
    const newWorkspaceDeferred = createDeferred<MockWorkspaceController>();
    const newWorkspace = createWorkspaceController('blob:new-policy-preview');
    testHarness.workspaceCreate
      .mockImplementationOnce(() => oldWorkspaceDeferred.promise)
      .mockImplementationOnce(() => newWorkspaceDeferred.promise);
    const { wrapper } = mountPage();
    await declareUserOwnedSource(wrapper);
    await beginFileSelection(
      wrapper,
      new File(['old-ack'], 'old-ack.png', { type: 'image/png' }),
    );
    await flushPromises();

    const firstAcknowledgement = wrapper.get('input[type="checkbox"]');
    await firstAcknowledgement.setValue(false);
    await firstAcknowledgement.setValue(true);
    await beginFileSelection(
      wrapper,
      new File(['new-ack'], 'new-ack.png', { type: 'image/png' }),
    );
    await flushPromises();
    expect(testHarness.workspaceCreate).toHaveBeenCalledTimes(2);

    oldWorkspaceDeferred.reject(new Error('late old workspace failure'));
    await flushPromises();
    expect(wrapper.get('input[type="file"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[aria-label="本地图片元数据"]').exists()).toBe(false);

    newWorkspaceDeferred.resolve(newWorkspace);
    await flushPromises();
    expect(wrapper.get('input[type="file"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[aria-label="本地图片元数据"]').exists()).toBe(true);
  });

  it('forwards serializable workspace commands to the local controller', async () => {
    const workspace = createWorkspaceController();
    testHarness.workspaceCreate.mockResolvedValue(workspace);
    const { wrapper } = mountPage();
    await declareUserOwnedSource(wrapper);
    await selectFile(wrapper, new File(['safe'], 'commands.png', { type: 'image/png' }));

    const component = wrapper.getComponent(ImageWorkspace);
    component.vm.$emit('rotate', 'RIGHT');
    component.vm.$emit('set-crop', { x: 1, y: 2, width: 30, height: 40 });
    component.vm.$emit('add-redaction', { x: 5, y: 6, width: 7, height: 8 });
    component.vm.$emit('remove-redaction', 0);
    component.vm.$emit('clear-redactions');
    await wrapper.vm.$nextTick();

    expect(workspace.rotate).toHaveBeenCalledWith('RIGHT');
    expect(workspace.setCrop).toHaveBeenCalledWith({ x: 1, y: 2, width: 30, height: 40 });
    expect(workspace.addRedaction).toHaveBeenCalledWith({ x: 5, y: 6, width: 7, height: 8 });
    expect(workspace.removeRedaction).toHaveBeenCalledWith(0);
    expect(workspace.clearRedactions).toHaveBeenCalledTimes(1);
    expect(workspace.snapshot).toHaveBeenCalledTimes(6);
  });

  it('fetches the fictional fixture only as a same-origin GET and uses the local pipeline', async () => {
    const fixture = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    const expectedUrl = new URL('/ocr-samples/fictional-golden.png', window.location.href).href;
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      redirected: false,
      url: expectedUrl,
      blob: async () => fixture,
    }));
    vi.stubGlobal('fetch', fetchSpy);
    testHarness.workspaceCreate.mockResolvedValue(createWorkspaceController('blob:fixture-preview'));
    const { wrapper } = mountPage();

    await wrapper.get('[data-testid="fictional-sample"]').trigger('click');
    await flushPromises();

    expect(fetchSpy).toHaveBeenCalledWith('/ocr-samples/fictional-golden.png', {
      method: 'GET',
      redirect: 'error',
      credentials: 'same-origin',
    });
    expect(fetchSpy.mock.calls.map((call) => call[1]?.body)).toEqual([undefined]);
    const preparedFile = testHarness.workspaceCreate.mock.calls[0]?.[0];
    expect(preparedFile).toBeInstanceOf(File);
    expect(preparedFile.type).toBe('image/png');
    expect(testHarness.inspectImageFileHeader).toHaveBeenCalledWith(preparedFile);
    expect(wrapper.get('input[value="FICTIONAL_SAMPLE"]').element).toMatchObject({ checked: true });
  });

  it('[quality] rejects redirected, missing, or cross-origin fictional fixture responses before blob access', async () => {
    const expectedUrl = new URL('/ocr-samples/fictional-golden.png', window.location.href).href;
    for (const response of [
      { redirected: true, url: expectedUrl },
      { redirected: false, url: '' },
      { redirected: false, url: 'https://untrusted.example/ocr-samples/fictional-golden.png' },
    ]) {
      const blob = vi.fn(async () => new Blob(['unsafe'], { type: 'image/png' }));
      const fetchSpy = vi.fn(async () => ({ ok: true, ...response, blob }));
      vi.stubGlobal('fetch', fetchSpy);
      testHarness.workspaceCreate.mockClear();
      testHarness.inspectImageFileHeader.mockClear();
      const { wrapper } = mountPage();

      await wrapper.get('[data-testid="fictional-sample"]').trigger('click');
      await flushPromises();

      expect(blob).not.toHaveBeenCalled();
      expect(testHarness.inspectImageFileHeader).not.toHaveBeenCalled();
      expect(testHarness.workspaceCreate).not.toHaveBeenCalled();
      wrapper.unmount();
    }
  });

  it('[quality] ignores callbacks from a disposed failed run after retry creates a new controller', async () => {
    const oldDispose = createDeferred<void>();
    const firstRun = createRunController();
    firstRun.run.mockImplementation(async (input: { canvas: HTMLCanvasElement }) => {
      const dependencies = testHarness.ocrDependencies.at(-1) as {
        createAdapter?: () => { recognize(canvas: HTMLCanvasElement): Promise<unknown> };
      };
      const adapter = dependencies.createAdapter?.();
      if (adapter === undefined) throw new Error('missing first adapter');
      await adapter.recognize(input.canvas);
      throw new Error('first run failed');
    });
    firstRun.dispose.mockImplementation(() => oldDispose.promise);
    testHarness.runController = firstRun;
    const workspace = createWorkspaceController('blob:callback-preview');
    testHarness.workspaceCreate.mockResolvedValue(workspace);
    const { wrapper } = mountPage();
    await declareUserOwnedSource(wrapper);
    await selectFile(wrapper, new File(['callbacks'], 'callbacks.png', { type: 'image/png' }));
    await wrapper.get('[data-testid="start-ocr"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('识别未完成');
    const oldCallbacks = testHarness.adapterDependencies[0] as {
      onProgress(event: { status: string; progress: number }): void;
      onWarning(warning: { code: string; message: string }): void;
    };

    const retryResult = createDeferred<OcrCandidateDraftSeed>();
    const retryRun = createRunController();
    retryRun.run.mockImplementation(async (input: { canvas: HTMLCanvasElement }) => {
      const dependencies = testHarness.ocrDependencies.at(-1) as {
        createAdapter?: () => { recognize(canvas: HTMLCanvasElement): Promise<unknown> };
      };
      const adapter = dependencies.createAdapter?.();
      if (adapter === undefined) throw new Error('missing retry adapter');
      await adapter.recognize(input.canvas);
      return retryResult.promise;
    });
    testHarness.runController = retryRun;
    await wrapper.get('[data-testid="retry-ocr"]').trigger('click');
    expect(firstRun.dispose).toHaveBeenCalledTimes(1);
    oldDispose.resolve();
    await flushPromises();
    expect(testHarness.ocrDependencies).toHaveLength(2);
    const newCallbacks = testHarness.adapterDependencies[1] as typeof oldCallbacks;

    newCallbacks.onProgress({ status: 'recognizing text', progress: 0.4 });
    newCallbacks.onWarning({ code: 'OCR_CACHE_UNAVAILABLE', message: 'new cache warning' });
    await wrapper.vm.$nextTick();
    expect(wrapper.get('progress').attributes('value')).toBe('38');
    expect(wrapper.text()).toContain('new cache warning');

    oldCallbacks.onProgress({ status: 'recognizing text', progress: 0.99 });
    oldCallbacks.onWarning({ code: 'OCR_CACHE_UNAVAILABLE', message: 'stale cache warning' });
    await wrapper.vm.$nextTick();
    expect(wrapper.get('progress').attributes('value')).toBe('38');
    expect(wrapper.text()).toContain('new cache warning');
    expect(wrapper.text()).not.toContain('stale cache warning');
  });

  it('disposes old resources on replacement and suppresses a late OCR result', async () => {
    let resolveLate!: (result: OcrCandidateDraftSeed) => void;
    const lateResult = new Promise<OcrCandidateDraftSeed>((resolve) => {
      resolveLate = resolve;
    });
    const oldRun = createRunController();
    oldRun.run.mockImplementation(() => lateResult);
    testHarness.runController = oldRun;
    const oldWorkspace = createWorkspaceController('blob:old-preview');
    const newWorkspace = createWorkspaceController('blob:new-preview');
    testHarness.workspaceCreate
      .mockResolvedValueOnce(oldWorkspace)
      .mockResolvedValueOnce(newWorkspace);
    const { wrapper, pinia } = mountPage();
    await declareUserOwnedSource(wrapper);
    await selectFile(wrapper, new File(['old'], 'old.png', { type: 'image/png' }));
    await wrapper.get('[data-testid="start-ocr"]').trigger('click');
    await wrapper.vm.$nextTick();

    await selectFile(wrapper, new File(['new'], 'new.png', { type: 'image/png' }));
    resolveLate(OCR_RESULT);
    await flushPromises();

    expect(oldRun.dispose).toHaveBeenCalledTimes(1);
    expect(oldWorkspace.dispose).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).not.toContain('Observed League 42');
    expect(pinia.state.value.localOcrSession?.candidateBatch).toBeNull();

    const cancellingRun = createRunController();
    cancellingRun.run.mockImplementation(() => new Promise(() => undefined));
    testHarness.runController = cancellingRun;
    await wrapper.get('[data-testid="start-ocr"]').trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-testid="cancel-ocr"]').trigger('click');
    await flushPromises();
    expect(cancellingRun.dispose).toHaveBeenCalledTimes(1);
    expect(newWorkspace.dispose).toHaveBeenCalledTimes(1);
  });

  it('unmounts with synchronous transient-state clearing and complete teardown', async () => {
    const workspace = createWorkspaceController();
    testHarness.workspaceCreate.mockResolvedValue(workspace);
    const runController = createRunController();
    testHarness.runController = runController;
    const { wrapper, pinia } = mountPage();
    await declareUserOwnedSource(wrapper);
    await selectFile(wrapper, new File(['safe'], 'cancel.png', { type: 'image/png' }));
    await wrapper.get('[data-testid="start-ocr"]').trigger('click');
    await flushPromises();
    expect(pinia.state.value.localOcrSession?.candidateBatch).not.toBeNull();

    wrapper.unmount();
    expect(pinia.state.value.localOcrSession?.candidateBatch).toBeNull();
    await flushPromises();
    expect(runController.dispose).toHaveBeenCalledTimes(1);
    expect(workspace.dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps review unavailable before local candidates and enables the local review transition after OCR', async () => {
    testHarness.workspaceCreate.mockResolvedValue(createWorkspaceController());
    const { wrapper } = mountPage();

    expect(wrapper.get('[data-testid="continue-review-unavailable"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="continue-review"]').exists()).toBe(false);

    await declareUserOwnedSource(wrapper);
    await selectFile(wrapper, new File(['safe'], 'review.png', { type: 'image/png' }));
    await wrapper.get('[data-testid="start-ocr"]').trigger('click');
    await flushPromises();

    const continueLink = wrapper.get('[data-testid="continue-review"]');
    expect(continueLink.attributes('href')).toBe('/ocr-review');
    expect(wrapper.text()).toContain('Observed League 42');
  });
});
