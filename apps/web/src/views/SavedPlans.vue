<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, type RouteLocationRaw } from 'vue-router';

import { ApiRequestError } from '@/api/http';
import { getSimulatedPlan, saveSimulatedPlan, simulateStrategy } from '@/api/simulatedPlans';
import { useOcrWorkflowStore } from '@/stores/ocrWorkflow';
import { useSimulatedPlanStore } from '@/stores/simulatedPlan';
import type {
  SimulatedPlan,
  SimulatedPlanSavePayload,
  StrategySimulationPayload,
} from '@/types/simulatedPlan';
import {
  clearPendingWrite,
  readPendingWrite,
  savePendingWrite,
  type PendingWriteOperation,
} from '@/workflow/workflowSession';

const props = defineProps<{ planId?: string }>();
const workflowStore = useOcrWorkflowStore();
const planStore = useSimulatedPlanStore();
const displayedPlan = ref<SimulatedPlan | null>(null);
const pendingWrite = ref<PendingWriteOperation | null>(null);
const operatorNote = ref('');
const isGenerating = ref(false);
const isSaving = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
let routePlanSyncToken = 0;

const workflow = computed(() => workflowStore.workflow);
const reportId = computed(() => workflow.value?.currentReportId ?? null);
const selectedPlan = computed(() => displayedPlan.value);
const analysisRoute = computed<RouteLocationRaw>(() => (
  workflowStore.activeWorkflowId === null
    ? '/strategy-simulator'
    : { name: 'WorkflowAnalysis', params: { workflowId: workflowStore.activeWorkflowId } }
));
const pendingHint = computed(() => {
  if (pendingWrite.value === null) return '';
  return pendingWrite.value.recoveryState === 'SAME_KEY_REQUIRED'
    ? '上次响应未知或操作仍在进行；点击对应按钮会使用同一 Idempotency-Key 明确恢复。'
    : '上次操作失败或中断；点击对应按钮会明确创建新的 Idempotency-Key。';
});
const canGenerate = computed(() => reportId.value !== null && workflow.value?.currentPlanId === null);
const canSave = computed(() => selectedPlan.value !== null
  && selectedPlan.value.planStatus === 'GENERATED'
  && workflow.value?.currentPlanId === selectedPlan.value.planId);
const hasFrozenSavePending = computed(() => pendingWrite.value?.operationType === 'SAVE_PLAN');

onMounted(() => {
  void initializePage();
});
watch(() => props.planId, () => {
  void synchronizeRoutePlan(false);
});

async function initializePage() {
  const current = workflow.value;
  if (current === null) return;
  pendingWrite.value = readPendingWrite(current.workflowId);
  if (pendingWrite.value?.operationType === 'GENERATE_ANALYSIS'
    && current.currentReportId !== null) {
    clearPendingWrite(current.workflowId);
    pendingWrite.value = null;
  }
  await synchronizeRoutePlan(true);
}

async function synchronizeRoutePlan(clearProvenPending: boolean) {
  const token = ++routePlanSyncToken;
  const current = workflow.value;
  displayedPlan.value = null;
  errorMessage.value = '';
  if (current === null) return;
  if (props.planId !== undefined && props.planId !== current.currentPlanId) {
    errorMessage.value = '深链 planId 与工作流 currentPlanId 不匹配，已拒绝加载。';
    return;
  }
  if (current.currentPlanId === null) return;
  const requestedPlanId = current.currentPlanId;
  try {
    const restored = await restorePlan(requestedPlanId, token, false);
    if (token !== routePlanSyncToken) return;
    const saveProvenComplete = restored.planStatus === 'PENDING_RESULT'
      || current.currentStage === 'PENDING_RESULT';
    const pendingProvenComplete = clearProvenPending
      && (pendingWrite.value?.operationType !== 'SAVE_PLAN'
      || saveProvenComplete);
    if (pendingProvenComplete) {
      clearPendingWrite(current.workflowId);
      pendingWrite.value = null;
    } else if (pendingWrite.value?.operationType === 'SAVE_PLAN' && !saveProvenComplete) {
      operatorNote.value = pendingWrite.value.request.operatorNote;
    }
  } catch (error) {
    if (token !== routePlanSyncToken) return;
    errorMessage.value = describeError(error, '模拟方案恢复失败');
  }
}

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;
}

function recoveryId(error: ApiRequestError): string | null {
  const value = error.recovery.currentPlanId;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
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

function assertPlanLineage(candidate: SimulatedPlan, expectedPlanId: string): void {
  const current = workflow.value;
  const snapshotId = candidate.snapshotId ?? candidate.snapshot.snapshotId;
  if (current === null
    || candidate.planId !== expectedPlanId
    || candidate.reportId !== current.currentReportId
    || snapshotId !== current.confirmedSnapshotId
    || candidate.snapshot.reportId !== current.currentReportId
    || candidate.snapshot.snapshotId !== current.confirmedSnapshotId) {
    throw new Error('方案与当前 workflow/report/snapshot 不匹配，已拒绝缓存。');
  }
}

function routeAllowsPlanDisplay(planId: string, expectedRouteToken: number): boolean {
  return expectedRouteToken === routePlanSyncToken
    && workflow.value?.currentPlanId === planId
    && (props.planId === undefined || props.planId === planId);
}

async function restorePlan(
  planId: string,
  expectedRouteToken: number,
  cacheWhenRouteChanged = true,
): Promise<SimulatedPlan> {
  const restored = await getSimulatedPlan(planId);
  assertPlanLineage(restored, planId);
  const mayDisplay = routeAllowsPlanDisplay(planId, expectedRouteToken);
  if (mayDisplay || cacheWhenRouteChanged) planStore.cachePlan(restored);
  if (mayDisplay) {
    displayedPlan.value = restored;
    operatorNote.value = restored.operatorNote ?? operatorNote.value;
  }
  return restored;
}

async function refreshAndRestorePlan(expectedRouteToken: number): Promise<void> {
  const refreshed = await workflowStore.refreshActiveWorkflow();
  const authoritativePlanId = refreshed?.currentPlanId ?? null;
  if (authoritativePlanId === null) throw new Error('工作流未返回权威方案 ID。');
  await restorePlan(authoritativePlanId, expectedRouteToken);
}

async function recoverAlready(error: ApiRequestError, expectedRouteToken: number): Promise<boolean> {
  if (!['PLAN_ALREADY_GENERATED', 'PLAN_ALREADY_SAVED'].includes(error.errorCode)) return false;
  const planId = recoveryId(error);
  if (planId === null) return false;
  const refreshed = await workflowStore.refreshActiveWorkflow();
  if (refreshed?.currentPlanId !== planId) {
    throw new Error('恢复方案 ID 与工作流 currentPlanId 不一致。');
  }
  await restorePlan(planId, expectedRouteToken);
  const current = workflow.value;
  if (current !== null) clearPendingWrite(current.workflowId);
  pendingWrite.value = null;
  return true;
}

async function handleGeneratePlan() {
  const current = workflow.value;
  if (current === null || current.currentReportId === null || current.currentPlanId !== null) return;
  isGenerating.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  const existing = readPendingWrite(current.workflowId);
  const sameKeyReplay = existing?.operationType === 'GENERATE_PLAN'
    && existing.recoveryState === 'SAME_KEY_REQUIRED';
  const request: StrategySimulationPayload = sameKeyReplay
    ? existing.request
    : { reportId: current.currentReportId };
  const idempotencyKey = sameKeyReplay ? existing.idempotencyKey : globalThis.crypto.randomUUID();
  const durable: PendingWriteOperation = {
    operationType: 'GENERATE_PLAN',
    workflowId: current.workflowId,
    idempotencyKey,
    request,
    recoveryState: 'SAME_KEY_REQUIRED',
    errorCode: null,
  };
  savePendingWrite(durable);
  pendingWrite.value = readPendingWrite(current.workflowId);
  const expectedRouteToken = routePlanSyncToken;
  let mutationSucceeded = false;

  try {
    await simulateStrategy(request, idempotencyKey);
    mutationSucceeded = true;
    await refreshAndRestorePlan(expectedRouteToken);
    clearPendingWrite(current.workflowId);
    pendingWrite.value = null;
    successMessage.value = '模拟方案已生成；保存仍需单独确认。';
  } catch (error) {
    if (!mutationSucceeded && error instanceof ApiRequestError) {
      try {
        if (await recoverAlready(error, expectedRouteToken)) return;
      } catch (recoveryError) {
        errorMessage.value = describeError(recoveryError, '已生成方案恢复失败');
        return;
      }
    }
    const classification = mutationSucceeded
      ? { state: 'SAME_KEY_REQUIRED' as const, code: 'UNKNOWN_RESPONSE' }
      : classifyPending(error);
    savePendingWrite({ ...durable, recoveryState: classification.state, errorCode: classification.code });
    pendingWrite.value = readPendingWrite(current.workflowId);
    errorMessage.value = describeError(error, '模拟方案生成失败');
  } finally {
    isGenerating.value = false;
  }
}

async function handleSavePlan() {
  const current = workflow.value;
  const plan = selectedPlan.value;
  if (current === null || plan === null || !canSave.value) return;
  isSaving.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  const existing = readPendingWrite(current.workflowId);
  const existingSave = existing?.operationType === 'SAVE_PLAN' ? existing : null;
  const sameKeyReplay = existingSave?.recoveryState === 'SAME_KEY_REQUIRED';
  const request: SimulatedPlanSavePayload = existingSave?.request
    ?? { generatedPlanId: plan.planId, operatorNote: operatorNote.value.trim() };
  const idempotencyKey = sameKeyReplay && existingSave !== null
    ? existingSave.idempotencyKey
    : globalThis.crypto.randomUUID();
  const durable: PendingWriteOperation = {
    operationType: 'SAVE_PLAN',
    workflowId: current.workflowId,
    idempotencyKey,
    request,
    recoveryState: 'SAME_KEY_REQUIRED',
    errorCode: null,
  };
  savePendingWrite(durable);
  pendingWrite.value = readPendingWrite(current.workflowId);
  const expectedRouteToken = routePlanSyncToken;
  let mutationSucceeded = false;

  try {
    await saveSimulatedPlan(request, idempotencyKey);
    mutationSucceeded = true;
    await refreshAndRestorePlan(expectedRouteToken);
    clearPendingWrite(current.workflowId);
    pendingWrite.value = null;
    successMessage.value = '模拟方案已保存并进入 PENDING_RESULT。';
  } catch (error) {
    if (!mutationSucceeded && error instanceof ApiRequestError) {
      try {
        if (await recoverAlready(error, expectedRouteToken)) return;
      } catch (recoveryError) {
        errorMessage.value = describeError(recoveryError, '已保存方案恢复失败');
        return;
      }
    }
    const classification = mutationSucceeded
      ? { state: 'SAME_KEY_REQUIRED' as const, code: 'UNKNOWN_RESPONSE' }
      : classifyPending(error);
    savePendingWrite({ ...durable, recoveryState: classification.state, errorCode: classification.code });
    pendingWrite.value = readPendingWrite(current.workflowId);
    errorMessage.value = describeError(error, '模拟方案保存失败');
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <section class="workflow-page" aria-labelledby="saved-plans-title">
    <div class="page-heading">
      <div>
        <p class="page-heading__eyebrow">SavedPlans</p>
        <h2 id="saved-plans-title">权威报告生成模拟方案</h2>
      </div>
      <p class="page-heading__notice">非官方 · 生成与保存分离 · 等待公开赛果复盘</p>
    </div>

    <div class="policy-panel" role="note">
      <strong>阶段边界</strong>
      <p>浏览器只提交权威 reportId；方案明细只从 currentPlanId 对应的服务端详情恢复，不从内存报告重建。</p>
    </div>

    <div v-if="!workflow || !reportId" class="state-panel">
      <div><strong>缺少权威分析报告</strong><p>请先生成并恢复当前工作流的分析报告。</p></div>
      <RouterLink class="external-link" :to="analysisRoute">返回 AI 分析</RouterLink>
    </div>

    <template v-else>
      <div class="workflow-grid">
        <section class="tool-panel">
          <h3>1. 当前权威链路</h3>
          <dl class="meta-list">
            <div><dt>工作流</dt><dd>{{ workflow.workflowId }}</dd></div>
            <div><dt>快照</dt><dd>{{ workflow.confirmedSnapshotId }}</dd></div>
            <div><dt>报告</dt><dd>{{ reportId }}</dd></div>
            <div><dt>方案</dt><dd>{{ workflow.currentPlanId ?? '尚未生成' }}</dd></div>
          </dl>
          <button
            v-if="canGenerate"
            type="button"
            class="action-button"
            data-testid="generate-plan-button"
            :disabled="isGenerating"
            @click="handleGeneratePlan"
          >
            {{ isGenerating ? '处理中...' : pendingWrite?.operationType === 'GENERATE_PLAN' ? '恢复/重试生成' : '生成模拟方案' }}
          </button>
        </section>

        <section class="tool-panel">
          <h3>2. 显式保存</h3>
          <label class="field-control" for="operator-note-input">
            操作备注
            <textarea
              id="operator-note-input"
              v-model="operatorNote"
              data-testid="operator-note-input"
              :disabled="hasFrozenSavePending"
            ></textarea>
          </label>
          <p v-if="hasFrozenSavePending" class="helper-text">
            恢复将提交冻结备注；如需修改备注，需先完成恢复。
          </p>
          <button
            v-if="canSave"
            type="button"
            class="action-button"
            data-testid="save-plan-button"
            :disabled="isSaving"
            @click="handleSavePlan"
          >
            {{ isSaving ? '保存中...' : pendingWrite?.operationType === 'SAVE_PLAN' ? '恢复/重试保存' : '保存模拟方案' }}
          </button>
          <p v-if="pendingHint" class="helper-text" data-testid="plan-pending-hint">{{ pendingHint }}</p>
          <div v-if="errorMessage" class="state-panel state-panel--error" role="alert"><p>{{ errorMessage }}</p></div>
          <div v-if="successMessage" class="state-panel state-panel--success" role="status"><p>{{ successMessage }}</p></div>
        </section>
      </div>

      <section v-if="selectedPlan" class="report-section" aria-live="polite">
        <section class="tool-panel">
          <h3>方案详情</h3>
          <dl class="meta-list">
            <div><dt>方案</dt><dd>{{ selectedPlan.planId }}</dd></div>
            <div><dt>状态</dt><dd>{{ selectedPlan.planStatus }}</dd></div>
            <div><dt>状态流</dt><dd>{{ selectedPlan.statusFlow.join(' -> ') }}</dd></div>
          </dl>
          <p class="helper-text">{{ selectedPlan.complianceNotice }}</p>
        </section>
        <section class="tool-panel">
          <h3>服务端方案明细</h3>
          <div class="link-table-wrap">
            <table class="link-table workflow-table">
              <thead><tr><th>明细</th><th>比赛</th><th>玩法</th><th>方向</th><th>状态</th></tr></thead>
              <tbody>
                <tr v-for="item in selectedPlan.items" :key="item.planItemId">
                  <td>{{ item.planItemId }}</td><td>{{ item.matchId }}</td><td>{{ item.playType }}</td><td>{{ item.selection }}</td><td>{{ item.itemStatus }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </template>
  </section>
</template>
