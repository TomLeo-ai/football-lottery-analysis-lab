import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isMap, isScalar, isSeq, parseDocument, Scalar } from 'yaml';

const RELEASE_VERSION = '0.2.0';
const repositoryUrl = new URL('../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, repositoryUrl), 'utf8'));
const rootPackage = readJson('package.json');
const webPackage = readJson('apps/web/package.json');
const ocrCorePackage = readJson('packages/ocr-core/package.json');
const lockfile = readJson('package-lock.json');
const serverPom = readFileSync(new URL('apps/server/pom.xml', repositoryUrl), 'utf8');
const workflow = readFileSync(new URL('.github/workflows/compliance.yml', repositoryUrl), 'utf8');

for (const [name, version] of [
  ['root package', rootPackage.version],
  ['Web package', webPackage.version],
  ['OCR Core package', ocrCorePackage.version],
  ['lockfile root', lockfile.version],
  ['lockfile root workspace', lockfile.packages?.['']?.version],
  ['lockfile Web workspace', lockfile.packages?.['apps/web']?.version],
  ['lockfile OCR Core workspace', lockfile.packages?.['packages/ocr-core']?.version],
]) {
  assert.equal(version, RELEASE_VERSION, `${name} must use ${RELEASE_VERSION}`);
}
assert.equal(webPackage.dependencies['@football-lottery-analysis-lab/ocr-core'], RELEASE_VERSION);
assert.match(
  serverPom,
  /<artifactId>football-lottery-analysis-server<\/artifactId>\s*<version>0\.2\.0<\/version>/u,
);
assert.doesNotMatch(serverPom, /SNAPSHOT/iu);

const expectedScripts = {
  'test:compliance-scan': 'node --test scripts/compliance-scan.spec.mjs',
  'test:ocr-core': 'npm run test -w packages/ocr-core',
  'test:ocr-fixtures': 'node --test scripts/fictional-ocr-sample.spec.mjs',
  'sync:ocr-assets': 'node scripts/sync-ocr-assets.mjs',
  'check:ocr-assets': 'node scripts/ocr-assets-check.mjs',
  'test:ocr-assets': 'node --test scripts/ocr-assets-check.spec.mjs',
  'test:isolated-runtime': 'node --test scripts/lib/isolated-runtime.spec.mjs',
  'test:stage9-web-server': 'node --test scripts/stage9-web-server.spec.mjs',
  'test:stage9-smoke': 'node --test scripts/stage9-smoke.spec.mjs scripts/stage9-privacy-audit.spec.mjs',
  'test:stage9-config': 'node scripts/stage9-config.spec.mjs',
  'smoke:stage9': 'node scripts/stage9-smoke.mjs',
};
for (const [name, command] of Object.entries(expectedScripts)) {
  assert.equal(rootPackage.scripts[name], command, `${name} must have one canonical command`);
}
const expectedVerify = [
  'verify:community-templates',
  'test:compliance-scan',
  'compliance:scan',
  'test:ocr-core',
  'test:ocr-fixtures',
  'sync:ocr-assets',
  'check:ocr-assets',
  'test:ocr-assets',
  'test:isolated-runtime',
  'test:stage9-web-server',
  'test:stage9-smoke',
  'lint:web',
  'test:web',
  'build:web',
  'verify:server',
  'test:stage8-config',
  'test:stage9-config',
  'smoke:stage8',
  'smoke:stage9',
].map((name) => `npm run ${name}`).join(' && ');
assert.equal(rootPackage.scripts['verify:stage9'], expectedVerify);
assert.equal(rootPackage.scripts['verify:stage9'].includes('smoke:deepseek'), false);

const expectedSteps = [
  { name: 'Checkout', uses: 'actions/checkout@v4' },
  { name: 'Setup Node.js', uses: 'actions/setup-node@v4', with: { 'node-version': 20, cache: 'npm' } },
  { name: 'Setup Java', uses: 'actions/setup-java@v4', with: { distribution: 'temurin', 'java-version': 17, cache: 'maven' } },
  { name: 'Install dependencies', run: 'npm ci' },
  { name: 'Install Playwright Chromium', run: 'npx playwright install --with-deps chromium' },
  { name: 'Run Stage 9 verification', run: 'npm run verify:stage9' },
];

function assertWorkflowContract(source) {
  const document = parseDocument(source, { keepSourceTokens: true });
  assert.equal(document.errors.length, 0, 'CI workflow must be valid YAML');
  assert.equal(document.warnings.length, 0, 'CI workflow must not contain YAML warnings');
  const timeout = document.getIn(['jobs', 'verify', 'timeout-minutes']);
  assert.ok(Number.isInteger(timeout) && timeout > 0 && timeout <= 60, 'CI timeout must be finite');
  const steps = document.getIn(['jobs', 'verify', 'steps'], true);
  assert.ok(isSeq(steps), 'CI steps must be a sequence');
  for (const [index, step] of steps.items.entries()) {
    assert.ok(isMap(step), `CI step ${index + 1} must be a mapping`);
    const hasRun = step.has('run');
    const hasUses = step.has('uses');
    assert.notEqual(hasRun, hasUses, `CI step ${index + 1} must define exactly one of run or uses`);
    if (hasRun) {
      const run = step.get('run', true);
      assert.ok(isScalar(run) && typeof run.value === 'string');
      assert.equal(run.type, Scalar.PLAIN, `CI step ${index + 1} run must be a plain scalar`);
    }
  }
  assert.deepEqual(steps.toJSON(), expectedSteps, 'CI must keep the exact approved six-step contract');
}

assertWorkflowContract(workflow);
assert.throws(
  () => assertWorkflowContract(workflow.replace(
    'run: npm run verify:stage9',
    'run: |-\n          npm run verify:stage9',
  )),
  /plain scalar/u,
);
assert.throws(
  () => assertWorkflowContract(`${workflow.trimEnd()}\n      - name: Extra\n        run: npm test\n`),
  /exact approved six-step/u,
);

process.stdout.write('Stage 9 configuration check passed.\n');
