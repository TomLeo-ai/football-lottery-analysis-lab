import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const smokeScript = readFileSync(new URL('deepseek-integration-smoke.mjs', import.meta.url), 'utf8');

assert.doesNotMatch(smokeScript, /exactScorePolicy:\s*'CONSERVATIVE'/);
assert.doesNotMatch(smokeScript, /upsetCoverageLevel:\s*'MEDIUM'/);
assert.match(smokeScript, /function releaseChildHandles/);
assert.match(smokeScript, /await response\.text\(\)/);

const result = spawnSync(process.execPath, ['scripts/deepseek-integration-smoke.mjs'], {
  cwd: rootDir,
  env: {
    ...process.env,
    DEEPSEEK_API_KEY: ''
  },
  encoding: 'utf8'
});

const output = `${result.stdout}\n${result.stderr}`;

assert.equal(result.status, 2);
assert.match(output, /DEEPSEEK_API_KEY is required/);
assert.doesNotMatch(output, /unit-test-secret|sk-[A-Za-z0-9_-]+/);
