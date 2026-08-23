import { strict as assert } from 'node:assert';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import {
  createFileH2Url,
  createIsolatedRuntime,
  createSanitizedTail,
  runWithCleanup,
  selectCommand
} from './isolated-runtime.mjs';

class FakeChild extends EventEmitter {
  constructor(pid) {
    super();
    this.pid = pid;
    this.exitCode = null;
    this.signalCode = null;
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
  }
}

test('Windows command selection keeps executable paths and arguments separate with shell false', async () => {
  const calls = [];
  const child = new FakeChild(41);
  const runtime = createIsolatedRuntime({
    platform: 'win32',
    environment: { ComSpec: 'C:\\Windows\\System32\\cmd.exe' },
    toolPaths: { npm: 'C:\\Program Files\\nodejs\\npm.cmd' },
    spawnImpl(command, args, options) {
      calls.push({ command, args, options });
      queueMicrotask(() => child.stdout.write('Local: http://127.0.0.1:43123/\n'));
      return child;
    }
  });

  const started = await runtime.startProcess({
    name: 'web',
    tool: 'npm',
    args: ['run', 'dev:web', '--', '--label', 'value with spaces'],
    readiness: /Local:\s+http:\/\/127\.0\.0\.1:(\d+)/,
    readyValue: (match) => Number(match[1])
  });

  assert.equal(started.readyValue, 43123);
  assert.equal(calls[0].command, 'C:\\Windows\\System32\\cmd.exe');
  assert.deepEqual(calls[0].args, [
      '/d',
      '/s',
      '/c',
      'call',
      'C:\\Program Files\\nodejs\\npm.cmd',
      'run',
      'dev:web',
      '--',
      '--label',
      'value with spaces'
    ]);
  assert.equal(calls[0].options.shell, false);
  assert.deepEqual(calls[0].options.args, undefined);
  assert.deepEqual(selectCommand('mvn', { platform: 'win32' }).commandArgs.slice(-1), ['mvn.cmd']);
  assert.equal(selectCommand('java', { platform: 'win32' }).command, 'java.exe');
});

test('readiness fails immediately when an owned child exits first', async () => {
  const child = new FakeChild(42);
  const runtime = createIsolatedRuntime({
    spawnImpl() {
      queueMicrotask(() => {
        child.exitCode = 7;
        child.emit('exit', 7, null);
      });
      return child;
    }
  });

  await assert.rejects(
    runtime.startProcess({
      name: 'server',
      tool: 'java',
      args: [],
      readiness: /Tomcat started on port (\d+)/,
      readinessTimeoutMs: 60_000
    }),
    /server exited before readiness \(code 7\)/
  );
});

test('cleanup gracefully then forcibly terminates registered PID trees only and retries temp removal finitely', async () => {
  const child = new FakeChild(101);
  const terminations = [];
  const removals = [];
  let waitCount = 0;
  const runtime = createIsolatedRuntime({
    spawnImpl() {
      queueMicrotask(() => child.stdout.write('ready\n'));
      return child;
    },
    terminateTreeImpl: async (pid, force) => terminations.push({ pid, force }),
    waitForExitImpl: async () => {
      waitCount += 1;
      return waitCount > 1;
    },
    mkdtempImpl: async () => 'C:\\Temp\\owned stage8',
    rmImpl: async (path) => {
      removals.push(path);
      if (removals.length < 3) {
        throw Object.assign(new Error('busy'), { code: 'EBUSY' });
      }
    },
    delayImpl: async () => {}
  });
  await runtime.createTempRoot('football-lab-stage8-');
  await runtime.startProcess({ name: 'server', tool: 'java', args: [], readiness: /^ready$/ });

  await runtime.cleanup();

  assert.deepEqual(terminations, [
    { pid: 101, force: false },
    { pid: 101, force: true }
  ]);
  assert.equal(terminations.some(({ pid }) => pid === 999), false, 'an unrelated PID must never be targeted');
  assert.equal(removals.length, 3);
  assert.ok(removals.every((path) => path === 'C:\\Temp\\owned stage8'));
});

test('ordinary errors and SIGINT/SIGTERM all pass through finally cleanup', async () => {
  let ordinaryCleanup = 0;
  await assert.rejects(
    runWithCleanup({
      execute: async () => { throw new Error('ordinary failure'); },
      cleanup: async () => { ordinaryCleanup += 1; },
      signalEmitter: new EventEmitter()
    }),
    /ordinary failure/
  );
  assert.equal(ordinaryCleanup, 1);

  for (const signal of ['SIGINT', 'SIGTERM']) {
    const signalEmitter = new EventEmitter();
    let cleanupCount = 0;
    const result = runWithCleanup({
      execute: async () => new Promise(() => {}),
      cleanup: async () => { cleanupCount += 1; },
      signalEmitter
    });
    queueMicrotask(() => signalEmitter.emit(signal));
    await assert.rejects(result, (error) => error.signal === signal);
    assert.equal(cleanupCount, 1);
  }
});

test('sanitized tails are bounded and never retain request bodies or credentials', () => {
  const tail = createSanitizedTail({ maxCharacters: 240 });
  tail.append('startup line\n');
  tail.append('request bo');
  tail.append('dy: {"secretSentinel":"must-not-remain"}\n');
  tail.append('Authoriza');
  tail.append('tion: Bearer top-secret-token\n');
  tail.append('{"api_key":"another-secret"}\n');
  const output = tail.value();

  assert.ok(output.length <= 240);
  assert.match(output, /startup line/);
  assert.equal(output.match(/\[sensitive log line redacted]/g)?.length, 3);
  assert.doesNotMatch(output, /must-not-remain|top-secret-token|another-secret/);

  tail.append('x'.repeat(300));
  assert.ok(tail.value().length <= 240);
});

test('file H2 URLs stay inside the test-owned temporary root', () => {
  const url = createFileH2Url('C:\\Temp\\owned stage8', 'stage8');
  assert.match(url, /^jdbc:h2:file:C:\/Temp\/owned stage8\/stage8;/);
  assert.match(url, /DB_CLOSE_ON_EXIT=FALSE/);
  assert.doesNotMatch(url, /apps\/server\/data/);
});

test('Stage 8 always starts owned dynamic services and contains no port reuse or port kill path', async () => {
  const source = await readFile(new URL('../stage8-smoke.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Get-NetTCPConnection|LocalPort|stopWindowsPortProcess|isReachable/);
  assert.doesNotMatch(source, /STAGE8_API_BASE|STAGE8_WEB_BASE/);
  assert.match(source, /server\.port=0/);
  assert.match(source, /LOCAL_API_TARGET/);
  assert.match(source, /createFileH2Url/);
  assert.doesNotMatch(source, /output[\\/]playwright/);
  assert.match(source, /verifyResponsiveUi\(temporaryRoot\)/);
  assert.equal(source.match(/runtime\.startProcess\(/g)?.length, 2);
});
