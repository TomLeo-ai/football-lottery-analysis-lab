import {
  IMAGE_POLICY,
  scaleToLongestEdge,
  transformBoundingBox,
  validateProcessedImageTransform,
  type PixelRect,
  type PixelSize,
  type ProcessedImageTransform,
  type Rotation,
} from '@football-lottery-analysis-lab/ocr-core';

import {
  inspectImageFileHeader as inspectBrowserImageFileHeader,
  type ImageHeader,
} from './browserImageFile';

const MAX_REDACTIONS = 4_096;

export type ImageWorkspaceErrorCode =
  | 'IMAGE_DECODE_FAILED'
  | 'INVALID_BITMAP_DIMENSIONS'
  | 'INVALID_GEOMETRY'
  | 'INVALID_REDACTION_INDEX'
  | 'CANVAS_UNAVAILABLE'
  | 'RENDER_FAILED'
  | 'WORKSPACE_DISPOSED';

const ERROR_MESSAGES: Readonly<Record<ImageWorkspaceErrorCode, string>> = {
  IMAGE_DECODE_FAILED: 'The image could not be decoded locally.',
  INVALID_BITMAP_DIMENSIONS: 'The decoded image dimensions are invalid.',
  INVALID_GEOMETRY: 'The image workspace geometry is invalid.',
  INVALID_REDACTION_INDEX: 'The redaction index is invalid.',
  CANVAS_UNAVAILABLE: 'A local image Canvas is unavailable.',
  RENDER_FAILED: 'The local OCR image could not be rendered.',
  WORKSPACE_DISPOSED: 'The image workspace has been disposed.',
};

export class ImageWorkspaceError extends Error {
  readonly code: ImageWorkspaceErrorCode;

  constructor(code: ImageWorkspaceErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'ImageWorkspaceError';
    this.code = code;
  }
}

export interface ImageWorkspaceDependencies {
  inspectImageFileHeader: (file: File) => Promise<ImageHeader>;
  createImageBitmap: (
    image: ImageBitmapSource,
    options?: ImageBitmapOptions,
  ) => Promise<ImageBitmap>;
  createObjectURL: (object: Blob | MediaSource) => string;
  revokeObjectURL: (url: string) => void;
  createCanvas: () => HTMLCanvasElement;
}

export interface ImageWorkspaceSnapshot {
  previewUrl: string;
  normalizedWidth: number;
  normalizedHeight: number;
  rotation: Rotation;
  crop: PixelRect | null;
  redactions: readonly PixelRect[];
}

export interface ProcessedCanvasResult {
  readonly canvas: HTMLCanvasElement;
  readonly transform: ProcessedImageTransform;
}

const DEFAULT_DEPENDENCIES: ImageWorkspaceDependencies = {
  inspectImageFileHeader: inspectBrowserImageFileHeader,
  createImageBitmap: (image, options) => globalThis.createImageBitmap(image, options),
  createObjectURL: (object) => URL.createObjectURL(object),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  createCanvas: () => document.createElement('canvas'),
};

function fail(code: ImageWorkspaceErrorCode): never {
  throw new ImageWorkspaceError(code);
}

function safeRevokeObjectUrl(deps: ImageWorkspaceDependencies, previewUrl: string | null): void {
  if (previewUrl === null) return;
  try {
    deps.revokeObjectURL(previewUrl);
  } catch {
    // Disposal is best-effort and must continue with the other owned resources.
  }
}

function safeCloseBitmap(bitmap: ImageBitmap | null): void {
  if (bitmap === null) return;
  try {
    bitmap.close();
  } catch {
    // Disposal is best-effort and must continue with the other owned resources.
  }
}

function safeClearCanvas(canvas: HTMLCanvasElement | null): void {
  if (canvas === null) return;
  try {
    canvas.width = 0;
    canvas.height = 0;
  } catch {
    // A hostile or already-detached Canvas must not block the remaining cleanup.
  }
}

function isValidBitmapSize(size: { width: unknown; height: unknown }): size is PixelSize {
  const { width, height } = size;
  return (
    typeof width === 'number'
    && typeof height === 'number'
    && Number.isSafeInteger(width)
    && Number.isSafeInteger(height)
    && width > 0
    && height > 0
    && width <= IMAGE_POLICY.maxPixels / height
  );
}

function copySourceSize(header: ImageHeader): PixelSize {
  try {
    if (typeof header !== 'object' || header === null || Array.isArray(header)) {
      return fail('IMAGE_DECODE_FAILED');
    }
    const widthDescriptor = Object.getOwnPropertyDescriptor(header, 'width');
    const heightDescriptor = Object.getOwnPropertyDescriptor(header, 'height');
    if (
      widthDescriptor === undefined
      || heightDescriptor === undefined
      || !Object.hasOwn(widthDescriptor, 'value')
      || !Object.hasOwn(heightDescriptor, 'value')
    ) {
      return fail('IMAGE_DECODE_FAILED');
    }
    const size = { width: widthDescriptor.value, height: heightDescriptor.value };
    if (!isValidBitmapSize(size)) return fail('IMAGE_DECODE_FAILED');
    return size;
  } catch {
    return fail('IMAGE_DECODE_FAILED');
  }
}

function readOwnFiniteNumber(record: object, key: keyof PixelRect): number {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
    return fail('INVALID_GEOMETRY');
  }
  const value = descriptor.value;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fail('INVALID_GEOMETRY');
  }
  return value;
}

function copyInteractionRect(value: PixelRect, allowNegativeOrigin: boolean): PixelRect {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return fail('INVALID_GEOMETRY');
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return fail('INVALID_GEOMETRY');
    }
    const x = readOwnFiniteNumber(value, 'x');
    const y = readOwnFiniteNumber(value, 'y');
    const width = readOwnFiniteNumber(value, 'width');
    const height = readOwnFiniteNumber(value, 'height');
    const right = x + width;
    const bottom = y + height;
    if (
      (!allowNegativeOrigin && (x < 0 || y < 0))
      || width <= 0
      || height <= 0
      || !Number.isFinite(right)
      || !Number.isFinite(bottom)
      || right <= x
      || bottom <= y
    ) {
      return fail('INVALID_GEOMETRY');
    }
    return { x, y, width, height };
  } catch (error) {
    if (error instanceof ImageWorkspaceError) throw error;
    return fail('INVALID_GEOMETRY');
  }
}

function rotatedSize(size: PixelSize, rotation: Rotation): PixelSize {
  return rotation === 90 || rotation === 270
    ? { width: size.height, height: size.width }
    : { ...size };
}

function normalizeCrop(crop: PixelRect | null, bounds: PixelSize): PixelRect | null {
  if (crop === null) return null;
  const left = Math.max(0, Math.min(bounds.width, Math.floor(crop.x)));
  const top = Math.max(0, Math.min(bounds.height, Math.floor(crop.y)));
  const right = Math.max(0, Math.min(bounds.width, Math.ceil(crop.x + crop.width)));
  const bottom = Math.max(0, Math.min(bounds.height, Math.ceil(crop.y + crop.height)));
  if (right <= left || bottom <= top) return fail('INVALID_GEOMETRY');
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function freezeRect(rect: PixelRect): PixelRect {
  return Object.freeze({ ...rect });
}

function freezeTransform(transform: ProcessedImageTransform): ProcessedImageTransform {
  const redactions = Object.freeze(transform.redactions.map(freezeRect));
  return Object.freeze({
    ...transform,
    sourceSize: Object.freeze({ ...transform.sourceSize }),
    normalizedSize: Object.freeze({ ...transform.normalizedSize }),
    crop: transform.crop === null ? null : freezeRect(transform.crop),
    redactions,
    processedSize: Object.freeze({ ...transform.processedSize }),
  });
}

function setWorkspaceTransform(
  context: CanvasRenderingContext2D,
  crop: PixelRect,
  scaleX: number,
  scaleY: number,
): void {
  const offsetX = crop.x === 0 ? 0 : -crop.x * scaleX;
  const offsetY = crop.y === 0 ? 0 : -crop.y * scaleY;
  context.setTransform(scaleX, 0, 0, scaleY, offsetX, offsetY);
}

function applyClockwiseRotation(
  context: CanvasRenderingContext2D,
  normalizedSize: PixelSize,
  rotation: Rotation,
): void {
  switch (rotation) {
    case 0:
      return;
    case 90:
      context.translate(normalizedSize.height, 0);
      context.rotate(Math.PI / 2);
      return;
    case 180:
      context.translate(normalizedSize.width, normalizedSize.height);
      context.rotate(Math.PI);
      return;
    case 270:
      context.translate(0, normalizedSize.width);
      context.rotate(-Math.PI / 2);
  }
}

export class ImageWorkspaceController {
  private bitmap: ImageBitmap | null;
  private previewUrl: string;
  private readonly sourceSize: PixelSize;
  private readonly normalizedSize: PixelSize;
  private readonly deps: ImageWorkspaceDependencies;
  private rotation: Rotation = 0;
  private crop: PixelRect | null = null;
  private redactions: PixelRect[] = [];
  private workCanvas: HTMLCanvasElement | null = null;
  private disposed = false;

  private constructor(
    bitmap: ImageBitmap,
    previewUrl: string,
    sourceSize: PixelSize,
    normalizedSize: PixelSize,
    deps: ImageWorkspaceDependencies,
  ) {
    this.bitmap = bitmap;
    this.previewUrl = previewUrl;
    this.sourceSize = sourceSize;
    this.normalizedSize = normalizedSize;
    this.deps = deps;
  }

  static async create(
    file: File,
    deps: ImageWorkspaceDependencies = DEFAULT_DEPENDENCIES,
  ): Promise<ImageWorkspaceController> {
    let previewUrl: string | null = null;
    let bitmap: ImageBitmap | null = null;
    let sourceSize: PixelSize;

    try {
      sourceSize = copySourceSize(await deps.inspectImageFileHeader(file));
    } catch {
      return fail('IMAGE_DECODE_FAILED');
    }

    try {
      previewUrl = deps.createObjectURL(file);
      if (typeof previewUrl !== 'string' || previewUrl.length === 0) {
        previewUrl = null;
        return fail('IMAGE_DECODE_FAILED');
      }
    } catch {
      return fail('IMAGE_DECODE_FAILED');
    }

    try {
      bitmap = await deps.createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      safeRevokeObjectUrl(deps, previewUrl);
      return fail('IMAGE_DECODE_FAILED');
    }

    let width: unknown;
    let height: unknown;
    try {
      width = bitmap.width;
      height = bitmap.height;
    } catch {
      safeCloseBitmap(bitmap);
      safeRevokeObjectUrl(deps, previewUrl);
      return fail('INVALID_BITMAP_DIMENSIONS');
    }
    const decodedSize = { width, height };
    if (!isValidBitmapSize(decodedSize)) {
      safeCloseBitmap(bitmap);
      safeRevokeObjectUrl(deps, previewUrl);
      return fail('INVALID_BITMAP_DIMENSIONS');
    }

    return new ImageWorkspaceController(bitmap, previewUrl, sourceSize, decodedSize, deps);
  }

  snapshot(): ImageWorkspaceSnapshot {
    this.assertActive();
    const crop = this.crop === null ? null : freezeRect(this.crop);
    const redactions = Object.freeze(this.redactions.map(freezeRect));
    return Object.freeze({
      previewUrl: this.previewUrl,
      normalizedWidth: this.normalizedSize.width,
      normalizedHeight: this.normalizedSize.height,
      rotation: this.rotation,
      crop,
      redactions,
    });
  }

  rotate(direction: 'LEFT' | 'RIGHT'): void {
    this.assertActive();
    if (direction !== 'LEFT' && direction !== 'RIGHT') return fail('INVALID_GEOMETRY');
    const step = direction === 'RIGHT' ? 90 : -90;
    this.rotation = ((this.rotation + step + 360) % 360) as Rotation;
    this.crop = null;
  }

  setCrop(crop: PixelRect | null): void {
    this.assertActive();
    this.crop = crop === null ? null : copyInteractionRect(crop, true);
  }

  addRedaction(rect: PixelRect): void {
    this.assertActive();
    if (this.redactions.length >= MAX_REDACTIONS) return fail('INVALID_GEOMETRY');
    this.redactions.push(copyInteractionRect(rect, false));
  }

  removeRedaction(index: number): void {
    this.assertActive();
    if (!Number.isInteger(index) || index < 0 || index >= this.redactions.length) {
      return fail('INVALID_REDACTION_INDEX');
    }
    this.redactions.splice(index, 1);
  }

  clearRedactions(): void {
    this.assertActive();
    this.redactions = [];
  }

  renderForOcr(): ProcessedCanvasResult {
    this.assertActive();
    const bitmap = this.bitmap;
    if (bitmap === null) return fail('WORKSPACE_DISPOSED');

    const fullRotatedSize = rotatedSize(this.normalizedSize, this.rotation);
    const crop = normalizeCrop(this.crop, fullRotatedSize);
    const effectiveRect: PixelRect = crop ?? { x: 0, y: 0, ...fullRotatedSize };
    let processedSize: PixelSize;
    let scaleX: number;
    let scaleY: number;
    try {
      ({ processedSize, scaleX, scaleY } = scaleToLongestEdge(
        { width: effectiveRect.width, height: effectiveRect.height },
        IMAGE_POLICY.maxOcrEdge,
      ));
    } catch {
      return fail('INVALID_GEOMETRY');
    }

    const transform: ProcessedImageTransform = {
      schemaVersion: 'IMAGE_TRANSFORM_V1',
      sourceSize: { ...this.sourceSize },
      normalizedSize: { ...this.normalizedSize },
      rotation: this.rotation,
      crop,
      redactions: this.redactions.map((redaction) => ({ ...redaction })),
      processedSize,
    };
    let processedRedactions: PixelRect[];
    try {
      validateProcessedImageTransform(transform);
      processedRedactions = transform.redactions.map((redaction) => (
        transformBoundingBox(redaction, transform)
      ));
    } catch {
      return fail('INVALID_GEOMETRY');
    }

    let canvas: HTMLCanvasElement | null = null;
    let context: CanvasRenderingContext2D | null = null;
    try {
      canvas = this.deps.createCanvas();
      canvas.width = processedSize.width;
      canvas.height = processedSize.height;
      context = canvas.getContext('2d');
    } catch {
      safeClearCanvas(canvas);
      return fail('CANVAS_UNAVAILABLE');
    }
    if (context === null) {
      safeClearCanvas(canvas);
      return fail('CANVAS_UNAVAILABLE');
    }

    try {
      context.clearRect(0, 0, processedSize.width, processedSize.height);
      setWorkspaceTransform(context, effectiveRect, scaleX, scaleY);
      applyClockwiseRotation(context, this.normalizedSize, this.rotation);
      context.drawImage(bitmap, 0, 0);

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = '#000000';
      for (const redaction of processedRedactions) {
        context.fillRect(redaction.x, redaction.y, redaction.width, redaction.height);
      }
    } catch {
      safeClearCanvas(canvas);
      return fail('RENDER_FAILED');
    }

    safeClearCanvas(this.workCanvas);
    this.workCanvas = canvas;
    return Object.freeze({
      canvas,
      transform: freezeTransform(transform),
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const bitmap = this.bitmap;
    const canvas = this.workCanvas;
    const previewUrl = this.previewUrl;
    this.bitmap = null;
    this.workCanvas = null;
    this.previewUrl = '';

    safeRevokeObjectUrl(this.deps, previewUrl);
    safeCloseBitmap(bitmap);
    safeClearCanvas(canvas);
    this.crop = null;
    this.redactions = [];
  }

  private assertActive(): void {
    if (this.disposed) return fail('WORKSPACE_DISPOSED');
  }
}
