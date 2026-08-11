<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { listSimulatedPlans, saveSimulatedPlan, simulateStrategy } from '@/api/simulatedPlans';
import { useAnalysisReportStore } from '@/stores/analysisReport';
import { useSimulatedPlanStore } from '@/stores/simulatedPlan';
import { toStrategySimulationPayload } from '@/types/simulatedPlan';
import type { SimulatedPlan } from '@/types/simulatedPlan';

const analysisReportStore = useAnalysisReportStore();
const simulatedPlanStore = useSimulatedPlanStore();
const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const report = computed(() => analysisReportStore.currentReport);
const savedPlans = computed(() => simulatedPlanStore.savedPlans);
const selectedPlan = computed(() => simulatedPlanStore.currentPlan);
const generatedPlan = computed(() => simulatedPlanStore.generatedPlan);

onMounted(() => {
  void loadSavedPlans();
});

async function loadSavedPlans() {
  isLoading.value = true;
  errorMessage.value = '';

  try {
    const plans = await listSimulatedPlans();
    simulatedPlanStore.setSavedPlans(plans);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '模拟方案列表加载失败';
  } finally {
    isLoading.value = false;
  }
}

async function handleGenerateAndSave() {
  if (!report.value) {
    return;
  }

  isSaving.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    const plan = await simulateStrategy(toStrategySimulationPayload(report.value));
    simulatedPlanStore.setGeneratedPlan(plan);

    const savedPlan = await saveSimulatedPlan({
      generatedPlanId: plan.planId,
      operatorNote: '保存为等待公开赛果阶段的模拟方案。'
    });
    simulatedPlanStore.upsertSavedPlan(savedPlan);
    successMessage.value = '模拟方案已保存，当前状态为 PENDING_RESULT。';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '模拟方案生成或保存失败';
  } finally {
    isSaving.value = false;
  }
}

function statusFlowText(plan: SimulatedPlan) {
  return plan.statusFlow.join(' -> ');
}

function formatAmount(amount?: number | null, currency?: string | null) {
  if (amount === null || amount === undefined) {
    return '未设置';
  }
  return `${amount} ${currency ?? ''}`.trim();
}

function selectPlan(plan: SimulatedPlan) {
  simulatedPlanStore.setCurrentPlan(plan);
}
</script>

<template>
  <section class="workflow-page" aria-labelledby="saved-plans-title">
    <div class="page-heading">
      <div>
        <p class="page-heading__eyebrow">SavedPlans</p>
        <h2 id="saved-plans-title">模拟方案生成与保存</h2>
      </div>
      <p class="page-heading__notice">非官方 · 仅保存模拟方案 · 等待公开赛果复盘</p>
    </div>

    <div class="policy-panel" role="note">
      <strong>阶段边界</strong>
      <p>
        本阶段只把已生成的分析报告转为 simulated_plan、simulated_plan_item、simulated_plan_snapshot
        三类结构，并将状态推进到 PENDING_RESULT。
      </p>
    </div>

    <div v-if="!report" class="state-panel">
      <div>
        <strong>缺少分析报告</strong>
        <p>请先完成 AI 分析 Mock，生成 reportStatus 为 GENERATED 的报告。</p>
      </div>
      <RouterLink class="external-link" to="/strategy-simulator">返回 AI 分析</RouterLink>
    </div>

    <template v-else>
      <div class="workflow-grid">
        <section class="tool-panel" aria-labelledby="plan-input-title">
          <h3 id="plan-input-title">1. 当前分析报告</h3>
          <dl class="meta-list">
            <div>
              <dt>报告</dt>
              <dd>{{ report.reportId }}</dd>
            </div>
            <div>
              <dt>快照</dt>
              <dd>{{ report.snapshotId }}</dd>
            </div>
            <div>
              <dt>来源</dt>
              <dd>{{ report.inputSourceType }}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>{{ report.reportStatus }}</dd>
            </div>
          </dl>

          <button
            type="button"
            class="action-button"
            data-testid="generate-save-plan-button"
            :disabled="isSaving"
            @click="handleGenerateAndSave"
          >
            {{ isSaving ? '保存中...' : '生成并保存模拟方案' }}
          </button>
        </section>

        <section class="tool-panel" aria-labelledby="plan-status-title">
          <h3 id="plan-status-title">2. 保存状态</h3>
          <div v-if="isLoading" class="state-panel" aria-live="polite">
            <span class="state-panel__spinner" aria-hidden="true"></span>
            <p>正在加载已保存模拟方案...</p>
          </div>
          <div v-if="errorMessage" class="state-panel state-panel--error" role="alert">
            <strong>操作失败</strong>
            <p>{{ errorMessage }}</p>
          </div>
          <div v-if="successMessage" class="state-panel state-panel--success" role="status">
            <strong>保存完成</strong>
            <p>{{ successMessage }}</p>
          </div>
          <dl v-if="generatedPlan" class="meta-list">
            <div>
              <dt>生成方案</dt>
              <dd>{{ generatedPlan.planId }}</dd>
            </div>
            <div>
              <dt>生成状态</dt>
              <dd>{{ generatedPlan.planStatus }}</dd>
            </div>
          </dl>
          <RouterLink class="external-link" to="/review-center">查看 Mock 赛果源</RouterLink>
        </section>
      </div>

      <section class="tool-panel" aria-labelledby="saved-list-title">
        <h3 id="saved-list-title">已保存模拟方案</h3>
        <div v-if="savedPlans.length === 0 && !isLoading" class="state-panel">
          <div>
            <strong>暂无保存记录</strong>
            <p>点击“生成并保存模拟方案”后，这里会展示 PENDING_RESULT 记录。</p>
          </div>
        </div>

        <div v-else class="link-table-wrap">
          <table class="link-table workflow-table">
            <caption>
              模拟方案列表。状态流转使用文字展示，不只依赖颜色。
            </caption>
            <thead>
              <tr>
                <th scope="col">方案</th>
                <th scope="col">状态</th>
                <th scope="col">状态流转</th>
                <th scope="col">明细</th>
                <th scope="col">更新时间</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="plan in savedPlans" :key="plan.planId">
                <td>{{ plan.planId }}</td>
                <td>{{ plan.planStatus }}</td>
                <td>{{ statusFlowText(plan) }}</td>
                <td>{{ plan.items.length }} 项</td>
                <td>{{ plan.updatedAt }}</td>
                <td>
                  <button type="button" class="text-button" @click="selectPlan(plan)">查看</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="selectedPlan" class="report-section" aria-live="polite">
        <section class="tool-panel" aria-labelledby="plan-detail-title">
          <h3 id="plan-detail-title">方案详情</h3>
          <dl class="meta-list">
            <div>
              <dt>方案类型</dt>
              <dd>{{ selectedPlan.planType }}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>{{ selectedPlan.planStatus }}</dd>
            </div>
            <div>
              <dt>预算</dt>
              <dd>{{ formatAmount(selectedPlan.budgetAmount, selectedPlan.currency) }}</dd>
            </div>
            <div>
              <dt>快照状态</dt>
              <dd>{{ selectedPlan.snapshot.snapshotStatus }}</dd>
            </div>
          </dl>
          <p class="helper-text">{{ selectedPlan.complianceNotice }}</p>
        </section>

        <section class="tool-panel" aria-labelledby="plan-item-title">
          <h3 id="plan-item-title">方案明细</h3>
          <div class="link-table-wrap">
            <table class="link-table workflow-table">
              <caption>
                模拟方案明细表。
              </caption>
              <thead>
                <tr>
                  <th scope="col">明细</th>
                  <th scope="col">比赛</th>
                  <th scope="col">玩法</th>
                  <th scope="col">方向</th>
                  <th scope="col">赔率</th>
                  <th scope="col">模拟预算</th>
                  <th scope="col">状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in selectedPlan.items" :key="item.planItemId">
                  <td>{{ item.planItemId }}</td>
                  <td>{{ item.matchId }}</td>
                  <td>{{ item.playType }}</td>
                  <td>{{ item.selection }}</td>
                  <td>{{ item.odds }}</td>
                  <td>{{ item.stakeAmount }}</td>
                  <td>{{ item.itemStatus }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </template>
  </section>
</template>
