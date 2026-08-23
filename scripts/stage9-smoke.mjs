import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createFileH2Url } from './lib/isolated-runtime.mjs';

const LOOPBACK_HOST = '127.0.0.1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const DEFAULT_REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));

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

function isDirectRun() {
  return typeof process.argv[1] === 'string'
    && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
}

if (isDirectRun()) {
  process.stderr.write('STAGE9_HARNESS_REQUIRES_TASK4_REAL_GOLDEN_FLOW_ADAPTERS\n');
  process.exitCode = 1;
}
