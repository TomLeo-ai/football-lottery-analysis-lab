<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { fetchEngineSettings, fetchModelProviders, testModelProvider, updateEngineSettings } from '@/api/modelProviders';
import { fetchStrategyParameterDefaults, updateStrategyParameterDefaults } from '@/api/strategyParameters';
import type {
  EngineSettings,
  ModelProvider,
  ModelProviderConnectionTest
} from '@/types/modelProvider';
import type { StrategyParameters } from '@/types/strategyParameter';

const providers = ref<ModelProvider[]>([]);
const engineSettings = ref<EngineSettings | null>(null);
const strategyDefaults = ref<StrategyParameters | null>(null);
const editableStrategyDefaults = ref<StrategyParameters | null>(null);
const editableAnalysisEngineMode = ref<EngineSettings['analysisEngineMode']>('MOCK_RULE_ENGINE');
const editableReviewInsightMode = ref<EngineSettings['reviewInsightMode']>('RULE_REVIEW_ONLY');
const providerTestResults = ref<Record<string, ModelProviderConnectionTest>>({});
const testingProviderKey = ref('');
const isLoading = ref(false);
const isSavingEngineSettings = ref(false);
const isSavingStrategyDefaults = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const configuredProviderCount = computed(
  () => providers.value.filter((provider) => provider.credentialStatus === 'CONFIGURED').length
);

onMounted(() => {
  void loadSettings();
});

async function loadSettings() {
  isLoading.value = true;
  errorMessage.value = '';

  try {
    const [settings, modelProviders, defaults] = await Promise.all([
      fetchEngineSettings(),
      fetchModelProviders(),
      fetchStrategyParameterDefaults()
    ]);
    engineSettings.value = settings;
    editableAnalysisEngineMode.value = settings.analysisEngineMode;
    editableReviewInsightMode.value = settings.reviewInsightMode;
    providers.value = modelProviders;
    strategyDefaults.value = defaults;
    editableStrategyDefaults.value = cloneStrategyParameters(defaults);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '模型设置加载失败';
  } finally {
    isLoading.value = false;
  }
}

async function handleTestProvider(provider: ModelProvider) {
  testingProviderKey.value = provider.providerKey;
  errorMessage.value = '';

  try {
    const result = await testModelProvider(provider.providerKey, provider.defaultModel);
    providerTestResults.value = {
      ...providerTestResults.value,
      [provider.providerKey]: result
    };
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Provider 连接测试失败';
  } finally {
    testingProviderKey.value = '';
  }
}

async function handleSaveEngineSettings() {
  isSavingEngineSettings.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    const updated = await updateEngineSettings({
      analysisEngineMode: editableAnalysisEngineMode.value,
      reviewInsightMode: editableReviewInsightMode.value
    });
    engineSettings.value = updated;
    editableAnalysisEngineMode.value = updated.analysisEngineMode;
    editableReviewInsightMode.value = updated.reviewInsightMode;
    successMessage.value = '设置已保存';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '引擎设置保存失败';
  } finally {
    isSavingEngineSettings.value = false;
  }
}

async function handleSaveStrategyDefaults() {
  if (!editableStrategyDefaults.value) {
    return;
  }

  isSavingStrategyDefaults.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    const updated = await updateStrategyParameterDefaults(editableStrategyDefaults.value);
    strategyDefaults.value = updated;
    editableStrategyDefaults.value = cloneStrategyParameters(updated);
    successMessage.value = '设置已保存';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '策略默认值保存失败';
  } finally {
    isSavingStrategyDefaults.value = false;
  }
}

function resolveConnectionStatus(provider: ModelProvider) {
  return providerTestResults.value[provider.providerKey]?.connectionStatus ?? provider.connectionStatus;
}

function resolveTestMeta(provider: ModelProvider) {
  const result = providerTestResults.value[provider.providerKey];

  if (!result) {
    return '待测试';
  }

  return `${result.errorType} · ${result.latencyMs}ms`;
}

function cloneStrategyParameters(value: StrategyParameters): StrategyParameters {
  return {
    ...value,
    preferredPlayTypes: [...value.preferredPlayTypes],
    excludedPlayTypes: [...value.excludedPlayTypes]
  };
}

function playTypesToText(values: string[]) {
  return values.join(', ');
}

function parsePlayTypes(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function handlePreferredPlayTypesInput(event: Event) {
  if (!editableStrategyDefaults.value) {
    return;
  }
  editableStrategyDefaults.value.preferredPlayTypes = parsePlayTypes((event.target as HTMLInputElement).value);
}

function handleExcludedPlayTypesInput(event: Event) {
  if (!editableStrategyDefaults.value) {
    return;
  }
  editableStrategyDefaults.value.excludedPlayTypes = parsePlayTypes((event.target as HTMLInputElement).value);
}
</script>

<template>
  <section class="workflow-page" aria-labelledby="model-settings-title">
    <div class="page-heading">
      <div>
        <p class="page-heading__eyebrow">ModelSettings</p>
        <h2 id="model-settings-title">模型设置 / 策略默认值</h2>
      </div>
      <p class="page-heading__notice">非官方 · 规则引擎默认 · API Key 前端不可见</p>
    </div>

    <div class="policy-panel" role="note">
      <strong>双引擎边界</strong>
      <p>
        默认保留 MOCK_RULE_ENGINE 与 RULE_REVIEW_ONLY。选择大模型时只通过后端环境变量读取密钥，
        输出必须通过 JSON 校验、敏感表达拦截和审计记录。
      </p>
    </div>

    <div v-if="isLoading" class="state-panel" aria-live="polite">
      <span class="state-panel__spinner" aria-hidden="true"></span>
      <p>正在加载模型设置...</p>
    </div>

    <div v-if="errorMessage" class="state-panel state-panel--error" role="alert">
      <strong>加载失败</strong>
      <p>{{ errorMessage }}</p>
    </div>

    <div v-if="successMessage" class="state-panel" role="status">
      <strong>{{ successMessage }}</strong>
      <p>最新设置已写入后端服务。</p>
    </div>

    <div class="workflow-grid">
      <section class="tool-panel" aria-labelledby="engine-settings-title">
        <h3 id="engine-settings-title">全局默认引擎</h3>
        <form v-if="engineSettings" class="form-grid" @submit.prevent="handleSaveEngineSettings">
          <label class="field-control" for="analysis-default-engine">
            <span>分析引擎</span>
            <select
              id="analysis-default-engine"
              v-model="editableAnalysisEngineMode"
              data-testid="analysis-default-engine-select"
            >
              <option value="MOCK_RULE_ENGINE">规则引擎</option>
              <option value="OPENAI_COMPATIBLE">大模型</option>
            </select>
          </label>
          <label class="field-control" for="review-default-engine">
            <span>复盘洞察</span>
            <select
              id="review-default-engine"
              v-model="editableReviewInsightMode"
              data-testid="review-default-engine-select"
            >
              <option value="RULE_REVIEW_ONLY">规则复盘</option>
              <option value="RULE_REVIEW_WITH_LLM_INSIGHT">规则复盘 + 大模型洞察</option>
            </select>
          </label>
          <dl class="meta-list">
            <div>
              <dt>默认回退</dt>
              <dd>{{ engineSettings.defaultEngineMode }}</dd>
            </div>
          </dl>
          <button
            type="button"
            class="primary-button"
            data-testid="save-engine-settings-button"
            :disabled="isSavingEngineSettings"
            @click="handleSaveEngineSettings"
          >
            {{ isSavingEngineSettings ? '保存中' : '保存引擎设置' }}
          </button>
        </form>
      </section>

      <section class="tool-panel" aria-labelledby="provider-summary-title">
        <h3 id="provider-summary-title">Provider 概览</h3>
        <dl class="meta-list">
          <div>
            <dt>模板数量</dt>
            <dd>{{ providers.length }}</dd>
          </div>
          <div>
            <dt>已配密钥</dt>
            <dd>{{ configuredProviderCount }}</dd>
          </div>
          <div>
            <dt>输入边界</dt>
            <dd>USER_SCREENSHOT_CONFIRMED</dd>
          </div>
        </dl>
      </section>
    </div>

    <section class="tool-panel" aria-labelledby="strategy-defaults-title">
      <h3 id="strategy-defaults-title">默认策略参数</h3>

      <form v-if="editableStrategyDefaults" class="form-grid" @submit.prevent="handleSaveStrategyDefaults">
        <label class="field-control" for="default-budget">
          <span>预算金额</span>
          <input
            id="default-budget"
            v-model.number="editableStrategyDefaults.budgetAmount"
            data-testid="default-budget-input"
            type="number"
            min="0"
            step="1"
          />
        </label>
        <label class="field-control" for="default-currency">
          <span>币种</span>
          <input id="default-currency" v-model="editableStrategyDefaults.currency" type="text" />
        </label>
        <label class="field-control" for="default-ticket-count">
          <span>目标方案组数</span>
          <input
            id="default-ticket-count"
            v-model.number="editableStrategyDefaults.targetTicketCount"
            data-testid="default-ticket-count-input"
            type="number"
            min="1"
            step="1"
          />
        </label>
        <label class="field-control" for="default-risk">
          <span>风险偏好</span>
          <select id="default-risk" v-model="editableStrategyDefaults.riskPreference" data-testid="default-risk-select">
            <option value="CONSERVATIVE">CONSERVATIVE</option>
            <option value="BALANCED">BALANCED</option>
            <option value="AGGRESSIVE">AGGRESSIVE</option>
          </select>
        </label>
        <label class="field-control" for="default-max-parlay">
          <span>最长串关</span>
          <input
            id="default-max-parlay"
            v-model.number="editableStrategyDefaults.maxParlayLegs"
            type="number"
            min="1"
            step="1"
          />
        </label>
        <label class="field-control" for="default-entertainment-cost">
          <span>娱乐票成本上限</span>
          <input
            id="default-entertainment-cost"
            v-model.number="editableStrategyDefaults.entertainmentTicketMaxCost"
            type="number"
            min="0"
            step="1"
          />
        </label>
        <label class="field-control" for="default-exact-score">
          <span>比分策略</span>
          <select id="default-exact-score" v-model="editableStrategyDefaults.exactScorePolicy">
            <option value="DISABLED">DISABLED</option>
            <option value="ENTERTAINMENT_ONLY">ENTERTAINMENT_ONLY</option>
            <option value="ALLOWED_WITH_REASON">ALLOWED_WITH_REASON</option>
          </select>
        </label>
        <label class="field-control" for="default-upset">
          <span>防冷覆盖</span>
          <select id="default-upset" v-model="editableStrategyDefaults.upsetCoverageLevel">
            <option value="NONE">NONE</option>
            <option value="LIGHT">LIGHT</option>
            <option value="BALANCED">BALANCED</option>
            <option value="STRONG">STRONG</option>
          </select>
        </label>
        <label class="field-control field-control--wide" for="default-preferred-play-types">
          <span>优先玩法</span>
          <input
            id="default-preferred-play-types"
            :value="playTypesToText(editableStrategyDefaults.preferredPlayTypes)"
            type="text"
            @input="handlePreferredPlayTypesInput"
          />
        </label>
        <label class="field-control field-control--wide" for="default-excluded-play-types">
          <span>禁用玩法</span>
          <input
            id="default-excluded-play-types"
            :value="playTypesToText(editableStrategyDefaults.excludedPlayTypes)"
            type="text"
            @input="handleExcludedPlayTypesInput"
          />
        </label>
        <label class="checkbox-row" for="default-entertainment">
          <input
            id="default-entertainment"
            v-model="editableStrategyDefaults.enableEntertainmentTicket"
            data-testid="default-entertainment-toggle"
            type="checkbox"
          />
          <span>生成娱乐票</span>
        </label>
        <label class="checkbox-row" for="default-low-return">
          <input id="default-low-return" v-model="editableStrategyDefaults.allowLowReturnTicket" type="checkbox" />
          <span>允许收益偏薄票</span>
        </label>
        <button
          type="button"
          class="primary-button"
          data-testid="save-strategy-defaults-button"
          :disabled="isSavingStrategyDefaults"
          @click="handleSaveStrategyDefaults"
        >
          {{ isSavingStrategyDefaults ? '保存中' : '保存策略默认值' }}
        </button>
      </form>
    </section>

    <section class="tool-panel" aria-labelledby="provider-table-title">
      <h3 id="provider-table-title">Provider 状态表</h3>

      <div class="link-table-wrap">
        <table class="link-table workflow-table">
          <caption>
            OpenAI-compatible Provider 配置状态。
          </caption>
          <thead>
            <tr>
              <th scope="col">Provider</th>
              <th scope="col">默认模型</th>
              <th scope="col">密钥环境变量</th>
              <th scope="col">密钥状态</th>
              <th scope="col">连接状态</th>
              <th scope="col">测试</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="provider in providers" :key="provider.providerKey">
              <td>
                {{ provider.displayName }}
                <span>{{ provider.providerKey }} · {{ provider.baseUrl }}</span>
              </td>
              <td>{{ provider.defaultModel }}</td>
              <td>{{ provider.apiKeyEnvName }}</td>
              <td>{{ provider.credentialStatus }}</td>
              <td>
                {{ resolveConnectionStatus(provider) }}
                <span>{{ resolveTestMeta(provider) }}</span>
              </td>
              <td>
                <button
                  type="button"
                  class="text-button"
                  :disabled="testingProviderKey === provider.providerKey"
                  @click="handleTestProvider(provider)"
                >
                  {{ testingProviderKey === provider.providerKey ? '测试中' : '连接测试' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="tool-panel" aria-labelledby="guardrail-title">
      <h3 id="guardrail-title">合规守卫状态</h3>
      <ul class="check-list">
        <li>API Key 前端不可见，仅显示环境变量配置状态。</li>
        <li>默认规则引擎保留，无密钥时仍可完整运行。</li>
        <li>未确认 OCR 不进入规则引擎或大模型。</li>
        <li>大模型输出必须通过 JSON 校验、敏感表达拦截和调用审计。</li>
        <li>复盘结算状态由规则引擎生成，大模型只提供洞察。</li>
      </ul>
    </section>
  </section>
</template>
