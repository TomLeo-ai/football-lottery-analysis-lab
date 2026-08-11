<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { generateAnalysis } from '@/api/analysis';
import { fetchEngineSettings, fetchModelProviders } from '@/api/modelProviders';
import { fetchStrategyParameterDefaults } from '@/api/strategyParameters';
import { useAnalysisReportStore } from '@/stores/analysisReport';
import { useOcrWorkflowStore } from '@/stores/ocrWorkflow';
import type { AnalysisGeneratePayload } from '@/types/analysis';
import type { EngineSettings, ModelProvider } from '@/types/modelProvider';
import type { StrategyParameters } from '@/types/strategyParameter';

type AnalysisEngineSelection = 'USE_GLOBAL' | 'MOCK_RULE_ENGINE' | 'OPENAI_COMPATIBLE';
type LlmOutputPreview = {
  ticketGroups?: unknown[];
  finalDecision?: {
    summary?: unknown;
  };
};

const fallbackStrategyParameters: StrategyParameters = {
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
  excludedPlayTypes: [],
  exactScorePolicy: 'ENTERTAINMENT_ONLY',
  minPayoutRequirement: null,
  allowLowReturnTicket: false,
  upsetCoverageLevel: 'BALANCED'
};

const ocrWorkflowStore = useOcrWorkflowStore();
const analysisReportStore = useAnalysisReportStore();
const isGenerating = ref(false);
const isLoadingParameters = ref(false);
const isLoadingProviders = ref(false);
const isLoadingEngineSettings = ref(false);
const errorMessage = ref('');
const parameterErrorMessage = ref('');
const providerErrorMessage = ref('');
const engineSettingsErrorMessage = ref('');
const analysisEngineSelection = ref<AnalysisEngineSelection>('USE_GLOBAL');
const engineSettings = ref<EngineSettings | null>(null);
const providers = ref<ModelProvider[]>([]);
const selectedProviderKey = ref('openai');
const selectedModelId = ref('');
const promptVersion = ref('danche-prediction-v1');
const preferredPlayTypesText = ref(fallbackStrategyParameters.preferredPlayTypes.join(', '));
const excludedPlayTypesText = ref('');
const strategyParameters = reactive<StrategyParameters>({ ...fallbackStrategyParameters });

const confirmedSnapshot = computed(() => ocrWorkflowStore.confirmedSnapshot);
const report = computed(() => analysisReportStore.currentReport);
const effectiveReportParameters = computed(() => report.value?.strategyParameters ?? null);
const selectedProvider = computed<ModelProvider | null>(
  () => providers.value.find((provider) => provider.providerKey === selectedProviderKey.value) ?? null
);
const isOpenAiCompatibleMode = computed(() => resolveEngineMode() === 'OPENAI_COMPATIBLE');
const effectiveModelId = computed(() => {
  const manualModelId = selectedModelId.value.trim();
  return manualModelId || selectedProvider.value?.defaultModel || '';
});
const llmOutputPreview = computed<LlmOutputPreview | null>(() => {
  const output = report.value?.llmOutput;
  return output && typeof output === 'object' ? (output as LlmOutputPreview) : null;
});
const llmTicketGroupCount = computed(() => {
  const ticketGroups = llmOutputPreview.value?.ticketGroups;
  return Array.isArray(ticketGroups) ? ticketGroups.length : null;
});
const llmFinalDecisionSummary = computed(() => {
  const summary = llmOutputPreview.value?.finalDecision?.summary;
  return typeof summary === 'string' ? summary : '';
});

onMounted(() => {
  void loadStrategyParameterDefaults();
  void loadEngineSettings();
  void loadModelProviders();
});

async function loadStrategyParameterDefaults() {
  isLoadingParameters.value = true;
  parameterErrorMessage.value = '';

  try {
    applyStrategyParameters(await fetchStrategyParameterDefaults());
  } catch (error) {
    parameterErrorMessage.value =
      error instanceof Error ? error.message : '策略参数默认值加载失败，已使用本地默认值';
  } finally {
    isLoadingParameters.value = false;
  }
}

async function loadModelProviders() {
  isLoadingProviders.value = true;
  providerErrorMessage.value = '';

  try {
    providers.value = await fetchModelProviders();
    const currentProvider =
      providers.value.find((provider) => provider.providerKey === selectedProviderKey.value) ??
      providers.value[0] ??
      null;

    if (currentProvider) {
      selectedProviderKey.value = currentProvider.providerKey;
      selectedModelId.value = currentProvider.defaultModel;
    }
  } catch (error) {
    providerErrorMessage.value =
      error instanceof Error ? error.message : '模型 Provider 状态加载失败';
  } finally {
    isLoadingProviders.value = false;
  }
}

async function loadEngineSettings() {
  isLoadingEngineSettings.value = true;
  engineSettingsErrorMessage.value = '';

  try {
    engineSettings.value = await fetchEngineSettings();
  } catch (error) {
    engineSettingsErrorMessage.value =
      error instanceof Error ? error.message : '全局引擎设置加载失败，已回退规则引擎';
    engineSettings.value = null;
  } finally {
    isLoadingEngineSettings.value = false;
  }
}

function handleProviderChange() {
  if (selectedProvider.value) {
    selectedModelId.value = selectedProvider.value.defaultModel;
  }
}

function applyStrategyParameters(parameters: StrategyParameters) {
  Object.assign(strategyParameters, parameters);
  preferredPlayTypesText.value = parameters.preferredPlayTypes.join(', ');
  excludedPlayTypesText.value = parameters.excludedPlayTypes.join(', ');
}

function parsePlayTypes(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function optionalNumber(value: number | null) {
  return value === null || Number.isNaN(value) ? null : value;
}

function resolveEngineMode(): 'MOCK_RULE_ENGINE' | 'OPENAI_COMPATIBLE' {
  return analysisEngineSelection.value === 'USE_GLOBAL'
    ? engineSettings.value?.analysisEngineMode ?? 'MOCK_RULE_ENGINE'
    : analysisEngineSelection.value;
}

function buildStrategyParameters(): StrategyParameters {
  return {
    ...strategyParameters,
    budgetAmount: Number(strategyParameters.budgetAmount),
    targetTicketCount: Number(strategyParameters.targetTicketCount),
    minTicketCount: Number(strategyParameters.minTicketCount),
    maxTicketCount: Number(strategyParameters.maxTicketCount),
    mainTicketRatio: Number(strategyParameters.mainTicketRatio),
    defensiveTicketRatio: Number(strategyParameters.defensiveTicketRatio),
    entertainmentTicketRatio: Number(strategyParameters.entertainmentTicketRatio),
    entertainmentTicketMaxCost: Number(strategyParameters.entertainmentTicketMaxCost),
    maxParlayLegs: Number(strategyParameters.maxParlayLegs),
    preferredPlayTypes: parsePlayTypes(preferredPlayTypesText.value),
    excludedPlayTypes: parsePlayTypes(excludedPlayTypesText.value),
    minPayoutRequirement: optionalNumber(strategyParameters.minPayoutRequirement)
  };
}

function formatPlayTypes(playTypes: string[]) {
  return playTypes.length === 0 ? '未设置' : playTypes.join(', ');
}

async function handleGenerateAnalysis() {
  if (!confirmedSnapshot.value) {
    return;
  }

  isGenerating.value = true;
  errorMessage.value = '';

  try {
    const engineMode = resolveEngineMode();
    const payload: AnalysisGeneratePayload = {
      snapshotId: confirmedSnapshot.value.snapshotId,
      sourceType: confirmedSnapshot.value.sourceType,
      analysisAllowed: confirmedSnapshot.value.analysisAllowed,
      riskPreference: confirmedSnapshot.value.riskPreference,
      budgetAmount: confirmedSnapshot.value.budgetAmount,
      currency: confirmedSnapshot.value.currency,
      engineMode,
      strategyParameters: buildStrategyParameters(),
      matches: confirmedSnapshot.value.matches,
      markets: confirmedSnapshot.value.markets
    };

    if (engineMode === 'OPENAI_COMPATIBLE') {
      payload.providerKey = selectedProviderKey.value.trim();
      payload.modelId = effectiveModelId.value;
      payload.promptVersion = promptVersion.value.trim() || 'danche-prediction-v1';
    }

    const generatedReport = await generateAnalysis(payload);
    analysisReportStore.setReport(generatedReport);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '分析报告生成失败';
  } finally {
    isGenerating.value = false;
  }
}
</script>

<template>
  <section class="workflow-page" aria-labelledby="strategy-simulator-title">
    <div class="page-heading">
      <div>
        <p class="page-heading__eyebrow">StrategySimulator</p>
        <h2 id="strategy-simulator-title">AI 分析 Mock/规则引擎</h2>
      </div>
      <p class="page-heading__notice">非官方 · 仅模拟分析/复盘 · 不构成确定性建议</p>
    </div>

    <div class="policy-panel" role="note">
      <strong>阶段边界</strong>
      <p>
        本阶段只基于用户确认快照生成分析报告；规则引擎默认可用，大模型模式只读取后端
        Provider 状态和环境变量，不在前端暴露密钥，不读取官方页面数据。
      </p>
    </div>

    <div v-if="!confirmedSnapshot" class="state-panel">
      <div>
        <strong>缺少已确认快照</strong>
        <p>请先完成 OCR 人工确认，生成 USER_SCREENSHOT_CONFIRMED 快照后再进入分析。</p>
      </div>
      <RouterLink class="external-link" to="/ocr-review">返回人工确认</RouterLink>
    </div>

    <template v-else>
      <div class="workflow-grid">
        <section class="tool-panel" aria-labelledby="analysis-input-title">
          <h3 id="analysis-input-title">1. 已确认输入</h3>
          <dl class="meta-list">
            <div>
              <dt>快照</dt>
              <dd>{{ confirmedSnapshot.snapshotId }}</dd>
            </div>
            <div>
              <dt>来源</dt>
              <dd>{{ confirmedSnapshot.sourceType }}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>{{ confirmedSnapshot.snapshotStatus }}</dd>
            </div>
            <div>
              <dt>预算</dt>
              <dd>{{ confirmedSnapshot.budgetAmount }} {{ confirmedSnapshot.currency }}</dd>
            </div>
          </dl>

          <button
            type="button"
            class="action-button"
            data-testid="generate-analysis-button"
            :disabled="isGenerating"
            @click="handleGenerateAnalysis"
          >
            {{ isGenerating ? '生成中...' : '生成分析报告' }}
          </button>

          <div v-if="errorMessage" class="state-panel state-panel--error" role="alert">
            <strong>分析生成失败</strong>
            <p>{{ errorMessage }}</p>
          </div>
        </section>

        <section class="tool-panel" aria-labelledby="analysis-engine-title">
          <h3 id="analysis-engine-title">2. 本次分析引擎</h3>
          <label class="field-control" for="analysis-engine-selection">
            引擎选择
            <select
              id="analysis-engine-selection"
              v-model="analysisEngineSelection"
              data-testid="analysis-engine-select"
            >
              <option value="USE_GLOBAL">使用全局设置</option>
              <option value="MOCK_RULE_ENGINE">规则引擎</option>
              <option value="OPENAI_COMPATIBLE">大模型</option>
            </select>
          </label>
          <div
            v-if="analysisEngineSelection === 'USE_GLOBAL' && isLoadingEngineSettings"
            class="state-panel"
            aria-live="polite"
          >
            <span class="state-panel__spinner" aria-hidden="true"></span>
            <p>正在读取全局引擎设置</p>
          </div>
          <div
            v-if="analysisEngineSelection === 'USE_GLOBAL' && engineSettingsErrorMessage"
            class="state-panel state-panel--error"
            role="alert"
          >
            <strong>全局引擎设置读取失败</strong>
            <p>{{ engineSettingsErrorMessage }}</p>
          </div>
          <dl class="meta-list">
            <div>
              <dt>当前提交</dt>
              <dd>{{ resolveEngineMode() }}</dd>
            </div>
            <div>
              <dt>Prompt 版本</dt>
              <dd>{{ isOpenAiCompatibleMode ? promptVersion : '未使用' }}</dd>
            </div>
            <div>
              <dt>密钥状态</dt>
              <dd>{{ isOpenAiCompatibleMode ? selectedProvider?.credentialStatus ?? '未加载' : '不需要密钥' }}</dd>
            </div>
            <div v-if="isOpenAiCompatibleMode">
              <dt>Provider</dt>
              <dd>{{ selectedProvider?.displayName ?? selectedProviderKey }}</dd>
            </div>
          </dl>

          <template v-if="isOpenAiCompatibleMode">
            <div v-if="isLoadingProviders" class="state-panel" aria-live="polite">
              <span class="state-panel__spinner" aria-hidden="true"></span>
              <p>正在读取 Provider 状态</p>
            </div>

            <div v-if="providerErrorMessage" class="state-panel state-panel--error" role="alert">
              <strong>Provider 状态读取失败</strong>
              <p>{{ providerErrorMessage }}</p>
            </div>

            <div class="parameter-form" aria-label="大模型调用参数">
              <label class="field-control" for="analysis-provider-selection">
                Provider
                <select
                  id="analysis-provider-selection"
                  v-model="selectedProviderKey"
                  data-testid="analysis-provider-select"
                  :disabled="isLoadingProviders"
                  @change="handleProviderChange"
                >
                  <option v-if="providers.length === 0" value="openai">openai</option>
                  <option
                    v-for="provider in providers"
                    :key="provider.providerKey"
                    :value="provider.providerKey"
                  >
                    {{ provider.displayName }} · {{ provider.providerKey }}
                  </option>
                </select>
              </label>

              <label class="field-control" for="analysis-model-input">
                模型
                <input
                  id="analysis-model-input"
                  v-model="selectedModelId"
                  data-testid="analysis-model-input"
                  type="text"
                />
                <span>留空时使用 Provider 默认模型。</span>
              </label>

              <label class="field-control" for="analysis-prompt-version-input">
                Prompt 版本
                <input
                  id="analysis-prompt-version-input"
                  v-model="promptVersion"
                  data-testid="analysis-prompt-version-input"
                  type="text"
                />
              </label>
            </div>

            <dl class="meta-list">
              <div>
                <dt>Provider 状态</dt>
                <dd>{{ selectedProvider?.credentialStatus ?? '未加载' }}</dd>
              </div>
              <div>
                <dt>连接状态</dt>
                <dd>{{ selectedProvider?.connectionStatus ?? '未测试' }}</dd>
              </div>
              <div>
                <dt>环境变量</dt>
                <dd>{{ selectedProvider?.apiKeyEnvName ?? '未配置' }}</dd>
              </div>
              <div>
                <dt>Base URL</dt>
                <dd>{{ selectedProvider?.baseUrl ?? '未加载' }}</dd>
              </div>
            </dl>
            <p class="helper-text">API Key 前端不可见，只由后端通过环境变量读取。</p>
          </template>
        </section>

        <section class="tool-panel tool-panel--wide" aria-labelledby="strategy-parameters-title">
          <div class="section-heading">
            <h3 id="strategy-parameters-title">3. 本轮参数</h3>
            <span v-if="isLoadingParameters" class="policy-tag">加载默认值</span>
          </div>

          <div v-if="parameterErrorMessage" class="state-panel state-panel--error" role="alert">
            <strong>默认值加载失败</strong>
            <p>{{ parameterErrorMessage }}</p>
          </div>

          <div class="parameter-form" aria-label="本轮策略参数">
            <label class="field-control" for="strategy-budget-input">
              本轮预算
              <input
                id="strategy-budget-input"
                v-model.number="strategyParameters.budgetAmount"
                data-testid="strategy-budget-input"
                type="number"
                min="1"
                step="1"
              />
            </label>

            <label class="field-control" for="strategy-currency-input">
              币种
              <input id="strategy-currency-input" v-model="strategyParameters.currency" type="text" />
            </label>

            <label class="field-control" for="strategy-target-count-input">
              目标方案组数
              <input
                id="strategy-target-count-input"
                v-model.number="strategyParameters.targetTicketCount"
                data-testid="strategy-target-count-input"
                type="number"
                min="1"
                step="1"
              />
            </label>

            <label class="field-control" for="strategy-min-count-input">
              最少组数
              <input
                id="strategy-min-count-input"
                v-model.number="strategyParameters.minTicketCount"
                data-testid="strategy-min-count-input"
                type="number"
                min="1"
                step="1"
              />
            </label>

            <label class="field-control" for="strategy-max-count-input">
              最多组数
              <input
                id="strategy-max-count-input"
                v-model.number="strategyParameters.maxTicketCount"
                data-testid="strategy-max-count-input"
                type="number"
                min="1"
                step="1"
              />
            </label>

            <label class="field-control" for="strategy-risk-select">
              风险偏好
              <select
                id="strategy-risk-select"
                v-model="strategyParameters.riskPreference"
                data-testid="strategy-risk-select"
              >
                <option value="CONSERVATIVE">CONSERVATIVE</option>
                <option value="BALANCED">BALANCED</option>
                <option value="AGGRESSIVE">AGGRESSIVE</option>
              </select>
            </label>

            <label class="field-control" for="strategy-main-ratio-input">
              主票预算占比
              <input
                id="strategy-main-ratio-input"
                v-model.number="strategyParameters.mainTicketRatio"
                data-testid="strategy-main-ratio-input"
                type="number"
                min="0"
                max="1"
                step="0.01"
              />
            </label>

            <label class="field-control" for="strategy-defensive-ratio-input">
              防冷预算占比
              <input
                id="strategy-defensive-ratio-input"
                v-model.number="strategyParameters.defensiveTicketRatio"
                data-testid="strategy-defensive-ratio-input"
                type="number"
                min="0"
                max="1"
                step="0.01"
              />
            </label>

            <label class="field-control" for="strategy-entertainment-ratio-input">
              娱乐票占比
              <input
                id="strategy-entertainment-ratio-input"
                v-model.number="strategyParameters.entertainmentTicketRatio"
                data-testid="strategy-entertainment-ratio-input"
                type="number"
                min="0"
                max="1"
                step="0.01"
              />
            </label>

            <label class="field-control" for="strategy-entertainment-cost-input">
              娱乐票成本上限
              <input
                id="strategy-entertainment-cost-input"
                v-model.number="strategyParameters.entertainmentTicketMaxCost"
                data-testid="strategy-entertainment-cost-input"
                type="number"
                min="0"
                step="1"
              />
            </label>

            <label class="field-control" for="strategy-max-parlay-input">
              最长串关场次数
              <input
                id="strategy-max-parlay-input"
                v-model.number="strategyParameters.maxParlayLegs"
                data-testid="strategy-max-parlay-input"
                type="number"
                min="1"
                step="1"
              />
            </label>

            <label class="field-control" for="strategy-exact-score-policy-select">
              比分策略
              <select
                id="strategy-exact-score-policy-select"
                v-model="strategyParameters.exactScorePolicy"
                data-testid="strategy-exact-score-policy-select"
              >
                <option value="DISABLED">DISABLED</option>
                <option value="ENTERTAINMENT_ONLY">ENTERTAINMENT_ONLY</option>
                <option value="ALLOWED_WITH_REASON">ALLOWED_WITH_REASON</option>
              </select>
            </label>

            <label class="field-control" for="strategy-upset-coverage-select">
              防冷覆盖
              <select
                id="strategy-upset-coverage-select"
                v-model="strategyParameters.upsetCoverageLevel"
                data-testid="strategy-upset-coverage-select"
              >
                <option value="NONE">NONE</option>
                <option value="LIGHT">LIGHT</option>
                <option value="BALANCED">BALANCED</option>
                <option value="STRONG">STRONG</option>
              </select>
            </label>

            <label class="field-control" for="strategy-preferred-play-types-input">
              优先玩法
              <input
                id="strategy-preferred-play-types-input"
                v-model="preferredPlayTypesText"
                data-testid="strategy-preferred-play-types-input"
                type="text"
              />
              <span>多个玩法用英文逗号分隔。</span>
            </label>

            <label class="field-control" for="strategy-excluded-play-types-input">
              禁用玩法
              <input
                id="strategy-excluded-play-types-input"
                v-model="excludedPlayTypesText"
                data-testid="strategy-excluded-play-types-input"
                type="text"
              />
              <span>命中禁用玩法时后端会阻断分析。</span>
            </label>

            <label class="checkbox-control" for="strategy-entertainment-toggle">
              <input
                id="strategy-entertainment-toggle"
                v-model="strategyParameters.enableEntertainmentTicket"
                data-testid="strategy-entertainment-toggle"
                type="checkbox"
              />
              生成娱乐票
            </label>

            <label class="checkbox-control" for="strategy-low-return-toggle">
              <input
                id="strategy-low-return-toggle"
                v-model="strategyParameters.allowLowReturnTicket"
                data-testid="strategy-low-return-toggle"
                type="checkbox"
              />
              允许收益偏薄方案
            </label>
          </div>

          <ul class="check-list">
            <li>本轮输入优先于后端默认值。</li>
            <li>分析报告和模拟方案都会保存本次参数快照。</li>
            <li>预算比例、禁用玩法、最长串关由后端再次校验。</li>
          </ul>
        </section>

        <section class="tool-panel tool-panel--wide" aria-labelledby="analysis-boundary-title">
          <h3 id="analysis-boundary-title">4. 输出边界</h3>
          <ul class="check-list">
            <li>只读取 USER_SCREENSHOT_CONFIRMED 快照。</li>
            <li>输出概率区间和风险提示，不输出确定性结论。</li>
            <li>候选项仅供下一阶段模拟方案生成使用。</li>
          </ul>
        </section>
      </div>

      <div v-if="report" class="report-section" aria-live="polite">
        <section class="tool-panel" aria-labelledby="report-summary-title">
          <h3 id="report-summary-title">分析报告</h3>
          <dl class="meta-list">
            <div>
              <dt>报告</dt>
              <dd>{{ report.reportId }}</dd>
            </div>
            <div>
              <dt>引擎</dt>
              <dd>{{ report.engineType }}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>{{ report.reportStatus }}</dd>
            </div>
            <div>
              <dt>输入来源</dt>
              <dd>{{ report.inputSourceType }}</dd>
            </div>
            <div v-if="report.providerKey">
              <dt>Provider</dt>
              <dd>{{ report.providerKey }}</dd>
            </div>
            <div v-if="report.modelId">
              <dt>模型</dt>
              <dd>{{ report.modelId }}</dd>
            </div>
            <div v-if="report.promptVersion">
              <dt>Prompt</dt>
              <dd>{{ report.promptVersion }}</dd>
            </div>
            <div v-if="report.safetyStatus">
              <dt>安全状态</dt>
              <dd>{{ report.safetyStatus }}</dd>
            </div>
          </dl>
          <p class="helper-text">{{ report.complianceNotice }}</p>
        </section>

        <section
          v-if="report.providerKey || llmOutputPreview"
          class="tool-panel"
          aria-labelledby="llm-output-title"
        >
          <h3 id="llm-output-title">大模型输出摘要</h3>
          <dl class="meta-list">
            <div>
              <dt>审计记录</dt>
              <dd>{{ report.llmAuditId ?? '待审计落库' }}</dd>
            </div>
            <div v-if="llmTicketGroupCount !== null">
              <dt>结构输出</dt>
              <dd>ticketGroups: {{ llmTicketGroupCount }}</dd>
            </div>
            <div v-if="llmFinalDecisionSummary">
              <dt>结论摘要</dt>
              <dd>{{ llmFinalDecisionSummary }}</dd>
            </div>
          </dl>
        </section>

        <section
          v-if="effectiveReportParameters"
          class="tool-panel"
          aria-labelledby="report-parameters-title"
        >
          <h3 id="report-parameters-title">实际使用参数</h3>
          <dl class="meta-list">
            <div>
              <dt>预算</dt>
              <dd>{{ effectiveReportParameters.budgetAmount }} {{ effectiveReportParameters.currency }}</dd>
            </div>
            <div>
              <dt>目标组数</dt>
              <dd>
                {{ effectiveReportParameters.targetTicketCount }}
                （{{ effectiveReportParameters.minTicketCount }}-{{ effectiveReportParameters.maxTicketCount }}）
              </dd>
            </div>
            <div>
              <dt>风险偏好</dt>
              <dd>{{ effectiveReportParameters.riskPreference }}</dd>
            </div>
            <div>
              <dt>最长串关</dt>
              <dd>{{ effectiveReportParameters.maxParlayLegs }}</dd>
            </div>
            <div>
              <dt>禁用玩法</dt>
              <dd>{{ formatPlayTypes(effectiveReportParameters.excludedPlayTypes) }}</dd>
            </div>
            <div>
              <dt>比分策略</dt>
              <dd>{{ effectiveReportParameters.exactScorePolicy }}</dd>
            </div>
            <div>
              <dt>防冷覆盖</dt>
              <dd>{{ effectiveReportParameters.upsetCoverageLevel }}</dd>
            </div>
          </dl>
        </section>

        <section class="tool-panel" aria-labelledby="probability-title">
          <h3 id="probability-title">概率分析</h3>
          <table class="link-table workflow-table">
            <caption>
              概率分析表。表格作为图表替代，避免只靠颜色表达。
            </caption>
            <thead>
              <tr>
                <th scope="col">比赛</th>
                <th scope="col">方向</th>
                <th scope="col">区间</th>
                <th scope="col">依据</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in report.probabilityAnalysis" :key="item.matchId">
                <td>{{ item.homeTeam }} vs {{ item.awayTeam }}</td>
                <td>{{ item.selection }}</td>
                <td>{{ item.probabilityBand }}</td>
                <td>{{ item.rationale }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="tool-panel" aria-labelledby="risk-title">
          <h3 id="risk-title">风险提示</h3>
          <table class="link-table workflow-table">
            <caption>
              风险提示表。
            </caption>
            <thead>
              <tr>
                <th scope="col">类型</th>
                <th scope="col">等级</th>
                <th scope="col">说明</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="risk in report.riskWarnings" :key="risk.riskCode">
                <td>{{ risk.riskCode }}</td>
                <td>{{ risk.riskLevel }}</td>
                <td>{{ risk.message }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="tool-panel" aria-labelledby="selection-title">
          <h3 id="selection-title">模拟选择候选</h3>
          <table class="link-table workflow-table">
            <caption>
              模拟选择候选表。保存方案将在下一阶段实现。
            </caption>
            <thead>
              <tr>
                <th scope="col">比赛</th>
                <th scope="col">玩法</th>
                <th scope="col">方向</th>
                <th scope="col">赔率</th>
                <th scope="col">模拟预算</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="selection in report.simulatedSelections" :key="selection.matchId">
                <td>{{ selection.matchId }}</td>
                <td>{{ selection.playType }}</td>
                <td>{{ selection.selection }}</td>
                <td>{{ selection.odds }}</td>
                <td>{{ selection.stakeAmount }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </template>
  </section>
</template>
