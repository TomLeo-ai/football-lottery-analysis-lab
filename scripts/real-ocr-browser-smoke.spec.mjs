import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertNetworkUrlAllowed,
  createAssetTracker,
  formatSmokeSummary,
  reduceWorkerObservation,
  runRealOcrBrowserSmoke,
  startStaticServer,
} from './real-ocr-browser-smoke.mjs';

test('network policy allows only the temporary origin plus data and blob URLs', () => {
  const origin = 'http://127.0.0.1:43123';

  assert.equal(assertNetworkUrlAllowed(`${origin}/assets/app.js?cache=1`, origin), 'same-origin');
  assert.equal(assertNetworkUrlAllowed('data:image/png;base64,AA==', origin), 'data');
  assert.equal(assertNetworkUrlAllowed('blob:http://127.0.0.1:43123/fixture', origin), 'blob');
  assert.throws(
    () => assertNetworkUrlAllowed('https://cdn.example.invalid/tesseract.js', origin),
    /external request/i,
  );
  assert.throws(() => assertNetworkUrlAllowed('file:///private/image.png', origin), /scheme/i);
});

test('static server and asset tracker expose exact OCR assets and reject a missing manifest asset', async (t) => {
  const distDirectory = await mkdtemp(join(tmpdir(), 'real-ocr-smoke-'));
  await writeFile(join(distDirectory, 'index.html'), '<!doctype html><title>fixture</title>');
  const server = await startStaticServer({ distDirectory });
  t.after(() => server.close());

  const tracker = createAssetTracker({
    origin: server.origin,
    manifestAssetPaths: [
      '/ocr/tesseract/7.0.0/worker/worker.min.js',
      '/ocr/tesseract/7.0.0/core/tesseract-core-simd-lstm.wasm.js',
      '/ocr/tesseract/7.0.0/lang/4.0.0_best_int/eng.traineddata.gz',
      '/ocr/tesseract/7.0.0/lang/4.0.0_best_int/chi_sim.traineddata.gz',
    ],
  });
  const observations = [
    ['/ocr/tesseract/7.0.0/worker/worker.min.js?cache=1', 200],
    ['/ocr/tesseract/7.0.0/core/tesseract-core-simd-lstm.wasm.js?cache=2', 200],
    ['/ocr/tesseract/7.0.0/lang/4.0.0_best_int/eng.traineddata.gz?cache=3', 200],
    ['/ocr/tesseract/7.0.0/lang/4.0.0_best_int/chi_sim.traineddata.gz?cache=4', 200],
  ];
  for (const [path, status] of observations) {
    tracker.recordRequest(new URL(path, server.origin).href);
    tracker.recordResponse(new URL(path, server.origin).href, status);
  }

  assert.deepEqual(tracker.snapshot(), {
    worker: [{ path: '/ocr/tesseract/7.0.0/worker/worker.min.js', status: 200 }],
    core: [{ path: '/ocr/tesseract/7.0.0/core/tesseract-core-simd-lstm.wasm.js', status: 200 }],
    lang: [
      { path: '/ocr/tesseract/7.0.0/lang/4.0.0_best_int/eng.traineddata.gz', status: 200 },
      { path: '/ocr/tesseract/7.0.0/lang/4.0.0_best_int/chi_sim.traineddata.gz', status: 200 },
    ],
  });

  const missingPath = '/ocr/tesseract/7.0.0/worker/worker.min.js';
  const missingResponse = await fetch(new URL(missingPath, server.origin));
  tracker.recordResponse(missingResponse.url, missingResponse.status);
  assert.equal(missingResponse.status, 404);
  assert.throws(() => tracker.assertHealthy(), /manifest asset.*404/i);
});

test('real smoke closes browser resources and its temporary server after success', async () => {
  const closed = [];
  const server = {
    origin: 'http://127.0.0.1:43124',
    close: async () => closed.push('server'),
  };
  const page = { close: async () => closed.push('page') };
  const context = {
    newPage: async () => page,
    close: async () => closed.push('context'),
  };
  const browser = {
    newContext: async () => context,
    close: async () => closed.push('browser'),
  };

  const result = await runRealOcrBrowserSmoke({
    startServer: async () => server,
    launchBrowser: async () => browser,
    executeBrowserFlow: async () => ({ passed: true }),
  });

  assert.deepEqual(result, { passed: true });
  assert.deepEqual(closed, ['page', 'context', 'browser', 'server']);
});

test('real smoke closes every owned resource while preserving a browser-flow failure', async () => {
  const closed = [];
  const failure = new Error('controlled browser-flow failure');
  const page = { close: async () => closed.push('page') };
  const context = {
    newPage: async () => page,
    close: async () => closed.push('context'),
  };
  const browser = {
    newContext: async () => context,
    close: async () => closed.push('browser'),
  };

  await assert.rejects(
    runRealOcrBrowserSmoke({
      startServer: async () => ({
        origin: 'http://127.0.0.1:43125',
        close: async () => closed.push('server'),
      }),
      launchBrowser: async () => browser,
      executeBrowserFlow: async () => {
        throw failure;
      },
    }),
    (error) => error === failure,
  );
  assert.deepEqual(closed, ['page', 'context', 'browser', 'server']);
});

test('worker evidence and the success summary retain token facts but never raw OCR details', () => {
  const rawText = [
    'DEMO DATA / FICTIONAL SAMPLE',
    'LEAGUE: 演示联赛',
    'HOME: Blue Harbor',
    'private raw tail that must never be retained',
  ].join('\n');
  const observation = reduceWorkerObservation(undefined, {
    action: 'recognize',
    status: 'resolve',
    data: { text: rawText, confidence: 93.7 },
  });

  assert.equal(observation.recognized, 1);
  assert.deepEqual(
    observation.tokens,
    {
      demoData: true,
      league: true,
      blueHarbor: true,
      redMaple: false,
      leagueIgnoringWhitespace: true,
      blueHarborIgnoringWhitespace: true,
      redMapleIgnoringWhitespace: false,
    },
  );
  assert.deepEqual(observation.diagnostics, {
    blockCount: 0,
    paragraphCount: 0,
    lineCount: 0,
    wordCount: 0,
    maxWordsPerLine: 0,
    approvedLabelCounts: {
      MATCH_REF: 0,
      MARKET_REF: 0,
      DATE: 0,
      LEAGUE: 0,
      HOME: 0,
      AWAY: 0,
      KICKOFF: 0,
      PLAY_TYPE: 0,
      SELECTION: 0,
      ODDS: 0,
    },
    multiApprovedLabelsPerLine: 0,
    labelWithoutValue: 0,
    valueFormatCounts: {
      DATE: { valid: 0, invalid: 0 },
      KICKOFF: { valid: 0, invalid: 0 },
      PLAY_TYPE: { valid: 0, invalid: 0 },
      SELECTION: { valid: 0, invalid: 0 },
      ODDS: { valid: 0, invalid: 0 },
    },
  });
  const serializedObservation = JSON.stringify(observation);
  assert.doesNotMatch(serializedObservation, /private raw tail|93\.7|FICTIONAL SAMPLE/);

  const summary = formatSmokeSummary({
    tokens: ['DEMO DATA', '演示联赛', 'Blue Harbor'],
    mappedMatchFields: 3,
    assets: { worker: 1, core: 2, lang: 2 },
    externalRequests: 0,
    serviceWorkers: 0,
  });
  assert.equal(
    summary,
    'Real OCR smoke passed: tokens=[DEMO DATA,演示联赛,Blue Harbor], mappedMatchFields=3, assets={worker:1,core:2,lang:2}, externalRequests=0, serviceWorkers=0',
  );
  assert.doesNotMatch(summary, /private raw tail|confidence|[A-Z]:\\|fictional-golden\.png/i);
});

test('worker reducer exposes only safe structure, label counts, and format outcomes', () => {
  const observation = reduceWorkerObservation(undefined, {
    action: 'recognize',
    status: 'resolve',
    data: {
      text: 'DEMO DATA OCR_RAW_ONLY_SENTINEL_PRIVATE Night Falcons 演 示 联 赛 红 枫 城 Blue   Harbor',
      blocks: [{
        paragraphs: [{
          lines: [
            { words: [{ text: 'MATCH' }, { text: 'REF:' }, { text: 'DEMO-MATCH-A' }, { text: 'MARKET' }, { text: 'REF:' }, { text: 'DEMO-MATCH-A' }] },
            { words: [{ text: 'DATE:' }, { text: '2030-04-01' }] },
            { words: [{ text: 'LEAGUE:' }] },
            { words: [{ text: 'HOME:' }, { text: 'Night Falcons' }] },
            { words: [{ text: 'PLAY' }, { text: 'TYPE:' }, { text: 'WIN_DRAW_LOSS' }] },
            { words: [{ text: 'SELECTION:' }, { text: 'HOME_WIN' }] },
            { words: [{ text: 'ODDS:' }, { text: '2.15' }] },
            { words: [{ text: 'KICKOFF:' }, { text: '2030-04-01T19:30:00+08:00' }] },
          ],
        }],
      }],
    },
  });

  assert.deepEqual(observation.diagnostics, {
    blockCount: 1,
    paragraphCount: 1,
    lineCount: 8,
    wordCount: 20,
    maxWordsPerLine: 6,
    approvedLabelCounts: {
      MATCH_REF: 1,
      MARKET_REF: 1,
      DATE: 1,
      LEAGUE: 1,
      HOME: 1,
      AWAY: 0,
      KICKOFF: 1,
      PLAY_TYPE: 1,
      SELECTION: 1,
      ODDS: 1,
    },
    multiApprovedLabelsPerLine: 1,
    labelWithoutValue: 1,
    valueFormatCounts: {
      DATE: { valid: 1, invalid: 0 },
      KICKOFF: { valid: 1, invalid: 0 },
      PLAY_TYPE: { valid: 1, invalid: 0 },
      SELECTION: { valid: 1, invalid: 0 },
      ODDS: { valid: 1, invalid: 0 },
    },
  });
  assert.deepEqual(observation.tokens, {
    demoData: true,
    league: false,
    blueHarbor: false,
    redMaple: false,
    leagueIgnoringWhitespace: true,
    blueHarborIgnoringWhitespace: true,
    redMapleIgnoringWhitespace: true,
  });
  const serialized = JSON.stringify(observation);
  assert.doesNotMatch(
    serialized,
    /OCR_RAW_ONLY_SENTINEL_PRIVATE|Night Falcons|演 示 联 赛|红 枫 城|Blue   Harbor|DEMO-MATCH-A|2030-04-01|WIN_DRAW_LOSS|HOME_WIN|2\.15/,
  );
});
