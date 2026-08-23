import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { strict as assert } from 'node:assert';
import { chromium } from '@playwright/test';
import {
  createFileH2Url,
  createIsolatedRuntime,
  runWithCleanup
} from './lib/isolated-runtime.mjs';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const runtime = createIsolatedRuntime();
let apiBase;
let webBase;

async function main() {
  const temporaryRoot = await runtime.createTempRoot('football-lab-stage8-');
  const dataSourceUrl = createFileH2Url(temporaryRoot, 'stage8');
  const server = await runtime.startProcess({
    name: 'server',
    tool: 'mvn',
    args: [
      '-f',
      'apps/server/pom.xml',
      'spring-boot:run',
      '-Dspring-boot.run.arguments=--server.port=0 --server.address=127.0.0.1 --spring.h2.console.enabled=false'
    ],
    cwd: rootDir,
    env: { ...process.env, SPRING_DATASOURCE_URL: dataSourceUrl },
    readiness: /Tomcat started on port (\d+)/,
    readyValue: (match) => Number(match[1])
  });
  apiBase = `http://127.0.0.1:${server.readyValue}`;

  const web = await runtime.startProcess({
    name: 'web',
    tool: 'npm',
    args: ['run', 'dev', '-w', 'apps/web', '--', '--host', '127.0.0.1', '--port', '0', '--strictPort'],
    cwd: rootDir,
    env: { ...process.env, LOCAL_API_TARGET: apiBase },
    readiness: /Local:\s+http:\/\/127\.0\.0\.1:(\d+)/,
    readyValue: (match) => Number(match[1])
  });
  webBase = `http://127.0.0.1:${web.readyValue}`;

  await waitForUrl(`${apiBase}/api/official-links`, 'backend API');
  await waitForUrl(`${webBase}/dashboard`, 'frontend app');
  await verifyApiFlow();
  await verifyResponsiveUi(temporaryRoot);
}

async function verifyApiFlow() {
  const workflow = await postJson('/api/ocr/workflows', {
    sourceDeclaration: 'FICTIONAL_SAMPLE',
    sourcePolicyVersion: 'SOURCE_POLICY_V2',
    contentType: 'image/png',
    byteSize: 204800,
    width: 1200,
    height: 800
  }, idempotencyHeaders());
  assert.equal(workflow.data.currentStage, 'WAITING_LOCAL_OCR');
  assert.equal(workflow.data.version, 0);

  const ocr = await postJson(`/api/ocr/workflows/${workflow.data.workflowId}/ocr-candidates`, {
    expectedVersion: workflow.data.version,
    entryMode: 'OCR',
    replaceDraft: false,
    ocrEngine: 'BROWSER_LOCAL_MOCK',
    ocrEngineVersion: 'stage8',
    languages: ['eng'],
    processedWidth: 1200,
    processedHeight: 800,
    candidateFields: [
      {
        fieldId: randomUUID(),
        scope: 'MATCH',
        fieldName: 'league',
        value: 'Fictional Coastal League',
        confidence: 0.96,
        boundingBox: { x: 12, y: 20, width: 180, height: 32 }
      },
      {
        fieldId: randomUUID(),
        scope: 'MATCH',
        fieldName: 'homeTeam',
        value: 'Northport United',
        confidence: 0.94,
        boundingBox: { x: 12, y: 64, width: 180, height: 32 }
      },
      {
        fieldId: randomUUID(),
        scope: 'MATCH',
        fieldName: 'awayTeam',
        value: 'Lakeside City',
        confidence: 0.93,
        boundingBox: { x: 220, y: 64, width: 160, height: 32 }
      }
    ]
  }, idempotencyHeaders());
  assert.equal(ocr.data.status, 'WAITING_USER_CONFIRMATION');
  assert.equal(ocr.data.analysisAllowed, false);

  const draft = await putJson(`/api/ocr/review-drafts/${ocr.data.ocrTaskId}`, {
    expectedRevision: 0,
    riskPreference: 'BALANCED',
    budgetAmount: 20,
    currency: 'CNY',
    matches: [
      {
        matchId: 'demo-match-001',
        matchDate: '2026-07-01',
        league: 'Fictional Coastal League',
        homeTeam: 'Northport United',
        awayTeam: 'Lakeside City',
        kickoffTime: '2026-07-01T19:30:00+08:00'
      }
    ],
    markets: [
      {
        marketId: 'demo-market-001',
        matchId: 'demo-match-001',
        playType: 'WIN_DRAW_LOSS',
        selection: 'AWAY_WIN',
        odds: 2.05
      }
    ]
  }, idempotencyHeaders());
  assert.equal(draft.data.revision, 1);

  const snapshot = await postJson(`/api/ocr/review-drafts/${ocr.data.ocrTaskId}/confirm`, {
    expectedRevision: draft.data.revision
  }, idempotencyHeaders());
  assert.equal(snapshot.data.sourceType, 'USER_SCREENSHOT_CONFIRMED');
  assert.equal(snapshot.data.analysisAllowed, true);
  assert.equal(snapshot.data.workflowId, workflow.data.workflowId);
  assert.equal(snapshot.data.schemaVersion, 'CONFIRMED_SNAPSHOT_V2');

  const analysis = await postJson('/api/analysis/generate', {
    snapshotId: snapshot.data.snapshotId,
    engineMode: 'MOCK_RULE_ENGINE',
    analysisOptions: null
  }, idempotencyHeaders());
  assert.equal(analysis.data.reportStatus, 'GENERATED');
  assert.equal(analysis.data.inputSourceType, 'USER_SCREENSHOT_CONFIRMED');

  const generatedPlan = await postJson('/api/strategies/simulate', {
    reportId: analysis.data.reportId
  }, idempotencyHeaders());
  assert.equal(generatedPlan.data.planStatus, 'GENERATED');

  const savedPlan = await postJson('/api/simulated-plans', {
    generatedPlanId: generatedPlan.data.planId,
    operatorNote: 'Stage 8 smoke validation plan.'
  }, idempotencyHeaders());
  assert.equal(savedPlan.data.planStatus, 'PENDING_RESULT');

  const sync = await postJson('/api/result-providers/sync', {
    providerKey: 'mock-public-results',
    requestedBy: 'stage8-smoke'
  });
  assert.equal(sync.data.syncStatus, 'SYNCED');
  assert.equal(sync.data.sourceName, 'Mock Public Result Provider');
  assert.equal(sync.data.snapshotCount, 1);

  const pending = await getJson('/api/reviews/pending');
  assert.ok(pending.data.some((item) => item.planId === savedPlan.data.planId));

  const match = await postJson(`/api/simulated-plans/${savedPlan.data.planId}/match-result`);
  assert.equal(match.data.matchStatus, 'NEEDS_REVIEW');
  assert.equal(match.data.matchConfidence, 0);
  assert.equal(match.data.reviewWarnings[0], 'RESULT_MATCHING_ERROR');

  const settle = await postJson(`/api/simulated-plans/${savedPlan.data.planId}/settle`);
  assert.equal(settle.data.reviewStatus, 'NEEDS_REVIEW');
  assert.equal(settle.data.failureReasons[0], 'RESULT_MATCHING_ERROR');
  assert.equal(settle.data.strategyRevisionRules[0].ruleCode, 'REVIEW_RESULT_MATCHING');
  assert.equal(settle.data.resultSource, null);

  const review = await getJson(`/api/simulated-plans/${savedPlan.data.planId}/review`);
  assert.equal(review.data.reviewStatus, 'NEEDS_REVIEW');
}

async function verifyResponsiveUi(temporaryRoot) {
  const screenshotRoot = join(temporaryRoot, 'playwright');
  await mkdir(screenshotRoot, { recursive: true });
  const browser = await chromium.launch();
  const routes = [
    ['/dashboard', '闭环流程仪表盘'],
    ['/official-source-hub', '官方外链入口'],
    ['/screenshot-upload', '截图本地 OCR'],
    ['/ocr-review', '人工确认'],
    ['/match-workspace', '比赛工作台'],
    ['/strategy-simulator', 'AI 分析'],
    ['/saved-plans', '模拟方案'],
    ['/review-center', '自动复盘与策略修正规则'],
    ['/strategy-lab', '策略实验室'],
    ['/model-settings', '模型设置 / 策略默认值'],
    ['/about-compliance', '合规说明']
  ];
  const viewports = [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 }
  ];

  try {
    const page = await browser.newPage();
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const [path, title] of routes) {
        await page.goto(`${webBase}${path}`, { waitUntil: 'networkidle' });
        await page.locator('h2').first().waitFor({ state: 'visible' });
        assert.equal((await page.locator('h2').first().textContent())?.trim(), title);
        assert.ok((await page.textContent('body'))?.includes('非官方'), `${path} must show non-official notice`);
        assert.equal(await hasPageOverflow(page), false, `${path} overflows at ${viewport.width}px`);
        await assertInteractiveTargets(page, path, viewport.width);
        await assertKeyboardFocus(page, path, viewport.width);
      }

      await page.goto(`${webBase}/dashboard`, { waitUntil: 'networkidle' });
      const visibleNavCount = await page.locator('.app-sidebar__nav a').evaluateAll((items) =>
        items.filter((item) => {
          const style = window.getComputedStyle(item);
          const rect = item.getBoundingClientRect();
          return style.display !== 'none' && rect.width > 0 && rect.height > 0;
        }).length
      );
      assert.equal(visibleNavCount, viewport.width <= 900 ? 5 : 11);
      await page.screenshot({
        path: join(screenshotRoot, `stage8-dashboard-${viewport.width}.png`),
        fullPage: true
      });
    }
  } finally {
    await browser.close();
  }
}

async function assertInteractiveTargets(page, path, width) {
  const shortTargets = await page.locator('button, a, input').evaluateAll((items) =>
    items
      .filter((item) => {
        const style = window.getComputedStyle(item);
        const rect = item.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      })
      .map((item) => {
        const usesLabelTarget = item instanceof HTMLInputElement
          && (item.type === 'radio' || item.type === 'checkbox');
        const touchTarget = usesLabelTarget ? item.closest('label') ?? item : item;
        return {
          height: touchTarget.getBoundingClientRect().height,
          label: item.textContent?.trim() || item.getAttribute('aria-label') || item.tagName
        };
      })
      .filter((item) => item.height < 44)
      .map((item) => item.label)
  );
  assert.deepEqual(shortTargets, [], `${path} has touch targets below 44px at ${width}px`);
}

async function assertKeyboardFocus(page, path, width) {
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => {
    const element = document.activeElement;
    if (!element || element === document.body) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    return {
      tagName: element.tagName,
      text: element.textContent?.trim() || element.getAttribute('aria-label') || '',
      visible: rect.width > 0 && rect.height > 0
    };
  });
  assert.ok(focused?.visible, `${path} must expose a visible keyboard focus target at ${width}px`);
}

async function hasPageOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
}

async function getJson(path) {
  const response = await fetch(`${apiBase}${path}`);
  return parseJson(response, path);
}

function idempotencyHeaders() {
  return { 'Idempotency-Key': randomUUID() };
}

async function postJson(path, body = {}, headers = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body)
  });
  return parseJson(response, path);
}

async function putJson(path, body = {}, headers = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body)
  });
  return parseJson(response, path);
}

async function parseJson(response, path) {
  assert.equal(response.ok, true, `${path} returned HTTP ${response.status}`);
  const result = await response.json();
  assert.equal(result.code, response.status, `${path} returned API code ${result.code}`);
  return result;
}

async function respondsSuccessfully(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForUrl(url, label) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await respondsSuccessfully(url)) {
      return;
    }
    await delay(1000);
  }
  throw new Error(`Timed out waiting for ${label}: ${url}`);
}

runWithCleanup({ execute: main, cleanup: () => runtime.cleanup() })
  .then(() => {
    console.log('Stage 8 smoke check passed.');
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = error.exitCode ?? 1;
  });
