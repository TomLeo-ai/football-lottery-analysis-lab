import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = join(repoRoot, 'assets', 'ocr-samples', 'fictional-golden.html');
const metadataPath = join(repoRoot, 'assets', 'ocr-samples', 'fictional-golden.json');
const generatorPath = join(repoRoot, 'scripts', 'generate-fictional-ocr-sample.mjs');
const targetPath = join(repoRoot, 'apps', 'web', 'public', 'ocr-samples', 'fictional-golden.png');
const targetDirectory = dirname(targetPath);
const stableMetadata = {
  rights: 'PROJECT_GENERATED_FICTIONAL_SAMPLE',
  containsThirdPartyMarks: false,
  stableTokens: ['DEMO DATA', '演示联赛', 'Blue Harbor', '红枫城'],
  rawOnlySentinel: 'OCR_RAW_ONLY_SENTINEL_V2_9F3A',
};
const expectedMetadataKeys = [
  'schemaVersion', 'rights', 'containsThirdPartyMarks', 'stableTokens', 'rawOnlySentinel',
  'sourcePath', 'generatorPath', 'targetPath', 'sourceSha256', 'generatorSha256',
  'width', 'height', 'bytes', 'sha256',
];
const expectedVisibleLabels = ['MATCH REF', 'MARKET REF', 'DATE', 'LEAGUE', 'HOME', 'AWAY', 'KICKOFF', 'PLAY TYPE', 'SELECTION', 'ODDS'];

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function fixtureFiles(root) {
  return {
    source: join(root, 'assets', 'ocr-samples', 'fictional-golden.html'),
    metadata: join(root, 'assets', 'ocr-samples', 'fictional-golden.json'),
    generator: join(root, 'scripts', 'generate-fictional-ocr-sample.mjs'),
    target: join(root, 'apps', 'web', 'public', 'ocr-samples', 'fictional-golden.png'),
    publicDirectory: join(root, 'apps', 'web', 'public', 'ocr-samples'),
  };
}

function copyFixtureToTemp() {
  const root = mkdtempSync(join(tmpdir(), 'fictional-ocr-contract-'));
  const files = fixtureFiles(root);
  mkdirSync(dirname(files.source), { recursive: true });
  mkdirSync(dirname(files.generator), { recursive: true });
  mkdirSync(files.publicDirectory, { recursive: true });
  cpSync(sourcePath, files.source);
  cpSync(metadataPath, files.metadata);
  cpSync(generatorPath, files.generator);
  cpSync(targetPath, files.target);
  return { root, files };
}

function readMetadata(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeMetadata(path, metadata) {
  writeFileSync(path, JSON.stringify(metadata, null, 2));
}

function refreshMetadata(files, { source = false, generator = false, target = false } = {}) {
  const metadata = readMetadata(files.metadata);
  if (source) metadata.sourceSha256 = sha256(readFileSync(files.source));
  if (generator) metadata.generatorSha256 = sha256(readFileSync(files.generator));
  if (target) {
    const png = readFileSync(files.target);
    metadata.bytes = png.length;
    metadata.sha256 = sha256(png);
  }
  writeMetadata(files.metadata, metadata);
}

function mutatePng(files, mutate) {
  const png = Buffer.from(readFileSync(files.target));
  mutate(png);
  writeFileSync(files.target, png);
  refreshMetadata(files, { target: true });
}

async function loadValidator() {
  const module = await loadGeneratorModule();
  assert.equal(typeof module.validateFictionalOcrFixture, 'function', 'generator must export pure validator');
  return module.validateFictionalOcrFixture;
}

async function loadGeneratorModule() {
  return import(pathToFileURL(generatorPath).href);
}

function replaceFirstIdatWithEmpty(bytes, crc32) {
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (type === 'IDAT') {
      const typeBytes = Buffer.from('IDAT', 'ascii');
      const emptyCrc = Buffer.alloc(4);
      emptyCrc.writeUInt32BE(crc32(typeBytes, Buffer.alloc(0)), 0);
      return Buffer.concat([bytes.subarray(0, offset), Buffer.alloc(4), typeBytes, emptyCrc, bytes.subarray(dataEnd + 4)]);
    }
    offset = dataEnd + 4;
  }
  throw new Error('fixture PNG has no IDAT chunk');
}

function assertPngSignatureAndDimensions(bytes, metadata) {
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'PNG magic must be exact');
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', 'PNG must start with an IHDR chunk');
  assert.equal(bytes.readUInt32BE(16), metadata.width, 'PNG width must match metadata');
  assert.equal(bytes.readUInt32BE(20), metadata.height, 'PNG height must match metadata');
}

test('rights-safe fictional OCR fixture satisfies the strict metadata, PNG, source, and DOM contract', async () => {
  for (const path of [sourcePath, metadataPath, generatorPath, targetPath]) {
    assert.equal(statSync(path).isFile(), true, `required fixture file missing: ${relative(repoRoot, path)}`);
  }

  const metadata = readMetadata(metadataPath);
  assert.deepEqual(Object.keys(metadata).sort(), [...expectedMetadataKeys].sort(), 'metadata must have the exact key set');
  assert.equal(metadata.schemaVersion, 'OCR_FIXTURE_V1');
  for (const [key, value] of Object.entries(stableMetadata)) assert.deepEqual(metadata[key], value, `metadata.${key}`);
  assert.equal(metadata.sourcePath, 'assets/ocr-samples/fictional-golden.html');
  assert.equal(metadata.generatorPath, 'scripts/generate-fictional-ocr-sample.mjs');
  assert.equal(metadata.targetPath, 'apps/web/public/ocr-samples/fictional-golden.png');
  assert.equal(metadata.width, 1440);
  assert.equal(metadata.height, 1000);
  assert.ok(Number.isInteger(metadata.bytes) && metadata.bytes > 0 && metadata.bytes < 1024 * 1024);
  assert.match(metadata.sourceSha256, /^[a-f0-9]{64}$/);
  assert.match(metadata.generatorSha256, /^[a-f0-9]{64}$/);
  assert.equal(metadata.sourceSha256, sha256(readFileSync(sourcePath)));
  assert.equal(metadata.generatorSha256, sha256(readFileSync(generatorPath)));

  const png = readFileSync(targetPath);
  assert.equal(png.length, metadata.bytes);
  assert.equal(sha256(png), metadata.sha256);
  assertPngSignatureAndDimensions(png, metadata);

  const source = readFileSync(sourcePath, 'utf8');
  for (const token of [...stableMetadata.stableTokens, stableMetadata.rawOnlySentinel]) assert.match(source, new RegExp(token));
  for (const label of expectedVisibleLabels) {
    const exactLabel = new RegExp(`<dt>\\s*${label}:\\s*</dt>`, 'g');
    assert.equal(source.match(exactLabel)?.length ?? 0, 2, `each match must visibly contain exactly two ${label}: labels`);
  }
  assert.equal(source.match(/<dt>[^<]*<\/dt>/g)?.length ?? 0, 20);
  assert.match(source, /DEMO DATA/);
  assert.match(source, /FICTIONAL SAMPLE/);
  assert.match(source, /DEMO-MATCH-A/);
  assert.match(source, /DEMO-MATCH-B/);
  assert.match(source, /WIN_DRAW_LOSS/);
  assert.doesNotMatch(source, /<img\b/i);
  assert.doesNotMatch(source, /https?:\/\//i);
  assert.doesNotMatch(source, /data:/i);
  assert.doesNotMatch(source, /\/\//);
  assert.doesNotMatch(source, /\burl\s*\(/i);
  assert.doesNotMatch(source, /@import\b/i);
  for (const forbidden of ['Premier League', 'UEFA', 'FIFA', '世界杯', '英超', '中超', 'Nike', 'Adidas', 'Manchester', 'Liverpool', 'Real Madrid', 'logo']) {
    assert.doesNotMatch(source, new RegExp(forbidden, 'i'), `source contains forbidden real-world mark: ${forbidden}`);
  }
  assert.deepEqual(readdirSync(targetDirectory), ['fictional-golden.png']);

  const validate = await loadValidator();
  assert.deepEqual(await validate(repoRoot), [], 'committed fixture must validate with no errors');
});

test('strict validator rejects malformed metadata, PNG structure, source visibility, resources, and generator copies', async () => {
  const validate = await loadValidator();
  const generatorModule = await loadGeneratorModule();
  const cases = [
    ['metadata null', ({ files }) => writeFileSync(files.metadata, 'null'), /metadata\.shape/],
    ['metadata array', ({ files }) => writeFileSync(files.metadata, '[]'), /metadata\.shape/],
    ['metadata false', ({ files }) => writeFileSync(files.metadata, 'false'), /metadata\.shape/],
    ['metadata zero', ({ files }) => writeFileSync(files.metadata, '0'), /metadata\.shape/],
    ['metadata string', ({ files }) => writeFileSync(files.metadata, '"fixture"'), /metadata\.shape/],
    ['metadata extra key', ({ files }) => { const metadata = readMetadata(files.metadata); metadata.extra = true; writeMetadata(files.metadata, metadata); }, /metadata\.keys/],
    ['metadata missing key', ({ files }) => { const metadata = readMetadata(files.metadata); delete metadata.generatorSha256; writeMetadata(files.metadata, metadata); }, /metadata\.keys/],
    ['metadata wrong schema', ({ files }) => { const metadata = readMetadata(files.metadata); metadata.schemaVersion = 'OCR_FIXTURE_V0'; writeMetadata(files.metadata, metadata); }, /metadata\.schemaVersion/],
    ['metadata generator path mismatch', ({ files }) => { const metadata = readMetadata(files.metadata); metadata.generatorPath = 'scripts/not-the-generator.mjs'; writeMetadata(files.metadata, metadata); }, /metadata\.generatorPath/],
    ['metadata wrong width', ({ files }) => { const metadata = readMetadata(files.metadata); metadata.width = 0; writeMetadata(files.metadata, metadata); }, /metadata\.width/],
    ['metadata wrong bytes type', ({ files }) => { const metadata = readMetadata(files.metadata); metadata.bytes = '99426'; writeMetadata(files.metadata, metadata); }, /metadata\.bytes/],
    ['generator tampered against approved hash', ({ files }) => { writeFileSync(files.generator, `${readFileSync(files.generator, 'utf8')}\n// tampered\n`); }, /generator\.sha256/],
    ['generator missing', ({ files }) => rmSync(files.generator), /generator\.missing/],
    ['PNG CRC tampered with refreshed hash', ({ files }) => mutatePng(files, (png) => { png[29] ^= 0xff; }), /png\.crc/],
    ['PNG truncated with refreshed hash', ({ files }) => { const png = readFileSync(files.target); writeFileSync(files.target, png.subarray(0, png.length - 12)); refreshMetadata(files, { target: true }); }, /png\.(iend|structure)/],
    ['PNG trailing bytes with refreshed hash', ({ files }) => { const png = readFileSync(files.target); writeFileSync(files.target, Buffer.concat([png, Buffer.from([0xde, 0xad])])); refreshMetadata(files, { target: true }); }, /png\.trailing/],
    ['PNG huge chunk length with refreshed hash', ({ files }) => mutatePng(files, (png) => { png.writeUInt32BE(0xffffffff, 8); }), /png\.(length|structure)/],
    ['PNG zero width with refreshed hash', ({ files }) => { const png = Buffer.from(readFileSync(files.target)); png.writeUInt32BE(0, 16); writeFileSync(files.target, png); const metadata = readMetadata(files.metadata); metadata.width = 0; writeMetadata(files.metadata, metadata); refreshMetadata(files, { target: true }); }, /png\.width/],
    ['PNG all-ones height with refreshed hash', ({ files }) => { const png = Buffer.from(readFileSync(files.target)); png.writeUInt32BE(0xffffffff, 20); writeFileSync(files.target, png); const metadata = readMetadata(files.metadata); metadata.height = 0xffffffff; writeMetadata(files.metadata, metadata); refreshMetadata(files, { target: true }); }, /png\.height/],
    ['PNG zero-length IDAT with refreshed hash', ({ files }) => { const png = replaceFirstIdatWithEmpty(readFileSync(files.target), generatorModule.crc32); writeFileSync(files.target, png); refreshMetadata(files, { target: true }); }, /png\.data/],
    ['comment-only stable token with refreshed source hash', ({ files }) => { const source = readFileSync(files.source, 'utf8').replace('<dd>Blue Harbor</dd>', '<dd><!-- Blue Harbor --></dd>'); writeFileSync(files.source, source); refreshMetadata(files, { source: true }); }, /render\.token/],
    ['style pseudo-only stable token with refreshed source hash', ({ files }) => { const source = readFileSync(files.source, 'utf8').replace('</style>', '.pseudo-token::after { content: "Blue Harbor"; }\n  </style>').replace('<dd>Blue Harbor</dd>', '<dd class="pseudo-token"></dd>'); writeFileSync(files.source, source); refreshMetadata(files, { source: true }); }, /render\.token/],
    ['transparent text with refreshed source hash', ({ files }) => { const source = readFileSync(files.source, 'utf8').replace('<dd>Blue Harbor</dd>', '<dd style="color:transparent">Blue Harbor</dd>'); writeFileSync(files.source, source); refreshMetadata(files, { source: true }); }, /render\.visibility/],
    ['transparent text-fill with refreshed source hash', ({ files }) => { const source = readFileSync(files.source, 'utf8').replace('<dd>Blue Harbor</dd>', '<dd style="-webkit-text-fill-color:transparent">Blue Harbor</dd>'); writeFileSync(files.source, source); refreshMetadata(files, { source: true }); }, /render\.visibility/],
    ['filter opacity zero with refreshed source hash', ({ files }) => { const source = readFileSync(files.source, 'utf8').replace('<dd>Blue Harbor</dd>', '<dd style="filter:opacity(0)">Blue Harbor</dd>'); writeFileSync(files.source, source); refreshMetadata(files, { source: true }); }, /render\.visibility/],
    ['clip path fully clipped with refreshed source hash', ({ files }) => { const source = readFileSync(files.source, 'utf8').replace('<dd>Blue Harbor</dd>', '<dd style="clip-path:inset(100%)">Blue Harbor</dd>'); writeFileSync(files.source, source); refreshMetadata(files, { source: true }); }, /render\.visibility/],
    ['mask fully transparent with refreshed source hash', ({ files }) => { const source = readFileSync(files.source, 'utf8').replace('<dd>Blue Harbor</dd>', '<dd style="mask-image:linear-gradient(transparent,transparent)">Blue Harbor</dd>'); writeFileSync(files.source, source); refreshMetadata(files, { source: true }); }, /render\.visibility/],
    ['display-none label with refreshed source hash', ({ files }) => { const source = readFileSync(files.source, 'utf8').replace('<div class="row"><dt>HOME:</dt>', '<div class="row" style="display:none"><dt>HOME:</dt>'); writeFileSync(files.source, source); refreshMetadata(files, { source: true }); }, /render\.label/],
    ['visibility-hidden label with refreshed source hash', ({ files }) => { const source = readFileSync(files.source, 'utf8').replace('<div class="row"><dt>HOME:</dt>', '<div class="row" style="visibility:hidden"><dt>HOME:</dt>'); writeFileSync(files.source, source); refreshMetadata(files, { source: true }); }, /render\.label/],
    ['opacity-zero label with refreshed source hash', ({ files }) => { const source = readFileSync(files.source, 'utf8').replace('<div class="row"><dt>HOME:</dt>', '<div class="row" style="opacity:0"><dt>HOME:</dt>'); writeFileSync(files.source, source); refreshMetadata(files, { source: true }); }, /render\.label/],
    ['offscreen label with refreshed source hash', ({ files }) => { const source = readFileSync(files.source, 'utf8').replace('<div class="row"><dt>HOME:</dt>', '<div class="row" style="position:absolute;left:-10000px"><dt>HOME:</dt>'); writeFileSync(files.source, source); refreshMetadata(files, { source: true }); }, /render\.label/],
    ['B market ref differs from match ref with refreshed source hash', ({ files }) => { const source = readFileSync(files.source, 'utf8').replace('<div class="row"><dt>MARKET REF:</dt><dd>DEMO-MATCH-B</dd>', '<div class="row"><dt>MARKET REF:</dt><dd>DEMO-MATCH-X</dd>'); writeFileSync(files.source, source); refreshMetadata(files, { source: true }); }, /render\.match\.ref/],
    ['uppercase protocol-relative CSS URL', ({ files }) => { const source = readFileSync(files.source, 'utf8').replace('</style>', '.network-probe { background-image: URL(//example.invalid/probe.png); }\n  </style>'); writeFileSync(files.source, source); refreshMetadata(files, { source: true }); }, /source\.resource/],
    ['entity encoded src resource', ({ files }) => { const source = readFileSync(files.source, 'utf8').replace('</main>', '<div src="&#x68;ttps://example.invalid/probe.png"></div>\n  </main>'); writeFileSync(files.source, source); refreshMetadata(files, { source: true }); }, /source\.resource/],
    ['public directory junction escapes temp root', ({ root, files }) => { const outside = join(root, 'external-public'); mkdirSync(outside, { recursive: true }); cpSync(files.target, join(outside, 'fictional-golden.png')); rmSync(files.publicDirectory, { recursive: true, force: true }); symlinkSync(outside, files.publicDirectory, 'junction'); }, /public\.path/],
    ['public metadata copied', ({ files }) => cpSync(files.metadata, join(files.publicDirectory, 'fictional-golden.json')), /public/],
    ['public extra artifact', ({ files }) => writeFileSync(join(files.publicDirectory, 'unexpected.txt'), 'extra'), /public/],
  ];

  for (const [label, mutate, expectedError] of cases) {
    const { root, files } = copyFixtureToTemp();
    try {
      mutate({ root, files });
      const errors = await validate(root);
      assert.ok(errors.some((error) => expectedError.test(error)), `${label}: expected ${expectedError}, got ${JSON.stringify(errors)}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('import and direct generator execution do not mutate metadata, source, or generator', async () => {
  const before = [sourcePath, metadataPath, generatorPath].map((path) => ({ path, hash: sha256(readFileSync(path)), mtimeNs: statSync(path).mtimeNs }));
  await import(pathToFileURL(generatorPath).href);
  for (const item of before) {
    assert.equal(sha256(readFileSync(item.path)), item.hash, `${relative(repoRoot, item.path)} changed during import`);
    assert.equal(statSync(item.path).mtimeNs, item.mtimeNs, `${relative(repoRoot, item.path)} mtime changed during import`);
  }

  const result = spawnSync(process.execPath, [generatorPath], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  for (const item of before) {
    assert.equal(sha256(readFileSync(item.path)), item.hash, `${relative(repoRoot, item.path)} changed during direct generation`);
    assert.equal(statSync(item.path).mtimeNs, item.mtimeNs, `${relative(repoRoot, item.path)} mtime changed during direct generation`);
  }
});
