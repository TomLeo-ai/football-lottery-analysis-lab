<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { RouterLink, type RouteLocationRaw } from 'vue-router';

import { generateAnalysis, getAnalysisReport } from '@/api/analysis';
import { ApiRequestError } from '@/api/http';
import { useAnalysisReportStore } from '@/stores/analysisReport';
import { useOcrWorkflowStore } from '@/stores/ocrWorkflow';
import type { AnalysisGeneratePayload, AnalysisOptions, AnalysisReport } from '@/types/analysis';
import {
  clearPendingWrite,
  readPendingWrite,
  savePendingWrite,
  type PendingWriteOperation,
} from '@/workflow/workflowSession';

const FIXED_PROMPT_VERSION = 'danche-prediction-v1' as const;

const workflowStore = useOcrWorkflowStore();
const reportStore = useAnalysisReportStore();
const engineMode = ref<'MOCK_RULE_ENGINE' | 'OPENAI_COMPATIBLE'>('MOCK_RULE_ENGINE');
const providerKey = ref('');
const modelId = ref('');
const isGenerating = ref(false);
const errorMessage = ref('');
const pendingWrite = ref<PendingWriteOperation | null>(null);
const displayedReport = ref<AnalysisReport | null>(null);
const analysisOptions = reactive<Required<Omit<AnalysisOptions, 'minPayoutRequirement'>> & {
  minPayoutRequirement: number | null;
}>({
  targetTicketCount: 1,
  minTicketCount: 1,
  maxTicketCount: 1,
  mainTicketRatio: 0.6,
  defensiveTicketRatio: 0.3,
  entertainmentTicketRatio: 0.1,
  enableEntertainmentTicket: true,
  entertainmentTicketMaxCost: 2,
  maxParlayLegs: 1,
  minPayoutRequirement: null,
  allowLowReturnTicket: false,
  upsetCoverageLevel: 'BALANCED',
});

const workflow = computed(() => workflowStore.workflow);
const confirmedSnapshot = computed(() => workflowStore.confirmedSnapshot);
const report = computed(() => displayedReport.value);
const hasFrozenAnalysisPending = computed(() => (
  pendingWrite.value?.operationType === 'GENERATE_ANALYSIS'
));
const reviewRoute = computed<RouteLocationRaw>(() => (
  workflowStore.activeWorkflowId === null
    ? '/ocr-review'
    : { name: 'WorkflowOcrReview', params: { workflowId: workflowStore.activeWorkflowId } }
));
const pendingHint = computed(() => {
  if (pendingWrite.value?.operationType !== 'GENERATE_ANALYSIS') return '';
  return pendingWrite.value.recoveryState === 'SAME_KEY_REQUIRED'
    ? '上次响应未知或操作仍在进行；点击后将使用同一 Idempotency-Key 明确恢复。'
    : '上次操作已失败或中断；点击后将明确创建新的 Idempotency-Key。';
});

onMounted(() => {
  void initializePage();
});

async function initializePage() {
  const current = workflow.value;
  if (current === null) return;
  pendingWrite.value = readPendingWrite(current.workflowId);
  if (pendingWrite.value?.operationType === 'GENERATE_ANALYSIS') {
    projectPendingAnalysisRequest(pendingWrite.value.request);
  }
  if (current.currentReportId === null) return;
  try {
    await restoreReport(current.currentReportId);
    if (pendingWrite.value?.operationType === 'GENERATE_ANALYSIS') {
      clearPendingWrite(current.workflowId);
      pendingWrite.value = null;
    }
  } catch (error) {
    errorMessage.value = describeError(error, '分析报告恢复失败');
  }
}

function projectPendingAnalysisRequest(request: AnalysisGeneratePayload): void {
  engineMode.value = request.engineMode;
  if (request.engineMode === 'OPENAI_COMPATIBLE') {
    providerKey.value = request.providerKey;
    modelId.value = request.modelId;
  }
  if (request.analysisOptions !== null) Object.assign(analysisOptions, request.analysisOptions);
}

function buildOptions(): AnalysisOptions {
  return {
    targetTicketCount: Number(analysisOptions.targetTicketCount),
    minTicketCount: Number(analysisOptions.minTicketCount),
    maxTicketCount: Number(analysisOptions.maxTicketCount),
    mainTicketRatio: Number(analysisOptions.mainTicketRatio),
    defensiveTicketRatio: Number(analysisOptions.defensiveTicketRatio),
    entertainmentTicketRatio: Number(analysisOptions.entertainmentTicketRatio),
    enableEntertainmentTicket: analysisOptions.enableEntertainmentTicket,
    entertainmentTicketMaxCost: Number(analysisOptions.entertainmentTicketMaxCost),
    maxParlayLegs: Number(analysisOptions.maxParlayLegs),
    minPayoutRequirement: analysisOptions.minPayoutRequirement === null
      ? null
      : Number(analysisOptions.minPayoutRequirement),
    allowLowReturnTicket: analysisOptions.allowLowReturnTicket,
    upsetCoverageLevel: analysisOptions.upsetCoverageLevel,
  };
}

function buildRequest(): AnalysisGeneratePayload {
  if (confirmedSnapshot.value === null) throw new Error('缺少服务端确认快照。');
  const base = {
    snapshotId: confirmedSnapshot.value.snapshotId,
    analysisOptions: buildOptions(),
  };
  if (engineMode.value === 'MOCK_RULE_ENGINE') {
    return { ...base, engineMode: 'MOCK_RULE_ENGINE' };
  }
  const explicitProvider = providerKey.value.trim();
  const explicitModel = modelId.value.trim();
  if (explicitProvider.length === 0 || explicitModel.length === 0) {
    throw new Error('大模型分析必须明确填写 Provider 和模型。');
  }
  return {
    ...base,
    engineMode: 'OPENAI_COMPATIBLE',
    providerKey: explicitProvider,
    modelId: explicitModel,
    promptVersion: FIXED_PROMPT_VERSION,
  };
}

function assertReportLineage(candidate: AnalysisReport, expectedReportId: string): void {
  const current = workflow.value;
  if (current === null
    || candidate.reportId !== expectedReportId
    || candidate.workflowId !== current.workflowId
    || candidate.snapshotId !== current.confirmedSnapshotId) {
    throw new Error('报告与当前 workflow/snapshot 不匹配，已拒绝缓存。');
  }
}

async function restoreReport(reportId: string): Promise<AnalysisReport> {
  const restored = await getAnalysisReport(reportId);
  assertReportLineage(restored, reportId);
  reportStore.cacheReport(restored);
  displayedReport.value = restored;
  return restored;
}

async function refreshAndRestoreReport(expectedReportId: string): Promise<AnalysisReport> {
  const refreshed = await workflowStore.refreshActiveWorkflow();
  if (refreshed?.currentReportId !== expectedReportId) {
    throw new Error('刷新后的 currentReportId 与本次分析结果不一致。');
  }
  return restoreReport(expectedReportId);
}

function classifyPending(error: unknown): { state: 'SAME_KEY_REQUIRED' | 'NEW_KEY_REQUIRED'; code: string } {
  if (!(error instanceof ApiRequestError)) {
    return { state: 'SAME_KEY_REQUIRED', code: 'UNKNOWN_RESPONSE' };
  }
  if (['MALFORMED_RESPONSE', 'HTTP_ERROR', 'OPERATION_IN_PROGRESS'].includes(error.errorCode)) {
    return { state: 'SAME_KEY_REQUIRED', code: error.errorCode };
  }
  return { state: 'NEW_KEY_REQUIRED', code: error.errorCode };
}

function recoveryId(error: ApiRequestError, key: string): string | null {
  const value = error.recovery[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;
}

async function handleGenerateAnalysis() {
  const current = workflow.value;
  if (current === null || confirmedSnapshot.value === null || current.currentReportId !== null) return;
  isGenerating.value = true;
  errorMessage.value = '';

  const existing = readPendingWrite(current.workflowId);
  const existingAnalysis = existing?.operationType === 'GENERATE_ANALYSIS' ? existing : null;
  const sameKeyReplay = existingAnalysis?.recoveryState === 'SAME_KEY_REQUIRED';
  let request: AnalysisGeneratePayload;
  try {
    request = existingAnalysis?.request ?? buildRequest();
  } catch (error) {
    errorMessage.value = describeError(error, '分析请求无效');
    isGenerating.value = false;
    return;
  }
  const idempotencyKey = sameKeyReplay && existingAnalysis !== null
    ? existingAnalysis.idempotencyKey
    : globalThis.crypto.randomUUID();
  const durable: PendingWriteOperation = {
    operationType: 'GENERATE_ANALYSIS',
    workflowId: current.workflowId,
    idempotencyKey,
    request,
    recoveryState: 'SAME_KEY_REQUIRED',
    errorCode: null,
  };
  savePendingWrite(durable);
  pendingWrite.value = readPendingWrite(current.workflowId);
  let mutationSucceeded = false;

  try {
    const generated = await generateAnalysis(request, idempotencyKey);
    mutationSucceeded = true;
    await refreshAndRestoreReport(generated.reportId);
    clearPendingWrite(current.workflowId);
    pendingWrite.value = null;
  } catch (error) {
    if (error instanceof ApiRequestError && error.errorCode === 'ANALYSIS_ALREADY_GENERATED') {
      const reportId = recoveryId(error, 'currentReportId');
      if (reportId !== null) {
        try {
          await refreshAndRestoreReport(reportId);
          clearPendingWrite(current.workflowId);
          pendingWrite.value = null;
          return;
        } catch (recoveryError) {
          savePendingWrite({
            ...durable,
            recoveryState: 'SAME_KEY_REQUIRED',
            errorCode: 'UNKNOWN_RESPONSE',
          });
          pendingWrite.value = readPendingWrite(current.workflowId);
          errorMessage.value = describeError(recoveryError, '已生成报告恢复失败');
          return;
        }
      }
    }
    const classification = mutationSucceeded
      ? { state: 'SAME_KEY_REQUIRED' as const, code: 'UNKNOWN_RESPONSE' }
      : classifyPending(error);
    savePendingWrite({
      ...durable,
      recoveryState: classification.state,
      errorCode: classification.code,
    });
    pendingWrite.value = readPendingWrite(current.workflowId);
    errorMessage.value = describeError(error, '分析报告生成失败');
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
        <h2 id="strategy-simulator-title">权威快照分析</h2>
      </div>
      <p class="page-heading__notice">非官方 · 仅模拟分析/复盘 · 不构成确定性建议</p>
    </div>

    <div class="policy-panel" role="note">
      <strong>输入边界</strong>
      <p>比赛、市场、预算、币种和风险偏好只由服务端确认快照提供；浏览器只提交快照 ID、明确引擎与 12 项非权威分析选项。</p>
    </div>

    <div v-if="!confirmedSnapshot || !workflow" class="state-panel">
      <div>
        <strong>缺少已确认快照</strong>
        <p>请先完成 OCR 人工确认。</p>
      </div>
      <RouterLink class="external-link" :to="reviewRoute">返回人工确认</RouterLink>
    </div>

    <template v-else>
      <div class="workflow-grid">
        <section class="tool-panel" aria-labelledby="analysis-input-title">
          <h3 id="analysis-input-title">1. 服务端权威输入</h3>
          <dl class="meta-list">
            <div><dt>工作流</dt><dd>{{ workflow.workflowId }}</dd></div>
            <div><dt>快照</dt><dd>{{ confirmedSnapshot.snapshotId }}</dd></div>
            <div><dt>阶段</dt><dd>{{ workflow.currentStage }}</dd></div>
          </dl>
          <button
            v-if="workflow.currentReportId === null"
            type="button"
            class="action-button"
            data-testid="generate-analysis-button"
            :disabled="isGenerating"
            @click="handleGenerateAnalysis"
          >
            {{ isGenerating ? '处理中...' : pendingWrite?.recoveryState === 'NEW_KEY_REQUIRED' ? '使用新 Key 重试' : pendingWrite ? '恢复上次分析' : '生成分析报告' }}
          </button>
          <p v-if="pendingHint" class="helper-text" data-testid="analysis-pending-hint">{{ pendingHint }}</p>
          <p v-if="hasFrozenAnalysisPending" class="helper-text">
            恢复将提交冻结请求；如需修改参数，需先完成恢复。
          </p>
          <div v-if="errorMessage" class="state-panel state-panel--error" role="alert">
            <strong>分析未完成</strong>
            <p>{{ errorMessage }}</p>
          </div>
        </section>

        <section class="tool-panel" aria-labelledby="analysis-engine-title">
          <h3 id="analysis-engine-title">2. 明确选择引擎</h3>
          <label class="field-control" for="analysis-engine-selection">
            引擎
            <select id="analysis-engine-selection" v-model="engineMode" data-testid="analysis-engine-select" :disabled="hasFrozenAnalysisPending">
              <option value="MOCK_RULE_ENGINE">MOCK_RULE_ENGINE</option>
              <option value="OPENAI_COMPATIBLE">OPENAI_COMPATIBLE</option>
            </select>
          </label>
          <template v-if="engineMode === 'OPENAI_COMPATIBLE'">
            <label class="field-control" for="analysis-provider-input">
              Provider
              <input id="analysis-provider-input" v-model="providerKey" data-testid="analysis-provider-input" type="text" :disabled="hasFrozenAnalysisPending" />
            </label>
            <label class="field-control" for="analysis-model-input">
              模型
              <input id="analysis-model-input" v-model="modelId" data-testid="analysis-model-input" type="text" :disabled="hasFrozenAnalysisPending" />
            </label>
            <p class="helper-text">Prompt 固定为 {{ FIXED_PROMPT_VERSION }}；API Key 只由后端读取。</p>
          </template>
        </section>

        <section class="tool-panel tool-panel--wide" aria-labelledby="analysis-options-title">
          <h3 id="analysis-options-title">3. 本次分析选项</h3>
          <div class="parameter-form">
            <label class="field-control">目标票数<input v-model.number="analysisOptions.targetTicketCount" data-testid="option-target" type="number" :disabled="hasFrozenAnalysisPending" /></label>
            <label class="field-control">最少票数<input v-model.number="analysisOptions.minTicketCount" data-testid="option-min" type="number" :disabled="hasFrozenAnalysisPending" /></label>
            <label class="field-control">最多票数<input v-model.number="analysisOptions.maxTicketCount" data-testid="option-max" type="number" :disabled="hasFrozenAnalysisPending" /></label>
            <label class="field-control">主票占比<input v-model.number="analysisOptions.mainTicketRatio" data-testid="option-main-ratio" type="number" step="0.01" :disabled="hasFrozenAnalysisPending" /></label>
            <label class="field-control">防守占比<input v-model.number="analysisOptions.defensiveTicketRatio" data-testid="option-defensive-ratio" type="number" step="0.01" :disabled="hasFrozenAnalysisPending" /></label>
            <label class="field-control">娱乐占比<input v-model.number="analysisOptions.entertainmentTicketRatio" data-testid="option-entertainment-ratio" type="number" step="0.01" :disabled="hasFrozenAnalysisPending" /></label>
            <label class="field-control">娱乐成本上限<input v-model.number="analysisOptions.entertainmentTicketMaxCost" data-testid="option-entertainment-cost" type="number" step="0.01" :disabled="hasFrozenAnalysisPending" /></label>
            <label class="field-control">最大串关<input v-model.number="analysisOptions.maxParlayLegs" data-testid="option-max-legs" type="number" :disabled="hasFrozenAnalysisPending" /></label>
            <label class="field-control">最低回报<input v-model.number="analysisOptions.minPayoutRequirement" data-testid="option-min-payout" type="number" step="0.01" :disabled="hasFrozenAnalysisPending" /></label>
            <label class="field-control">防冷等级
              <select v-model="analysisOptions.upsetCoverageLevel" data-testid="option-upset" :disabled="hasFrozenAnalysisPending">
                <option value="NONE">NONE</option><option value="LIGHT">LIGHT</option><option value="BALANCED">BALANCED</option><option value="STRONG">STRONG</option>
              </select>
            </label>
            <label class="checkbox-control"><input v-model="analysisOptions.enableEntertainmentTicket" data-testid="option-entertainment-enabled" type="checkbox" :disabled="hasFrozenAnalysisPending" />启用娱乐票</label>
            <label class="checkbox-control"><input v-model="analysisOptions.allowLowReturnTicket" data-testid="option-low-return" type="checkbox" :disabled="hasFrozenAnalysisPending" />允许低回报票</label>
          </div>
        </section>
      </div>

      <section v-if="report" class="report-section" aria-live="polite">
        <section class="tool-panel">
          <h3>分析报告</h3>
          <dl class="meta-list">
            <div><dt>报告</dt><dd>{{ report.reportId }}</dd></div>
            <div><dt>工作流</dt><dd>{{ report.workflowId }}</dd></div>
            <div><dt>引擎</dt><dd>{{ report.engineType }}</dd></div>
            <div><dt>状态</dt><dd>{{ report.reportStatus }}</dd></div>
          </dl>
          <p class="helper-text">{{ report.complianceNotice }}</p>
        </section>
      </section>
    </template>
  </section>
</template>
