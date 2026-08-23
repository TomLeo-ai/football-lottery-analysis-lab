import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  LLM_SECRET_ENV_NAMES,
  STAGE9_STAGES,
  assertApiError,
  assertBrowserStorageBoundary,
  assertBuildIdentities,
  assertStage9NetworkUrlAllowed,
  assertWarmLanguageCache,
  runStage9,
  sanitizeChildEnvironment,
  selectExecutableJar,
} from './stage9-smoke.mjs';

const RUN_ID = '550e8400-e29b-41d4-a716-446655440000';
const VERSION = '0.2.0';
const ARTIFACT = 'football-lottery-analysis-server';
const HASH = 'a'.repeat(64);
const TEMP_ROOT = 'C:\\stage9-tests\\football-lab-stage9-fixed';
const FIRST_PORT = 43_123;
const WEB_PORT = 43_124;

test('real adapter contracts block remote traffic and accept only the reviewed final browser storage', () => {
  const origin = `http://127.0.0.1:${WEB_PORT}`;
  assert.equal(assertStage9NetworkUrlAllowed(`${origin}/api/ocr/workflows`, origin), 'same-origin');
  assert.equal(assertStage9NetworkUrlAllowed('data:image/png;base64,AA==', origin), 'data');
  assert.equal(assertStage9NetworkUrlAllowed(`blob:${origin}/${RUN_ID}`, origin), 'blob');
  assert.throws(() => assertStage9NetworkUrlAllowed('https://example.com/model', origin), /blocked/i);
  assert.throws(() => assertStage9NetworkUrlAllowed(`blob:https://example.com/${RUN_ID}`, origin), /blocked/i);

  assert.equal(assertWarmLanguageCache(
    { eng: 1, chiSim: 1 },
    { eng: 1, chiSim: 1 },
  ), true);
  assert.throws(
    () => assertWarmLanguageCache({ eng: 1, chiSim: 1 }, { eng: 2, chiSim: 1 }),
    /warm cache/i,
  );

  assert.equal(assertBrowserStorageBoundary({
    localStorage: [],
    sessionStorage: [{ key: 'football-lab:v2:workflowId', value: `workflow-${RUN_ID}` }],
    cacheStorageKeys: [],
    serviceWorkerRegistrations: 0,
    indexedDb: [{
      name: 'keyval-store',
      stores: [{
        name: 'keyval',
        keys: [
          'football-lab-ocr/tesseract-7.0.0/4.0.0_best_int/eng.traineddata',
          'football-lab-ocr/tesseract-7.0.0/4.0.0_best_int/chi_sim.traineddata',
        ],
      }],
    }],
  }), true);
  assert.throws(() => assertBrowserStorageBoundary({
    localStorage: [{ key: 'draft', value: 'unsafe' }],
    sessionStorage: [],
    cacheStorageKeys: [],
    serviceWorkerRegistrations: 0,
    indexedDb: [],
  }), /storage/i);

  assert.equal(assertApiError({
    status: 409,
    body: { error: { errorCode: 'IDEMPOTENCY_KEY_REUSED' } },
  }, 409, 'IDEMPOTENCY_KEY_REUSED'), true);
  assert.throws(
    () => assertApiError({ status: 200, body: { data: {} } }, 409, 'IDEMPOTENCY_KEY_REUSED'),
    /negative API/i,
  );
});

test('pure runner contracts sanitize secrets, select one executable JAR, and validate both identities', () => {
  const sourceEnvironment = {
    PATH: 'safe-path',
    OPENAI_API_KEY: 'secret-1',
    deepseek_api_key: 'secret-2',
    STAGE9_PUBLIC_SETTING: 'kept',
  };
  const sanitized = sanitizeChildEnvironment(sourceEnvironment);

  assert.equal(sanitized.PATH, 'safe-path');
  assert.equal(sanitized.STAGE9_PUBLIC_SETTING, 'kept');
  assert.equal('OPENAI_API_KEY' in sanitized, false);
  assert.equal('deepseek_api_key' in sanitized, false);
  assert.equal(sourceEnvironment.OPENAI_API_KEY, 'secret-1', 'the source environment must not be mutated');
  assert.ok(LLM_SECRET_ENV_NAMES.includes('LOCAL_OPENAI_COMPATIBLE_API_KEY'));

  assert.equal(
    selectExecutableJar([
      'apps/server/target/server.jar.original',
      'apps/server/target/server.jar',
      'apps/server/target/readme.txt',
    ]),
    'apps/server/target/server.jar',
  );
  for (const candidates of [[], ['one.jar', 'two.jar']]) {
    assert.throws(
      () => selectExecutableJar(candidates),
      /exactly one executable JAR/i,
    );
  }

  const identities = assertBuildIdentities({
    backend: backendIdentity(),
    web: webIdentity(),
    expectedArtifact: ARTIFACT,
    expectedVersion: VERSION,
    runId: RUN_ID,
  });
  assert.equal(identities.backend.version, VERSION);
  assert.equal(identities.web.webVersion, VERSION);

  const identityFailures = [
    { backend: { ...backendIdentity(), artifact: 'wrong' }, web: webIdentity() },
    { backend: { ...backendIdentity(), version: '0.1.0' }, web: webIdentity() },
    { backend: { ...backendIdentity(), verificationRunId: 'wrong' }, web: webIdentity() },
    { backend: backendIdentity(), web: { ...webIdentity(), webVersion: '0.1.0' } },
    { backend: backendIdentity(), web: { ...webIdentity(), verificationRunId: 'wrong' } },
    { backend: backendIdentity(), web: { ...webIdentity(), indexHtmlSha256: 'not-a-hash' } },
  ];
  for (const identity of identityFailures) {
    assert.throws(
      () => assertBuildIdentities({
        ...identity,
        expectedArtifact: ARTIFACT,
        expectedVersion: VERSION,
        runId: RUN_ID,
      }),
      /build identity/i,
    );
  }
});

test('runStage9 executes the fixed isolated sequence and restarts the same JAR, database, run ID, and port', async () => {
  const harness = createHarness();
  const result = await execute(harness);

  assert.deepEqual(harness.stages, STAGE9_STAGES);
  assert.equal(harness.backendStarts.length, 2);
  const [firstStart, restart] = harness.backendStarts;
  assert.equal(firstStart.requestedPort, 0);
  assert.equal(restart.requestedPort, FIRST_PORT);
  assert.equal(restart.jarPath, firstStart.jarPath);
  assert.equal(restart.databaseUrl, firstStart.databaseUrl);
  assert.equal(restart.runId, firstStart.runId);
  assert.match(firstStart.originalFileName, new RegExp(RUN_ID));
  assert.equal(restart.originalFileName, firstStart.originalFileName);
  assert.equal(harness.flowContexts[0].rawOnlySentinel, 'RAW_ONLY_FIXED_SENTINEL');
  assert.equal(harness.flowContexts[1].flowState.workflowId, 'workflow-fixed');
  assert.equal(harness.flowContexts[1].backendPort, FIRST_PORT);
  assert.equal(harness.profileDirectories.length, 1);
  assert.match(harness.profileDirectories[0], /chromium-profile$/);

  for (const childEnvironment of harness.childEnvironments) {
    for (const secretName of LLM_SECRET_ENV_NAMES) {
      assert.equal(
        Object.keys(childEnvironment).some((name) => name.toUpperCase() === secretName),
        false,
        `${secretName} must be absent from every child environment`,
      );
    }
  }
  assert.deepEqual(harness.waitedPorts, [FIRST_PORT, FIRST_PORT]);
  assert.equal(harness.waitedDatabaseUrls.length, 2);
  assert.equal(harness.waitedDatabaseUrls[0], harness.waitedDatabaseUrls[1]);
  assert.deepEqual(harness.cleanupCounts, {
    'backend-1': 1,
    'backend-2': 1,
    browser: 1,
    temporaryRoot: 1,
    web: 1,
  });
  assert.deepEqual(harness.finalCleanupOrder, ['browser', 'web', 'temporaryRoot']);
  assert.deepEqual(result, {
    backendPort: FIRST_PORT,
    jarPath: 'C:\\repo\\apps\\server\\target\\server.jar',
    runId: RUN_ID,
    webOrigin: `http://127.0.0.1:${WEB_PORT}`,
  });
});

test('runStage9 failures clean every acquired resource exactly once in LIFO order', async (t) => {
  const cases = [
    {
      name: 'Web build failure',
      failAt: 'build-web',
      expectedCleanup: ['temporaryRoot'],
    },
    {
      name: 'zero executable JARs',
      jars: [],
      expectedCleanup: ['temporaryRoot'],
    },
    {
      name: 'two executable JARs',
      jars: ['C:\\repo\\apps\\server\\target\\one.jar', 'C:\\repo\\apps\\server\\target\\two.jar'],
      expectedCleanup: ['temporaryRoot'],
    },
    {
      name: 'backend child exits before readiness',
      failAt: 'backend-ready',
      expectedCleanup: ['backend-1', 'temporaryRoot'],
    },
    {
      name: 'wrong backend build identity',
      failAt: 'identity',
      expectedCleanup: ['web', 'backend-1', 'temporaryRoot'],
    },
    {
      name: 'browser golden flow failure',
      failAt: 'browser-flow',
      expectedCleanup: ['browser', 'web', 'backend-1', 'temporaryRoot'],
    },
    {
      name: 'external browser request is rejected',
      failAt: 'external-request',
      expectedCleanup: ['browser', 'web', 'backend-1', 'temporaryRoot'],
    },
    {
      name: 'runtime audit failure',
      failAt: 'runtime-audit',
      expectedCleanup: ['backend-2', 'browser', 'web', 'temporaryRoot'],
      expectedAlreadyStopped: ['backend-1'],
    },
    {
      name: 'database audit failure',
      failAt: 'database-audit',
      expectedCleanup: ['browser', 'web', 'temporaryRoot'],
      expectedAlreadyStopped: ['backend-1', 'backend-2'],
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const harness = createHarness(scenario);
      await assert.rejects(() => execute(harness), /stage9 test failure|executable JAR|build identity/i);

      assert.deepEqual(harness.finalCleanupOrder, scenario.expectedCleanup);
      for (const resource of scenario.expectedAlreadyStopped ?? []) {
        assert.equal(harness.cleanupCounts[resource], 1);
      }
      for (const [resource, count] of Object.entries(harness.cleanupCounts)) {
        assert.equal(count, 1, `${resource} must be cleaned exactly once`);
      }
    });
  }
});

test('runStage9 cleans owned resources when every stage boundary fails', async (t) => {
  const expectedCleanupByStage = new Map([
    ['prepare-run', []],
    ['build-web', ['temporaryRoot']],
    ['package-server', ['temporaryRoot']],
    ['select-jar', ['temporaryRoot']],
    ['start-backend', ['temporaryRoot']],
    ['start-web', ['backend-1', 'temporaryRoot']],
    ['verify-identities', ['web', 'backend-1', 'temporaryRoot']],
    ['launch-browser-profile', ['web', 'backend-1', 'temporaryRoot']],
    ['execute-golden-flow', ['browser', 'web', 'backend-1', 'temporaryRoot']],
    ['stop-backend-for-restart', ['browser', 'web', 'backend-1', 'temporaryRoot']],
    ['wait-owned-port-close-for-restart', ['browser', 'web', 'temporaryRoot']],
    ['wait-h2-unlock-for-restart', ['browser', 'web', 'temporaryRoot']],
    ['restart-backend', ['browser', 'web', 'temporaryRoot']],
    ['restore-golden-flow', ['backend-2', 'browser', 'web', 'temporaryRoot']],
    ['audit-runtime', ['backend-2', 'browser', 'web', 'temporaryRoot']],
    ['stop-backend-for-database-audit', ['backend-2', 'browser', 'web', 'temporaryRoot']],
    ['wait-owned-port-close-for-database-audit', ['browser', 'web', 'temporaryRoot']],
    ['wait-h2-unlock-for-database-audit', ['browser', 'web', 'temporaryRoot']],
    ['audit-database', ['browser', 'web', 'temporaryRoot']],
    ['cleanup', ['browser', 'web', 'temporaryRoot']],
  ]);

  assert.deepEqual([...expectedCleanupByStage.keys()], STAGE9_STAGES);
  for (const [stage, expectedCleanup] of expectedCleanupByStage) {
    await t.test(stage, async () => {
      const harness = createHarness({ failStage: stage });
      await assert.rejects(() => execute(harness), /stage9 stage failure/i);
      assert.deepEqual(harness.finalCleanupOrder, expectedCleanup);
      for (const count of Object.values(harness.cleanupCounts)) assert.equal(count, 1);
    });
  }
});

test('runStage9 retries a failed owned-process stop during final cleanup', async () => {
  const harness = createHarness({ failAt: 'first-backend-stop-once' });
  await assert.rejects(() => execute(harness), /stage9 test failure: first-backend-stop-once/i);

  assert.equal(harness.cleanupAttempts['backend-1'], 2);
  assert.equal(harness.cleanupCounts['backend-1'], 1);
  assert.deepEqual(harness.finalCleanupOrder, ['browser', 'web', 'backend-1', 'temporaryRoot']);
});

function backendIdentity(overrides = {}) {
  return {
    artifact: ARTIFACT,
    version: VERSION,
    verificationRunId: RUN_ID,
    ...overrides,
  };
}

function webIdentity(overrides = {}) {
  return {
    indexHtmlSha256: HASH,
    verificationRunId: RUN_ID,
    webVersion: VERSION,
    ...overrides,
  };
}

function createHarness({ failAt, failStage, jars } = {}) {
  const stages = [];
  const cleanupCounts = {};
  const cleanupAttempts = {};
  const finalCleanupOrder = [];
  const backendStarts = [];
  const childEnvironments = [];
  const flowContexts = [];
  const profileDirectories = [];
  const waitedPorts = [];
  const waitedDatabaseUrls = [];
  let backendSequence = 0;
  let mainSettled = false;

  function fail(point) {
    if (failAt === point) throw new Error(`stage9 test failure: ${point}`);
  }

  function clean(resource) {
    cleanupCounts[resource] = (cleanupCounts[resource] ?? 0) + 1;
    if (mainSettled) finalCleanupOrder.push(resource);
  }

  const adapters = {
    observeStage(stage) {
      stages.push(stage);
      if (stage === 'cleanup') mainSettled = true;
      if (stage === failStage) throw new Error(`stage9 stage failure: ${stage}`);
    },
    files: {
      async createTempRoot(prefix) {
        assert.equal(prefix, 'football-lab-stage9-');
        return TEMP_ROOT;
      },
      async readJson(path) {
        assert.match(path, /assets[\\/]ocr-samples[\\/]fictional-golden\.json$/);
        return { rawOnlySentinel: 'RAW_ONLY_FIXED_SENTINEL' };
      },
      async listServerJars(path) {
        assert.match(path, /apps[\\/]server[\\/]target$/);
        return jars ?? [
          'C:\\repo\\apps\\server\\target\\server.jar.original',
          'C:\\repo\\apps\\server\\target\\server.jar',
        ];
      },
      async removeTempRoot(path) {
        assert.equal(path, TEMP_ROOT);
        clean('temporaryRoot');
      },
    },
    build: {
      async buildWeb(context) {
        childEnvironments.push(context.childEnvironment);
        fail('build-web');
      },
      async packageServer(context) {
        childEnvironments.push(context.childEnvironment);
        fail('package-server');
      },
    },
    process: {
      async startBackend(specification) {
        backendSequence += 1;
        backendStarts.push(specification);
        childEnvironments.push(specification.childEnvironment);
        return { id: `backend-${backendSequence}`, specification };
      },
      async waitForBackendReady(backend) {
        if (backend.id === 'backend-1') fail('backend-ready');
        const port = backend.specification.requestedPort === 0
          ? FIRST_PORT
          : backend.specification.requestedPort;
        return { origin: `http://127.0.0.1:${port}`, port };
      },
      async stopBackend(backend) {
        cleanupAttempts[backend.id] = (cleanupAttempts[backend.id] ?? 0) + 1;
        if (
          failAt === 'first-backend-stop-once'
          && backend.id === 'backend-1'
          && cleanupAttempts[backend.id] === 1
        ) {
          fail('first-backend-stop-once');
        }
        clean(backend.id);
      },
      async waitForOwnedPortClose({ backend, port }) {
        assert.match(backend.id, /^backend-[12]$/);
        waitedPorts.push(port);
      },
      async waitForH2Unlock({ databaseUrl }) {
        waitedDatabaseUrls.push(databaseUrl);
      },
      async startWeb(specification) {
        childEnvironments.push(specification.childEnvironment);
        return { id: 'web', specification };
      },
      async waitForWebReady() {
        return { origin: `http://127.0.0.1:${WEB_PORT}`, port: WEB_PORT };
      },
      async stopWeb() {
        clean('web');
      },
    },
    identity: {
      async readBackendBuildInfo() {
        if (failAt === 'identity') return backendIdentity({ verificationRunId: 'wrong-run-id' });
        return backendIdentity();
      },
      async readWebBuildInfo() {
        return webIdentity();
      },
    },
    browser: {
      async launchPersistentProfile(context) {
        childEnvironments.push(context.childEnvironment);
        profileDirectories.push(context.profileDirectory);
        return { id: 'browser' };
      },
      async closePersistentProfile() {
        clean('browser');
      },
      async executeGoldenFlow(context) {
        flowContexts.push(context);
        fail('browser-flow');
        fail('external-request');
        return { workflowId: 'workflow-fixed' };
      },
      async restoreGoldenFlow(context) {
        flowContexts.push(context);
        return { restored: true };
      },
    },
    audit: {
      async runtime() {
        fail('runtime-audit');
      },
      async database() {
        fail('database-audit');
      },
    },
  };

  return {
    adapters,
    backendStarts,
    childEnvironments,
    cleanupAttempts,
    cleanupCounts,
    finalCleanupOrder,
    flowContexts,
    profileDirectories,
    stages,
    waitedDatabaseUrls,
    waitedPorts,
  };
}

async function execute(harness) {
  return runStage9({
    adapters: harness.adapters,
    environment: {
      PATH: 'safe-path',
      OPENAI_API_KEY: 'must-be-removed',
      DEEPSEEK_API_KEY: 'must-be-removed',
    },
    expectedArtifact: ARTIFACT,
    expectedVersion: VERSION,
    randomUUIDImpl: () => RUN_ID,
    repositoryRoot: 'C:\\repo',
  });
}
