import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const RELEASE_VERSION = '0.2.0';
const repositoryUrl = new URL('../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, repositoryUrl), 'utf8'));

const rootPackage = readJson('package.json');
const webPackage = readJson('apps/web/package.json');
const ocrCorePackage = readJson('packages/ocr-core/package.json');
const lockfile = readJson('package-lock.json');
const serverPom = readFileSync(new URL('apps/server/pom.xml', repositoryUrl), 'utf8');

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
assert.equal(
  webPackage.dependencies['@football-lottery-analysis-lab/ocr-core'],
  RELEASE_VERSION,
  'Web must consume the aligned OCR Core workspace version',
);
assert.match(
  serverPom,
  /<artifactId>football-lottery-analysis-server<\/artifactId>\s*<version>0\.2\.0<\/version>/u,
  'server project version must use 0.2.0',
);
assert.doesNotMatch(serverPom, /SNAPSHOT/iu, 'release-candidate server version must not be a SNAPSHOT');
assert.equal(
  rootPackage.scripts['smoke:stage9'],
  'node scripts/stage9-smoke.mjs',
  'smoke:stage9 must execute the real isolated runner',
);

process.stdout.write('Stage 9 configuration check passed.\n');
