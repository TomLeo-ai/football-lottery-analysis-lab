import { createReadStream } from 'node:fs';
import { access, readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOOPBACK_HOST = '127.0.0.1';
const OCR_WORKER_PATH = '/ocr/tesseract/7.0.0/worker/worker.min.js';
const OCR_CORE_PREFIX = '/ocr/tesseract/7.0.0/core/';
const OCR_LANG_PREFIX = '/ocr/tesseract/7.0.0/lang/4.0.0_best_int/';
const OCR_LANG_PATHS = Object.freeze([
  `${OCR_LANG_PREFIX}eng.traineddata.gz`,
  `${OCR_LANG_PREFIX}chi_sim.traineddata.gz`,
]);
const SAFE_TOKENS = new Set(['DEMO DATA', '演示联赛', 'Blue Harbor', '红枫城']);
const DEFAULT_DIST_DIRECTORY = fileURLToPath(new URL('../apps/web/dist/', import.meta.url));
const DEFAULT_MANIFEST_URL = new URL('../apps/web/src/ocr/ocr-asset-manifest.json', import.meta.url);
const WORKER_EVIDENCE_PROPERTY = '__footballLabRealOcrEvidence__';
const MIME_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.gz': 'application/gzip',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
});

export class RealOcrSmokeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RealOcrSmokeError';
    this.code = code;
  }
}

function smokeFailure(code, message) {
  return new RealOcrSmokeError(code, message);
}

export function assertNetworkUrlAllowed(rawUrl, expectedOrigin) {
  let parsed;
  let origin;
  try {
    parsed = new URL(rawUrl);
    origin = new URL(expectedOrigin).origin;
  } catch {
    throw smokeFailure('NETWORK_URL_INVALID', 'network URL is invalid');
  }

  if (parsed.protocol === 'data:') return 'data';
  if (parsed.protocol === 'blob:') return 'blob';
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw smokeFailure('NETWORK_SCHEME_BLOCKED', 'network scheme is not allowed');
  }
  if (parsed.origin !== origin) {
    throw smokeFailure('EXTERNAL_REQUEST_BLOCKED', 'external request is not allowed');
  }
  return 'same-origin';
}

function classifyOcrAsset(pathname) {
  if (pathname === OCR_WORKER_PATH) return 'worker';
  if (pathname.startsWith(OCR_CORE_PREFIX)) return 'core';
  if (OCR_LANG_PATHS.includes(pathname)) return 'lang';
  return null;
}

function normalizeManifestPath(pathname) {
  if (
    typeof pathname !== 'string'
    || !pathname.startsWith('/')
    || pathname.startsWith('//')
    || pathname.includes('?')
    || pathname.includes('#')
    || pathname.includes('\\')
    || pathname.split('/').some((part) => part === '.' || part === '..')
  ) {
    throw smokeFailure('MANIFEST_PATH_INVALID', 'manifest asset path is invalid');
  }
  return pathname;
}

export function createAssetTracker({ origin, manifestAssetPaths }) {
  const normalizedOrigin = new URL(origin).origin;
  const knownPaths = new Set(manifestAssetPaths.map(normalizeManifestPath));
  const records = new Map();
  const failures = [];

  const readPath = (rawUrl) => {
    const parsed = new URL(rawUrl);
    if (parsed.origin !== normalizedOrigin) return null;
    return knownPaths.has(parsed.pathname) ? parsed.pathname : null;
  };

  const getRecord = (pathname) => {
    let record = records.get(pathname);
    if (record === undefined) {
      record = { path: pathname, kind: classifyOcrAsset(pathname), requested: false, status: null };
      records.set(pathname, record);
    }
    return record;
  };

  return Object.freeze({
    recordRequest(rawUrl) {
      const pathname = readPath(rawUrl);
      if (pathname === null) return;
      getRecord(pathname).requested = true;
    },
    recordResponse(rawUrl, status) {
      const pathname = readPath(rawUrl);
      if (pathname === null) return;
      const record = getRecord(pathname);
      record.status = status;
      if (!Number.isInteger(status) || status < 200 || status >= 300) {
        failures.push({ path: pathname, status });
      }
    },
    recordRequestFailure(rawUrl) {
      const pathname = readPath(rawUrl);
      if (pathname === null) return;
      const record = getRecord(pathname);
      record.requested = true;
      failures.push({ path: pathname, status: 'requestfailed' });
    },
    assertHealthy() {
      if (failures.length > 0) {
        const failure = failures[0];
        throw smokeFailure(
          'MANIFEST_ASSET_FAILED',
          `manifest asset ${failure.path} returned ${failure.status}`,
        );
      }
      for (const record of records.values()) {
        if (record.requested && record.status === null) {
          throw smokeFailure(
            'MANIFEST_ASSET_NO_RESPONSE',
            `manifest asset ${record.path} had no successful response`,
          );
        }
      }
    },
    snapshot() {
      const snapshot = { worker: [], core: [], lang: [] };
      for (const record of records.values()) {
        if (record.kind === null || record.status === null) continue;
        snapshot[record.kind].push({ path: record.path, status: record.status });
      }
      return snapshot;
    },
  });
}

function decodeRequestPath(requestTarget) {
  if (typeof requestTarget !== 'string' || !requestTarget.startsWith('/') || requestTarget.startsWith('//')) {
    throw smokeFailure('STATIC_REQUEST_INVALID', 'static request target is invalid');
  }
  const encodedPath = requestTarget.split('?', 1)[0];
  let pathname;
  try {
    pathname = decodeURIComponent(encodedPath);
  } catch {
    throw smokeFailure('STATIC_REQUEST_INVALID', 'static request path cannot be decoded');
  }
  if (
    pathname.includes('\\')
    || pathname.includes('\0')
    || pathname.split('/').some((segment) => segment === '..')
  ) {
    throw smokeFailure('STATIC_TRAVERSAL_BLOCKED', 'static path traversal is not allowed');
  }
  return pathname;
}

function containedFilePath(distDirectory, pathname) {
  const root = resolve(distDirectory);
  const candidate = resolve(root, `.${pathname}`);
  const fromRoot = relative(root, candidate);
  if (fromRoot === '..' || fromRoot.startsWith(`..\\`) || fromRoot.startsWith('../')) {
    throw smokeFailure('STATIC_TRAVERSAL_BLOCKED', 'static path traversal is not allowed');
  }
  return candidate;
}

async function readableFile(pathname) {
  try {
    const details = await stat(pathname);
    return details.isFile() ? details : null;
  } catch {
    return null;
  }
}

async function sendFile(response, pathname, method) {
  const details = await readableFile(pathname);
  if (details === null) return false;
  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Length': details.size,
    'Content-Type': MIME_TYPES[extname(pathname).toLowerCase()] ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  });
  if (method === 'HEAD') {
    response.end();
    return true;
  }
  const stream = createReadStream(pathname);
  stream.on('error', () => response.destroy());
  stream.pipe(response);
  return true;
}

export async function startStaticServer({ distDirectory = DEFAULT_DIST_DIRECTORY } = {}) {
  const root = resolve(distDirectory);
  const indexPath = containedFilePath(root, '/index.html');
  try {
    await access(indexPath);
  } catch {
    throw smokeFailure('DIST_REQUIRED', 'production dist index.html is required');
  }

  const server = createServer((request, response) => {
    void (async () => {
      const method = request.method ?? 'GET';
      if (method !== 'GET' && method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' });
        response.end();
        return;
      }

      let pathname;
      try {
        pathname = decodeRequestPath(request.url ?? '/');
      } catch {
        response.writeHead(400);
        response.end();
        return;
      }
      const requestedPath = containedFilePath(root, pathname === '/' ? '/index.html' : pathname);
      if (await sendFile(response, requestedPath, method)) return;
      if (extname(pathname) === '') {
        await sendFile(response, indexPath, method);
        return;
      }
      response.writeHead(404);
      response.end();
    })().catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });

  await new Promise((resolveListen, rejectListen) => {
    const handleError = (error) => rejectListen(error);
    server.once('error', handleError);
    server.listen(0, LOOPBACK_HOST, () => {
      server.off('error', handleError);
      resolveListen();
    });
  }).catch((error) => {
    server.close();
    throw smokeFailure('STATIC_SERVER_START_FAILED', 'temporary static server could not start');
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw smokeFailure('STATIC_SERVER_START_FAILED', 'temporary static server has no TCP address');
  }
  const origin = `http://${LOOPBACK_HOST}:${address.port}`;
  let closePromise;
  return Object.freeze({
    origin,
    close() {
      closePromise ??= new Promise((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error) rejectClose(error);
          else resolveClose();
        });
      });
      return closePromise;
    },
  });
}

function emptyWorkerObservation() {
  return {
    recognized: 0,
    tokens: {
      demoData: false,
      league: false,
      blueHarbor: false,
      redMaple: false,
      leagueIgnoringWhitespace: false,
      blueHarborIgnoringWhitespace: false,
      redMapleIgnoringWhitespace: false,
    },
    diagnostics: emptyRecognitionDiagnostics(),
  };
}

const APPROVED_LABEL_SPECS = Object.freeze([
  Object.freeze({ name: 'MATCH_REF', tokens: Object.freeze(['MATCH', 'REF:']) }),
  Object.freeze({ name: 'MARKET_REF', tokens: Object.freeze(['MARKET', 'REF:']) }),
  Object.freeze({ name: 'DATE', tokens: Object.freeze(['DATE:']) }),
  Object.freeze({ name: 'LEAGUE', tokens: Object.freeze(['LEAGUE:']) }),
  Object.freeze({ name: 'HOME', tokens: Object.freeze(['HOME:']) }),
  Object.freeze({ name: 'AWAY', tokens: Object.freeze(['AWAY:']) }),
  Object.freeze({ name: 'KICKOFF', tokens: Object.freeze(['KICKOFF:']) }),
  Object.freeze({ name: 'PLAY_TYPE', tokens: Object.freeze(['PLAY', 'TYPE:']) }),
  Object.freeze({ name: 'SELECTION', tokens: Object.freeze(['SELECTION:']) }),
  Object.freeze({ name: 'ODDS', tokens: Object.freeze(['ODDS:']) }),
]);

function emptyLabelCounts() {
  return Object.fromEntries(APPROVED_LABEL_SPECS.map((spec) => [spec.name, 0]));
}

function emptyValueFormatCounts() {
  return Object.fromEntries(
    ['DATE', 'KICKOFF', 'PLAY_TYPE', 'SELECTION', 'ODDS'].map((name) => [
      name,
      { valid: 0, invalid: 0 },
    ]),
  );
}

function emptyRecognitionDiagnostics() {
  return {
    blockCount: 0,
    paragraphCount: 0,
    lineCount: 0,
    wordCount: 0,
    maxWordsPerLine: 0,
    approvedLabelCounts: emptyLabelCounts(),
    multiApprovedLabelsPerLine: 0,
    labelWithoutValue: 0,
    valueFormatCounts: emptyValueFormatCounts(),
  };
}

function cloneRecognitionDiagnostics(source) {
  const clone = emptyRecognitionDiagnostics();
  for (const key of ['blockCount', 'paragraphCount', 'lineCount', 'wordCount', 'maxWordsPerLine', 'multiApprovedLabelsPerLine', 'labelWithoutValue']) {
    clone[key] = Number.isSafeInteger(source?.[key]) && source[key] >= 0 ? source[key] : 0;
  }
  for (const name of Object.keys(clone.approvedLabelCounts)) {
    const count = source?.approvedLabelCounts?.[name];
    clone.approvedLabelCounts[name] = Number.isSafeInteger(count) && count >= 0 ? count : 0;
  }
  for (const name of Object.keys(clone.valueFormatCounts)) {
    for (const outcome of ['valid', 'invalid']) {
      const count = source?.valueFormatCounts?.[name]?.[outcome];
      clone.valueFormatCounts[name][outcome] = Number.isSafeInteger(count) && count >= 0 ? count : 0;
    }
  }
  return clone;
}

function normalizeOcrToken(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toUpperCase() : '';
}

function valueFormatIsValid(name, value) {
  if (name === 'DATE') return /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (name === 'KICKOFF') return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(value);
  if (name === 'PLAY_TYPE') return value === 'WIN_DRAW_LOSS';
  if (name === 'SELECTION') return ['HOME_WIN', 'DRAW', 'AWAY_WIN'].includes(value);
  if (name === 'ODDS') {
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(value)) return false;
    const number = Number(value);
    return Number.isFinite(number)
      && number >= 1.01
      && number <= 1000
      && (!value.includes('.') || !value.endsWith('0'));
  }
  return null;
}

function recordRecognitionDiagnostics(target, data) {
  const blocks = Array.isArray(data?.blocks) ? data.blocks : [];
  target.blockCount += blocks.length;
  for (const block of blocks) {
    const paragraphs = Array.isArray(block?.paragraphs) ? block.paragraphs : [];
    target.paragraphCount += paragraphs.length;
    for (const paragraph of paragraphs) {
      const lines = Array.isArray(paragraph?.lines) ? paragraph.lines : [];
      target.lineCount += lines.length;
      for (const line of lines) {
        const words = Array.isArray(line?.words) ? line.words : [];
        target.wordCount += words.length;
        target.maxWordsPerLine = Math.max(target.maxWordsPerLine, words.length);
        const tokens = words.map((word) => normalizeOcrToken(word?.text));
        const labels = [];
        for (let wordIndex = 0; wordIndex < tokens.length; wordIndex += 1) {
          for (const spec of APPROVED_LABEL_SPECS) {
            if (spec.tokens.every((token, tokenIndex) => tokens[wordIndex + tokenIndex] === token)) {
              labels.push({ name: spec.name, index: wordIndex, tokenCount: spec.tokens.length });
              target.approvedLabelCounts[spec.name] += 1;
            }
          }
        }
        if (labels.length > 1) target.multiApprovedLabelsPerLine += 1;
        for (let labelIndex = 0; labelIndex < labels.length; labelIndex += 1) {
          const label = labels[labelIndex];
          const valueStart = label.index + label.tokenCount;
          const valueEnd = labels[labelIndex + 1]?.index ?? words.length;
          const value = words
            .slice(valueStart, valueEnd)
            .map((word) => (typeof word?.text === 'string' ? word.text : ''))
            .join(' ')
            .trim()
            .replace(/\s+/g, ' ');
          if (value.length === 0) target.labelWithoutValue += 1;
          const formatValid = valueFormatIsValid(label.name, value);
          if (formatValid !== null) {
            target.valueFormatCounts[label.name][formatValid ? 'valid' : 'invalid'] += 1;
          }
        }
      }
    }
  }
}

export function reduceWorkerObservation(previous, message) {
  const prior = previous ?? emptyWorkerObservation();
  const next = {
    recognized: Number.isSafeInteger(prior.recognized) && prior.recognized >= 0
      ? prior.recognized
      : 0,
    tokens: {
      demoData: prior.tokens?.demoData === true,
      league: prior.tokens?.league === true,
      blueHarbor: prior.tokens?.blueHarbor === true,
      redMaple: prior.tokens?.redMaple === true,
      leagueIgnoringWhitespace: prior.tokens?.leagueIgnoringWhitespace === true,
      blueHarborIgnoringWhitespace: prior.tokens?.blueHarborIgnoringWhitespace === true,
      redMapleIgnoringWhitespace: prior.tokens?.redMapleIgnoringWhitespace === true,
    },
    diagnostics: cloneRecognitionDiagnostics(prior.diagnostics),
  };
  try {
    if (message?.action !== 'recognize' || message?.status !== 'resolve') return next;
    const text = message?.data?.text;
    if (typeof text !== 'string') return next;
    next.recognized += 1;
    next.tokens.demoData ||= text.includes('DEMO DATA');
    next.tokens.league ||= text.includes('演示联赛');
    next.tokens.blueHarbor ||= text.includes('Blue Harbor');
    next.tokens.redMaple ||= text.includes('红枫城');
    const compact = text.replace(/\s+/gu, '');
    next.tokens.leagueIgnoringWhitespace ||= compact.includes('演示联赛');
    next.tokens.blueHarborIgnoringWhitespace ||= compact.includes('BlueHarbor');
    next.tokens.redMapleIgnoringWhitespace ||= compact.includes('红枫城');
    recordRecognitionDiagnostics(next.diagnostics, message.data);
    return next;
  } catch {
    return next;
  }
}

function requireCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw smokeFailure('SUMMARY_INVALID', `${label} count is invalid`);
  }
  return value;
}

export function formatSmokeSummary({
  tokens,
  mappedMatchFields,
  assets,
  externalRequests,
  serviceWorkers,
}) {
  if (
    !Array.isArray(tokens)
    || tokens.length === 0
    || tokens.some((token) => !SAFE_TOKENS.has(token))
    || new Set(tokens).size !== tokens.length
  ) {
    throw smokeFailure('SUMMARY_INVALID', 'summary token names are invalid');
  }
  const matchCount = requireCount(mappedMatchFields, 'mappedMatchFields');
  const workerCount = requireCount(assets?.worker, 'worker asset');
  const coreCount = requireCount(assets?.core, 'core asset');
  const langCount = requireCount(assets?.lang, 'language asset');
  const externalCount = requireCount(externalRequests, 'external request');
  const serviceWorkerCount = requireCount(serviceWorkers, 'service worker');
  return `Real OCR smoke passed: tokens=[${tokens.join(',')}], mappedMatchFields=${matchCount}, assets={worker:${workerCount},core:${coreCount},lang:${langCount}}, externalRequests=${externalCount}, serviceWorkers=${serviceWorkerCount}`;
}

async function loadManifestAssetPaths() {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(DEFAULT_MANIFEST_URL, 'utf8'));
  } catch {
    throw smokeFailure('MANIFEST_UNAVAILABLE', 'checked OCR asset manifest is unavailable');
  }
  if (
    manifest?.tesseractVersion !== '7.0.0'
    || !Array.isArray(manifest.files)
    || manifest.files.length === 0
  ) {
    throw smokeFailure('MANIFEST_INVALID', 'checked OCR asset manifest is invalid');
  }
  return manifest.files.map((file) => {
    if (typeof file?.publicRelativePath !== 'string') {
      throw smokeFailure('MANIFEST_INVALID', 'checked OCR asset manifest is invalid');
    }
    return normalizeManifestPath(`/ocr/tesseract/7.0.0/${file.publicRelativePath}`);
  });
}

async function launchChromium() {
  const playwright = await import('@playwright/test');
  if (typeof playwright.chromium?.launch !== 'function') {
    throw smokeFailure('CHROMIUM_UNAVAILABLE', 'Playwright Chromium launcher is unavailable');
  }
  return playwright.chromium.launch({ headless: true });
}

async function installWorkerEvidenceProbe(context) {
  await context.addInitScript(({ evidenceProperty, labelSpecs }) => {
    const emptyLabelCounts = () => Object.fromEntries(labelSpecs.map((spec) => [spec.name, 0]));
    const emptyValueFormatCounts = () => Object.fromEntries(
      ['DATE', 'KICKOFF', 'PLAY_TYPE', 'SELECTION', 'ODDS'].map((name) => [
        name,
        { valid: 0, invalid: 0 },
      ]),
    );
    const emptyDiagnostics = () => ({
      blockCount: 0,
      paragraphCount: 0,
      lineCount: 0,
      wordCount: 0,
      maxWordsPerLine: 0,
      approvedLabelCounts: emptyLabelCounts(),
      multiApprovedLabelsPerLine: 0,
      labelWithoutValue: 0,
      valueFormatCounts: emptyValueFormatCounts(),
    });
    const valueFormatIsValid = (name, value) => {
      if (name === 'DATE') return /^\d{4}-\d{2}-\d{2}$/.test(value);
      if (name === 'KICKOFF') return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(value);
      if (name === 'PLAY_TYPE') return value === 'WIN_DRAW_LOSS';
      if (name === 'SELECTION') return ['HOME_WIN', 'DRAW', 'AWAY_WIN'].includes(value);
      if (name === 'ODDS') {
        if (!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(value)) return false;
        const number = Number(value);
        return Number.isFinite(number)
          && number >= 1.01
          && number <= 1000
          && (!value.includes('.') || !value.endsWith('0'));
      }
      return null;
    };
    const recordDiagnostics = (target, data) => {
      const blocks = Array.isArray(data?.blocks) ? data.blocks : [];
      target.blockCount += blocks.length;
      for (const block of blocks) {
        const paragraphs = Array.isArray(block?.paragraphs) ? block.paragraphs : [];
        target.paragraphCount += paragraphs.length;
        for (const paragraph of paragraphs) {
          const lines = Array.isArray(paragraph?.lines) ? paragraph.lines : [];
          target.lineCount += lines.length;
          for (const line of lines) {
            const words = Array.isArray(line?.words) ? line.words : [];
            target.wordCount += words.length;
            target.maxWordsPerLine = Math.max(target.maxWordsPerLine, words.length);
            const tokens = words.map((word) => (
              typeof word?.text === 'string'
                ? word.text.trim().replace(/\s+/g, ' ').toUpperCase()
                : ''
            ));
            const labels = [];
            for (let wordIndex = 0; wordIndex < tokens.length; wordIndex += 1) {
              for (const spec of labelSpecs) {
                if (spec.tokens.every((token, tokenIndex) => tokens[wordIndex + tokenIndex] === token)) {
                  labels.push({ name: spec.name, index: wordIndex, tokenCount: spec.tokens.length });
                  target.approvedLabelCounts[spec.name] += 1;
                }
              }
            }
            if (labels.length > 1) target.multiApprovedLabelsPerLine += 1;
            for (let labelIndex = 0; labelIndex < labels.length; labelIndex += 1) {
              const label = labels[labelIndex];
              const valueStart = label.index + label.tokenCount;
              const valueEnd = labels[labelIndex + 1]?.index ?? words.length;
              const value = words
                .slice(valueStart, valueEnd)
                .map((word) => (typeof word?.text === 'string' ? word.text : ''))
                .join(' ')
                .trim()
                .replace(/\s+/g, ' ');
              if (value.length === 0) target.labelWithoutValue += 1;
              const formatValid = valueFormatIsValid(label.name, value);
              if (formatValid !== null) {
                target.valueFormatCounts[label.name][formatValid ? 'valid' : 'invalid'] += 1;
              }
            }
          }
        }
      }
    };
    const evidence = {
      failed: false,
      recognized: 0,
      tokens: {
        demoData: false,
        league: false,
        blueHarbor: false,
        redMaple: false,
        leagueIgnoringWhitespace: false,
        blueHarborIgnoringWhitespace: false,
        redMapleIgnoringWhitespace: false,
      },
      diagnostics: emptyDiagnostics(),
    };
    Object.defineProperty(globalThis, evidenceProperty, {
      configurable: false,
      enumerable: false,
      get() {
        return {
          failed: evidence.failed,
          recognized: evidence.recognized,
          tokens: { ...evidence.tokens },
          diagnostics: structuredClone(evidence.diagnostics),
        };
      },
    });

    try {
      const NativeWorker = globalThis.Worker;
      if (typeof NativeWorker !== 'function') throw new Error('worker unavailable');
      const WrappedWorker = function Worker(...args) {
        if (new.target === undefined) throw new TypeError('Worker constructor requires new');
        const worker = Reflect.construct(
          NativeWorker,
          args,
          new.target === WrappedWorker ? NativeWorker : new.target,
        );
        worker.addEventListener('message', (event) => {
          try {
            const packet = event.data;
            if (packet?.action !== 'recognize' || packet?.status !== 'resolve') return;
            const text = packet?.data?.text;
            if (typeof text !== 'string') {
              evidence.failed = true;
              return;
            }
            evidence.recognized += 1;
            evidence.tokens.demoData ||= text.includes('DEMO DATA');
            evidence.tokens.league ||= text.includes('演示联赛');
            evidence.tokens.blueHarbor ||= text.includes('Blue Harbor');
            evidence.tokens.redMaple ||= text.includes('红枫城');
            const compact = text.replace(/\s+/gu, '');
            evidence.tokens.leagueIgnoringWhitespace ||= compact.includes('演示联赛');
            evidence.tokens.blueHarborIgnoringWhitespace ||= compact.includes('BlueHarbor');
            evidence.tokens.redMapleIgnoringWhitespace ||= compact.includes('红枫城');
            recordDiagnostics(evidence.diagnostics, packet.data);
          } catch {
            evidence.failed = true;
          }
        });
        return worker;
      };
      Object.setPrototypeOf(WrappedWorker, NativeWorker);
      Object.defineProperty(WrappedWorker, 'prototype', {
        configurable: false,
        enumerable: false,
        value: NativeWorker.prototype,
        writable: false,
      });
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
      Object.defineProperty(globalThis, 'Worker', {
        configurable: descriptor?.configurable ?? true,
        enumerable: descriptor?.enumerable ?? false,
        value: WrappedWorker,
        writable: descriptor?.writable ?? true,
      });
      if (
        Object.getPrototypeOf(WrappedWorker) !== NativeWorker
        || WrappedWorker.prototype !== NativeWorker.prototype
        || globalThis.Worker !== WrappedWorker
      ) {
        throw new Error('worker wrapper incompatible');
      }
    } catch {
      evidence.failed = true;
    }
  }, {
    evidenceProperty: WORKER_EVIDENCE_PROPERTY,
    labelSpecs: APPROVED_LABEL_SPECS,
  });
}

function assertObservedAssets(assetTracker) {
  assetTracker.assertHealthy();
  const snapshot = assetTracker.snapshot();
  if (snapshot.worker.length < 1 || snapshot.worker.some((asset) => asset.status < 200 || asset.status >= 300)) {
    throw smokeFailure('WORKER_ASSET_MISSING', `worker asset ${OCR_WORKER_PATH} was not observed as 2xx`);
  }
  if (snapshot.core.length < 1 || snapshot.core.some((asset) => asset.status < 200 || asset.status >= 300)) {
    throw smokeFailure('CORE_ASSET_MISSING', `core asset ${OCR_CORE_PREFIX} was not observed as 2xx`);
  }
  for (const languagePath of OCR_LANG_PATHS) {
    const observed = snapshot.lang.find((asset) => asset.path === languagePath);
    if (observed === undefined || observed.status < 200 || observed.status >= 300) {
      throw smokeFailure('LANG_ASSET_MISSING', `language asset ${languagePath} was not observed as 2xx`);
    }
  }
  return snapshot;
}

async function executeRealBrowserFlow({ context, page, origin, manifestAssetPaths }) {
  const assetTracker = createAssetTracker({ origin, manifestAssetPaths });
  const countedNetworkViolations = new WeakSet();
  let networkViolations = 0;
  const recordViolation = (request) => {
    if (countedNetworkViolations.has(request)) return;
    countedNetworkViolations.add(request);
    networkViolations += 1;
  };
  const requestAllowed = (request) => {
    try {
      assertNetworkUrlAllowed(request.url(), origin);
      return true;
    } catch {
      recordViolation(request);
      return false;
    }
  };

  await context.route('**/*', async (route) => {
    if (!requestAllowed(route.request())) {
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  context.on('request', (request) => {
    if (requestAllowed(request)) assetTracker.recordRequest(request.url());
  });
  context.on('response', (response) => {
    const request = response.request();
    if (!requestAllowed(request)) return;
    assetTracker.recordResponse(response.url(), response.status());
  });
  context.on('requestfailed', (request) => {
    if (requestAllowed(request)) assetTracker.recordRequestFailure(request.url());
  });
  await installWorkerEvidenceProbe(context);

  try {
    await page.goto(`${origin}/screenshot-upload`, { waitUntil: 'networkidle', timeout: 30_000 });
    const initialServiceWorkers = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 0;
      return (await navigator.serviceWorker.getRegistrations()).length;
    });
    if (initialServiceWorkers !== 0) {
      throw smokeFailure('SERVICE_WORKER_PRESENT', 'service worker registrations were not empty');
    }

    await page.locator('[data-testid="fictional-sample"]').click();
    await page.locator('img[alt="待处理的本地 OCR 图片预览"]').waitFor({
      state: 'visible',
      timeout: 30_000,
    });
    await page.locator('#ocr-redaction-x').fill('10');
    await page.locator('#ocr-redaction-y').fill('970');
    await page.locator('#ocr-redaction-width').fill('300');
    await page.locator('#ocr-redaction-height').fill('20');
    await page.locator('[data-testid="add-redaction"]').click();
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid^="remove-redaction-"]').length === 1,
      undefined,
      { timeout: 10_000 },
    );
    await page.locator('[data-testid="start-ocr"]').click();
    await page.waitForFunction(
      () => {
        const text = document.body.textContent ?? '';
        return text.includes('识别完成，等待人工核对。')
          || text.includes('识别未完成，请重试或改用手工录入。');
      },
      undefined,
      { timeout: 180_000 },
    );
    const succeeded = await page.getByText('识别完成，等待人工核对。', { exact: true }).count();
    if (succeeded !== 1) {
      const workerEvidence = await page.evaluate(
        (propertyName) => globalThis[propertyName],
        WORKER_EVIDENCE_PROPERTY,
      );
      const mappedMatchFields = await page.evaluate(() => {
        const names = new Set(['matchDate', 'league', 'homeTeam', 'awayTeam', 'kickoffTime']);
        return [...document.querySelectorAll('dl[aria-label="OCR 结构化候选字段"] > div')]
          .filter((row) => names.has(
            (row.querySelector('dt')?.textContent ?? '').split('·', 1)[0].trim(),
          ))
          .length;
      });
      const serviceWorkers = await page.evaluate(async () => {
        if (!('serviceWorker' in navigator)) return 0;
        return (await navigator.serviceWorker.getRegistrations()).length;
      });
      const assetSnapshot = assetTracker.snapshot();
      const safeEvidence = {
        stage: 'ERROR',
        worker: workerEvidence,
        mappedMatchFields,
        assetStatuses: {
          worker: assetSnapshot.worker.map((asset) => asset.status),
          core: assetSnapshot.core.map((asset) => asset.status),
          lang: assetSnapshot.lang.map((asset) => asset.status),
        },
        externalRequests: networkViolations,
        serviceWorkers,
      };
      throw smokeFailure(
        'OCR_STAGE_FAILED',
        `recognition stage diagnostics=${JSON.stringify(safeEvidence)}`,
      );
    }

    const mappedEvidence = await page.evaluate(() => {
      const matchFieldNames = new Set(['matchDate', 'league', 'homeTeam', 'awayTeam', 'kickoffTime']);
      let mappedMatchFields = 0;
      let hasLeague = false;
      let hasTeam = false;
      for (const row of document.querySelectorAll('dl[aria-label="OCR 结构化候选字段"] > div')) {
        const fieldName = (row.querySelector('dt')?.textContent ?? '').split('·', 1)[0].trim();
        const fieldValue = (row.querySelector('dd')?.textContent ?? '').trim();
        if (matchFieldNames.has(fieldName)) mappedMatchFields += 1;
        if (fieldName === 'league' && fieldValue.includes('演示联赛')) hasLeague = true;
        if (
          (fieldName === 'homeTeam' || fieldName === 'awayTeam')
          && ['Blue Harbor', '红枫城', '青石湾队', '星河谷队'].some((token) => fieldValue.includes(token))
        ) {
          hasTeam = true;
        }
      }
      return { mappedMatchFields, hasLeague, hasTeam };
    });
    if (!mappedEvidence.hasLeague) {
      throw smokeFailure('MAPPED_TOKEN_MISSING', 'mapped candidate token 演示联赛 is missing');
    }
    if (!mappedEvidence.hasTeam) {
      throw smokeFailure('MAPPED_TOKEN_MISSING', 'mapped candidate fictional team token is missing');
    }
    if (mappedEvidence.mappedMatchFields < 1) {
      throw smokeFailure('MAPPED_MATCH_MISSING', 'mapped MATCH field evidence is missing');
    }

    const workerEvidence = await page.evaluate(
      (propertyName) => globalThis[propertyName],
      WORKER_EVIDENCE_PROPERTY,
    );
    if (
      workerEvidence?.failed !== false
      || workerEvidence?.recognized < 1
      || workerEvidence?.tokens?.demoData !== true
      || workerEvidence?.tokens?.leagueIgnoringWhitespace !== true
    ) {
      throw smokeFailure('RAW_TOKEN_MISSING', 'raw recognition token DEMO DATA or 演示联赛 is missing');
    }
    const teamToken = workerEvidence.tokens.blueHarborIgnoringWhitespace === true
      ? 'Blue Harbor'
      : workerEvidence.tokens.redMapleIgnoringWhitespace === true
        ? '红枫城'
        : null;
    if (teamToken === null) {
      throw smokeFailure('RAW_TOKEN_MISSING', 'raw recognition fictional team token is missing');
    }

    const redactionCount = await page.locator('[data-testid^="remove-redaction-"]').count();
    if (redactionCount !== 1) {
      throw smokeFailure('REDACTION_MISSING', 'redaction count was not 1');
    }
    const serviceWorkers = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 0;
      return (await navigator.serviceWorker.getRegistrations()).length;
    });
    if (serviceWorkers !== 0) {
      throw smokeFailure('SERVICE_WORKER_PRESENT', 'service worker registrations were not empty');
    }
    if (networkViolations !== 0) {
      throw smokeFailure('NETWORK_POLICY_FAILED', 'external or unsupported network request was observed');
    }
    const assets = assertObservedAssets(assetTracker);

    return Object.freeze({
      tokens: Object.freeze(['DEMO DATA', '演示联赛', teamToken]),
      mappedMatchFields: mappedEvidence.mappedMatchFields,
      assets: Object.freeze({
        worker: assets.worker.length,
        core: assets.core.length,
        lang: assets.lang.length,
      }),
      externalRequests: networkViolations,
      serviceWorkers,
    });
  } catch (error) {
    if (error instanceof RealOcrSmokeError) throw error;
    throw smokeFailure('BROWSER_FLOW_FAILED', 'real browser OCR flow failed at a controlled stage');
  }
}

async function closeResource(resource, failure) {
  if (resource === null || typeof resource?.close !== 'function') return failure;
  try {
    await resource.close();
    return failure;
  } catch {
    return failure ?? smokeFailure('CLEANUP_FAILED', 'owned smoke resource did not close cleanly');
  }
}

export async function runRealOcrBrowserSmoke(dependencies = {}) {
  const startServer = dependencies.startServer ?? (() => startStaticServer());
  const launchBrowser = dependencies.launchBrowser ?? launchChromium;
  const executeBrowserFlow = dependencies.executeBrowserFlow ?? executeRealBrowserFlow;
  let server = null;
  let browser = null;
  let context = null;
  let page = null;
  let result;
  let failure;

  try {
    server = await startServer();
    browser = await launchBrowser();
    context = await browser.newContext({ serviceWorkers: 'block' });
    page = await context.newPage();
    const manifestAssetPaths = dependencies.manifestAssetPaths
      ?? (dependencies.executeBrowserFlow === undefined ? await loadManifestAssetPaths() : []);
    result = await executeBrowserFlow({
      server,
      browser,
      context,
      page,
      origin: server.origin,
      manifestAssetPaths,
    });
  } catch (error) {
    failure = error;
  }

  failure = await closeResource(page, failure);
  failure = await closeResource(context, failure);
  failure = await closeResource(browser, failure);
  failure = await closeResource(server, failure);
  if (failure !== undefined) throw failure;
  return result;
}

function isDirectRun() {
  if (typeof process.argv[1] !== 'string') return false;
  const currentPath = resolve(fileURLToPath(import.meta.url));
  const invokedPath = resolve(process.argv[1]);
  return process.platform === 'win32'
    ? currentPath.toLowerCase() === invokedPath.toLowerCase()
    : currentPath === invokedPath;
}

async function runCli() {
  try {
    const evidence = await runRealOcrBrowserSmoke();
    console.log(formatSmokeSummary(evidence));
  } catch (error) {
    const reason = error instanceof RealOcrSmokeError
      ? error.message
      : 'unexpected controlled smoke failure';
    console.error(`Real OCR smoke failed: ${reason}`);
    process.exitCode = 1;
  }
}

if (isDirectRun()) void runCli();
