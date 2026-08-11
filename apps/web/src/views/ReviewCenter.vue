<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { fetchModelProviders } from '@/api/modelProviders';
import { getResultProviderStatus, syncResultProvider } from '@/api/resultProviders';
import { listPendingReviews, matchPlanResult, settlePlan } from '@/api/reviews';
import { useResultProviderStore } from '@/stores/resultProvider';
import type { ModelProvider } from '@/types/modelProvider';
import type { PendingReviewPlan, ResultMatch, ReviewRecord, ReviewSettlePayload } from '@/types/review';

const resultProviderStore = useResultProviderStore();
type ReviewEngineMode = 'RULE_REVIEW_ONLY' | 'RULE_REVIEW_WITH_LLM_INSIGHT';

const isLoading = ref(false);
const isSyncing = ref(false);
const isLoadingPending = ref(false);
const isLoadingProviders = ref(false);
const isReviewing = ref(false);
const errorMessage = ref('');
const providerErrorMessage = ref('');
const successMessage = ref('');
const pendingPlans = ref<PendingReviewPlan[]>([]);
const matchResult = ref<ResultMatch | null>(null);
const reviewRecord = ref<ReviewRecord | null>(null);
const modelProviders = ref<ModelProvider[]>([]);
const reviewEngineMode = ref<ReviewEngineMode>('RULE_REVIEW_ONLY');
const selectedProviderKey = ref('openai');
const selectedModelId = ref('');
const reviewPromptVersion = ref('danche-review-insight-v1');

const status = computed(() => resultProviderStore.status);
const snapshots = computed(() => status.value?.snapshots ?? []);
const firstPendingPlan = computed(() => pendingPlans.value[0] ?? null);
const isLlmReviewMode = computed(() => reviewEngineMode.value === 'RULE_REVIEW_WITH_LLM_INSIGHT');
const selectedProvider = computed<ModelProvider | null>(
  () => modelProviders.value.find((provider) => provider.providerKey === selectedProviderKey.value) ?? null
);
const effectiveModelId = computed(() => selectedModelId.value.trim() || selectedProvider.value?.defaultModel || '');
const llmInsight = computed(() => reviewRecord.value?.llmInsight ?? null);
const ticketReviewNarratives = computed(() => llmInsight.value?.ticketReviewNarratives ?? []);
const failureClassifications = computed(() => llmInsight.value?.failureClassifications ?? []);
const reviewStrategySuggestions = computed(() => llmInsight.value?.strategyRevisionSuggestions ?? []);
const doNotOverreactEvents = computed(() => llmInsight.value?.doNotOverreactEvents ?? []);
const nextRoundParameterSuggestions = computed(() => {
  const suggestions = llmInsight.value?.nextRoundParameterSuggestions;
  if (!suggestions || Array.isArray(suggestions) || typeof suggestions !== 'object') {
    return [];
  }
  return Object.entries(suggestions).map(([key, value]) => ({
    key,
    value: formatUnknownValue(value)
  }));
});

onMounted(() => {
  void loadStatus();
  void loadPendingReviews();
  void loadModelProviders();
});

async function loadStatus() {
  isLoading.value = true;
  errorMessage.value = '';

  try {
    const providerStatus = await getResultProviderStatus();
    resultProviderStore.setStatus(providerStatus);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '公开赛果源状态加载失败';
  } finally {
    isLoading.value = false;
  }
}

async function loadPendingReviews() {
  isLoadingPending.value = true;

  try {
    pendingPlans.value = await listPendingReviews();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '待复盘方案加载失败';
  } finally {
    isLoadingPending.value = false;
  }
}

async function handleSync() {
  isSyncing.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    const providerStatus = await syncResultProvider({
      providerKey: 'mock-public-results',
      requestedBy: 'review-center'
    });
    resultProviderStore.setStatus(providerStatus);
    successMessage.value = 'Mock 公开赛果源同步完成。';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Mock 公开赛果源同步失败';
  } finally {
    isSyncing.value = false;
  }
}

async function loadModelProviders() {
  isLoadingProviders.value = true;
  providerErrorMessage.value = '';

  try {
    modelProviders.value = await fetchModelProviders();
    const currentProvider =
      modelProviders.value.find((provider) => provider.providerKey === selectedProviderKey.value) ??
      modelProviders.value[0] ??
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

function handleProviderChange() {
  if (selectedProvider.value) {
    selectedModelId.value = selectedProvider.value.defaultModel;
  }
}

function buildReviewSettlePayload(): ReviewSettlePayload | undefined {
  if (!isLlmReviewMode.value) {
    return undefined;
  }

  return {
    reviewEngineMode: 'RULE_REVIEW_WITH_LLM_INSIGHT',
    providerKey: selectedProviderKey.value.trim(),
    modelId: effectiveModelId.value,
    promptVersion: reviewPromptVersion.value.trim() || 'danche-review-insight-v1'
  };
}

function formatUnknownValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return '未设置';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

async function handleMatchAndSettle() {
  if (!firstPendingPlan.value) {
    errorMessage.value = '暂无 PENDING_RESULT 方案可复盘。';
    return;
  }

  isReviewing.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  matchResult.value = null;
  reviewRecord.value = null;

  try {
    const planId = firstPendingPlan.value.planId;
    matchResult.value = await matchPlanResult(planId);
    reviewRecord.value = await settlePlan(planId, buildReviewSettlePayload());
    pendingPlans.value = pendingPlans.value.filter((plan) => plan.planId !== planId);
    successMessage.value = '自动复盘完成，已生成命中状态、失败原因和策略修正规则。';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '自动复盘失败';
  } finally {
    isReviewing.value = false;
  }
}
</script>

<template>
  <section class="workflow-page" aria-labelledby="review-center-title">
    <div class="page-heading">
      <div>
        <p class="page-heading__eyebrow">ReviewCenter</p>
        <h2 id="review-center-title">自动复盘与策略修正规则</h2>
      </div>
      <p class="page-heading__notice">非官方 · Mock 赛果源 · 仅模拟复盘</p>
    </div>

    <div class="policy-panel" role="note">
      <strong>阶段边界</strong>
      <p>
        本阶段只使用虚构 Mock 公开赛果快照匹配 PENDING_RESULT 模拟方案；结算结果由规则引擎生成，
        大模型仅提供解释和策略建议，不改写 HIT、MISS、PARTIAL_HIT、VOID、PENDING、NEEDS_REVIEW。
      </p>
    </div>

    <div class="workflow-grid">
      <section class="tool-panel" aria-labelledby="provider-status-title">
        <h3 id="provider-status-title">1. 赛果源状态</h3>
        <div v-if="isLoading" class="state-panel" aria-live="polite">
          <span class="state-panel__spinner" aria-hidden="true"></span>
          <p>正在加载 Mock 赛果源状态...</p>
        </div>
        <dl v-if="status" class="meta-list">
          <div>
            <dt>Provider</dt>
            <dd>{{ status.providerName }}</dd>
          </div>
          <div>
            <dt>类型</dt>
            <dd>{{ status.providerType }}</dd>
          </div>
          <div>
            <dt>状态</dt>
            <dd>{{ status.syncStatus }}</dd>
          </div>
          <div>
            <dt>快照数</dt>
            <dd>{{ status.snapshotCount }}</dd>
          </div>
          <div>
            <dt>置信度</dt>
            <dd>{{ status.lastConfidence ?? '待同步' }}</dd>
          </div>
        </dl>
      </section>

      <section class="tool-panel" aria-labelledby="provider-action-title">
        <h3 id="provider-action-title">2. 手动同步</h3>
        <p class="helper-text">只使用本地虚构样例，不接入默认官方彩票页面。</p>
        <button
          type="button"
          class="action-button"
          data-testid="sync-result-provider-button"
          :disabled="isSyncing"
          @click="handleSync"
        >
          {{ isSyncing ? '同步中...' : '同步 Mock 公开赛果源' }}
        </button>

        <div v-if="errorMessage" class="state-panel state-panel--error" role="alert">
          <strong>操作失败</strong>
          <p>{{ errorMessage }}</p>
        </div>
        <div v-if="successMessage" class="state-panel state-panel--success" role="status">
          <strong>操作完成</strong>
          <p>{{ successMessage }}</p>
        </div>
      </section>

      <section class="tool-panel tool-panel--wide" aria-labelledby="review-engine-title">
        <h3 id="review-engine-title">3. 复盘洞察引擎</h3>
        <label class="field-control" for="review-engine-selection">
          引擎选择
          <select
            id="review-engine-selection"
            v-model="reviewEngineMode"
            data-testid="review-engine-select"
          >
            <option value="RULE_REVIEW_ONLY">规则复盘</option>
            <option value="RULE_REVIEW_WITH_LLM_INSIGHT">规则复盘 + 大模型洞察</option>
          </select>
        </label>

        <dl class="meta-list">
          <div>
            <dt>当前提交</dt>
            <dd>{{ reviewEngineMode }}</dd>
          </div>
          <div>
            <dt>结算边界</dt>
            <dd>结算结果由规则引擎生成，大模型仅提供解释和策略建议。</dd>
          </div>
          <div>
            <dt>Prompt 版本</dt>
            <dd>{{ isLlmReviewMode ? reviewPromptVersion : '未使用' }}</dd>
          </div>
        </dl>

        <template v-if="isLlmReviewMode">
          <div v-if="isLoadingProviders" class="state-panel" aria-live="polite">
            <span class="state-panel__spinner" aria-hidden="true"></span>
            <p>正在读取 Provider 状态</p>
          </div>

          <div v-if="providerErrorMessage" class="state-panel state-panel--error" role="alert">
            <strong>Provider 状态读取失败</strong>
            <p>{{ providerErrorMessage }}</p>
          </div>

          <div class="parameter-form" aria-label="复盘洞察模型参数">
            <label class="field-control" for="review-provider-selection">
              Provider
              <select
                id="review-provider-selection"
                v-model="selectedProviderKey"
                data-testid="review-provider-select"
                :disabled="isLoadingProviders"
                @change="handleProviderChange"
              >
                <option v-if="modelProviders.length === 0" value="openai">openai</option>
                <option
                  v-for="provider in modelProviders"
                  :key="provider.providerKey"
                  :value="provider.providerKey"
                >
                  {{ provider.displayName }} · {{ provider.providerKey }}
                </option>
              </select>
            </label>

            <label class="field-control" for="review-model-input">
              模型
              <input
                id="review-model-input"
                v-model="selectedModelId"
                data-testid="review-model-input"
                type="text"
              />
              <span>留空时使用 Provider 默认模型。</span>
            </label>

            <label class="field-control" for="review-prompt-version-input">
              Prompt 版本
              <input
                id="review-prompt-version-input"
                v-model="reviewPromptVersion"
                data-testid="review-prompt-version-input"
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
    </div>

    <section class="tool-panel" aria-labelledby="pending-review-title">
      <h3 id="pending-review-title">4. 待复盘方案</h3>
      <p class="helper-text">系统只扫描已保存且状态为 PENDING_RESULT 的模拟方案。</p>
      <button
        type="button"
        class="action-button"
        data-testid="match-settle-button"
        :disabled="isReviewing || !firstPendingPlan"
        @click="handleMatchAndSettle"
      >
        {{ isReviewing ? '复盘中...' : '匹配赛果并结算首个方案' }}
      </button>

      <div v-if="isLoadingPending" class="state-panel" aria-live="polite">
        <span class="state-panel__spinner" aria-hidden="true"></span>
        <p>正在加载待复盘方案...</p>
      </div>
      <div v-else-if="pendingPlans.length === 0" class="state-panel">
        <div>
          <strong>暂无待复盘方案</strong>
          <p>保存模拟方案并同步 Mock 赛果源后，可在这里执行自动复盘。</p>
        </div>
      </div>

      <div v-else class="link-table-wrap">
        <table class="link-table workflow-table">
          <caption>
            PENDING_RESULT 模拟方案列表。
          </caption>
          <thead>
            <tr>
              <th scope="col">方案</th>
              <th scope="col">状态</th>
              <th scope="col">报告</th>
              <th scope="col">明细数</th>
              <th scope="col">更新时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="plan in pendingPlans" :key="plan.planId">
              <td>{{ plan.planId }}</td>
              <td>{{ plan.planStatus }}</td>
              <td>{{ plan.reportId }}</td>
              <td>{{ plan.itemCount }}</td>
              <td>{{ plan.updatedAt }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="matchResult" class="tool-panel" aria-labelledby="match-result-title">
      <h3 id="match-result-title">匹配结果</h3>
      <dl class="meta-list">
        <div>
          <dt>方案</dt>
          <dd>{{ matchResult.planId }}</dd>
        </div>
        <div>
          <dt>匹配状态</dt>
          <dd>{{ matchResult.matchStatus }}</dd>
        </div>
        <div>
          <dt>匹配置信度</dt>
          <dd>{{ matchResult.matchConfidence }}</dd>
        </div>
      </dl>

      <div class="link-table-wrap">
        <table class="link-table workflow-table">
          <caption>
            赛果匹配候选表。
          </caption>
          <thead>
            <tr>
              <th scope="col">候选</th>
              <th scope="col">方案明细</th>
              <th scope="col">比赛</th>
              <th scope="col">状态</th>
              <th scope="col">来源</th>
              <th scope="col">置信度</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="candidate in matchResult.candidates" :key="candidate.candidateId">
              <td>{{ candidate.candidateId }}</td>
              <td>{{ candidate.planItemId }}</td>
              <td>{{ candidate.matchId }}</td>
              <td>{{ candidate.matchStatus }}</td>
              <td>
                {{ candidate.sourceName }}
                <span>{{ candidate.sourceUrl }}</span>
              </td>
              <td>{{ candidate.confidence }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="reviewRecord" class="tool-panel" aria-labelledby="review-result-title">
      <h3 id="review-result-title">复盘结果</h3>
      <dl class="meta-list">
        <div>
          <dt>方案</dt>
          <dd>{{ reviewRecord.planId }}</dd>
        </div>
        <div>
          <dt>复盘状态</dt>
          <dd>{{ reviewRecord.reviewStatus }}</dd>
        </div>
        <div>
          <dt>复盘引擎</dt>
          <dd>{{ reviewRecord.reviewEngineType ?? 'RULE_REVIEW_ONLY' }}</dd>
        </div>
        <div>
          <dt>失败原因</dt>
          <dd>{{ reviewRecord.failureReasons.join(', ') || '无' }}</dd>
        </div>
        <div v-if="reviewRecord.providerKey">
          <dt>Provider</dt>
          <dd>{{ reviewRecord.providerKey }}</dd>
        </div>
        <div v-if="reviewRecord.modelId">
          <dt>模型</dt>
          <dd>{{ reviewRecord.modelId }}</dd>
        </div>
        <div v-if="reviewRecord.promptVersion">
          <dt>Prompt</dt>
          <dd>{{ reviewRecord.promptVersion }}</dd>
        </div>
        <div v-if="reviewRecord.safetyStatus">
          <dt>安全状态</dt>
          <dd>{{ reviewRecord.safetyStatus }}</dd>
        </div>
        <div v-if="reviewRecord.providerKey">
          <dt>审计记录</dt>
          <dd>{{ reviewRecord.llmAuditId ?? '待审计落库' }}</dd>
        </div>
        <div v-if="reviewRecord.resultSource">
          <dt>赛果来源</dt>
          <dd>
            {{ reviewRecord.resultSource.sourceName }} · {{ reviewRecord.resultSource.sourceLicense }}
          </dd>
        </div>
        <div v-if="reviewRecord.resultSource">
          <dt>获取时间</dt>
          <dd>{{ reviewRecord.resultSource.fetchedAt }}</dd>
        </div>
      </dl>

      <div class="link-table-wrap">
        <table class="link-table workflow-table">
          <caption>
            结算明细表。命中状态使用文字展示，不只依赖颜色。
          </caption>
          <thead>
            <tr>
              <th scope="col">明细</th>
              <th scope="col">比赛</th>
              <th scope="col">模拟方向</th>
              <th scope="col">实际结果</th>
              <th scope="col">状态</th>
              <th scope="col">原因</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in reviewRecord.itemSettlements" :key="item.planItemId">
              <td>{{ item.planItemId }}</td>
              <td>{{ item.matchId }}</td>
              <td>{{ item.selection }}</td>
              <td>{{ item.actualOutcome ?? '待确认' }}</td>
              <td>{{ item.settlementStatus }}</td>
              <td>{{ item.failureReason ?? '无' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="link-table-wrap">
        <table class="link-table workflow-table">
          <caption>
            策略修正规则表。
          </caption>
          <thead>
            <tr>
              <th scope="col">规则</th>
              <th scope="col">原因</th>
              <th scope="col">说明</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="rule in reviewRecord.strategyRevisionRules" :key="rule.ruleCode">
              <td>{{ rule.ruleCode }}</td>
              <td>{{ rule.reasonCode }}</td>
              <td>{{ rule.suggestion }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="llmInsight" class="tool-panel" aria-labelledby="llm-review-title">
      <h3 id="llm-review-title">大模型复盘洞察</h3>
      <dl class="meta-list">
        <div>
          <dt>边界声明</dt>
          <dd>{{ llmInsight.settlementAuthorityNotice ?? '规则结算已锁定' }}</dd>
        </div>
        <div v-if="llmInsight.complianceNotice">
          <dt>合规声明</dt>
          <dd>{{ llmInsight.complianceNotice }}</dd>
        </div>
      </dl>

      <div v-if="ticketReviewNarratives.length > 0" class="link-table-wrap">
        <table class="link-table workflow-table">
          <caption>
            每张票解释。
          </caption>
          <thead>
            <tr>
              <th scope="col">明细</th>
              <th scope="col">解释</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in ticketReviewNarratives" :key="item.planItemId ?? item.narrative">
              <td>{{ item.planItemId ?? '未指定' }}</td>
              <td>{{ item.narrative ?? '未提供' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="failureClassifications.length > 0" class="link-table-wrap">
        <table class="link-table workflow-table">
          <caption>
            失败归因。
          </caption>
          <thead>
            <tr>
              <th scope="col">原因</th>
              <th scope="col">分类</th>
              <th scope="col">说明</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in failureClassifications" :key="item.reasonCode ?? item.category">
              <td>{{ item.reasonCode ?? '未指定' }}</td>
              <td>{{ item.category ?? '未分类' }}</td>
              <td>{{ item.explanation ?? '未提供' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="reviewStrategySuggestions.length > 0" class="link-table-wrap">
        <table class="link-table workflow-table">
          <caption>
            下一轮策略修正规则。
          </caption>
          <thead>
            <tr>
              <th scope="col">规则</th>
              <th scope="col">建议</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in reviewStrategySuggestions" :key="item.ruleCode ?? item.suggestion">
              <td>{{ item.ruleCode ?? '未指定' }}</td>
              <td>{{ item.suggestion ?? '未提供' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <dl v-if="nextRoundParameterSuggestions.length > 0" class="meta-list">
        <div v-for="item in nextRoundParameterSuggestions" :key="item.key">
          <dt>{{ item.key }}</dt>
          <dd>{{ item.value }}</dd>
        </div>
      </dl>

      <ul v-if="doNotOverreactEvents.length > 0" class="check-list">
        <li v-for="event in doNotOverreactEvents" :key="event">{{ event }}</li>
      </ul>
    </section>

    <section v-if="status" class="tool-panel" aria-labelledby="provider-metadata-title">
      <h3 id="provider-metadata-title">来源元数据</h3>
      <dl class="meta-list">
        <div>
          <dt>sourceName</dt>
          <dd>{{ status.sourceName }}</dd>
        </div>
        <div>
          <dt>sourceUrl</dt>
          <dd>{{ status.sourceUrl }}</dd>
        </div>
        <div>
          <dt>sourceLicense</dt>
          <dd>{{ status.sourceLicense }}</dd>
        </div>
        <div>
          <dt>fetchedAt</dt>
          <dd>{{ status.lastFetchedAt ?? '待同步' }}</dd>
        </div>
      </dl>
      <p class="helper-text">{{ status.complianceNotice }}</p>
    </section>

    <section class="tool-panel" aria-labelledby="result-snapshot-title">
      <h3 id="result-snapshot-title">赛果快照</h3>
      <div v-if="snapshots.length === 0" class="state-panel">
        <div>
          <strong>暂无赛果快照</strong>
          <p>点击“同步 Mock 公开赛果源”后，这里会展示虚构公开赛果。</p>
        </div>
      </div>

      <div v-else class="link-table-wrap">
        <table class="link-table workflow-table">
          <caption>
            Mock 公开赛果快照表。
          </caption>
          <thead>
            <tr>
              <th scope="col">比赛</th>
              <th scope="col">比分</th>
              <th scope="col">状态</th>
              <th scope="col">来源</th>
              <th scope="col">许可</th>
              <th scope="col">获取时间</th>
              <th scope="col">置信度</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="snapshot in snapshots" :key="snapshot.resultSnapshotId">
              <td>
                {{ snapshot.homeTeam }} vs {{ snapshot.awayTeam }}
                <span>{{ snapshot.league }} · {{ snapshot.kickoffTime }}</span>
              </td>
              <td>{{ snapshot.homeScore }} - {{ snapshot.awayScore }}</td>
              <td>{{ snapshot.resultStatus }}</td>
              <td>
                {{ snapshot.sourceName }}
                <span>{{ snapshot.sourceUrl }}</span>
              </td>
              <td>{{ snapshot.sourceLicense }}</td>
              <td>{{ snapshot.fetchedAt }}</td>
              <td>{{ snapshot.confidence }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </section>
</template>
