import { spawn, spawnSync } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const apiBase = process.env.DEEPSEEK_API_BASE ?? process.env.STAGE8_API_BASE ?? 'http://127.0.0.1:8080';
const providerKey = 'deepseek';
const modelId = 'deepseek-v4-pro';
const predictionPromptVersion = 'danche-prediction-v1';
const reviewPromptVersion = 'danche-review-insight-v1';
const spawned = [];

async function main() {
  if (!process.env.DEEPSEEK_API_KEY?.trim()) {
    console.error('DEEPSEEK_API_KEY is required for real DeepSeek integration smoke testing.');
    console.error('Set it only in the current PowerShell session, for example: $env:DEEPSEEK_API_KEY="<redacted>"');
    process.exitCode = 2;
    return;
  }

  try {
    await ensureBackend();
    await verifyProviderConfiguration();
    await verifyProviderConnection();
    const analysis = await verifyPredictionFlow();
    const savedPlan = await verifyPlanFlow(analysis);
    await verifyReviewInsightFlow(savedPlan.planId);
  } finally {
    await stopSpawnedServices();
  }
}

async function ensureBackend() {
  if (!(await isReachable(`${apiBase}/api/model-providers`))) {
    spawned.push(spawnService('server', 'mvn -f apps/server/pom.xml spring-boot:run', 8080));
  }

  await waitForUrl(`${apiBase}/api/model-providers`, 'backend API');
}

function spawnService(name, command, port) {
  const child = spawn(command, {
    cwd: rootDir,
    detached: process.platform !== 'win32',
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env
  });

  child.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  return { child, port };
}

async function verifyProviderConfiguration() {
  const providers = await getJson('/api/model-providers');
  const provider = providers.data.find((item) => item.providerKey === providerKey);

  assert.ok(provider, 'GET /api/model-providers must include deepseek');
  assert.equal(provider.displayName, 'DeepSeek');
  assert.equal(provider.baseUrl, 'https://api.deepseek.com');
  assert.equal(provider.defaultModel, modelId);
  assert.equal(provider.apiKeyEnvName, 'DEEPSEEK_API_KEY');
  assert.equal(provider.enabled, true);

  if (provider.credentialStatus !== 'CONFIGURED') {
    throw new Error('Backend process cannot see DEEPSEEK_API_KEY. Restart the backend from the same PowerShell session.');
  }

  assertNoSecretLeak(provider, 'provider configuration response');
  console.log(`DeepSeek provider configured: ${provider.defaultModel}`);
}

async function verifyProviderConnection() {
  const response = await postJson('/api/model-providers/test', {
    providerKey,
    modelId
  });

  assertNoSecretLeak(response, 'provider connection response');
  if (response.data.connectionStatus !== 'CONNECTED') {
    throw new Error(`DeepSeek provider connection failed: ${response.data.connectionStatus} / ${response.data.errorType}`);
  }

  console.log(`DeepSeek provider connection: ${response.data.connectionStatus} (${response.data.latencyMs}ms)`);
}

async function verifyPredictionFlow() {
  const response = await postJson('/api/analysis/generate', {
    snapshotId: `deepseek-smoke-snapshot-${Date.now()}`,
    sourceType: 'USER_SCREENSHOT_CONFIRMED',
    analysisAllowed: true,
    riskPreference: 'BALANCED',
    budgetAmount: 20,
    currency: 'CNY',
    engineMode: 'OPENAI_COMPATIBLE',
    providerKey,
    modelId,
    promptVersion: predictionPromptVersion,
    strategyParameters: sampleStrategyParameters(),
    matches: sampleMatches(),
    markets: sampleMarkets()
  });

  assertNoSecretLeak(response, 'prediction response');
  assert.equal(response.data.providerKey, providerKey);
  assert.equal(response.data.modelId, modelId);
  assert.equal(response.data.promptVersion, predictionPromptVersion);
  assert.equal(response.data.inputSourceType, 'USER_SCREENSHOT_CONFIRMED');
  assert.equal(response.data.reportStatus, 'GENERATED');
  assert.ok(response.data.safetyStatus, 'prediction must expose safetyStatus');
  assert.ok(response.data.llmAuditId, 'prediction must expose llmAuditId');

  console.log(`DeepSeek prediction generated: audit=${response.data.llmAuditId}`);
  return response.data;
}

async function verifyPlanFlow(analysis) {
  const generatedPlan = await postJson('/api/strategies/simulate', {
    reportId: analysis.reportId,
    snapshotId: analysis.snapshotId,
    inputSourceType: analysis.inputSourceType,
    engineType: analysis.engineType,
    reportStatus: analysis.reportStatus,
    currency: 'CNY',
    budgetAmount: 20,
    strategyParameters: sampleStrategyParameters(),
    probabilityAnalysis: analysis.probabilityAnalysis,
    riskWarnings: analysis.riskWarnings,
    simulatedSelections: analysis.simulatedSelections
  });
  assert.equal(generatedPlan.data.planStatus, 'GENERATED');

  const savedPlan = await postJson('/api/simulated-plans', {
    generatedPlanId: generatedPlan.data.planId,
    operatorNote: 'DeepSeek integration smoke validation plan.'
  });
  assert.equal(savedPlan.data.planStatus, 'PENDING_RESULT');

  const sync = await postJson('/api/result-providers/sync', {
    providerKey: 'mock-public-results',
    requestedBy: 'deepseek-integration-smoke'
  });
  assert.equal(sync.data.syncStatus, 'SYNCED');

  const match = await postJson(`/api/simulated-plans/${savedPlan.data.planId}/match-result`);
  assert.equal(match.data.matchStatus, 'MATCHED');

  return savedPlan.data;
}

async function verifyReviewInsightFlow(planId) {
  const response = await postJson(`/api/simulated-plans/${planId}/settle`, {
    reviewEngineMode: 'RULE_REVIEW_WITH_LLM_INSIGHT',
    providerKey,
    modelId,
    promptVersion: reviewPromptVersion
  });

  assertNoSecretLeak(response, 'review insight response');
  assert.equal(response.data.providerKey, providerKey);
  assert.equal(response.data.modelId, modelId);
  assert.equal(response.data.promptVersion, reviewPromptVersion);
  assert.equal(response.data.reviewEngineType, 'RULE_REVIEW_WITH_LLM_INSIGHT');
  assert.ok(response.data.llmAuditId, 'review insight must expose llmAuditId');
  assert.ok(response.data.safetyStatus, 'review insight must expose safetyStatus');
  assert.ok(response.data.itemSettlements.every((item) => item.settlementStatus !== undefined));

  console.log(`DeepSeek review insight generated without rewriting rule settlement: audit=${response.data.llmAuditId}`);
}

function sampleStrategyParameters() {
  return {
    budgetAmount: 20,
    currency: 'CNY',
    targetTicketCount: 2,
    minTicketCount: 1,
    maxTicketCount: 3,
    riskPreference: 'BALANCED',
    mainTicketRatio: 0.7,
    defensiveTicketRatio: 0.2,
    entertainmentTicketRatio: 0.1,
    enableEntertainmentTicket: true,
    entertainmentTicketMaxCost: 4,
    maxParlayLegs: 2,
    preferredPlayTypes: ['WIN_DRAW_LOSS'],
    excludedPlayTypes: [],
    exactScorePolicy: 'ENTERTAINMENT_ONLY',
    minPayoutRequirement: 1.5,
    allowLowReturnTicket: false,
    upsetCoverageLevel: 'BALANCED'
  };
}

function sampleMatches() {
  return [
    {
      matchId: 'demo-match-001',
      matchDate: '2026-07-01',
      league: 'Fictional Coastal League',
      homeTeam: 'Northport United',
      awayTeam: 'Lakeside City',
      kickoffTime: '2026-07-01T19:30:00+08:00'
    }
  ];
}

function sampleMarkets() {
  return [
    {
      marketId: 'demo-market-001',
      matchId: 'demo-match-001',
      playType: 'WIN_DRAW_LOSS',
      selection: 'AWAY_WIN',
      odds: 2.05
    }
  ];
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
  const responseText = await response.text();
  const result = responseText ? parseJsonText(responseText) : null;
  if (!response.ok || result?.code !== 200) {
    throw new Error(`${path} failed: HTTP ${response.status}, API code ${result?.code ?? 'UNKNOWN'}, msg=${errorMessage(result, responseText)}`);
  }
  assertNoSecretLeak(result, `${path} response`);
  return result;
}

function parseJsonText(responseText) {
  try {
    return JSON.parse(responseText);
  } catch {
    return null;
  }
}

function errorMessage(result, responseText) {
  const message = result?.msg ?? result?.message ?? result?.detail ?? result?.error ?? responseText ?? 'NO_JSON_BODY';
  return redact(String(message).slice(0, 500));
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

function assertNoSecretLeak(value, label) {
  const serialized = JSON.stringify(value);
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (apiKey && serialized.includes(apiKey)) {
    throw new Error(`${label} leaked DEEPSEEK_API_KEY`);
  }
  if (/sk-[A-Za-z0-9_-]{8,}/.test(serialized)) {
    throw new Error(`${label} contains an API-key shaped token`);
  }
}

function redact(value) {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  let redacted = value.replace(/sk-[A-Za-z0-9_-]{8,}/g, '[REDACTED]');
  if (apiKey) {
    redacted = redacted.split(apiKey).join('[REDACTED]');
  }
  return redacted;
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
    } else if (child.exitCode === null) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
    }
    releaseChildHandles(child);
  }
}

function releaseChildHandles(child) {
  child.stdout?.destroy();
  child.stderr?.destroy();
  child.stdin?.destroy();
  child.unref();
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
    if (!process.exitCode) {
      console.log('DeepSeek integration smoke check passed.');
    }
  })
  .catch((error) => {
    console.error(redact(error.message));
    process.exitCode = 1;
  });
