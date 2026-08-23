import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  assertPrivacyClean,
  createPrivacyPolicy,
  scanPrivacyEvidence,
  scanPrivacyEvidenceItem,
} from './stage9-privacy-audit.mjs';

const rawOnlySentinel = 'RAW only "private" 测试 sentinel';
const originalFileName = 'original upload 私密 screenshot.png';
const policy = createPrivacyPolicy({ rawOnlySentinel, originalFileName });

function item(content, overrides = {}) {
  return {
    method: 'POST',
    path: '/api/v2/workflows/workflow-test/revisions',
    contentType: 'application/json',
    content,
    ...overrides,
  };
}

function categories(findings) {
  return new Set(findings.map(({ category }) => category));
}

function unicodeEscape(value) {
  let escaped = '';
  for (let index = 0; index < value.length; index += 1) {
    escaped += `\\u${value.charCodeAt(index).toString(16).padStart(4, '0')}`;
  }
  return escaped;
}

test('an opaque policy and minimal JSON contain no privacy findings', () => {
  assert.equal(JSON.stringify(policy), '{}');
  assert.deepEqual(scanPrivacyEvidenceItem(policy, item('{"status":"ok","matches":[]}')), []);
  assert.deepEqual(scanPrivacyEvidence(policy, [item('{}'), item(Buffer.from('{"result":null}'))]), []);
  assert.deepEqual(assertPrivacyClean([]), []);
});

test('both protected tokens are found in raw, URL, JSON-escaped, and UTF-8 Base64 forms', () => {
  for (const [token, expectedCategory] of [
    [rawOnlySentinel, 'raw-only-sentinel'],
    [originalFileName, 'original-file-name'],
  ]) {
    const encoded = encodeURIComponent(token);
    const base64 = Buffer.from(token, 'utf8').toString('base64');
    const variants = [
      token,
      encoded,
      encoded.replace(/%20/g, '+'),
      JSON.stringify(token).slice(1, -1),
      unicodeEscape(token),
      base64,
      base64.replace(/=+$/u, ''),
    ];

    for (const representation of variants) {
      const findings = scanPrivacyEvidenceItem(policy, item(`{"evidence":"${representation}"}`));
      assert.equal(categories(findings).has(expectedCategory), true, `missing ${expectedCategory}`);
    }
  }
});

test('image data, image Base64 prefixes, and raw OCR field names are rejected', () => {
  const probes = [
    ['data:image/png;base64,AAAA', 'image-data-url'],
    ['iVBORw0KGgoAAAANSUhEUg', 'image-base64-prefix'],
    ['/9j/4AAQSkZJRgABAQ', 'image-base64-prefix'],
    ['UklGRiIAAABXRUJQVlA4', 'image-base64-prefix'],
    ['{"rawText":null}', 'raw-text-field'],
    ['{"raw_text":""}', 'raw-text-field'],
  ];

  for (const [content, expectedCategory] of probes) {
    assert.equal(categories(scanPrivacyEvidenceItem(policy, item(content))).has(expectedCategory), true);
  }
});

test('multipart filename and image-like upload fields are rejected', () => {
  for (const field of ['image', 'file', 'screenshot', 'upload']) {
    const body = [
      '--boundary',
      `Content-Disposition: form-data; name="${field}"; filename="fixture.bin"`,
      'Content-Type: application/octet-stream',
      '',
      'safe-placeholder',
      '--boundary--',
    ].join('\r\n');
    const findings = scanPrivacyEvidenceItem(policy, item(body, {
      contentType: 'multipart/form-data; boundary=boundary',
    }));
    assert.deepEqual(categories(findings), new Set(['multipart-filename', 'multipart-file-field']));
  }

  const imagePartWithoutFileLikeName = [
    '--boundary',
    'Content-Disposition: form-data; name="payload"',
    'Content-Type: image/png',
    '',
    'safe-placeholder',
    '--boundary--',
  ].join('\r\n');
  assert.equal(categories(scanPrivacyEvidenceItem(policy, item(imagePartWithoutFileLikeName, {
    contentType: 'multipart/form-data; boundary=boundary',
  }))).has('multipart-file-field'), true);
});

test('findings and thrown audit errors expose only safe evidence metadata', () => {
  const privateBody = `private body ${rawOnlySentinel} ${originalFileName}`;
  const findings = scanPrivacyEvidenceItem(policy, item(Buffer.from(privateBody), {
    path: `/api/upload?name=${encodeURIComponent(originalFileName)}`,
  }));
  const expectedHash = createHash('sha256').update(Buffer.from(privateBody)).digest('hex');

  assert.ok(findings.length >= 2);
  for (const result of findings) {
    assert.deepEqual(Object.keys(result), ['category', 'method', 'path', 'sha256']);
    assert.equal(result.method, 'POST');
    assert.equal(result.path, '[redacted-path]');
    assert.equal(result.sha256, expectedHash);
  }

  assert.throws(
    () => assertPrivacyClean(findings),
    (error) => {
      const exposed = `${error.message}\n${JSON.stringify(error)}\n${error.stack}`;
      for (const secret of [rawOnlySentinel, originalFileName, privateBody]) {
        assert.equal(exposed.includes(secret), false);
      }
      assert.equal(exposed.includes(expectedHash), true);
      return error.name === 'PrivacyAuditError';
    },
  );
});

test('validation errors remain generic and never stringify supplied content', () => {
  const secret = `invalid ${rawOnlySentinel} ${originalFileName}`;
  assert.throws(
    () => scanPrivacyEvidenceItem(policy, item({ secret })),
    (error) => !error.message.includes(secret) && !JSON.stringify(error).includes(secret),
  );

  assert.throws(
    () => assertPrivacyClean([{
      category: 'forged',
      method: 'POST',
      path: '/api/forged',
      sha256: 'a'.repeat(64),
      privateBody: secret,
    }]),
    (error) => !error.message.includes(secret) && !JSON.stringify(error).includes(secret),
  );
});

test('finding paths never retain query strings or fragments', () => {
  const unrelatedSecret = 'unrelated-access-token-value';
  const findings = scanPrivacyEvidenceItem(policy, item('data:image/png;base64,AAAA', {
    path: `/api/upload?access_token=${unrelatedSecret}#private`,
  }));

  assert.ok(findings.length > 0);
  assert.ok(findings.every((result) => result.path === '/api/upload'));
  assert.throws(
    () => assertPrivacyClean(findings),
    (error) => {
      const exposed = `${error.message}\n${JSON.stringify(error)}\n${error.stack}`;
      return !exposed.includes(unrelatedSecret) && !exposed.includes('access_token');
    },
  );
});
