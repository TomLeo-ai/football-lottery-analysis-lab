import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const rootDir = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const outputDir = join(rootDir, 'promo-video', 'assets', 'screens');
const nodeExe = process.execPath;
const nodePath = 'C:\\Users\\dwyan\\AppData\\Local\\nvm\\v25.9.0';
const baseUrl = 'http://127.0.0.1:5173';
const viteEntry = join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');

const strategyParameters = {
  budgetAmount: 20,
  currency: 'CNY',
  targetTicketCount: 5,
  minTicketCount: 5,
  maxTicketCount: 6,
  riskPreference: 'BALANCED',
  mainTicketRatio: 0.6,
  defensiveTicketRatio: 0.3,
  entertainmentTicketRatio: 0.1,
  enableEntertainmentTicket: true,
  entertainmentTicketMaxCost: 2,
  maxParlayLegs: 4,
  preferredPlayTypes: ['WIN_DRAW_LOSS', 'HANDICAP_WIN_DRAW_LOSS'],
  excludedPlayTypes: ['EXACT_SCORE'],
  exactScorePolicy: 'ENTERTAINMENT_ONLY',
  minPayoutRequirement: null,
  allowLowReturnTicket: false,
  upsetCoverageLevel: 'BALANCED'
};

const modelProviders = [
  {
    providerKey: 'openai',
    displayName: 'OpenAI Compatible',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1-mini',
    apiKeyEnvName: 'OPENAI_API_KEY',
    enabled: true,
    credentialStatus: 'MISSING',
    connectionStatus: 'SKIPPED'
  },
  {
    providerKey: 'deepseek',
    displayName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-v4-pro',
    apiKeyEnvName: 'DEEPSEEK_API_KEY',
    enabled: true,
    credentialStatus: 'MISSING',
    connectionStatus: 'SKIPPED'
  }
];

const confirmedSnapshot = {
  snapshotId: 'snapshot-demo-042',
  ocrTaskId: 'ocr-demo-042',
  sourceType: 'USER_SCREENSHOT_CONFIRMED',
  snapshotStatus: 'CONFIRMED',
  analysisAllowed: true,
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
      selection: 'HOME_WIN',
      odds: 2.05
    }
  ],
  confirmedAt: '2026-06-30T17:20:00+08:00'
};

function api(data) {
  return {
    code: 200,
    msg: 'OK',
    data
  };
}

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

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function waitForServer(timeoutMs = 45_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until Vite is ready.
    }

    await wait(500);
  }

  throw new Error(`Timed out waiting for ${baseUrl}`);
}

async function installMockApi(page) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const now = '2026-06-30T17:20:00+08:00';

    if (!path.startsWith('/api/')) {
      await route.continue();
      return;
    }

    let data = null;

    if (path === '/api/screenshots/tasks') {
      data = {
        taskId: 'screen-demo-042',
        fileName: 'fictional-demo-slip.png',
        contentType: 'image/png',
        fileSize: 204800,
        sampleLabel: 'DEMO DATA / FICTIONAL SAMPLE',
        status: 'WAITING_LOCAL_OCR',
        serverOcrEnabled: false,
        privacyPolicy: 'Local mock OCR only',
        createdAt: now
      };
    } else if (path === '/api/ocr/parse-local-result') {
      data = {
        ocrTaskId: 'ocr-demo-042',
        screenshotTaskId: 'screen-demo-042',
        ocrProvider: 'BROWSER_LOCAL_MOCK',
        rawText: 'DEMO DATA / FICTIONAL SAMPLE',
        status: 'WAITING_USER_CONFIRMATION',
        analysisAllowed: false,
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
        ],
        parsedAt: now
      };
    } else if (path === '/api/ocr/review/confirm') {
      data = confirmedSnapshot;
    } else if (path === '/api/strategy-parameter-defaults') {
      data = strategyParameters;
    } else if (path === '/api/engine-settings') {
      data = {
        defaultEngineMode: 'MOCK_RULE_ENGINE',
        analysisEngineMode: 'MOCK_RULE_ENGINE',
        reviewInsightMode: 'RULE_REVIEW_ONLY'
      };
    } else if (path === '/api/model-providers') {
      data = modelProviders;
    } else if (path === '/api/analysis/generate') {
      data = {
        reportId: 'report-demo-042',
        snapshotId: confirmedSnapshot.snapshotId,
        inputSourceType: confirmedSnapshot.sourceType,
        engineType: 'MOCK_RULE_ENGINE',
        reportStatus: 'GENERATED',
        strategyParameters,
        probabilityAnalysis: [
          {
            matchId: 'demo-match-001',
            matchDate: '2026-07-01',
            league: 'Fictional Coastal League',
            homeTeam: 'Northport United',
            awayTeam: 'Lakeside City',
            kickoffTime: '2026-07-01T19:30:00+08:00',
            selection: 'HOME_WIN',
            probabilityBand: 'BALANCED',
            rationale: '基于虚构样例和规则参数生成的本地模拟分析。'
          }
        ],
        riskWarnings: [
          {
            riskCode: 'SAMPLE_ONLY',
            riskLevel: 'INFO',
            message: '本报告仅用于开源产品流程演示。'
          }
        ],
        simulatedSelections: [
          {
            matchId: 'demo-match-001',
            playType: 'WIN_DRAW_LOSS',
            selection: 'HOME_WIN',
            odds: 2.05,
            stakeAmount: 8,
            note: '本地模拟候选项'
          }
        ],
        complianceNotice: '非官方，仅模拟分析与复盘，不构成确定性建议。',
        generatedAt: now,
        providerKey: null,
        modelId: null,
        promptVersion: null,
        safetyStatus: 'RULE_ENGINE_ONLY',
        llmAuditId: null,
        llmOutput: null
      };
    } else if (path === '/api/result-providers/status' || path === '/api/result-providers/sync') {
      data = {
        providerKey: 'mock-public-results',
        providerName: 'Mock 公开赛果源',
        providerType: 'LOCAL_MOCK',
        providerEnabled: true,
        syncStatus: 'SYNCED',
        snapshotCount: 2,
        lastFetchedAt: now,
        lastConfidence: 0.98,
        sourceName: 'Local Mock Result Snapshot',
        sourceUrl: 'local://mock-result-provider',
        sourceLicense: 'DEMO_ONLY',
        dataPolicy: 'Local fictional sample only',
        complianceNotice: '非官方，仅模拟复盘。',
        snapshots: [
          {
            resultSnapshotId: 'result-demo-001',
            matchId: 'demo-match-001',
            matchDate: '2026-07-01',
            league: 'Fictional Coastal League',
            homeTeam: 'Northport United',
            awayTeam: 'Lakeside City',
            kickoffTime: '2026-07-01T19:30:00+08:00',
            homeScore: 2,
            awayScore: 1,
            resultStatus: 'FINAL',
            sourceName: 'Local Mock Result Snapshot',
            sourceUrl: 'local://mock-result-provider',
            sourceLicense: 'DEMO_ONLY',
            fetchedAt: now,
            confidence: 0.98
          }
        ]
      };
    } else if (path === '/api/reviews/pending') {
      data = [
        {
          planId: 'plan-demo-042',
          planStatus: 'PENDING_RESULT',
          reportId: 'report-demo-042',
          itemCount: 1,
          updatedAt: now
        }
      ];
    } else if (path.endsWith('/match-result')) {
      data = {
        planId: 'plan-demo-042',
        matchStatus: 'MATCHED',
        matchConfidence: 0.98,
        candidates: [
          {
            candidateId: 'candidate-demo-001',
            planItemId: 'item-demo-001',
            resultSnapshotId: 'result-demo-001',
            matchId: 'demo-match-001',
            matchStatus: 'MATCHED',
            confidence: 0.98,
            sourceName: 'Local Mock Result Snapshot',
            sourceUrl: 'local://mock-result-provider',
            sourceLicense: 'DEMO_ONLY',
            fetchedAt: now
          }
        ],
        reviewWarnings: []
      };
    } else if (path.endsWith('/settle')) {
      data = {
        planId: 'plan-demo-042',
        reviewStatus: 'REVIEWED',
        matchStatus: 'MATCHED',
        matchConfidence: 0.98,
        itemSettlements: [
          {
            planItemId: 'item-demo-001',
            matchId: 'demo-match-001',
            selection: 'HOME_WIN',
            actualOutcome: 'HOME_WIN',
            settlementStatus: 'HIT',
            failureReason: null
          }
        ],
        failureReasons: [],
        strategyRevisionRules: [
          {
            ruleCode: 'KEEP_EVIDENCE_CHAIN',
            reasonCode: 'TRACEABLE_REVIEW',
            suggestion: '继续保留快照、参数和复盘结果的对应关系。'
          }
        ],
        resultSource: {
          sourceName: 'Local Mock Result Snapshot',
          sourceUrl: 'local://mock-result-provider',
          sourceLicense: 'DEMO_ONLY',
          fetchedAt: now,
          confidence: 0.98
        },
        supportedSettlementStatuses: ['HIT', 'MISS', 'PARTIAL_HIT', 'VOID', 'PENDING', 'NEEDS_REVIEW'],
        supportedFailureReasons: ['ODDS_DRIFT', 'LOW_CONFIDENCE', 'MARKET_MISMATCH'],
        reviewedAt: now,
        reviewEngineType: 'RULE_REVIEW_ONLY',
        providerKey: null,
        modelId: null,
        promptVersion: null,
        safetyStatus: 'RULE_ENGINE_ONLY',
        llmAuditId: null,
        llmInsight: null
      };
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(api(data))
    });
  });
}

async function capture(page, routePath, fileName) {
  await page.goto(`${baseUrl}${routePath}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#app .app-shell', { timeout: 15_000 });
  await page.waitForTimeout(600);
  await screenshotCurrent(page, fileName);
}

async function screenshotCurrent(page, fileName) {
  await page.waitForSelector('#app .app-shell', { timeout: 15_000 });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelector('.app-content')?.scrollTo(0, 0);
  });
  await page.addStyleTag({
    content: `
      .page-heading__eyebrow { display: none !important; }
      input[type="file"] { color: transparent !important; }
      .app-topbar__status { min-width: 142px; text-align: center; }
    `
  });
  await page.evaluate(() => {
    const replacements = [
      ['Football Lottery Analysis Lab', '足彩分析实验室'],
      ['Simulation Lab', '模拟复盘实验室'],
      ['Compliance Guard Active', '合规守卫已开启'],
      ['Dashboard', '仪表盘'],
      ['ScreenshotUpload', '截图上传'],
      ['OcrReviewWizard', 'OCR 人工确认'],
      ['StrategySimulator', '策略分析'],
      ['ReviewCenter', '复盘中心'],
      ['ModelSettings', '模型设置'],
      ['DEMO DATA / FICTIONAL SAMPLE', '虚构样例数据'],
      ['AI 分析', '智能分析'],
      ['No file chosen', '未选择文件'],
      ['Choose File', '选择文件'],
      ['WAITING_INPUT', '等待输入'],
      ['WAITING_USER_CONFIRMATION', '等待人工确认'],
      ['WAITING_CONFIRMED_SNAPSHOT', '等待确认快照'],
      ['WAITING_ANALYSIS_REPORT', '等待分析报告'],
      ['WAITING_RESULT_SYNC', '等待赛果同步'],
      ['USER_SCREENSHOT_CONFIRMED', '用户截图已确认'],
      ['CONFIRMED', '已确认'],
      ['GENERATED', '已生成'],
      ['MOCK_RULE_ENGINE', '规则引擎'],
      ['RULE_REVIEW_ONLY', '规则复盘'],
      ['PENDING_RESULT', '等待赛果'],
      ['MATCHED', '已匹配'],
      ['SYNCED', '已同步'],
      ['BROWSER_LOCAL_MOCK', '浏览器本地模拟'],
      ['Provider', '模型提供方'],
      ['Prompt', '提示词'],
      ['Mock', '模拟'],
      ['mock', '模拟'],
      ['CNY', '元'],
      ['HOME_WIN', '主胜'],
      ['WIN_DRAW_LOSS', '胜平负'],
      ['HANDICAP_WIN_DRAW_LOSS', '让球胜平负'],
      ['BALANCED', '均衡'],
      ['Fictional Coastal League', '虚构海岸联赛'],
      ['Northport United', '北港联'],
      ['Lakeside City', '湖城队'],
      ['OpenAI Compatible', '通用模型接口'],
      ['DeepSeek', '深度求索'],
      ['MISSING', '未配置'],
      ['SKIPPED', '已跳过'],
      ['UNTESTED', '未测试'],
      ['RULE_ENGINE_ONLY', '仅规则引擎']
    ];

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    for (const node of textNodes) {
      let value = node.nodeValue ?? '';
      for (const [source, target] of replacements) {
        value = value.split(source).join(target);
      }
      node.nodeValue = value;
    }

    for (const input of document.querySelectorAll('input')) {
      if (input.value === 'CNY') {
        input.value = '元';
      }
    }
  });
  await page.waitForTimeout(600);
  await page.screenshot({
    path: join(outputDir, fileName),
    fullPage: false
  });
  console.log(`captured ${fileName}`);
}

async function main() {
  await mkdir(outputDir, { recursive: true });

  const viteProcess = spawn(nodeExe, [viteEntry, '--host', '127.0.0.1'], {
    cwd: join(rootDir, 'apps', 'web'),
    env: createWindowsEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  viteProcess.stdout.on('data', (chunk) => process.stdout.write(chunk));
  viteProcess.stderr.on('data', (chunk) => process.stderr.write(chunk));

  let browser;
  try {
    await waitForServer();

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 960 },
      deviceScaleFactor: 1
    });

    page.on('console', (message) => {
      if (message.type() === 'error') {
        console.error(`browser console: ${message.text()}`);
      }
    });
    page.on('pageerror', (error) => {
      console.error(`browser pageerror: ${error.message}`);
    });

    await installMockApi(page);

    await page.addStyleTag({
      content: `
        * { animation-duration: 0s !important; transition-duration: 0s !important; }
        body { background: #f5f7fa !important; }
      `
    });

    await capture(page, '/screenshot-upload', 'screenshot-upload.png');
    await page.getByTestId('demo-ocr-button').click();
    await page.waitForSelector('.state-panel--success');
    await screenshotCurrent(page, 'screenshot-upload-active.png');

    await page.locator('a[href="/ocr-review"]').first().click();
    await page.waitForSelector('[data-testid="confirm-ocr-button"]');
    await page.getByTestId('confirm-ocr-button').click();
    await page.waitForSelector('text=USER_SCREENSHOT_CONFIRMED');
    await screenshotCurrent(page, 'ocr-review.png');

    await page.locator('a[href="/strategy-simulator"]').first().click();
    await page.waitForSelector('[data-testid="generate-analysis-button"]');
    await page.getByTestId('generate-analysis-button').click();
    await page.waitForSelector('text=分析报告');
    await screenshotCurrent(page, 'strategy-simulator.png');

    await page.locator('a[href="/review-center"]').first().click();
    await page.waitForSelector('[data-testid="match-settle-button"]');
    await page.getByTestId('match-settle-button').click();
    await page.waitForSelector('text=复盘结果');
    await screenshotCurrent(page, 'review-center.png');

    await page.locator('a[href="/dashboard"]').first().click();
    await screenshotCurrent(page, 'dashboard.png');
    await page.locator('a[href="/model-settings"]').first().click();
    await screenshotCurrent(page, 'model-settings.png');
  } finally {
    if (browser) {
      await browser.close();
    }
    viteProcess.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
