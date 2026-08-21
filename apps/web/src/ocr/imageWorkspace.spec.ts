import {
  transformBoundingBox,
  validateProcessedImageTransform,
  type PixelRect,
} from '@football-lottery-analysis-lab/ocr-core';
import { describe, expect, it, vi } from 'vitest';

import {
  ImageWorkspaceController,
  ImageWorkspaceError,
  type ImageWorkspaceDependencies,
} from './imageWorkspace';

interface RecordedCanvasOperation {
  name: string;
  args: readonly unknown[];
}

interface FakeCanvas {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  operations: RecordedCanvasOperation[];
}

function createFakeCanvas(hasContext = true): FakeCanvas {
  const operations: RecordedCanvasOperation[] = [];
  const contextRecord = {
    clearRect: vi.fn((...args: unknown[]) => operations.push({ name: 'clearRect', args })),
    setTransform: vi.fn((...args: unknown[]) => operations.push({ name: 'setTransform', args })),
    translate: vi.fn((...args: unknown[]) => operations.push({ name: 'translate', args })),
    rotate: vi.fn((...args: unknown[]) => operations.push({ name: 'rotate', args })),
    drawImage: vi.fn((...args: unknown[]) => operations.push({ name: 'drawImage', args })),
    fillRect: vi.fn((...args: unknown[]) => operations.push({ name: 'fillRect', args })),
  };
  Object.defineProperty(contextRecord, 'fillStyle', {
    configurable: true,
    get: () => '#000000',
    set: (value: unknown) => operations.push({ name: 'fillStyle', args: [value] }),
  });
  const context = contextRecord as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 17,
    height: 19,
    getContext: vi.fn((kind: string) => (kind === '2d' && hasContext ? context : null)),
  } as unknown as HTMLCanvasElement;

  return { canvas, context, operations };
}

function createBitmap(width: number, height: number) {
  return {
    width,
    height,
    close: vi.fn(),
  } as unknown as ImageBitmap;
}

function privateFile(): File {
  const file = new Blob(['private pixels'], { type: 'image/png' }) as File;
  Object.defineProperty(file, 'name', {
    configurable: true,
    get: () => {
      throw new Error('private-file-name.png');
    },
  });
  return file;
}

function createHarness(
  width = 4000,
  height = 3000,
  sourceSize = { width, height },
) {
  const bitmap = createBitmap(width, height);
  const canvases: FakeCanvas[] = [];
  const inspectImageFileHeader = vi.fn(async (_file: File) => ({
    mimeType: 'image/png' as const,
    width: sourceSize.width,
    height: sourceSize.height,
  }));
  const createImageBitmap = vi.fn(async (
    _image: ImageBitmapSource,
    _options?: ImageBitmapOptions,
  ) => bitmap);
  const createObjectURL = vi.fn((_object: Blob | MediaSource) => 'blob:local-preview');
  const revokeObjectURL = vi.fn();
  const createCanvas = vi.fn(() => {
    const fake = createFakeCanvas();
    canvases.push(fake);
    return fake.canvas;
  });
  const deps: ImageWorkspaceDependencies = {
    inspectImageFileHeader,
    createImageBitmap,
    createObjectURL,
    revokeObjectURL,
    createCanvas,
  };

  return {
    bitmap,
    canvases,
    inspectImageFileHeader,
    createImageBitmap,
    createObjectURL,
    revokeObjectURL,
    createCanvas,
    deps,
  };
}

function expectWorkspaceError(action: () => unknown, code: ImageWorkspaceError['code']): ImageWorkspaceError {
  let error: unknown;
  try {
    action();
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(ImageWorkspaceError);
  expect(error).toMatchObject({ code });
  return error as ImageWorkspaceError;
}

describe('ImageWorkspaceController', () => {
  it('normalizes EXIF orientation exactly once and exposes only a detached local preview snapshot', async () => {
    const harness = createHarness(1440, 1000);
    const file = privateFile();

    const workspace = await ImageWorkspaceController.create(file, harness.deps);
    const snapshot = workspace.snapshot();

    expect(harness.createImageBitmap).toHaveBeenCalledTimes(1);
    expect(harness.createImageBitmap.mock.calls[0]?.[0]).toBe(file);
    expect(harness.createImageBitmap.mock.calls[0]?.[1]).toEqual({
      imageOrientation: 'from-image',
    });
    expect(harness.createObjectURL.mock.calls[0]?.[0]).toBe(file);
    expect(snapshot).toEqual({
      previewUrl: 'blob:local-preview',
      normalizedWidth: 1440,
      normalizedHeight: 1000,
      rotation: 0,
      crop: null,
      redactions: [],
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.redactions)).toBe(true);
    expect('file' in snapshot).toBe(false);
    expect('bitmap' in snapshot).toBe(false);
    expect('canvas' in snapshot).toBe(false);
  });

  it.each([
    ['zero', 0, 10],
    ['fractional', 10.5, 10],
    ['unsafe integer', Number.MAX_SAFE_INTEGER + 1, 1],
  ])('fails closed and releases resources for %s decoded dimensions', async (_label, width, height) => {
    const harness = createHarness(width, height, { width: 10, height: 10 });
    let error: unknown;

    try {
      await ImageWorkspaceController.create(privateFile(), harness.deps);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ImageWorkspaceError);
    expect(error).toMatchObject({ code: 'INVALID_BITMAP_DIMENSIONS' });
    expect(harness.bitmap.close).toHaveBeenCalledTimes(1);
    expect(harness.revokeObjectURL).toHaveBeenCalledOnce();
    expect(harness.revokeObjectURL).toHaveBeenCalledWith('blob:local-preview');
  });

  it('wraps decode failures without leaking details and revokes a partially created preview URL', async () => {
    const harness = createHarness();
    harness.createImageBitmap.mockRejectedValueOnce(new Error('C:/private/image.png'));
    let error: unknown;

    try {
      await ImageWorkspaceController.create(privateFile(), harness.deps);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ImageWorkspaceError);
    expect(error).toMatchObject({ code: 'IMAGE_DECODE_FAILED' });
    expect((error as Error).message).not.toContain('private');
    expect(harness.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(harness.bitmap.close).not.toHaveBeenCalled();
  });

  it('rotates only in 90-degree modulo steps while normalized dimensions stay authoritative', async () => {
    const harness = createHarness(1440, 1000);
    const workspace = await ImageWorkspaceController.create(privateFile(), harness.deps);

    workspace.rotate('RIGHT');
    expect(workspace.snapshot()).toMatchObject({
      normalizedWidth: 1440,
      normalizedHeight: 1000,
      rotation: 90,
    });
    workspace.rotate('RIGHT');
    workspace.rotate('RIGHT');
    workspace.rotate('RIGHT');
    expect(workspace.snapshot().rotation).toBe(0);
    workspace.rotate('LEFT');
    expect(workspace.snapshot().rotation).toBe(270);
  });

  it('keeps raw source dimensions separate from the EXIF-normalized bitmap dimensions', async () => {
    const harness = createHarness(200, 100, { width: 100, height: 200 });
    const file = privateFile();
    const workspace = await ImageWorkspaceController.create(file, harness.deps);

    const result = workspace.renderForOcr();

    expect(harness.inspectImageFileHeader).toHaveBeenCalledTimes(1);
    expect(harness.inspectImageFileHeader.mock.calls[0]?.[0]).toBe(file);
    expect(result.transform.sourceSize).toEqual({ width: 100, height: 200 });
    expect(result.transform.normalizedSize).toEqual({ width: 200, height: 100 });
  });

  it('clears the interaction crop only after a successful rotation and renders the new full extent', async () => {
    const harness = createHarness(4000, 3000);
    const workspace = await ImageWorkspaceController.create(privateFile(), harness.deps);
    const crop = { x: 10, y: 20, width: 1000, height: 1200 };
    workspace.setCrop(crop);

    expectWorkspaceError(
      () => workspace.rotate('UP' as unknown as 'LEFT'),
      'INVALID_GEOMETRY',
    );
    expect(workspace.snapshot()).toMatchObject({ rotation: 0, crop });

    workspace.rotate('RIGHT');
    expect(workspace.snapshot()).toMatchObject({ rotation: 90, crop: null });
    const result = workspace.renderForOcr();
    expect(result.transform.crop).toBeNull();
    expect(result.transform.processedSize).toEqual({ width: 1800, height: 2400 });
  });

  it('copies interaction geometry and returns deeply frozen detached snapshots', async () => {
    const harness = createHarness(100, 80);
    const workspace = await ImageWorkspaceController.create(privateFile(), harness.deps);
    const crop: PixelRect = { x: 1.2, y: 2.3, width: 40.4, height: 30.5 };
    const redaction: PixelRect = { x: 5.5, y: 6.5, width: 7.5, height: 8.5 };

    workspace.setCrop(crop);
    workspace.addRedaction(redaction);
    crop.x = 99;
    redaction.width = 99;
    const snapshot = workspace.snapshot();

    expect(snapshot.crop).toEqual({ x: 1.2, y: 2.3, width: 40.4, height: 30.5 });
    expect(snapshot.redactions).toEqual([{ x: 5.5, y: 6.5, width: 7.5, height: 8.5 }]);
    expect(Object.isFrozen(snapshot.crop)).toBe(true);
    expect(Object.isFrozen(snapshot.redactions[0])).toBe(true);
    expect(() => {
      (snapshot.redactions[0] as PixelRect).x = 12;
    }).toThrow(TypeError);
    expect(workspace.snapshot().redactions[0]?.x).toBe(5.5);
  });

  it('normalizes crop edges to bounded Canvas integers and uses Core scaling with exact axis ratios', async () => {
    const harness = createHarness(4000, 3000);
    const workspace = await ImageWorkspaceController.create(privateFile(), harness.deps);
    workspace.rotate('RIGHT');
    workspace.setCrop({ x: 10.8, y: 20.2, width: 2500.1, height: 3500.3 });
    workspace.addRedaction({ x: 20.5, y: 1000.25, width: 10.5, height: 6.75 });
    workspace.addRedaction({ x: 100, y: 1000, width: 30, height: 40 });

    const result = workspace.renderForOcr();
    const fake = harness.canvases[0];

    expect(result.canvas).toBe(fake?.canvas);
    expect(result.canvas.width).toBe(1714);
    expect(result.canvas.height).toBe(2400);
    expect(result.transform).toEqual({
      schemaVersion: 'IMAGE_TRANSFORM_V1',
      sourceSize: { width: 4000, height: 3000 },
      normalizedSize: { width: 4000, height: 3000 },
      rotation: 90,
      crop: { x: 10, y: 20, width: 2501, height: 3501 },
      redactions: [
        { x: 20.5, y: 1000.25, width: 10.5, height: 6.75 },
        { x: 100, y: 1000, width: 30, height: 40 },
      ],
      processedSize: { width: 1714, height: 2400 },
    });
    expect(() => validateProcessedImageTransform(result.transform)).not.toThrow();
    const firstProcessedRedaction = transformBoundingBox(
      { x: 20.5, y: 1000.25, width: 10.5, height: 6.75 },
      result.transform,
    );
    const secondProcessedRedaction = transformBoundingBox(
      { x: 100, y: 1000, width: 30, height: 40 },
      result.transform,
    );
    expect(fake?.operations).toEqual([
      { name: 'clearRect', args: [0, 0, 1714, 2400] },
      { name: 'setTransform', args: [1714 / 2501, 0, 0, 2400 / 3501, -10 * (1714 / 2501), -20 * (2400 / 3501)] },
      { name: 'translate', args: [3000, 0] },
      { name: 'rotate', args: [Math.PI / 2] },
      { name: 'drawImage', args: [harness.bitmap, 0, 0] },
      { name: 'setTransform', args: [1, 0, 0, 1, 0, 0] },
      { name: 'fillStyle', args: ['#000000'] },
      {
        name: 'fillRect',
        args: [
          firstProcessedRedaction.x,
          firstProcessedRedaction.y,
          firstProcessedRedaction.width,
          firstProcessedRedaction.height,
        ],
      },
      {
        name: 'fillRect',
        args: [
          secondProcessedRedaction.x,
          secondProcessedRedaction.y,
          secondProcessedRedaction.width,
          secondProcessedRedaction.height,
        ],
      },
    ]);
    expect(Object.keys(result).sort()).toEqual(['canvas', 'transform']);
    expect('file' in result).toBe(false);
    expect('bitmap' in result).toBe(false);
  });

  it('does not enlarge a null-crop image and uses the full rotated integer extent', async () => {
    const harness = createHarness(320, 200);
    const workspace = await ImageWorkspaceController.create(privateFile(), harness.deps);
    const redaction = { x: 10.25, y: 20.5, width: 30.75, height: 40.25 };
    workspace.addRedaction(redaction);

    const result = workspace.renderForOcr();
    const processedRedaction = transformBoundingBox(redaction, result.transform);

    expect(result.canvas).toMatchObject({ width: 320, height: 200 });
    expect(result.transform.crop).toBeNull();
    expect(result.transform.processedSize).toEqual({ width: 320, height: 200 });
    expect(harness.canvases[0]?.operations).toContainEqual({
      name: 'setTransform',
      args: [1, 0, 0, 1, 0, 0],
    });
    expect(harness.canvases[0]?.operations).toContainEqual({
      name: 'fillRect',
      args: [
        processedRedaction.x,
        processedRedaction.y,
        processedRedaction.width,
        processedRedaction.height,
      ],
    });
  });

  it('clamps intersecting crop edges but rejects empty or invalid interaction geometry', async () => {
    const harness = createHarness(100, 80);
    const workspace = await ImageWorkspaceController.create(privateFile(), harness.deps);
    workspace.setCrop({ x: -0.4, y: 9.2, width: 20.6, height: 10.1 });

    expect(workspace.renderForOcr().transform.crop).toEqual({
      x: 0,
      y: 9,
      width: 21,
      height: 11,
    });

    expectWorkspaceError(
      () => workspace.setCrop({ x: 1, y: 1, width: 0, height: 1 }),
      'INVALID_GEOMETRY',
    );
    workspace.setCrop({ x: 200, y: 200, width: 10, height: 10 });
    expectWorkspaceError(() => workspace.renderForOcr(), 'INVALID_GEOMETRY');
  });

  it('removes redactions by strict index and can clear all redactions', async () => {
    const workspace = await ImageWorkspaceController.create(privateFile(), createHarness(100, 80).deps);
    workspace.addRedaction({ x: 1, y: 1, width: 2, height: 2 });
    workspace.addRedaction({ x: 3, y: 3, width: 4, height: 4 });

    workspace.removeRedaction(0);
    expect(workspace.snapshot().redactions).toEqual([{ x: 3, y: 3, width: 4, height: 4 }]);
    expectWorkspaceError(() => workspace.removeRedaction(1), 'INVALID_REDACTION_INDEX');
    expectWorkspaceError(() => workspace.removeRedaction(0.5), 'INVALID_REDACTION_INDEX');
    workspace.clearRedactions();
    expect(workspace.snapshot().redactions).toEqual([]);
  });

  it('replaces and clears an old render Canvas, then disposes every owned resource exactly once', async () => {
    const harness = createHarness(320, 200);
    const workspace = await ImageWorkspaceController.create(privateFile(), harness.deps);
    const first = workspace.renderForOcr();
    const second = workspace.renderForOcr();

    expect(harness.createCanvas).toHaveBeenCalledTimes(2);
    expect(first.canvas).toMatchObject({ width: 0, height: 0 });
    expect(second.canvas).toMatchObject({ width: 320, height: 200 });

    workspace.dispose();
    workspace.dispose();

    expect(second.canvas).toMatchObject({ width: 0, height: 0 });
    expect(harness.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(harness.revokeObjectURL).toHaveBeenCalledWith('blob:local-preview');
    expect(harness.bitmap.close).toHaveBeenCalledTimes(1);
    for (const action of [
      () => workspace.snapshot(),
      () => workspace.rotate('RIGHT'),
      () => workspace.setCrop(null),
      () => workspace.addRedaction({ x: 1, y: 1, width: 1, height: 1 }),
      () => workspace.removeRedaction(0),
      () => workspace.clearRedactions(),
      () => workspace.renderForOcr(),
    ]) {
      expectWorkspaceError(action, 'WORKSPACE_DISPOSED');
    }
  });

  it('clears a failed render Canvas when a 2D context is unavailable', async () => {
    const harness = createHarness(320, 200);
    const failedCanvas = createFakeCanvas(false);
    harness.createCanvas.mockReturnValueOnce(failedCanvas.canvas);
    const workspace = await ImageWorkspaceController.create(privateFile(), harness.deps);

    expectWorkspaceError(() => workspace.renderForOcr(), 'CANVAS_UNAVAILABLE');
    expect(failedCanvas.canvas).toMatchObject({ width: 0, height: 0 });
  });

  it('keeps replacement-file resources independent when the caller disposes the old controller', async () => {
    const oldHarness = createHarness(100, 80);
    const newHarness = createHarness(200, 160);
    const oldWorkspace = await ImageWorkspaceController.create(privateFile(), oldHarness.deps);
    oldWorkspace.renderForOcr();
    oldWorkspace.dispose();

    const newWorkspace = await ImageWorkspaceController.create(privateFile(), newHarness.deps);
    expect(newWorkspace.snapshot()).toMatchObject({ normalizedWidth: 200, normalizedHeight: 160 });
    expect(oldHarness.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(oldHarness.bitmap.close).toHaveBeenCalledTimes(1);
    expect(newHarness.revokeObjectURL).not.toHaveBeenCalled();
    expect(newHarness.bitmap.close).not.toHaveBeenCalled();
  });
});
