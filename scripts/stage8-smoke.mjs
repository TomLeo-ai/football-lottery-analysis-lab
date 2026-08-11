import { spawn, spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { strict as assert } from 'node:assert';
import { chromium } from '@playwright/test';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const apiBase = process.env.STAGE8_API_BASE ?? 'http://127.0.0.1:8080';
const webBase = process.env.STAGE8_WEB_BASE ?? 'http://127.0.0.1:5173';
const spawned = [];

async function main() {
  try {
    await ensureServices();
    await verifyApiFlow();
    await verifyResponsiveUi();
  } finally {
    await stopSpawnedServices();
  }
}

async function ensureServices() {
  if (!(await isReachable(`${apiBase}/api/official-links`))) {
    spawned.push(spawnService('server', 'mvn -f apps/server/pom.xml spring-boot:run', 8080));
  }
  if (!(await isReachable(`${webBase}/dashboard`))) {
    spawned.push(spawnService('web', 'npm run dev:web', 5173));
  }

  await waitForUrl(`${apiBase}/api/official-links`, 'backend API');
  await waitForUrl(`${webBase}/dashboard`, 'frontend app');
}

function spawnService(name, command, port) {
  const child = spawn(command, {
    cwd: rootDir,
    detached: process.platform !== 'win32',
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  return { child, port };
}

async function verifyApiFlow() {
  const screenshot = await postJson('/api/screenshots/tasks', {
    fileName: 'fictional-stage8-flow.png',
    contentType: 'image/png',
    fileSize: 204800,
    sampleLabel: 'DEMO DATA / FICTIONAL SAMPLE'
  });
  assert.equal(screenshot.data.status, 'WAITING_LOCAL_OCR');
  assert.equal(screenshot.data.serverOcrEnabled, false);

  const ocr = await postJson('/api/ocr/parse-local-result', {
    screenshotTaskId: screenshot.data.taskId,
    ocrProvider: 'BROWSER_LOCAL_MOCK',
    rawText: 'DEMO DATA / FICTIONAL SAMPLE\nFictional Coastal League\nNorthport United vs Lakeside City',
    fields: [
      {
        fieldName: 'league',
        fieldValue: 'Fictional Coastal League',
        confidence: 0.96,
        sourceRegion: 'x=12,y=20,w=180,h=32'
      },
      {
        fieldName: 'homeTeam',
        fieldValue: 'Northport United',
        confidence: 0.94,
        sourceRegion: 'x=12,y=64,w=180,h=32'
      },
      {
        fieldName: 'awayTeam',
        fieldValue: 'Lakeside City',
        confidence: 0.93,
        sourceRegion: 'x=220,y=64,w=160,h=32'
      }
    ]
  });
  assert.equal(ocr.data.status, 'WAITING_USER_CONFIRMATION');
  assert.equal(ocr.data.analysisAllowed, false);

  const snapshot = await postJson('/api/ocr/review/confirm', {
    ocrTaskId: ocr.data.ocrTaskId,
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
  });
  assert.equal(snapshot.data.sourceType, 'USER_SCREENSHOT_CONFIRMED');
  assert.equal(snapshot.data.analysisAllowed, true);

  const analysis = await postJson('/api/analysis/generate', {
    snapshotId: snapshot.data.snapshotId,
    sourceType: snapshot.data.sourceType,
    analysisAllowed: snapshot.data.analysisAllowed,
    riskPreference: snapshot.data.riskPreference,
    budgetAmount: snapshot.data.budgetAmount,
    currency: snapshot.data.currency,
    matches: snapshot.data.matches,
    markets: snapshot.data.markets
  });
  assert.equal(analysis.data.reportStatus, 'GENERATED');
  assert.equal(analysis.data.inputSourceType, 'USER_SCREENSHOT_CONFIRMED');

  const generatedPlan = await postJson('/api/strategies/simulate', {
    reportId: analysis.data.reportId,
    snapshotId: analysis.data.snapshotId,
    inputSourceType: analysis.data.inputSourceType,
    engineType: analysis.data.engineType,
    reportStatus: analysis.data.reportStatus,
    currency: snapshot.data.currency,
    budgetAmount: snapshot.data.budgetAmount,
    probabilityAnalysis: analysis.data.probabilityAnalysis,
    riskWarnings: analysis.data.riskWarnings,
    simulatedSelections: analysis.data.simulatedSelections
  });
  assert.equal(generatedPlan.data.planStatus, 'GENERATED');

  const savedPlan = await postJson('/api/simulated-plans', {
    generatedPlanId: generatedPlan.data.planId,
    operatorNote: 'Stage 8 smoke validation plan.'
  });
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
  assert.equal(match.data.matchStatus, 'MATCHED');
  assert.equal(match.data.matchConfidence, 0.98);

  const settle = await postJson(`/api/simulated-plans/${savedPlan.data.planId}/settle`);
  assert.equal(settle.data.reviewStatus, 'MISS');
  assert.equal(settle.data.failureReasons[0], 'DIRECTION_ERROR');
  assert.equal(settle.data.strategyRevisionRules[0].ruleCode, 'REVIEW_DIRECTION_WEIGHT');
  assert.equal(settle.data.resultSource.sourceName, 'Mock Public Result Provider');

  const review = await getJson(`/api/simulated-plans/${savedPlan.data.planId}/review`);
  assert.equal(review.data.reviewStatus, 'MISS');
}

async function verifyResponsiveUi() {
  await mkdir(new URL('../output/playwright/', import.meta.url), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const routes = [
    ['/dashboard', '闭环流程仪表盘'],
    ['/official-source-hub', '官方外链入口'],
    ['/screenshot-upload', '虚构截图上传与本地 OCR'],
    ['/ocr-review', 'OCR 人工确认'],
    ['/match-workspace', '比赛工作台'],
    ['/strategy-simulator', 'AI 分析 Mock/规则引擎'],
    ['/saved-plans', '模拟方案生成与保存'],
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
        path: `output/playwright/stage8-dashboard-${viewport.width}.png`,
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
      .filter((item) => item.getBoundingClientRect().height < 44)
      .map((item) => item.textContent?.trim() || item.getAttribute('aria-label') || item.tagName)
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

async function postJson(path, body = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  return parseJson(response, path);
}

async function parseJson(response, path) {
  assert.equal(response.ok, true, `${path} returned HTTP ${response.status}`);
  const result = await response.json();
  assert.equal(result.code, 200, `${path} returned API code ${result.code}`);
  return result;
}

async function isReachable(url) {
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
    if (await isReachable(url)) {
      return;
    }
    await delay(1000);
  }
  throw new Error(`Timed out waiting for ${label}: ${url}`);
}

async function stopSpawnedServices() {
  stopSpawnedServicesSync();
  if (spawned.length > 0) {
    await delay(1500);
  }
}

function stopSpawnedServicesSync() {
  for (const service of spawned) {
    const child = service.child;
    if (!child.pid) {
      continue;
    }
    if (process.platform === 'win32') {
      if (child.exitCode === null) {
        spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
      }
      stopWindowsPortProcess(service.port);
    } else {
      if (child.exitCode !== null) {
        continue;
      }
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
    }
  }
}

function stopWindowsPortProcess(port) {
  if (!port) {
    return;
  }
  const command = [
    `$ids = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue`,
    '| Select-Object -ExpandProperty OwningProcess -Unique;',
    'foreach ($id in $ids) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }'
  ].join(' ');
  spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { stdio: 'ignore' });
}

process.on('exit', stopSpawnedServicesSync);
process.on('SIGINT', () => {
  stopSpawnedServicesSync();
  process.exit(130);
});
process.on('SIGTERM', () => {
  stopSpawnedServicesSync();
  process.exit(143);
});

main()
  .then(() => {
    console.log('Stage 8 smoke check passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
