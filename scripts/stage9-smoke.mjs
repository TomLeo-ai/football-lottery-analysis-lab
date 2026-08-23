import { randomUUID } from 'node:crypto';
import { spawn as nodeSpawn } from 'node:child_process';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import {
  createFileH2Url,
  createIsolatedRuntime,
  createSanitizedTail,
  selectCommand,
} from './lib/isolated-runtime.mjs';
import {
  assertPrivacyClean,
  createPrivacyPolicy,
  scanPrivacyEvidence,
} from './stage9-privacy-audit.mjs';
import { startStage9WebServer } from './stage9-web-server.mjs';

const LOOPBACK_HOST = '127.0.0.1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const DEFAULT_REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const WORKFLOW_ID_PATTERN = /^workflow-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OCR_WORKER_PATH = '/ocr/tesseract/7.0.0/worker/worker.min.js';
const OCR_CORE_PREFIX = '/ocr/tesseract/7.0.0/core/';
const OCR_LANGUAGE_PATHS = Object.freeze({
  eng: '/ocr/tesseract/7.0.0/lang/4.0.0_best_int/eng.traineddata.gz',
  chiSim: '/ocr/tesseract/7.0.0/lang/4.0.0_best_int/chi_sim.traineddata.gz',
});
const OCR_INDEXED_DB_KEYS = Object.freeze([
  'football-lab-ocr/tesseract-7.0.0/4.0.0_best_int/eng.traineddata',
  'football-lab-ocr/tesseract-7.0.0/4.0.0_best_int/chi_sim.traineddata',
]);
const WORKER_EVIDENCE_PROPERTY = '__footballLabStage9WorkerEvidence__';

export const STAGE9_STAGES = Object.freeze([
  'prepare-run',
  'build-web',
  'package-server',
  'select-jar',
  'start-backend',
  'start-web',
  'verify-identities',
  'launch-browser-profile',
  'execute-golden-flow',
  'stop-backend-for-restart',
  'wait-owned-port-close-for-restart',
  'wait-h2-unlock-for-restart',
  'restart-backend',
  'restore-golden-flow',
  'audit-runtime',
  'stop-backend-for-database-audit',
  'wait-owned-port-close-for-database-audit',
  'wait-h2-unlock-for-database-audit',
  'audit-database',
  'cleanup',
]);

export const LLM_SECRET_ENV_NAMES = Object.freeze([
  'OPENAI_API_KEY',
  'AZURE_OPENAI_API_KEY',
  'DEEPSEEK_API_KEY',
  'DASHSCOPE_API_KEY',
  'ZHIPU_API_KEY',
  'ARK_API_KEY',
  'MOONSHOT_API_KEY',
  'GEMINI_API_KEY',
  'OPENROUTER_API_KEY',
  'LITELLM_PROXY_API_KEY',
  'LOCAL_OPENAI_COMPATIBLE_API_KEY',
]);

class Stage9RunnerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'Stage9RunnerError';
    this.code = code;
  }
}

function runnerError(code, message) {
  return new Stage9RunnerError(code, message);
}

/**
 * Return a fresh environment object with every configured LLM credential removed.
 * Environment keys are matched case-insensitively so Windows casing cannot bypass
 * the isolation boundary.
 */
export function sanitizeChildEnvironment(environment = {}) {
  const blocked = new Set(LLM_SECRET_ENV_NAMES);
  return Object.fromEntries(
    Object.entries(environment)
      .filter(([name]) => !blocked.has(name.toUpperCase())),
  );
}

/** Enforce the browser's same-origin-only Stage 9 network boundary. */
export function assertStage9NetworkUrlAllowed(rawUrl, expectedOrigin) {
  let parsed;
  let normalizedOrigin;
  try {
    parsed = new URL(rawUrl);
    normalizedOrigin = new URL(expectedOrigin).origin;
  } catch {
    throw runnerError('NETWORK_REQUEST_BLOCKED', 'Stage 9 network request is invalid or blocked');
  }

  if (parsed.protocol === 'data:') return 'data';
  if (parsed.protocol === 'blob:') {
    if (parsed.origin !== normalizedOrigin) {
      throw runnerError('NETWORK_REQUEST_BLOCKED', 'Stage 9 foreign blob request is blocked');
    }
    return 'blob';
  }
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    || parsed.origin !== normalizedOrigin
  ) {
    throw runnerError('NETWORK_REQUEST_BLOCKED', 'Stage 9 external network request is blocked');
  }
  return 'same-origin';
}

/** Require both language models to have been loaded cold and never requested warm. */
export function assertWarmLanguageCache(before, after) {
  const valid = [before, after].every((value) => (
    value !== null
    && typeof value === 'object'
    && Number.isInteger(value.eng)
    && Number.isInteger(value.chiSim)
  ));
  if (
    !valid
    || before.eng < 1
    || before.chiSim < 1
    || after.eng !== before.eng
    || after.chiSim !== before.chiSim
  ) {
    throw runnerError(
      'WARM_CACHE_FAILED',
      'Stage 9 warm cache requested a language model again',
    );
  }
  return true;
}

/** Validate the settled, public-model-only browser persistence boundary. */
export function assertBrowserStorageBoundary(snapshot) {
  const fail = () => {
    throw runnerError('BROWSER_STORAGE_FAILED', 'Stage 9 browser storage boundary failed');
  };
  if (snapshot === null || typeof snapshot !== 'object') fail();
  if (!Array.isArray(snapshot.localStorage) || snapshot.localStorage.length !== 0) fail();
  if (!Array.isArray(snapshot.cacheStorageKeys) || snapshot.cacheStorageKeys.length !== 0) fail();
  if (snapshot.serviceWorkerRegistrations !== 0) fail();

  if (!Array.isArray(snapshot.sessionStorage) || snapshot.sessionStorage.length !== 1) fail();
  const sessionEntry = snapshot.sessionStorage[0];
  if (
    sessionEntry?.key !== 'football-lab:v2:workflowId'
    || typeof sessionEntry.value !== 'string'
    || !WORKFLOW_ID_PATTERN.test(sessionEntry.value)
  ) fail();

  if (!Array.isArray(snapshot.indexedDb) || snapshot.indexedDb.length !== 1) fail();
  const database = snapshot.indexedDb[0];
  if (database?.name !== 'keyval-store' || !Array.isArray(database.stores) || database.stores.length !== 1) {
    fail();
  }
  const store = database.stores[0];
  const actualKeys = Array.isArray(store?.keys) ? [...store.keys].sort() : [];
  const expectedKeys = [...OCR_INDEXED_DB_KEYS].sort();
  if (
    store?.name !== 'keyval'
    || actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])
  ) fail();
  return true;
}

/** Require one precise negative API status and safe server error token. */
export function assertApiError(result, expectedStatus, expectedCode) {
  if (
    result === null
    || typeof result !== 'object'
    || result.status !== expectedStatus
    || result.body?.error?.errorCode !== expectedCode
  ) {
    throw runnerError(
      'NEGATIVE_API_FAILED',
      'Stage 9 negative API contract returned an unexpected result',
    );
  }
  return true;
}

/** Select the single Maven executable JAR and reject zero or ambiguous results. */
export function selectExecutableJar(candidates) {
  if (!Array.isArray(candidates)) {
    throw new TypeError('Stage 9 JAR candidates must be an array');
  }
  const executableJars = candidates.filter((candidate) => {
    if (typeof candidate !== 'string') return false;
    const fileName = basename(candidate).toLowerCase();
    return fileName.endsWith('.jar') && !fileName.endsWith('.original');
  });
  if (executableJars.length !== 1) {
    throw runnerError(
      'EXECUTABLE_JAR_AMBIGUOUS',
      `Stage 9 expected exactly one executable JAR, found ${executableJars.length}`,
    );
  }
  return executableJars[0];
}

/** Validate that both independently served build identities belong to this run. */
export function assertBuildIdentities({
  backend,
  web,
  expectedArtifact,
  expectedVersion,
  runId,
}) {
  const backendIdentity = unwrapIdentity(backend, 'artifact');
  const webIdentity = unwrapIdentity(web, 'webVersion');
  const valid = typeof expectedArtifact === 'string'
    && expectedArtifact.length > 0
    && typeof expectedVersion === 'string'
    && expectedVersion.length > 0
    && typeof runId === 'string'
    && backendIdentity?.artifact === expectedArtifact
    && backendIdentity?.version === expectedVersion
    && backendIdentity?.verificationRunId === runId
    && webIdentity?.webVersion === expectedVersion
    && webIdentity?.verificationRunId === runId
    && typeof webIdentity?.indexHtmlSha256 === 'string'
    && SHA256_PATTERN.test(webIdentity.indexHtmlSha256);

  if (!valid) {
    throw runnerError(
      'BUILD_IDENTITY_MISMATCH',
      'Stage 9 build identity does not match the current artifact, version, and verification run',
    );
  }
  return Object.freeze({ backend: backendIdentity, web: webIdentity });
}

/**
 * Execute the Stage 9 state machine using injected build, process, identity,
 * browser, and audit adapters. Task 4 supplies the real golden-flow adapters;
 * this Task 3 harness intentionally has no operational default CLI.
 */
export async function runStage9({
  adapters,
  environment = process.env,
  expectedArtifact = 'football-lottery-analysis-server',
  expectedVersion,
  randomUUIDImpl = randomUUID,
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
} = {}) {
  validateRunnerInputs({ adapters, expectedArtifact, expectedVersion, randomUUIDImpl });
  const files = createFileAdapters(adapters.files);
  const childEnvironment = Object.freeze(sanitizeChildEnvironment(environment));
  const cleanup = createCleanupStack();
  const emitStage = async (stage) => {
    await adapters.observeStage?.(stage);
  };

  let primaryError;
  let output;
  try {
    await emitStage('prepare-run');
    const temporaryRoot = await files.createTempRoot('football-lab-stage9-');
    cleanup.register('temporary-root', () => files.removeTempRoot(temporaryRoot));

    const runId = randomUUIDImpl();
    if (typeof runId !== 'string' || !UUID_PATTERN.test(runId)) {
      throw runnerError('RUN_ID_INVALID', 'Stage 9 verification run ID must be a UUID');
    }
    const originalFileName = `fictional-golden-${runId}.png`;
    const fixturePath = join(repositoryRoot, 'assets', 'ocr-samples', 'fictional-golden.json');
    const fixture = await files.readJson(fixturePath);
    const rawOnlySentinel = fixture?.rawOnlySentinel;
    if (typeof rawOnlySentinel !== 'string' || rawOnlySentinel.trim() === '') {
      throw runnerError('RAW_SENTINEL_REQUIRED', 'Stage 9 fixture must define a raw-only sentinel');
    }

    const distDirectory = join(repositoryRoot, 'apps', 'web', 'dist');
    const serverTargetDirectory = join(repositoryRoot, 'apps', 'server', 'target');
    const profileDirectory = join(temporaryRoot, 'chromium-profile');
    const databaseUrl = createFileH2Url(temporaryRoot, 'stage9');
    const common = Object.freeze({
      childEnvironment,
      databaseUrl,
      distDirectory,
      originalFileName,
      profileDirectory,
      rawOnlySentinel,
      repositoryRoot,
      runId,
      serverTargetDirectory,
      temporaryRoot,
    });

    await emitStage('build-web');
    await adapters.build.buildWeb({
      childEnvironment,
      repositoryRoot,
    });

    await emitStage('package-server');
    await adapters.build.packageServer({
      childEnvironment,
      repositoryRoot,
    });

    await emitStage('select-jar');
    const jarPath = selectExecutableJar(await files.listServerJars(serverTargetDirectory));

    const firstBackend = await acquireBackend({
      adapters,
      childEnvironment,
      cleanup,
      databaseUrl,
      emitStage,
      jarPath,
      originalFileName,
      repositoryRoot,
      requestedPort: 0,
      runId,
      stage: 'start-backend',
    });

    await emitStage('start-web');
    const webProcess = await adapters.process.startWeb({
      backendOrigin: firstBackend.origin,
      childEnvironment,
      distDirectory,
      repositoryRoot,
      runId,
    });
    const stopWeb = cleanup.register('web', () => adapters.process.stopWeb(webProcess));
    const webReady = normalizeReadyOrigin(
      await adapters.process.waitForWebReady(webProcess, { runId }),
      'Web',
    );

    await emitStage('verify-identities');
    const backendBuildInfo = await adapters.identity.readBackendBuildInfo({
      backend: firstBackend.resource,
      origin: firstBackend.origin,
      runId,
    });
    const webBuildInfo = await adapters.identity.readWebBuildInfo({
      origin: webReady.origin,
      runId,
      web: webProcess,
    });
    const identities = assertBuildIdentities({
      backend: backendBuildInfo,
      expectedArtifact,
      expectedVersion,
      runId,
      web: webBuildInfo,
    });

    await emitStage('launch-browser-profile');
    const browser = await adapters.browser.launchPersistentProfile({
      childEnvironment,
      profileDirectory,
      runId,
      webOrigin: webReady.origin,
    });
    cleanup.register('browser', () => adapters.browser.closePersistentProfile(browser));

    await emitStage('execute-golden-flow');
    const flowState = await adapters.browser.executeGoldenFlow({
      ...common,
      backend: firstBackend.resource,
      backendOrigin: firstBackend.origin,
      backendPort: firstBackend.port,
      browser,
      identities,
      jarPath,
      web: webProcess,
      webOrigin: webReady.origin,
    });

    await emitStage('stop-backend-for-restart');
    await firstBackend.stop.run();

    await emitStage('wait-owned-port-close-for-restart');
    await adapters.process.waitForOwnedPortClose({
      backend: firstBackend.resource,
      host: LOOPBACK_HOST,
      port: firstBackend.port,
    });

    await emitStage('wait-h2-unlock-for-restart');
    await adapters.process.waitForH2Unlock({ databaseUrl, temporaryRoot });

    const restartedBackend = await acquireBackend({
      adapters,
      childEnvironment,
      cleanup,
      databaseUrl,
      emitStage,
      jarPath,
      originalFileName,
      repositoryRoot,
      requestedPort: firstBackend.port,
      runId,
      stage: 'restart-backend',
    });
    if (restartedBackend.port !== firstBackend.port) {
      throw runnerError(
        'BACKEND_RESTART_PORT_MISMATCH',
        'Stage 9 backend restart did not bind the original owned port',
      );
    }

    await emitStage('restore-golden-flow');
    const restoredState = await adapters.browser.restoreGoldenFlow({
      ...common,
      backend: restartedBackend.resource,
      backendOrigin: restartedBackend.origin,
      backendPort: restartedBackend.port,
      browser,
      flowState,
      identities,
      jarPath,
      web: webProcess,
      webOrigin: webReady.origin,
    });

    await emitStage('audit-runtime');
    await adapters.audit.runtime({
      ...common,
      backend: restartedBackend.resource,
      backendOrigin: restartedBackend.origin,
      browser,
      flowState,
      identities,
      jarPath,
      restoredState,
      web: webProcess,
      webOrigin: webReady.origin,
    });

    await emitStage('stop-backend-for-database-audit');
    await restartedBackend.stop.run();

    await emitStage('wait-owned-port-close-for-database-audit');
    await adapters.process.waitForOwnedPortClose({
      backend: restartedBackend.resource,
      host: LOOPBACK_HOST,
      port: restartedBackend.port,
    });

    await emitStage('wait-h2-unlock-for-database-audit');
    await adapters.process.waitForH2Unlock({ databaseUrl, temporaryRoot });

    await emitStage('audit-database');
    await adapters.audit.database({
      ...common,
      flowState,
      jarPath,
      restoredState,
    });

    // Resource details only; privacy sentinels and original filenames never leave
    // the injected browser/audit contexts or appear in the returned summary.
    output = Object.freeze({
      backendPort: firstBackend.port,
      jarPath,
      runId,
      webOrigin: webReady.origin,
    });

    // Kept in scope to make ownership explicit; cleanup remains centralized.
    void stopWeb;
  } catch (error) {
    primaryError = error;
  }

  let cleanupError;
  try {
    await emitStage('cleanup');
  } catch (error) {
    cleanupError = error;
  }
  try {
    await cleanup.runAll();
  } catch (error) {
    cleanupError = cleanupError === undefined
      ? error
      : new AggregateError([cleanupError, error], 'Stage 9 cleanup failed');
  }

  if (primaryError !== undefined && cleanupError !== undefined) {
    throw new AggregateError([primaryError, cleanupError], 'Stage 9 run and cleanup failed');
  }
  if (primaryError !== undefined) throw primaryError;
  if (cleanupError !== undefined) throw cleanupError;
  return output;
}

function unwrapIdentity(value, marker) {
  if (
    value !== null
    && typeof value === 'object'
    && value.data !== null
    && typeof value.data === 'object'
    && marker in value.data
  ) {
    return value.data;
  }
  return value;
}

function createFileAdapters(overrides = {}) {
  return {
    async createTempRoot(prefix) {
      return mkdtemp(join(tmpdir(), prefix));
    },
    async listServerJars(directory) {
      const entries = await readdir(directory, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) => join(directory, entry.name));
    },
    async readJson(path) {
      return JSON.parse(await readFile(path, 'utf8'));
    },
    async removeTempRoot(path) {
      await rm(path, { force: true, maxRetries: 2, recursive: true, retryDelay: 100 });
    },
    ...overrides,
  };
}

function validateRunnerInputs({ adapters, expectedArtifact, expectedVersion, randomUUIDImpl }) {
  if (adapters === null || typeof adapters !== 'object') {
    throw runnerError('ADAPTERS_REQUIRED', 'Stage 9 adapters are required');
  }
  const required = [
    ['build', 'buildWeb'],
    ['build', 'packageServer'],
    ['process', 'startBackend'],
    ['process', 'waitForBackendReady'],
    ['process', 'stopBackend'],
    ['process', 'waitForOwnedPortClose'],
    ['process', 'waitForH2Unlock'],
    ['process', 'startWeb'],
    ['process', 'waitForWebReady'],
    ['process', 'stopWeb'],
    ['identity', 'readBackendBuildInfo'],
    ['identity', 'readWebBuildInfo'],
    ['browser', 'launchPersistentProfile'],
    ['browser', 'closePersistentProfile'],
    ['browser', 'executeGoldenFlow'],
    ['browser', 'restoreGoldenFlow'],
    ['audit', 'runtime'],
    ['audit', 'database'],
  ];
  for (const [group, method] of required) {
    if (typeof adapters[group]?.[method] !== 'function') {
      throw runnerError(
        'ADAPTER_REQUIRED',
        `Stage 9 adapter ${group}.${method} is required`,
      );
    }
  }
  if (typeof expectedArtifact !== 'string' || expectedArtifact.trim() === '') {
    throw runnerError('EXPECTED_ARTIFACT_REQUIRED', 'Stage 9 expected artifact is required');
  }
  if (typeof expectedVersion !== 'string' || expectedVersion.trim() === '') {
    throw runnerError('EXPECTED_VERSION_REQUIRED', 'Stage 9 expected version is required');
  }
  if (typeof randomUUIDImpl !== 'function') {
    throw runnerError('RUN_ID_FACTORY_REQUIRED', 'Stage 9 run ID factory is required');
  }
}

async function acquireBackend({
  adapters,
  childEnvironment,
  cleanup,
  databaseUrl,
  emitStage,
  jarPath,
  originalFileName,
  repositoryRoot,
  requestedPort,
  runId,
  stage,
}) {
  await emitStage(stage);
  const specification = Object.freeze({
    childEnvironment,
    databaseUrl,
    host: LOOPBACK_HOST,
    jarPath,
    javaArguments: Object.freeze([
      '-jar',
      jarPath,
      `--server.address=${LOOPBACK_HOST}`,
      `--server.port=${requestedPort}`,
      `--spring.datasource.url=${databaseUrl}`,
      '--spring.h2.console.enabled=false',
      `--app.verification.run-id=${runId}`,
    ]),
    originalFileName,
    repositoryRoot,
    requestedPort,
    runId,
  });
  const resource = await adapters.process.startBackend(specification);
  const stop = cleanup.register(
    `backend-${requestedPort === 0 ? 'initial' : 'restart'}`,
    () => adapters.process.stopBackend(resource),
  );
  const ready = normalizeReadyOrigin(
    await adapters.process.waitForBackendReady(resource, specification),
    'backend',
  );
  return Object.freeze({
    origin: ready.origin,
    port: ready.port,
    resource,
    stop,
  });
}

function normalizeReadyOrigin(readiness, label) {
  if (readiness === null || typeof readiness !== 'object') {
    throw runnerError('PROCESS_READINESS_INVALID', `Stage 9 ${label} readiness is invalid`);
  }
  const port = Number(readiness.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw runnerError('PROCESS_READINESS_INVALID', `Stage 9 ${label} port is invalid`);
  }
  const expectedOrigin = `http://${LOOPBACK_HOST}:${port}`;
  const origin = readiness.origin ?? expectedOrigin;
  if (origin !== expectedOrigin) {
    throw runnerError(
      'PROCESS_ORIGIN_BLOCKED',
      `Stage 9 ${label} must bind the owned 127.0.0.1 port`,
    );
  }
  return Object.freeze({ origin, port });
}

function createCleanupStack() {
  const entries = [];
  return {
    register(name, action) {
      let completed = false;
      let runningPromise;
      const handle = Object.freeze({
        name,
        async run() {
          if (completed) return;
          if (runningPromise === undefined) {
            runningPromise = Promise.resolve()
              .then(action)
              .then(() => {
                completed = true;
              });
          }
          try {
            await runningPromise;
          } finally {
            if (!completed) runningPromise = undefined;
          }
        },
      });
      entries.push(handle);
      return handle;
    },
    async runAll() {
      const errors = [];
      for (const entry of [...entries].reverse()) {
        try {
          await entry.run();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) throw new AggregateError(errors, 'Stage 9 resource cleanup failed');
    },
  };
}

/**
 * Production adapters for the Stage 9 CLI. They build the current checkout,
 * own every process/browser, and never depend on an already-running service.
 */
export function createRealStage9Adapters({
  spawnImpl = nodeSpawn,
  delayImpl = delay,
} = {}) {
  return {
    build: {
      async buildWeb({ childEnvironment, repositoryRoot }) {
        await runOwnedCommand({
          tool: 'npm',
          args: ['run', 'sync:ocr-assets'],
          cwd: repositoryRoot,
          environment: childEnvironment,
          spawnImpl,
        });
        await runOwnedCommand({
          tool: 'npm',
          args: ['run', 'build:web'],
          cwd: repositoryRoot,
          environment: childEnvironment,
          spawnImpl,
        });
      },
      async packageServer({ childEnvironment, repositoryRoot }) {
        await runOwnedCommand({
          tool: 'mvn',
          args: ['-f', 'apps/server/pom.xml', 'clean', 'package', '-DskipTests'],
          cwd: repositoryRoot,
          environment: childEnvironment,
          spawnImpl,
        });
      },
    },
    process: {
      async startBackend(specification) {
        const runtime = createIsolatedRuntime({ environment: specification.childEnvironment });
        try {
          const owned = await runtime.startProcess({
            name: 'Stage 9 backend',
            tool: 'java',
            args: specification.javaArguments,
            cwd: specification.repositoryRoot,
            env: specification.childEnvironment,
            readiness: /Tomcat started on port (\d+)/,
            readyValue: (match) => {
              const port = Number(match[1]);
              return { origin: `http://${LOOPBACK_HOST}:${port}`, port };
            },
            readinessTimeoutMs: 120_000,
          });
          return Object.freeze({ runtime, owned });
        } catch (error) {
          await runtime.cleanup();
          throw error;
        }
      },
      async waitForBackendReady(resource) {
        return resource.owned.readyValue;
      },
      async stopBackend(resource) {
        await resource.runtime.cleanup();
      },
      async waitForOwnedPortClose({ host, port }) {
        await waitUntil(async () => !(await canConnect(host, port)), {
          code: 'OWNED_PORT_STILL_OPEN',
          delayImpl,
          timeoutMs: 20_000,
        });
      },
      async waitForH2Unlock({ databaseUrl }) {
        const lockPath = `${h2DatabasePath(databaseUrl)}.lock.db`;
        await waitUntil(async () => !(await pathExists(lockPath)), {
          code: 'H2_DATABASE_STILL_LOCKED',
          delayImpl,
          timeoutMs: 20_000,
        });
      },
      async startWeb({ backendOrigin, distDirectory, runId }) {
        return startStage9WebServer({
          backendOrigin,
          distDirectory,
          verificationRunId: runId,
        });
      },
      async waitForWebReady(resource) {
        return { origin: resource.origin, port: resource.port };
      },
      async stopWeb(resource) {
        await resource.close();
      },
    },
    identity: {
      async readBackendBuildInfo({ origin }) {
        return fetchJson(`${origin}/api/system/build-info`);
      },
      async readWebBuildInfo({ origin }) {
        return fetchJson(`${origin}/__stage9/build-info`);
      },
    },
    browser: {
      launchPersistentProfile: launchStage9Browser,
      closePersistentProfile: closeStage9Browser,
      executeGoldenFlow: executeStage9GoldenFlow,
      restoreGoldenFlow: restoreStage9GoldenFlow,
    },
    audit: {
      runtime: executeStage9RuntimeAudit,
      async database(context) {
        const result = await runOwnedCommand({
          tool: 'mvn',
          args: [
            '-f',
            'apps/server/pom.xml',
            '-Dtest=Stage9PrivacyDatabaseAuditTest',
            `-Dstage9.db.url=${context.databaseUrl}`,
            `-Dstage9.privacy.rawSentinel=${context.rawOnlySentinel}`,
            `-Dstage9.privacy.originalFileName=${context.originalFileName}`,
            'test',
          ],
          cwd: context.repositoryRoot,
          environment: context.childEnvironment,
          spawnImpl,
        });
        const policy = createPrivacyPolicy(context);
        assertPrivacyClean(scanPrivacyEvidence(policy, [
          privacyItem('database-audit-stdout', result.stdout),
          privacyItem('database-audit-stderr', result.stderr),
        ]));
      },
    },
  };
}

async function runOwnedCommand({ tool, args, cwd, environment, spawnImpl }) {
  const selected = selectCommand(tool, { environment });
  const stdoutTail = createSanitizedTail({ maxCharacters: 24_000 });
  const stderrTail = createSanitizedTail({ maxCharacters: 24_000 });
  const child = spawnImpl(
    selected.command,
    [...selected.commandArgs, ...args],
    {
      cwd,
      env: environment,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  child.stdout?.on('data', (chunk) => stdoutTail.append(chunk));
  child.stderr?.on('data', (chunk) => stderrTail.append(chunk));

  const exit = await new Promise((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('exit', (code, signal) => resolveExit({ code, signal }));
  });
  if (exit.code !== 0) {
    throw runnerError(
      'OWNED_COMMAND_FAILED',
      `Stage 9 ${tool} command failed without exposing command arguments`,
    );
  }
  return Object.freeze({ stdout: stdoutTail.value(), stderr: stderrTail.value() });
}

async function fetchJson(url) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch {
    throw runnerError('IDENTITY_REQUEST_FAILED', 'Stage 9 identity endpoint was unavailable');
  }
  if (!response.ok) {
    throw runnerError('IDENTITY_REQUEST_FAILED', 'Stage 9 identity endpoint rejected the request');
  }
  try {
    return await response.json();
  } catch {
    throw runnerError('IDENTITY_RESPONSE_INVALID', 'Stage 9 identity endpoint returned invalid JSON');
  }
}

async function waitUntil(predicate, { code, delayImpl, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delayImpl(100);
  }
  throw runnerError(code, 'Stage 9 owned resource did not reach the required state');
}

function canConnect(host, port) {
  return new Promise((resolveConnection) => {
    const socket = createConnection({ host, port });
    socket.setTimeout(400);
    socket.once('connect', () => {
      socket.destroy();
      resolveConnection(true);
    });
    const unavailable = () => {
      socket.destroy();
      resolveConnection(false);
    };
    socket.once('error', unavailable);
    socket.once('timeout', unavailable);
  });
}

function h2DatabasePath(databaseUrl) {
  const prefix = 'jdbc:h2:file:';
  if (typeof databaseUrl !== 'string' || !databaseUrl.startsWith(prefix)) {
    throw runnerError('H2_URL_INVALID', 'Stage 9 H2 URL is invalid');
  }
  const path = databaseUrl.slice(prefix.length).split(';', 1)[0];
  if (path.length === 0) throw runnerError('H2_URL_INVALID', 'Stage 9 H2 URL is invalid');
  return path;
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function launchStage9Browser({ childEnvironment, profileDirectory, webOrigin }) {
  const playwright = await import('@playwright/test');
  if (typeof playwright.chromium?.launchPersistentContext !== 'function') {
    throw runnerError('CHROMIUM_UNAVAILABLE', 'Stage 9 Playwright Chromium is unavailable');
  }
  const browser = {
    chromium: playwright.chromium,
    childEnvironment,
    profileDirectory,
    webOrigin,
    context: null,
    page: null,
    blockedRequests: 0,
    networkWrites: [],
    consoleEntries: [],
    assetCounts: new Map(),
  };
  try {
    await openStage9BrowserContext(browser);
  } catch (error) {
    await closeStage9Browser(browser);
    throw error;
  }
  return browser;
}

async function openStage9BrowserContext(browser) {
  const context = await browser.chromium.launchPersistentContext(browser.profileDirectory, {
    headless: true,
    env: browser.childEnvironment,
    serviceWorkers: 'block',
  });
  browser.context = context;
  browser.page = context.pages()[0] ?? await context.newPage();

  await context.addInitScript(({ evidenceProperty }) => {
    const evidence = {
      active: 0,
      created: 0,
      maxActive: 0,
      recognized: 0,
      terminated: 0,
      failed: false,
      tokens: {
        demoData: false,
        league: false,
        blueHarbor: false,
        redMaple: false,
      },
    };
    Object.defineProperty(globalThis, evidenceProperty, {
      configurable: false,
      enumerable: false,
      get() {
        return structuredClone(evidence);
      },
    });

    try {
      const NativeWorker = globalThis.Worker;
      if (typeof NativeWorker !== 'function') throw new Error('Worker unavailable');
      const WrappedWorker = function Worker(...args) {
        if (new.target === undefined) throw new TypeError('Worker constructor requires new');
        const worker = Reflect.construct(NativeWorker, args, NativeWorker);
        evidence.created += 1;
        evidence.active += 1;
        evidence.maxActive = Math.max(evidence.maxActive, evidence.active);
        let terminated = false;
        const nativeTerminate = worker.terminate.bind(worker);
        Object.defineProperty(worker, 'terminate', {
          configurable: true,
          value(...terminateArgs) {
            if (!terminated) {
              terminated = true;
              evidence.terminated += 1;
              evidence.active = Math.max(0, evidence.active - 1);
            }
            return nativeTerminate(...terminateArgs);
          },
        });
        worker.addEventListener('message', (event) => {
          try {
            const packet = event.data;
            if (packet?.action !== 'recognize' || packet?.status !== 'resolve') return;
            if (typeof packet?.data?.text !== 'string') {
              evidence.failed = true;
              return;
            }
            const compact = packet.data.text.replace(/\s+/gu, '');
            evidence.recognized += 1;
            evidence.tokens.demoData ||= compact.includes('DEMODATA');
            evidence.tokens.league ||= compact.includes('演示联赛');
            evidence.tokens.blueHarbor ||= compact.includes('BlueHarbor');
            evidence.tokens.redMaple ||= compact.includes('红枫城');
          } catch {
            evidence.failed = true;
          }
        });
        return worker;
      };
      Object.setPrototypeOf(WrappedWorker, NativeWorker);
      Object.defineProperty(WrappedWorker, 'prototype', {
        configurable: false,
        value: NativeWorker.prototype,
        writable: false,
      });
      Object.defineProperty(globalThis, 'Worker', {
        configurable: true,
        value: WrappedWorker,
        writable: true,
      });
    } catch {
      evidence.failed = true;
    }
  }, { evidenceProperty: WORKER_EVIDENCE_PROPERTY });

  await context.route('**/*', async (route) => {
    const request = route.request();
    try {
      assertStage9NetworkUrlAllowed(request.url(), browser.webOrigin);
    } catch {
      browser.blockedRequests += 1;
      await route.abort('blockedbyclient');
      return;
    }

    const parsed = new URL(request.url());
    if (parsed.origin === new URL(browser.webOrigin).origin) {
      browser.assetCounts.set(
        parsed.pathname,
        (browser.assetCounts.get(parsed.pathname) ?? 0) + 1,
      );
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      const headers = request.headers();
      browser.networkWrites.push(Object.freeze({
        method: request.method(),
        origin: parsed.origin,
        pathname: parsed.pathname,
        query: parsed.search,
        headers,
        body: request.postData() ?? '',
        contentType: headers['content-type'] ?? '',
      }));
    }
    await route.continue();
  });

  const attachPage = (page) => {
    page.on('console', (message) => {
      browser.consoleEntries.push({ type: message.type(), text: message.text() });
    });
    page.on('pageerror', (error) => {
      browser.consoleEntries.push({ type: 'pageerror', text: error.message });
    });
  };
  for (const page of context.pages()) attachPage(page);
  context.on('page', attachPage);
}

async function closeStage9Browser(browser) {
  if (browser?.context === null || browser?.context === undefined) return;
  const context = browser.context;
  browser.context = null;
  browser.page = null;
  await context.close();
}

function browserPage(browser) {
  if (browser?.page === null || browser?.page === undefined) {
    throw runnerError('BROWSER_NOT_RUNNING', 'Stage 9 browser is not running');
  }
  return browser.page;
}

function snapshotAssetCounts(browser) {
  return Object.freeze({
    worker: browser.assetCounts.get(OCR_WORKER_PATH) ?? 0,
    core: [...browser.assetCounts.entries()]
      .filter(([pathname]) => pathname.startsWith(OCR_CORE_PREFIX))
      .reduce((total, [, count]) => total + count, 0),
    eng: browser.assetCounts.get(OCR_LANGUAGE_PATHS.eng) ?? 0,
    chiSim: browser.assetCounts.get(OCR_LANGUAGE_PATHS.chiSim) ?? 0,
  });
}

async function runRealOcr({ browser, originalFileName, repositoryRoot, webOrigin }) {
  const page = browserPage(browser);
  const before = snapshotAssetCounts(browser);
  await page.goto(`${webOrigin}/screenshot-upload`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.getByRole('radio', { name: /虚构示例图片/ }).check();
  const image = await readFile(join(
    repositoryRoot,
    'apps',
    'web',
    'public',
    'ocr-samples',
    'fictional-golden.png',
  ));
  await page.getByLabel('选择本人拥有或已获授权的图片').setInputFiles({
    name: originalFileName,
    mimeType: 'image/png',
    buffer: image,
  });
  await page.getByRole('img', { name: '待处理的本地 OCR 图片预览' }).waitFor({ timeout: 30_000 });

  await page.getByTestId('rotate-right').click();
  await page.getByTestId('rotate-left').click();
  const crop = page.getByRole('group', { name: '裁剪区域' });
  await crop.getByLabel('x 坐标').fill('0');
  await crop.getByLabel('y 坐标').fill('0');
  await crop.getByLabel('宽度').fill('1440');
  await crop.getByLabel('高度').fill('1000');
  await page.getByTestId('apply-crop').click();
  const redaction = page.getByRole('group', { name: '新增隐私遮挡区域' });
  await redaction.getByLabel('x 坐标').fill('10');
  await redaction.getByLabel('y 坐标').fill('970');
  await redaction.getByLabel('宽度').fill('300');
  await redaction.getByLabel('高度').fill('20');
  await page.getByTestId('add-redaction').click();

  await page.getByTestId('start-ocr').click();
  await page.waitForFunction(() => {
    const text = document.body.textContent ?? '';
    return text.includes('OCR 本地人工核对')
      || text.includes('识别未完成，请重试或改用手工录入。');
  }, undefined, { timeout: 180_000 });
  const path = new URL(page.url()).pathname;
  const match = path.match(/^\/workflows\/(workflow-[0-9a-f-]{36})\/ocr-review$/i);
  if (match === null || !WORKFLOW_ID_PATTERN.test(match[1])) {
    throw runnerError('OCR_FLOW_FAILED', 'Stage 9 real OCR did not reach the review route');
  }
  await page.getByRole('heading', { name: 'OCR 本地人工核对' }).waitFor({ timeout: 30_000 });
  await page.waitForFunction(
    (propertyName) => globalThis[propertyName]?.active === 0,
    WORKER_EVIDENCE_PROPERTY,
    { timeout: 30_000 },
  );
  const worker = await page.evaluate(
    (propertyName) => globalThis[propertyName],
    WORKER_EVIDENCE_PROPERTY,
  );
  if (
    worker?.failed !== false
    || worker.recognized < 1
    || worker.active !== 0
    || worker.maxActive > 1
    || worker.terminated < 1
    || worker.tokens?.demoData !== true
    || worker.tokens?.league !== true
    || (worker.tokens?.blueHarbor !== true && worker.tokens?.redMaple !== true)
  ) {
    throw runnerError('OCR_EVIDENCE_FAILED', 'Stage 9 real OCR evidence was incomplete');
  }

  await page.locator('[data-testid^="match-league-"]').first().waitFor({
    state: 'visible',
    timeout: 30_000,
  });
  const structured = await page.evaluate(() => {
    const values = (prefix) => [...document.querySelectorAll(`[data-testid^="${prefix}"]`)]
      .map((element) => element.value);
    return {
      leagues: values('match-league-'),
      homes: values('match-home-'),
      aways: values('match-away-'),
    };
  });
  const teamValues = [...structured.homes, ...structured.aways].join(' ');
  if (
    !structured.leagues.some((value) => value.includes('演示联赛'))
    || !['Blue Harbor', '红枫城', '青石湾队', '星河谷队'].some((token) => teamValues.includes(token))
  ) {
    throw runnerError('OCR_MAPPING_FAILED', 'Stage 9 structured OCR mapping was incomplete');
  }

  const after = snapshotAssetCounts(browser);
  return Object.freeze({
    workflowId: match[1],
    worker,
    assetCountsBefore: before,
    assetCountsAfter: after,
  });
}

const GOLDEN_MATCHES = Object.freeze([
  Object.freeze({
    matchDate: '2030-04-01',
    league: '演示联赛',
    homeTeam: 'Blue Harbor',
    awayTeam: '青石湾队',
    kickoffTime: '2030-04-01T19:30:00+08:00',
    selection: 'HOME_WIN',
    odds: '2.15',
  }),
  Object.freeze({
    matchDate: '2030-04-02',
    league: '演示联赛',
    homeTeam: '红枫城',
    awayTeam: '星河谷队',
    kickoffTime: '2030-04-02T20:00:00+08:00',
    selection: 'DRAW',
    odds: '3.4',
  }),
]);

async function executeStage9GoldenFlow(context) {
  const ocr = await controlledFlowStep(
    'GOLDEN_OCR_BROWSER_FAILED',
    () => runRealOcr(context),
  );
  const page = browserPage(context.browser);
  await controlledFlowStep('GOLDEN_DRAFT_EDIT_FAILED', () => normalizeGoldenDraft(page));
  await controlledFlowStep('GOLDEN_DRAFT_SAVE_UI_FAILED', async () => {
    await page.getByTestId('save-review-draft').click();
    await page.getByText(/草稿已保存，revision 1。/).waitFor({ timeout: 30_000 });
  });

  const savedWrite = [...context.browser.networkWrites]
    .reverse()
    .find((entry) => entry.method === 'PUT' && entry.pathname.includes('/api/ocr/review-drafts/'));
  if (savedWrite === undefined || typeof savedWrite.headers['idempotency-key'] !== 'string') {
    throw runnerError('DRAFT_WRITE_EVIDENCE_MISSING', 'Stage 9 draft write evidence is missing');
  }
  let savedBody;
  try {
    savedBody = JSON.parse(savedWrite.body);
  } catch {
    throw runnerError('DRAFT_WRITE_EVIDENCE_INVALID', 'Stage 9 draft write evidence is invalid');
  }

  assertApiError(await browserApi(page, savedWrite.pathname, {
    method: 'PUT',
    idempotencyKey: savedWrite.headers['idempotency-key'],
    body: {
      ...savedBody,
      matches: savedBody.matches.map((match, index) => (
        index === 0 ? { ...match, homeTeam: 'Changed Harbor' } : match
      )),
    },
  }), 409, 'IDEMPOTENCY_KEY_REUSED');

  assertApiError(await browserApi(page, savedWrite.pathname, {
    method: 'PUT',
    idempotencyKey: randomUUID(),
    body: {
      ...savedBody,
      expectedRevision: 1,
      markets: [
        ...savedBody.markets,
        {
          ...savedBody.markets[0],
          marketId: randomUUID(),
          selection: 'AWAY_WIN',
        },
      ],
    },
  }), 400, 'VALIDATION_FAILED');

  await controlledFlowStep('GOLDEN_DRAFT_RELOAD_UI_FAILED', async () => {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.getByText(/已从服务端恢复 revision 1/).waitFor({ timeout: 30_000 });
    await assertGoldenDraft(page);
  });

  const workflowResult = await browserApi(page, `/api/ocr/workflows/${ocr.workflowId}`);
  const workflow = requireApiData(workflowResult, 200);
  if (typeof workflow.currentOcrTaskId !== 'string') {
    throw runnerError('OCR_TASK_ID_MISSING', 'Stage 9 workflow did not expose its OCR task');
  }
  if (
    ocr.assetCountsAfter.worker <= ocr.assetCountsBefore.worker
    || ocr.assetCountsAfter.core <= ocr.assetCountsBefore.core
    || ocr.assetCountsAfter.eng <= ocr.assetCountsBefore.eng
    || ocr.assetCountsAfter.chiSim <= ocr.assetCountsBefore.chiSim
  ) {
    throw runnerError('COLD_OCR_ASSET_FAILED', 'Stage 9 cold OCR did not request every local asset class');
  }
  if (context.browser.blockedRequests !== 0) {
    throw runnerError('NETWORK_REQUEST_BLOCKED', 'Stage 9 observed a blocked browser request');
  }
  return Object.freeze({
    workflowId: ocr.workflowId,
    ocrTaskId: workflow.currentOcrTaskId,
    revision: 1,
    coldLanguageCounts: Object.freeze({
      eng: ocr.assetCountsAfter.eng,
      chiSim: ocr.assetCountsAfter.chiSim,
    }),
    coldWorker: ocr.worker,
    firstBackendResource: context.backend,
  });
}

async function controlledFlowStep(code, action) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof Stage9RunnerError) throw error;
    throw runnerError(code, 'Stage 9 browser flow failed at a controlled step');
  }
}

async function normalizeGoldenDraft(page) {
  let matchCount = await page.locator('[data-testid^="match-home-"]').count();
  while (matchCount < GOLDEN_MATCHES.length) {
    await page.getByTestId('add-draft-match').click();
    matchCount = await page.locator('[data-testid^="match-home-"]').count();
  }
  while (matchCount > GOLDEN_MATCHES.length) {
    await page.getByTestId(`delete-match-${matchCount - 1}`).click();
    matchCount = await page.locator('[data-testid^="match-home-"]').count();
  }

  for (const [index, match] of GOLDEN_MATCHES.entries()) {
    await page.getByTestId(`match-date-${index}`).fill(match.matchDate);
    await page.getByTestId(`match-league-${index}`).fill(match.league);
    await page.getByTestId(`match-home-${index}`).fill(match.homeTeam);
    await page.getByTestId(`match-away-${index}`).fill(match.awayTeam);
    await page.getByTestId(`match-kickoff-${index}`).fill(match.kickoffTime);

    const region = page.getByRole('region', { name: `比赛草稿 ${index + 1}` });
    let marketCount = await region.locator('[data-testid^="market-selection-"]').count();
    if (marketCount === 0) {
      await page.getByTestId(`add-market-${index}`).click();
      marketCount = await region.locator('[data-testid^="market-selection-"]').count();
    }
    while (marketCount > 1) {
      await region.locator('[data-testid^="delete-market-"]').nth(marketCount - 1).click();
      marketCount = await region.locator('[data-testid^="market-selection-"]').count();
    }
    await region.locator('[data-testid^="market-selection-"]').selectOption(match.selection);
    await region.locator('[data-testid^="market-odds-"]').fill(match.odds);
  }
}

async function assertGoldenDraft(page) {
  for (const [index, match] of GOLDEN_MATCHES.entries()) {
    const values = await Promise.all([
      page.getByTestId(`match-date-${index}`).inputValue(),
      page.getByTestId(`match-league-${index}`).inputValue(),
      page.getByTestId(`match-home-${index}`).inputValue(),
      page.getByTestId(`match-away-${index}`).inputValue(),
      page.getByTestId(`match-kickoff-${index}`).inputValue(),
    ]);
    if (values.join('\u0000') !== [
      match.matchDate,
      match.league,
      match.homeTeam,
      match.awayTeam,
      match.kickoffTime,
    ].join('\u0000')) {
      throw runnerError('DRAFT_RECOVERY_FAILED', 'Stage 9 draft order or values did not recover');
    }
    const region = page.getByRole('region', { name: `比赛草稿 ${index + 1}` });
    if (
      await region.locator('[data-testid^="market-selection-"]').count() !== 1
      || await region.locator('[data-testid^="market-selection-"]').inputValue() !== match.selection
      || await region.locator('[data-testid^="market-odds-"]').inputValue() !== match.odds
    ) {
      throw runnerError('DRAFT_RECOVERY_FAILED', 'Stage 9 draft market did not recover');
    }
  }
}

async function restoreStage9GoldenFlow(context) {
  const page = browserPage(context.browser);
  await page.goto(`${context.webOrigin}/workflows/${context.flowState.workflowId}/ocr-review`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.getByText(/已从服务端恢复 revision 1/).waitFor({ timeout: 30_000 });
  await assertGoldenDraft(page);

  await page.getByTestId('confirm-review-draft').click();
  await page.getByText(/已确认快照：/).waitFor({ timeout: 30_000 });
  let workflow = requireApiData(
    await browserApi(page, `/api/ocr/workflows/${context.flowState.workflowId}`),
    200,
  );
  const snapshotId = workflow.confirmedSnapshotId;
  if (typeof snapshotId !== 'string') {
    throw runnerError('SNAPSHOT_ID_MISSING', 'Stage 9 confirmation did not create a snapshot');
  }

  assertApiError(await browserApi(
    page,
    `/api/ocr/review-drafts/${context.flowState.ocrTaskId}/confirm`,
    {
      method: 'POST',
      idempotencyKey: randomUUID(),
      body: { expectedRevision: context.flowState.revision },
    },
  ), 409, 'WORKFLOW_ALREADY_CONFIRMED');
  assertApiError(await browserApi(page, '/api/analysis/generate', {
    method: 'POST',
    idempotencyKey: randomUUID(),
    body: {
      snapshotId,
      engineMode: 'MOCK_RULE_ENGINE',
      sourceType: 'USER_SCREENSHOT_CONFIRMED',
      matches: [],
    },
  }), 400, 'CLIENT_ASSERTED_AUTHORITY_NOT_ALLOWED');
  assertApiError(await browserApi(page, '/api/analysis/generate', {
    method: 'POST',
    idempotencyKey: randomUUID(),
    body: {
      snapshotId: `snapshot-missing-${randomUUID()}`,
      engineMode: 'MOCK_RULE_ENGINE',
    },
  }), 404, 'SNAPSHOT_NOT_FOUND');

  await page.goto(`${context.webOrigin}/workflows/${context.flowState.workflowId}/analysis`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.getByTestId('analysis-engine-select').selectOption('MOCK_RULE_ENGINE');
  await page.getByTestId('generate-analysis-button').click();
  await page.getByRole('heading', { name: '分析报告' }).waitFor({ timeout: 30_000 });
  workflow = requireApiData(
    await browserApi(page, `/api/ocr/workflows/${context.flowState.workflowId}`),
    200,
  );
  const reportId = workflow.currentReportId;
  if (typeof reportId !== 'string') {
    throw runnerError('REPORT_ID_MISSING', 'Stage 9 analysis did not create a report');
  }

  assertApiError(await browserApi(page, '/api/strategies/simulate', {
    method: 'POST',
    idempotencyKey: randomUUID(),
    body: { reportId, snapshotId: {} },
  }), 400, 'CLIENT_ASSERTED_REPORT_NOT_ALLOWED');
  assertApiError(await browserApi(page, '/api/strategies/simulate', {
    method: 'POST',
    idempotencyKey: randomUUID(),
    body: { reportId: `analysis-missing-${randomUUID()}` },
  }), 404, 'REPORT_NOT_FOUND');

  await page.goto(`${context.webOrigin}/workflows/${context.flowState.workflowId}/plans`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.getByTestId('generate-plan-button').click();
  await page.getByText('模拟方案已生成；保存仍需单独确认。', { exact: true })
    .waitFor({ timeout: 30_000 });
  workflow = requireApiData(
    await browserApi(page, `/api/ocr/workflows/${context.flowState.workflowId}`),
    200,
  );
  const planId = workflow.currentPlanId;
  if (typeof planId !== 'string') {
    throw runnerError('PLAN_ID_MISSING', 'Stage 9 strategy did not create a plan');
  }
  await page.getByTestId('operator-note-input').fill('Stage 9 local verification');
  await page.getByTestId('save-plan-button').click();
  await page.getByText('模拟方案已保存并进入 PENDING_RESULT。', { exact: true })
    .waitFor({ timeout: 30_000 });
  await page.goto(
    `${context.webOrigin}/workflows/${context.flowState.workflowId}/plans/${planId}`,
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );
  await page.getByRole('heading', { name: '方案详情' }).waitFor({ timeout: 30_000 });
  if (!(await page.getByText(planId, { exact: true }).count())) {
    throw runnerError('PLAN_DEEP_LINK_FAILED', 'Stage 9 plan deep link did not restore the plan');
  }
  if (context.browser.blockedRequests !== 0) {
    throw runnerError('NETWORK_REQUEST_BLOCKED', 'Stage 9 observed a blocked browser request');
  }
  return Object.freeze({ snapshotId, reportId, planId });
}

async function browserApi(page, path, {
  method = 'GET',
  idempotencyKey,
  body,
} = {}) {
  return page.evaluate(async ({ requestPath, requestMethod, requestKey, requestBody }) => {
    const headers = {};
    if (requestKey !== undefined) headers['Idempotency-Key'] = requestKey;
    if (requestBody !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(requestPath, {
      method: requestMethod,
      headers,
      ...(requestBody === undefined ? {} : { body: JSON.stringify(requestBody) }),
    });
    const text = await response.text();
    let parsed = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { malformed: true };
      }
    }
    return { status: response.status, body: parsed };
  }, {
    requestPath: path,
    requestMethod: method,
    requestKey: idempotencyKey,
    requestBody: body,
  });
}

function requireApiData(result, expectedStatus) {
  if (
    result?.status !== expectedStatus
    || result.body?.data === null
    || typeof result.body?.data !== 'object'
  ) {
    throw runnerError('AUTHORITATIVE_API_FAILED', 'Stage 9 authoritative API response was invalid');
  }
  return result.body.data;
}

async function executeStage9RuntimeAudit(context) {
  const browser = context.browser;
  await closeStage9Browser(browser);
  await openStage9BrowserContext(browser);
  const beforeWarm = snapshotAssetCounts(browser);
  assertWarmLanguageCache(context.flowState.coldLanguageCounts, {
    eng: beforeWarm.eng,
    chiSim: beforeWarm.chiSim,
  });

  const warm = await runRealOcr(context);
  assertWarmLanguageCache(context.flowState.coldLanguageCounts, {
    eng: warm.assetCountsAfter.eng,
    chiSim: warm.assetCountsAfter.chiSim,
  });
  if (
    warm.worker.active !== 0
    || warm.worker.maxActive > 1
    || warm.worker.terminated < 1
    || context.flowState.coldWorker.active !== 0
    || context.flowState.coldWorker.maxActive > 1
  ) {
    throw runnerError('WORKER_LIFECYCLE_FAILED', 'Stage 9 worker lifecycle was not bounded');
  }

  const page = browserPage(browser);
  const abandon = await browserApi(page, `/api/ocr/workflows/${warm.workflowId}`, {
    method: 'DELETE',
    idempotencyKey: randomUUID(),
  });
  if (abandon.status !== 204) {
    throw runnerError('WARM_WORKFLOW_CLEANUP_FAILED', 'Stage 9 warm workflow was not abandoned');
  }

  const storage = await readBrowserStorage(page);
  assertBrowserStorageBoundary(storage);
  if (browser.blockedRequests !== 0) {
    throw runnerError('NETWORK_REQUEST_BLOCKED', 'Stage 9 observed a blocked browser request');
  }

  const policy = createPrivacyPolicy(context);
  const runtimeEvidence = [
    ...browser.networkWrites.map((entry) => ({
      method: entry.method,
      path: entry.pathname,
      contentType: entry.contentType,
      content: JSON.stringify({
        origin: entry.origin,
        pathname: entry.pathname,
        query: entry.query,
        headers: entry.headers,
        body: entry.body,
      }),
    })),
    ...browser.consoleEntries.map((entry) => privacyItem(
      `browser-${entry.type}`,
      entry.text,
    )),
    ...backendPrivacyItems('backend-initial', context.flowState.firstBackendResource),
    ...backendPrivacyItems('backend-restarted', context.backend),
  ];
  assertPrivacyClean(scanPrivacyEvidence(policy, runtimeEvidence));

  const distItems = await collectDirectoryEvidence(context.distDirectory, {
    pathPrefix: 'dist',
  });
  const protectedDistFindings = scanPrivacyEvidence(policy, distItems).filter((finding) => (
    finding.category === 'raw-only-sentinel' || finding.category === 'original-file-name'
  ));
  assertPrivacyClean(protectedDistFindings);
  if (await pathExists(join(context.distDirectory, 'ocr-samples', 'fictional-golden.json'))) {
    throw runnerError('FIXTURE_METADATA_COPIED', 'Stage 9 source-only fixture metadata entered dist');
  }

  const temporaryItems = await collectDirectoryEvidence(context.temporaryRoot, {
    pathPrefix: 'temporary',
    exclude: (path) => {
      const relativePath = relative(context.temporaryRoot, path);
      return relativePath === 'chromium-profile'
        || relativePath.startsWith(`chromium-profile${sep}`)
        || /(?:\.mv\.db|\.lock\.db|\.trace\.db)$/iu.test(relativePath);
    },
  });
  assertPrivacyClean(scanPrivacyEvidence(policy, temporaryItems));
}

async function readBrowserStorage(page) {
  return page.evaluate(async () => {
    const readStorage = (storage) => Array.from({ length: storage.length }, (_, index) => {
      const key = storage.key(index);
      return { key, value: key === null ? null : storage.getItem(key) };
    });
    const indexedDb = [];
    const databases = typeof indexedDB.databases === 'function'
      ? await indexedDB.databases()
      : [];
    for (const databaseInfo of databases) {
      if (typeof databaseInfo.name !== 'string') {
        indexedDb.push({ name: null, stores: [] });
        continue;
      }
      const database = await new Promise((resolveOpen, rejectOpen) => {
        const request = indexedDB.open(databaseInfo.name);
        request.onsuccess = () => resolveOpen(request.result);
        request.onerror = () => rejectOpen(request.error);
      });
      const stores = [];
      for (const name of [...database.objectStoreNames]) {
        const keys = await new Promise((resolveKeys, rejectKeys) => {
          const transaction = database.transaction(name, 'readonly');
          const request = transaction.objectStore(name).getAllKeys();
          request.onsuccess = () => resolveKeys(request.result.map(String));
          request.onerror = () => rejectKeys(request.error);
        });
        stores.push({ name, keys });
      }
      database.close();
      indexedDb.push({ name: databaseInfo.name, stores });
    }
    return {
      localStorage: readStorage(localStorage),
      sessionStorage: readStorage(sessionStorage),
      cacheStorageKeys: 'caches' in globalThis ? await caches.keys() : [],
      serviceWorkerRegistrations: 'serviceWorker' in navigator
        ? (await navigator.serviceWorker.getRegistrations()).length
        : 0,
      indexedDb,
    };
  });
}

function privacyItem(path, content, overrides = {}) {
  return {
    method: 'READ',
    path: `/${path}`,
    contentType: 'text/plain',
    content: content ?? '',
    ...overrides,
  };
}

function backendPrivacyItems(prefix, resource) {
  const owned = resource?.owned;
  if (owned === undefined) return [];
  return [
    privacyItem(`${prefix}-stdout`, owned.stdoutTail.value()),
    privacyItem(`${prefix}-stderr`, owned.stderrTail.value()),
  ];
}

async function collectDirectoryEvidence(root, { pathPrefix, exclude = () => false }) {
  const items = [];
  if (!(await pathExists(root))) return items;
  const visit = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (exclude(path)) continue;
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        items.push(privacyItem(
          `${pathPrefix}/${relative(root, path).replaceAll('\\', '/')}`,
          await readFile(path),
          { contentType: 'application/octet-stream' },
        ));
      }
    }
  };
  await visit(root);
  return items;
}

function isDirectRun() {
  return typeof process.argv[1] === 'string'
    && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
}

if (isDirectRun()) {
  let activeStage = 'not-started';
  try {
    const rootPackage = JSON.parse(await readFile(join(DEFAULT_REPOSITORY_ROOT, 'package.json'), 'utf8'));
    const adapters = createRealStage9Adapters();
    adapters.observeStage = (stage) => {
      if (stage !== 'cleanup') activeStage = stage;
    };
    const result = await runStage9({
      adapters,
      expectedVersion: rootPackage.version,
      repositoryRoot: DEFAULT_REPOSITORY_ROOT,
    });
    process.stdout.write(`STAGE9_SMOKE_OK ${JSON.stringify({
      backendPort: result.backendPort,
      runId: result.runId,
    })}\n`);
  } catch (error) {
    process.stderr.write(`STAGE9_SMOKE_FAILED ${safeErrorCode(error)} ${activeStage}\n`);
    process.exitCode = 1;
  }
}

function safeErrorCode(error) {
  if (typeof error?.code === 'string' && /^[A-Z0-9_]+$/u.test(error.code)) return error.code;
  if (error instanceof AggregateError) {
    for (const nested of error.errors) {
      const code = safeErrorCode(nested);
      if (code !== 'UNEXPECTED_FAILURE') return code;
    }
  }
  return 'UNEXPECTED_FAILURE';
}
