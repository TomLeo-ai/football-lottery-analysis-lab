import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { scanRepository } from './compliance-scan.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'football-lab-compliance-'));
  execFileSync('git', ['init', '--quiet', root]);
  await write(root, '.gitignore', 'apps/web/public/ocr/tesseract/\n');
  await write(root, 'assets/ocr-samples/fictional-golden.json', JSON.stringify({
    targetPath: 'apps/web/public/ocr-samples/fictional-golden.png',
  }));
  await write(root, 'apps/web/public/ocr-samples/fictional-golden.png', Buffer.from([137, 80, 78, 71]));
  await write(root, 'apps/web/src/ocr/local.ts', "export const workerPath = '/ocr/tesseract/worker.js';\n");
  await write(root, 'apps/web/src/api/ocrWorkflow.ts', 'export const payload = { matches: [], markets: [] };\n');
  return root;
}

async function write(root, path, content) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

function categories(root) {
  return new Set(scanRepository(root).findings.map((entry) => entry.category));
}

test('scanner accepts the manifest-listed fictional PNG and ignores generated assets and negative tests', async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await write(root, 'apps/web/public/ocr/tesseract/ignored.bin', Buffer.from([1, 2, 3]));
  await write(root, 'apps/web/src/ocr/local.spec.ts', [
    "expect(() => load('https://cdn.invalid/model')).toThrow();",
    "expect(payload).not.toHaveProperty('rawText');",
  ].join('\n'));
  assert.deepEqual(scanRepository(root).findings, []);
});

test('scanner includes untracked files and rejects each OCR privacy/runtime boundary', async (t) => {
  const scenarios = [
    ['apps/web/public/ocr-samples/unlisted.png', Buffer.from([1]), 'UNMANIFESTED_OCR_BINARY'],
    ['apps/web/src/ocr/remote.ts', "fetch('https://cdn.example/model')", 'REMOTE_OCR_RESOURCE'],
    ['apps/web/src/ocr/ocr-asset-manifest.json', '{"workerPath":"https://cdn.example/worker.js"}', 'REMOTE_OCR_RESOURCE'],
    ['apps/web/src/api/ocrWorkflow.ts', 'const payload = { rawText };', 'RAW_OCR_WRITE_FIELD'],
    ['apps/web/src/api/ocrWorkflow.ts', 'const payload = { fileName };', 'ORIGINAL_FILENAME_WRITE_FIELD'],
    ['apps/web/src/api/ocrWorkflow.ts', 'const body = new FormData();', 'MULTIPART_IMAGE_WRITE'],
    ['apps/web/src/api/ocrWorkflow.ts', "const sourceImageData = 'data:image/png;base64,AA==';", 'SOURCE_IMAGE_DATA'],
  ];
  for (const [path, content, expected] of scenarios) {
    await t.test(expected, async () => {
      const root = await fixture();
      try {
        await write(root, path, content);
        assert.equal(categories(root).has(expected), true);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});
