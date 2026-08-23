import { spawn as nodeSpawn, spawnSync as nodeSpawnSync } from 'node:child_process';
import { mkdtemp as nodeMkdtemp, rm as nodeRm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_TAIL_CHARACTERS = 8_000;
const DEFAULT_READINESS_TIMEOUT_MS = 90_000;

export class OwnedProcessSignalError extends Error {
  constructor(signal) {
    super(`Received ${signal}`);
    this.name = 'OwnedProcessSignalError';
    this.signal = signal;
    this.exitCode = signal === 'SIGINT' ? 130 : 143;
  }
}

export function selectCommand(
  tool,
  {
    platform = process.platform,
    environment = process.env,
    toolPaths = {}
  } = {}
) {
  if (!['npm', 'mvn', 'java'].includes(tool)) {
    throw new Error(`Unsupported owned-process tool: ${tool}`);
  }

  if (platform === 'win32' && tool !== 'java') {
    return {
      command: environment.ComSpec ?? environment.COMSPEC ?? 'cmd.exe',
      commandArgs: ['/d', '/s', '/c', 'call', toolPaths[tool] ?? `${tool}.cmd`]
    };
  }

  return {
    command: toolPaths[tool] ?? (platform === 'win32' && tool === 'java' ? 'java.exe' : tool),
    commandArgs: []
  };
}

export function createFileH2Url(temporaryRoot, databaseName = 'stage8') {
  const databasePath = resolve(temporaryRoot, databaseName).replaceAll('\\', '/');
  return `jdbc:h2:file:${databasePath};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_ON_EXIT=FALSE`;
}

export function createSanitizedTail({ maxCharacters = DEFAULT_TAIL_CHARACTERS } = {}) {
  let retained = '';
  let pendingLine = '';
  let pendingLineIsSensitive = false;

  return {
    append(chunk) {
      const segments = String(chunk).replace(/\r/g, '').split('\n');
      for (const [index, segment] of segments.entries()) {
        appendSegment(segment);
        if (index < segments.length - 1) {
          retained = `${retained}${pendingLine}\n`.slice(-maxCharacters);
          pendingLine = '';
          pendingLineIsSensitive = false;
        }
      }
    },
    value() {
      return `${retained}${pendingLine}`.slice(-maxCharacters);
    }
  };

  function appendSegment(segment) {
    if (pendingLineIsSensitive) return;

    pendingLine = stripControlCharacters(`${pendingLine}${segment}`);
    if (containsSensitiveLogContent(pendingLine)) {
      pendingLine = '[sensitive log line redacted]';
      pendingLineIsSensitive = true;
      return;
    }

    const detectionWindow = Math.max(maxCharacters, 128);
    pendingLine = pendingLine.slice(-detectionWindow);
  }
}

function containsSensitiveLogContent(line) {
  return /request[\s_-]*body\s*[:=]/i.test(line)
    || /authorization\s*:\s*bearer\b/i.test(line)
    || /["']?(?:api[_-]?key|access[_-]?token|token|secret|password)["']?\s*[:=]/i.test(line);
}

function stripControlCharacters(value) {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

function stripAnsiSequences(value) {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
}

export function createIsolatedRuntime({
  platform = process.platform,
  environment = process.env,
  toolPaths = {},
  spawnImpl = nodeSpawn,
  spawnSyncImpl = nodeSpawnSync,
  mkdtempImpl = nodeMkdtemp,
  rmImpl = nodeRm,
  delayImpl = delay,
  temporaryBase = tmpdir(),
  terminateTreeImpl,
  waitForExitImpl,
  tailCharacters = DEFAULT_TAIL_CHARACTERS,
  gracefulTimeoutMs = 2_000,
  forceTimeoutMs = 2_000,
  cleanupRetries = 3,
  cleanupRetryDelayMs = 100
} = {}) {
  const ownedProcesses = [];
  const ownedTemporaryRoots = [];
  const terminateOwnedTree = terminateTreeImpl ?? createTreeTerminator({ platform, spawnSyncImpl });
  const waitForOwnedExit = waitForExitImpl ?? ((child, timeoutMs) => waitForChildExit(child, timeoutMs, delayImpl));
  let cleanupPromise;

  return {
    async createTempRoot(prefix) {
      const path = await mkdtempImpl(join(temporaryBase, prefix));
      ownedTemporaryRoots.push(path);
      return path;
    },

    async startProcess({
      name,
      tool,
      args = [],
      cwd,
      env = environment,
      readiness,
      readyValue = (match) => match,
      readinessTimeoutMs = DEFAULT_READINESS_TIMEOUT_MS
    }) {
      const selected = selectCommand(tool, { platform, environment, toolPaths });
      const stdoutTail = createSanitizedTail({ maxCharacters: tailCharacters });
      const stderrTail = createSanitizedTail({ maxCharacters: tailCharacters });
      const child = spawnImpl(
        selected.command,
        [...selected.commandArgs, ...args],
        {
          cwd,
          env,
          detached: platform !== 'win32',
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe']
        }
      );
      const owned = { name, child, stdoutTail, stderrTail };
      ownedProcesses.push(owned);
      child.stdout?.on('data', (chunk) => stdoutTail.append(chunk));
      child.stderr?.on('data', (chunk) => stderrTail.append(chunk));

      const resolvedReadyValue = await waitForReadiness(child, {
        name,
        readiness,
        readyValue,
        timeoutMs: readinessTimeoutMs,
        stdoutTail,
        stderrTail
      });
      return { ...owned, readyValue: resolvedReadyValue };
    },

    cleanup() {
      cleanupPromise ??= cleanupOwnedResources();
      return cleanupPromise;
    }
  };

  async function cleanupOwnedResources() {
    for (const { child } of [...ownedProcesses].reverse()) {
      if (!Number.isInteger(child.pid) || child.exitCode !== null || child.signalCode !== null) {
        continue;
      }
      await terminateOwnedTree(child.pid, false);
      if (!(await waitForOwnedExit(child, gracefulTimeoutMs))) {
        await terminateOwnedTree(child.pid, true);
        await waitForOwnedExit(child, forceTimeoutMs);
      }
    }

    for (const path of [...ownedTemporaryRoots].reverse()) {
      await removeWithRetry(path, {
        rmImpl,
        delayImpl,
        retries: cleanupRetries,
        retryDelayMs: cleanupRetryDelayMs
      });
    }
  }
}

function waitForReadiness(child, {
  name,
  readiness,
  readyValue,
  timeoutMs,
  stdoutTail,
  stderrTail
}) {
  if (!(readiness instanceof RegExp)) {
    throw new TypeError(`${name} readiness must be a RegExp`);
  }

  return new Promise((resolveReady, rejectReady) => {
    const buffers = new Map();
    let settled = false;
    const timer = setTimeout(() => {
      fail(new Error(`${name} readiness timed out after ${timeoutMs}ms${formatTails(stdoutTail, stderrTail)}`));
    }, timeoutMs);

    const onStdout = (chunk) => inspectChunk(child.stdout, chunk);
    const onStderr = (chunk) => inspectChunk(child.stderr, chunk);
    const onError = (error) => fail(new Error(`${name} failed to spawn: ${error.message}`));
    const onExit = (code, signal) => {
      fail(new Error(
        `${name} exited before readiness (${code === null ? `signal ${signal}` : `code ${code}`})${formatTails(stdoutTail, stderrTail)}`
      ));
    };

    child.stdout?.on('data', onStdout);
    child.stderr?.on('data', onStderr);
    child.once('error', onError);
    child.once('exit', onExit);

    function inspectChunk(stream, chunk) {
      const combined = `${buffers.get(stream) ?? ''}${String(chunk)}`;
      const lines = combined.split(/\r?\n/);
      buffers.set(stream, lines.pop() ?? '');
      for (const line of lines) {
        const readinessLine = stripAnsiSequences(line);
        readiness.lastIndex = 0;
        const match = readiness.exec(readinessLine);
        if (match) {
          succeed(readyValue(match, readinessLine));
          return;
        }
      }
    }

    function succeed(value) {
      if (settled) return;
      settled = true;
      detach();
      resolveReady(value);
    }

    function fail(error) {
      if (settled) return;
      settled = true;
      detach();
      rejectReady(error);
    }

    function detach() {
      clearTimeout(timer);
      child.stdout?.off('data', onStdout);
      child.stderr?.off('data', onStderr);
      child.off('error', onError);
      child.off('exit', onExit);
    }
  });
}

function formatTails(stdoutTail, stderrTail) {
  const stdout = stdoutTail.value().trim();
  const stderr = stderrTail.value().trim();
  if (!stdout && !stderr) return '';
  return `\nstdout tail:\n${stdout || '[empty]'}\nstderr tail:\n${stderr || '[empty]'}`;
}

function createTreeTerminator({ platform, spawnSyncImpl }) {
  if (platform === 'win32') {
    return async (pid, force) => {
      const args = ['/pid', String(pid), '/t'];
      if (force) args.push('/f');
      spawnSyncImpl('taskkill', args, { shell: false, stdio: 'ignore' });
    };
  }
  return async (pid, force) => {
    try {
      process.kill(-pid, force ? 'SIGKILL' : 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
}

async function waitForChildExit(child, timeoutMs, delayImpl) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolveExit) => {
    let settled = false;
    const onExit = () => finish(true);
    child.once('exit', onExit);
    delayImpl(timeoutMs).then(() => finish(child.exitCode !== null || child.signalCode !== null));
    function finish(exited) {
      if (settled) return;
      settled = true;
      child.off('exit', onExit);
      resolveExit(exited);
    }
  });
}

async function removeWithRetry(path, { rmImpl, delayImpl, retries, retryDelayMs }) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await rmImpl(path, { recursive: true, force: true, maxRetries: 0 });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await delayImpl(retryDelayMs);
    }
  }
  throw lastError;
}

export async function runWithCleanup({ execute, cleanup, signalEmitter = process }) {
  let rejectSignal;
  const signalPromise = new Promise((_, reject) => {
    rejectSignal = reject;
  });
  const handlers = Object.fromEntries(
    ['SIGINT', 'SIGTERM'].map((signal) => [signal, () => rejectSignal(new OwnedProcessSignalError(signal))])
  );
  for (const [signal, handler] of Object.entries(handlers)) signalEmitter.on(signal, handler);

  try {
    return await Promise.race([Promise.resolve().then(execute), signalPromise]);
  } finally {
    for (const [signal, handler] of Object.entries(handlers)) signalEmitter.off(signal, handler);
    await cleanup();
  }
}
