import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  STAGE9_WEB_READY_PREFIX,
  startStage9WebServer,
} from './stage9-web-server.mjs';

const RUN_ID = '550e8400-e29b-41d4-a716-446655440000';

function request(origin, path, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(origin);
    const client = httpRequest({
      hostname: target.hostname,
      port: target.port,
      method: options.method ?? 'GET',
      path,
      headers: options.headers,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    client.on('error', reject);
    if (options.body !== undefined) client.write(options.body);
    client.end();
  });
}

async function createFakeDist() {
  const root = await mkdtemp(join(tmpdir(), 'football-lab-stage9-web-test-'));
  const distDirectory = join(root, 'dist');
  await mkdir(join(distDirectory, 'assets'), { recursive: true });
  const indexHtml = '<!doctype html><title>Stage 9</title><div id="app"></div>';
  await writeFile(join(distDirectory, 'index.html'), indexHtml, 'utf8');
  await writeFile(join(distDirectory, 'assets', 'app.js'), 'globalThis.stage9 = true;\n', 'utf8');
  return { root, distDirectory, indexHtml };
}

async function startBackend(handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

test('serves exact production files, only known SPA routes, and build identity', async (context) => {
  const fixture = await createFakeDist();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const backend = await startBackend((_request, response) => {
    response.writeHead(204);
    response.end();
  });
  context.after(() => backend.close());

  const readiness = [];
  const web = await startStage9WebServer({
    distDirectory: fixture.distDirectory,
    backendOrigin: backend.origin,
    verificationRunId: RUN_ID,
    webVersion: '0.1.0-test',
    readinessWriter: (line) => readiness.push(line),
  });

  assert.match(web.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(readiness.length, 1);
  assert.ok(readiness[0].startsWith(STAGE9_WEB_READY_PREFIX));
  assert.deepEqual(JSON.parse(readiness[0].slice(STAGE9_WEB_READY_PREFIX.length)), {
    origin: web.origin,
    port: Number(new URL(web.origin).port),
  });

  const asset = await request(web.origin, '/assets/app.js');
  assert.equal(asset.status, 200);
  assert.equal(asset.body.toString('utf8'), 'globalThis.stage9 = true;\n');
  assert.match(asset.headers['content-type'], /^text\/javascript/);

  const deepLink = await request(
    web.origin,
    '/workflows/workflow-550e8400-e29b-41d4-a716-446655440000/plans',
  );
  assert.equal(deepLink.status, 200);
  assert.equal(deepLink.body.toString('utf8'), fixture.indexHtml);

  for (const route of ['/official-source-hub', '/about-compliance']) {
    const routeResponse = await request(web.origin, route);
    assert.equal(routeResponse.status, 200, route);
    assert.equal(routeResponse.body.toString('utf8'), fixture.indexHtml);
  }

  assert.equal((await request(web.origin, '/missing')).status, 404);
  assert.equal((await request(web.origin, '/assets/missing.js')).status, 404);

  const buildInfo = await request(web.origin, '/__stage9/build-info');
  assert.equal(buildInfo.status, 200);
  assert.deepEqual(JSON.parse(buildInfo.body.toString('utf8')), {
    verificationRunId: RUN_ID,
    webVersion: '0.1.0-test',
    indexHtmlSha256: createHash('sha256').update(fixture.indexHtml).digest('hex'),
  });

  const firstClose = web.close();
  const secondClose = web.close();
  assert.strictEqual(firstClose, secondClose);
  await firstClose;
});

test('rejects encoded and double-encoded traversal without serving outside dist', async (context) => {
  const fixture = await createFakeDist();
  await writeFile(join(fixture.root, 'secret.txt'), 'must-not-leak', 'utf8');
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const backend = await startBackend((_request, response) => response.end());
  context.after(() => backend.close());
  const web = await startStage9WebServer({
    distDirectory: fixture.distDirectory,
    backendOrigin: backend.origin,
    verificationRunId: RUN_ID,
    webVersion: '0.1.0-test',
  });
  context.after(() => web.close());

  for (const path of [
    '/%2e%2e/secret.txt',
    '/%252e%252e/secret.txt',
    '/..%5csecret.txt',
    '//outside.example/secret.txt',
  ]) {
    const response = await request(web.origin, path);
    assert.equal(response.status, 400, path);
    assert.notEqual(response.body.toString('utf8'), 'must-not-leak');
  }
});

test('streams only /api requests to the injected loopback backend and strips hop-by-hop headers', async (context) => {
  let backendRequests = 0;
  let firstChunkResolve;
  const firstChunk = new Promise((resolve) => {
    firstChunkResolve = resolve;
  });
  const observations = [];
  const backend = await startBackend((request, response) => {
    backendRequests += 1;
    const chunks = [];
    request.on('data', (chunk) => {
      chunks.push(chunk);
      firstChunkResolve();
    });
    request.on('end', () => {
      observations.push({
        url: request.url,
        host: request.headers.host,
        removed: request.headers['x-remove-me'],
        proxyAuthorization: request.headers['proxy-authorization'],
        body: Buffer.concat(chunks).toString('utf8'),
      });
      response.writeHead(201, {
        'Content-Type': 'application/json',
        Connection: 'x-backend-hop',
        'X-Backend-Hop': 'must-be-removed',
      });
      response.end('{"proxied":true}');
    });
  });
  context.after(() => backend.close());

  const fixture = await createFakeDist();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const web = await startStage9WebServer({
    distDirectory: fixture.distDirectory,
    backendOrigin: backend.origin,
    verificationRunId: RUN_ID,
    webVersion: '0.1.0-test',
  });
  context.after(() => web.close());

  const target = new URL(web.origin);
  const proxied = new Promise((resolve, reject) => {
    const client = httpRequest({
      hostname: target.hostname,
      port: target.port,
      method: 'POST',
      path: '/api/stream?mode=test',
      headers: {
        Host: 'untrusted.example',
        Connection: 'keep-alive, x-remove-me',
        'X-Remove-Me': 'must-be-removed',
        'Proxy-Authorization': 'must-be-removed',
        'Content-Type': 'text/plain',
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ response, body: Buffer.concat(chunks).toString('utf8') }));
    });
    client.on('error', reject);
    client.write('first-');
    Promise.race([
      firstChunk,
      new Promise((_, rejectTimeout) => setTimeout(
        () => rejectTimeout(new Error('proxy buffered the request body')),
        2_000,
      )),
    ]).then(() => client.end('second'), reject);
  });

  const result = await proxied;
  assert.equal(result.response.statusCode, 201);
  assert.equal(result.body, '{"proxied":true}');
  assert.equal(result.response.headers['x-backend-hop'], undefined);
  assert.deepEqual(observations, [{
    url: '/api/stream?mode=test',
    host: new URL(backend.origin).host,
    removed: undefined,
    proxyAuthorization: undefined,
    body: 'first-second',
  }]);

  const apiary = await request(web.origin, '/apiary');
  assert.equal(apiary.status, 404);
  assert.equal(backendRequests, 1);
});

test('rejects every backend target except an explicit HTTP 127.0.0.1 port', async (context) => {
  const fixture = await createFakeDist();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));

  for (const backendOrigin of [
    'https://127.0.0.1:8080',
    'http://localhost:8080',
    'http://127.0.0.2:8080',
    'http://127.0.0.1:8080/path',
    'http://user:secret@127.0.0.1:8080',
  ]) {
    await assert.rejects(
      startStage9WebServer({
        distDirectory: fixture.distDirectory,
        backendOrigin,
        verificationRunId: RUN_ID,
        webVersion: '0.1.0-test',
      }),
      { code: 'BACKEND_ORIGIN_BLOCKED' },
    );
  }
});
