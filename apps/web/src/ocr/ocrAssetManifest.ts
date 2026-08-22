import checkedManifest from './ocr-asset-manifest.json';

const EXPECTED_MANIFEST = Object.freeze({
  schemaVersion: 'OCR_ASSET_MANIFEST_V1',
  tesseractVersion: '7.0.0',
  coreVersion: '7.0.0',
  languageDataVersion: '1.0.0/4.0.0_best_int',
  cachePath: 'football-lab-ocr/tesseract-7.0.0/4.0.0_best_int',
  workerPath: 'ocr/tesseract/7.0.0/worker/worker.min.js',
  corePath: 'ocr/tesseract/7.0.0/core/',
  langPath: 'ocr/tesseract/7.0.0/lang/4.0.0_best_int/',
});

export interface ResolvedOcrAssetManifest {
  readonly workerPath: string;
  readonly corePath: string;
  readonly langPath: string;
  readonly cachePath: string;
}

export class OcrAssetManifestError extends Error {
  constructor() {
    super('OCR asset manifest is unavailable');
    this.name = 'OcrAssetManifestError';
  }
}

function fail(): never {
  throw new OcrAssetManifestError();
}

function readOwnString(value: unknown, key: string): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail();
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) fail();
    if (typeof descriptor.value !== 'string') fail();
    return descriptor.value;
  } catch {
    fail();
  }
}

function normalizeBaseUrl(baseUrl: unknown): string {
  if (typeof baseUrl !== 'string' || baseUrl.length === 0) fail();
  if (
    !baseUrl.startsWith('/')
    || baseUrl.startsWith('//')
    || /[\\%?#]/.test(baseUrl)
    || /^\/https?:/i.test(baseUrl)
  ) {
    fail();
  }

  const body = baseUrl === '/'
    ? ''
    : baseUrl.slice(1, baseUrl.endsWith('/') ? -1 : undefined);
  const segments = body === '' ? [] : body.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) fail();
  if (segments.some((segment) => !/^[A-Za-z0-9._~!$&'()+,;=@-]+$/.test(segment))) fail();
  return segments.length === 0 ? '/' : `/${segments.join('/')}/`;
}

function assertExpectedManifest(source: unknown): void {
  for (const [key, expected] of Object.entries(EXPECTED_MANIFEST)) {
    if (readOwnString(source, key) !== expected) fail();
  }
}

function assertSafeRelativePath(path: string, directory: boolean): void {
  if (
    path.length === 0
    || path.startsWith('/')
    || path.startsWith('//')
    || /[\\%?#:]/.test(path)
    || path.endsWith('/') !== directory
  ) {
    fail();
  }
  const body = directory ? path.slice(0, -1) : path;
  const segments = body.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) fail();
}

function freezeResolved(
  baseUrl: string,
  source: typeof EXPECTED_MANIFEST,
): ResolvedOcrAssetManifest {
  const result = {
    workerPath: `${baseUrl}${source.workerPath}`,
    corePath: `${baseUrl}${source.corePath}`,
    langPath: `${baseUrl}${source.langPath}`,
    cachePath: source.cachePath,
  };
  if (
    !result.workerPath.startsWith(baseUrl)
    || !result.corePath.startsWith(baseUrl)
    || !result.langPath.startsWith(baseUrl)
    || [result.workerPath, result.corePath, result.langPath].some((path) => /https?:|\/\//i.test(path))
  ) {
    fail();
  }
  return Object.freeze(result);
}

export function resolveOcrAssetManifest(
  baseUrl: unknown = import.meta.env.BASE_URL,
  source: unknown = checkedManifest,
): ResolvedOcrAssetManifest {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  assertExpectedManifest(source);
  assertSafeRelativePath(EXPECTED_MANIFEST.workerPath, false);
  assertSafeRelativePath(EXPECTED_MANIFEST.corePath, true);
  assertSafeRelativePath(EXPECTED_MANIFEST.langPath, true);
  return freezeResolved(normalizedBaseUrl, EXPECTED_MANIFEST);
}

export function validateResolvedOcrAssetManifest(
  baseUrl: unknown,
  source: unknown,
): ResolvedOcrAssetManifest {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const expected = freezeResolved(normalizedBaseUrl, EXPECTED_MANIFEST);
  const validated = {
    workerPath: readOwnString(source, 'workerPath'),
    corePath: readOwnString(source, 'corePath'),
    langPath: readOwnString(source, 'langPath'),
    cachePath: readOwnString(source, 'cachePath'),
  };
  if (
    validated.workerPath !== expected.workerPath
    || validated.corePath !== expected.corePath
    || validated.langPath !== expected.langPath
    || validated.cachePath !== expected.cachePath
  ) {
    fail();
  }
  return Object.freeze(validated);
}
