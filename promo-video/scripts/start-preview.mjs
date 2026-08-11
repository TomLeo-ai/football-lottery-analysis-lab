import { openSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const projectDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const nodePath = 'C:\\Users\\dwyan\\AppData\\Local\\nvm\\v25.9.0';
const stdout = openSync(join(projectDir, '.codex-hyperframes-preview.out.log'), 'a');
const stderr = openSync(join(projectDir, '.codex-hyperframes-preview.err.log'), 'a');

function createWindowsEnv() {
  const env = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (key.toLowerCase() !== 'path') {
      env[key] = value;
    }
  }

  env.Path = `${nodePath};${process.env.Path ?? process.env.PATH ?? ''}`;
  return env;
}

const child = spawn(
  'cmd.exe',
  ['/d', '/c', 'npx.cmd --yes hyperframes@0.7.20 preview --port 3017 --no-open --force-new'],
  {
    cwd: projectDir,
    detached: true,
    env: createWindowsEnv(),
    stdio: ['ignore', stdout, stderr],
    windowsHide: true
  }
);

child.unref();
console.log(`started hyperframes preview pid=${child.pid}`);
