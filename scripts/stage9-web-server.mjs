import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createServer, request as proxyRequest } from 'node:http';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOOPBACK_HOST = '127.0.0.1';
const DEFAULT_DIST_DIRECTORY = fileURLToPath(new URL('../apps/web/dist/', import.meta.url));
const DEFAULT_WEB_PACKAGE_URL = new URL('../apps/web/package.json', import.meta.url);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+-]*$/;
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
const MIME_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.gz': 'application/gzip',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
});
const STATIC_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
});
const TOP_LEVEL_SPA_ROUTES = new Set([
  '/',
  '/dashboard',
  '/official-source-hub',
  '/screenshot-upload',
  '/ocr-review',
  '/match-workspace',
  '/strategy-simulator',
  '/saved-plans',
  '/review-center',
  '/strategy-lab',
  '/model-settings',
  '/about-compliance',
]);

export const STAGE9_WEB_READY_PREFIX = 'STAGE9_WEB_READY ';

export class Stage9WebServerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'Stage9WebServerError';
    this.code = code;
  }
}

function fail(code, message) {
  return new Stage9WebServerError(code, message);
}

function isContained(root, candidate) {
  const fromRoot = relative(root, candidate);
  return fromRoot === ''
    || (!isAbsolute(fromRoot) && fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`));
}

function decodeRequestPath(requestTarget) {
  if (
    typeof requestTarget !== 'string'
    || !requestTarget.startsWith('/')
    || requestTarget.startsWith('//')
  ) {
    throw fail('REQUEST_TARGET_INVALID', 'request target must be an origin-form path');
  }

  const encodedPath = requestTarget.split('?', 1)[0];
  let pathname = encodedPath;
  try {
    for (let pass = 0; pass < 4; pass += 1) {
      const decoded = decodeURIComponent(pathname);
      pathname = decoded;
      if (!/%[0-9a-f]{2}/i.test(pathname)) break;
      if (pass === 3) throw new URIError('too many encoded layers');
    }
  } catch {
    throw fail('REQUEST_TARGET_INVALID', 'request path cannot be decoded safely');
  }

  if (
    !pathname.startsWith('/')
    || pathname.startsWith('//')
    || pathname.includes('\\')
    || pathname.includes('\0')
    || /[:*?"<>|]/.test(pathname)
    || pathname.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw fail('PATH_TRAVERSAL_BLOCKED', 'request path is not allowed');
  }
  return { pathname, rawTarget: requestTarget };
}

function normalizeBackendOrigin(rawOrigin) {
  let parsed;
  try {
    parsed = new URL(rawOrigin);
  } catch {
    throw fail('BACKEND_ORIGIN_BLOCKED', 'backend origin is invalid');
  }

  if (
    parsed.protocol !== 'http:'
    || parsed.hostname !== LOOPBACK_HOST
    || parsed.port === ''
    || parsed.pathname !== '/'
    || parsed.search !== ''
    || parsed.hash !== ''
    || parsed.username !== ''
    || parsed.password !== ''
    || !Number.isInteger(Number(parsed.port))
    || Number(parsed.port) < 1
    || Number(parsed.port) > 65_535
  ) {
    throw fail(
      'BACKEND_ORIGIN_BLOCKED',
      'backend origin must be an explicit http://127.0.0.1:<port> origin',
    );
  }
  return parsed.origin;
}

function connectionTokens(headers) {
  const raw = headers.connection;
  const values = Array.isArray(raw) ? raw : [raw];
  return new Set(values
    .filter((value) => typeof value === 'string')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean));
}

function filterHeaders(headers, { removeHost = false } = {}) {
  const nominatedHopHeaders = connectionTokens(headers);
  const filtered = {};
  for (const [name, value] of Object.entries(headers)) {
    const lowerName = name.toLowerCase();
    if (
      value === undefined
      || HOP_BY_HOP_HEADERS.has(lowerName)
      || nominatedHopHeaders.has(lowerName)
      || (removeHost && lowerName === 'host')
    ) {
      continue;
    }
    filtered[name] = value;
  }
  return filtered;
}

async function resolveStaticFile(root, pathname) {
  const candidate = resolve(root, `.${pathname}`);
  if (!isContained(root, candidate)) {
    throw fail('PATH_TRAVERSAL_BLOCKED', 'static path escapes the production dist');
  }

  let details;
  let canonical;
  try {
    details = await stat(candidate);
    if (!details.isFile()) return null;
    canonical = await realpath(candidate);
  } catch {
    return null;
  }
  if (!isContained(root, canonical)) {
    throw fail('PATH_TRAVERSAL_BLOCKED', 'static symlink escapes the production dist');
  }
  return { path: canonical, size: details.size };
}

function sendStaticFile(response, file, method) {
  response.writeHead(200, {
    ...STATIC_HEADERS,
    'Content-Length': file.size,
    'Content-Type': MIME_TYPES[extname(file.path).toLowerCase()] ?? 'application/octet-stream',
  });
  if (method === 'HEAD') {
    response.end();
    return;
  }
  const stream = createReadStream(file.path);
  stream.once('error', () => response.destroy());
  stream.pipe(response);
}

function isSpaRoute(pathname) {
  if (TOP_LEVEL_SPA_ROUTES.has(pathname)) return true;
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'workflows' || segments.length < 2 || segments.length > 4) return false;
  if (!/^workflow-[0-9a-f-]{36}$/i.test(segments[1])) return false;
  if (segments.length === 2) return true;
  if (!new Set(['ocr', 'ocr-review', 'match-workspace', 'analysis', 'plans']).has(segments[2])) {
    return false;
  }
  return segments.length === 3 || (segments.length === 4 && segments[2] === 'plans');
}

function isApiPath(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function sendStatus(response, status, headers = undefined) {
  response.writeHead(status, headers);
  response.end();
}

function proxyApiRequest(request, response, backendOrigin) {
  const target = new URL(backendOrigin);
  const upstream = proxyRequest({
    protocol: 'http:',
    hostname: LOOPBACK_HOST,
    port: target.port,
    method: request.method,
    path: request.url,
    headers: filterHeaders(request.headers, { removeHost: true }),
  }, (upstreamResponse) => {
    response.writeHead(
      upstreamResponse.statusCode ?? 502,
      filterHeaders(upstreamResponse.headers),
    );
    upstreamResponse.once('error', () => response.destroy());
    upstreamResponse.pipe(response);
  });

  upstream.once('error', () => {
    if (!response.headersSent) sendStatus(response, 502);
    else response.destroy();
  });
  request.once('aborted', () => upstream.destroy());
  response.once('close', () => {
    if (!response.writableEnded) upstream.destroy();
  });
  request.pipe(upstream);
}

async function defaultWebVersion() {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(DEFAULT_WEB_PACKAGE_URL, 'utf8'));
  } catch {
    throw fail('WEB_VERSION_REQUIRED', 'Web package version could not be read');
  }
  return parsed.version;
}

function validateBuildIdentity(verificationRunId, webVersion) {
  if (typeof verificationRunId !== 'string' || !UUID_PATTERN.test(verificationRunId)) {
    throw fail('VERIFICATION_RUN_ID_INVALID', 'verification run ID must be a UUID');
  }
  if (typeof webVersion !== 'string' || !SAFE_VERSION_PATTERN.test(webVersion)) {
    throw fail('WEB_VERSION_INVALID', 'Web version is invalid');
  }
}

export function formatStage9WebReadiness(origin) {
  const parsed = new URL(origin);
  return `${STAGE9_WEB_READY_PREFIX}${JSON.stringify({
    origin: parsed.origin,
    port: Number(parsed.port),
  })}\n`;
}

export async function startStage9WebServer({
  distDirectory = DEFAULT_DIST_DIRECTORY,
  backendOrigin,
  verificationRunId,
  webVersion,
  readinessWriter,
} = {}) {
  const normalizedBackendOrigin = normalizeBackendOrigin(backendOrigin);
  const resolvedWebVersion = webVersion ?? await defaultWebVersion();
  validateBuildIdentity(verificationRunId, resolvedWebVersion);

  let root;
  try {
    root = await realpath(resolve(distDirectory));
  } catch {
    throw fail('DIST_REQUIRED', 'production Web dist is required');
  }
  const indexFile = await resolveStaticFile(root, '/index.html');
  if (indexFile === null) throw fail('DIST_REQUIRED', 'production dist/index.html is required');
  const indexHtmlSha256 = createHash('sha256')
    .update(await readFile(indexFile.path))
    .digest('hex');
  const buildInfo = Object.freeze({
    verificationRunId,
    webVersion: resolvedWebVersion,
    indexHtmlSha256,
  });
  const buildInfoBody = Buffer.from(JSON.stringify(buildInfo));

  const server = createServer((request, response) => {
    void (async () => {
      let decoded;
      try {
        decoded = decodeRequestPath(request.url ?? '/');
      } catch {
        sendStatus(response, 400);
        return;
      }

      if (isApiPath(decoded.pathname)) {
        proxyApiRequest(request, response, normalizedBackendOrigin);
        return;
      }

      const method = request.method ?? 'GET';
      if (decoded.pathname === '/__stage9/build-info') {
        if (method !== 'GET') {
          sendStatus(response, 405, { Allow: 'GET' });
          return;
        }
        response.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Length': buildInfoBody.length,
          'Content-Type': 'application/json; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end(buildInfoBody);
        return;
      }

      if (method !== 'GET' && method !== 'HEAD') {
        sendStatus(response, 405, { Allow: 'GET, HEAD' });
        return;
      }

      const requestedPath = decoded.pathname === '/' ? '/index.html' : decoded.pathname;
      let requestedFile;
      try {
        requestedFile = await resolveStaticFile(root, requestedPath);
      } catch {
        sendStatus(response, 400);
        return;
      }
      if (requestedFile !== null) {
        sendStaticFile(response, requestedFile, method);
        return;
      }
      if (isSpaRoute(decoded.pathname)) {
        sendStaticFile(response, indexFile, method);
        return;
      }
      sendStatus(response, 404);
    })().catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  server.on('clientError', (_error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });

  try {
    await new Promise((resolveListen, rejectListen) => {
      const onError = (error) => rejectListen(error);
      server.once('error', onError);
      server.listen(0, LOOPBACK_HOST, () => {
        server.off('error', onError);
        resolveListen();
      });
    });
  } catch {
    server.close();
    throw fail('WEB_SERVER_START_FAILED', 'Stage 9 Web server could not start');
  }

  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw fail('WEB_SERVER_START_FAILED', 'Stage 9 Web server has no TCP address');
  }
  const origin = `http://${LOOPBACK_HOST}:${address.port}`;
  if (readinessWriter !== undefined) {
    if (typeof readinessWriter !== 'function') {
      server.close();
      throw fail('READINESS_WRITER_INVALID', 'readiness writer must be a function');
    }
    readinessWriter(formatStage9WebReadiness(origin));
  }

  let closePromise;
  return Object.freeze({
    origin,
    port: address.port,
    buildInfo,
    close() {
      closePromise ??= new Promise((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error) rejectClose(error);
          else resolveClose();
        });
        server.closeIdleConnections?.();
      });
      return closePromise;
    },
  });
}

function parseCliArguments(argv) {
  const values = {};
  const supported = new Map([
    ['--dist-directory', 'distDirectory'],
    ['--backend-origin', 'backendOrigin'],
    ['--verification-run-id', 'verificationRunId'],
    ['--web-version', 'webVersion'],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    const key = supported.get(option);
    if (key === undefined || index + 1 >= argv.length) {
      throw fail('CLI_ARGUMENT_INVALID', 'Stage 9 Web server CLI arguments are invalid');
    }
    values[key] = argv[index + 1];
    index += 1;
  }
  return values;
}

function isDirectRun() {
  return typeof process.argv[1] === 'string'
    && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
}

if (isDirectRun()) {
  try {
    const cli = parseCliArguments(process.argv.slice(2));
    const running = await startStage9WebServer({
      distDirectory: cli.distDirectory ?? process.env.STAGE9_DIST_DIRECTORY,
      backendOrigin: cli.backendOrigin ?? process.env.STAGE9_BACKEND_ORIGIN,
      verificationRunId: cli.verificationRunId ?? process.env.STAGE9_VERIFICATION_RUN_ID,
      webVersion: cli.webVersion ?? process.env.STAGE9_WEB_VERSION,
      readinessWriter: (line) => process.stdout.write(line),
    });
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      void running.close().catch(() => {
        process.exitCode = 1;
      });
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch (error) {
    const code = error instanceof Stage9WebServerError ? error.code : 'UNEXPECTED_FAILURE';
    process.stderr.write(`STAGE9_WEB_ERROR ${code}\n`);
    process.exitCode = 1;
  }
}
