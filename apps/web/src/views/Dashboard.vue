<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, type RouteLocationRaw } from 'vue-router';

import { useAnalysisReportStore } from '@/stores/analysisReport';
import { useOcrWorkflowStore } from '@/stores/ocrWorkflow';
import { useResultProviderStore } from '@/stores/resultProvider';
import { useSimulatedPlanStore } from '@/stores/simulatedPlan';

const ocrWorkflowStore = useOcrWorkflowStore();
const analysisReportStore = useAnalysisReportStore();
const simulatedPlanStore = useSimulatedPlanStore();
const resultProviderStore = useResultProviderStore();
const currentReport = computed(() => {
  const reportId = ocrWorkflowStore.workflow?.currentReportId;
  return reportId ? analysisReportStore.getReport(reportId) : null;
});
const currentPlan = computed(() => {
  const planId = ocrWorkflowStore.workflow?.currentPlanId;
  return planId ? simulatedPlanStore.getPlan(planId) : null;
});
const currentReportId = computed(() => ocrWorkflowStore.workflow?.currentReportId ?? null);
const currentPlanId = computed(() => ocrWorkflowStore.workflow?.currentPlanId ?? null);
const analysisStatus = computed(() => currentReport.value?.reportStatus
  ?? (currentReportId.value ? ocrWorkflowStore.workflow?.currentStage : 'WAITING_CONFIRMED_SNAPSHOT'));
const planStatus = computed(() => currentPlan.value?.planStatus
  ?? (currentPlanId.value ? ocrWorkflowStore.workflow?.currentStage : 'WAITING_ANALYSIS_REPORT'));

function workflowRoute(targetName: string, fallback: string): RouteLocationRaw {
  return ocrWorkflowStore.activeWorkflowId === null
    ? fallback
    : { name: targetName, params: { workflowId: ocrWorkflowStore.activeWorkflowId } };
}

const dashboardRows = computed(() => [
  {
    name: '截图 OCR',
    status: ocrWorkflowStore.workflow?.currentStage ?? (ocrWorkflowStore.reviewDraft ? ocrWorkflowStore.reviewDraft.status : 'WAITING_INPUT'),
    path: '/screenshot-upload',
    next: '上传虚构截图并生成待确认字段'
  },
  {
    name: '人工确认',
    status: ocrWorkflowStore.confirmedSnapshot?.snapshotStatus ?? 'WAITING_USER_CONFIRMATION',
    path: workflowRoute('WorkflowOcrReview', '/ocr-review'),
    next: '确认 USER_SCREENSHOT_CONFIRMED 快照'
  },
  {
    name: 'AI 分析',
    status: analysisStatus.value,
    path: workflowRoute('WorkflowAnalysis', '/strategy-simulator'),
    next: '生成 Mock 规则引擎分析报告'
  },
  {
    name: '模拟方案',
    status: planStatus.value,
    path: workflowRoute('WorkflowPlans', '/saved-plans'),
    next: '保存为 PENDING_RESULT 模拟方案'
  },
  {
    name: '自动复盘',
    status: resultProviderStore.status?.syncStatus ?? 'WAITING_RESULT_SYNC',
    path: '/review-center',
    next: '同步 Mock 公开赛果并复盘'
  }
]);
</script>

<template>
  <section class="workflow-page" aria-labelledby="dashboard-title">
    <div class="page-heading">
      <div>
        <p class="page-heading__eyebrow">Dashboard</p>
        <h2 id="dashboard-title">闭环流程仪表盘</h2>
      </div>
      <p class="page-heading__notice">非官方 · 仅模拟分析/复盘 · 本地 Mock 闭环</p>
    </div>

    <div class="policy-panel" role="note">
      <strong>当前目标</strong>
      <p>
        仪表盘串联官方外链入口、虚构截图 OCR、人工确认、Mock 分析、模拟方案保存和自动复盘。
        页面只展示本地工作流状态，不展示官方具体赛事数据。
      </p>
    </div>

    <div class="workflow-grid">
      <section class="tool-panel" aria-labelledby="dashboard-summary-title">
        <h3 id="dashboard-summary-title">闭环状态</h3>
        <dl class="meta-list">
          <div>
            <dt>输入来源</dt>
            <dd>{{ ocrWorkflowStore.confirmedSnapshot?.sourceType ?? '等待人工确认' }}</dd>
          </div>
          <div>
            <dt>分析报告</dt>
            <dd>{{ currentReportId ?? '待生成' }}</dd>
          </div>
          <div>
            <dt>保存方案</dt>
            <dd>{{ currentPlanId ?? '待保存' }}</dd>
          </div>
          <div>
            <dt>赛果源</dt>
            <dd>{{ resultProviderStore.status?.providerName ?? '待同步 Mock 源' }}</dd>
          </div>
        </dl>
      </section>

      <section class="tool-panel" aria-labelledby="dashboard-links-title">
        <h3 id="dashboard-links-title">快速入口</h3>
        <RouterLink class="external-link" to="/official-source-hub">查看官方外链入口</RouterLink>
        <RouterLink class="external-link" :to="workflowRoute('WorkflowMatchWorkspace', '/match-workspace')">打开比赛工作台</RouterLink>
        <RouterLink class="external-link" to="/about-compliance">查看合规说明</RouterLink>
      </section>
    </div>

    <section class="tool-panel" aria-labelledby="dashboard-workflow-title">
      <h3 id="dashboard-workflow-title">流程检查表</h3>
      <div class="link-table-wrap">
        <table class="link-table workflow-table">
          <caption>
            首版模拟闭环流程。每一步都有页面入口和文字状态。
          </caption>
          <thead>
            <tr>
              <th scope="col">步骤</th>
              <th scope="col">状态</th>
              <th scope="col">下一步</th>
              <th scope="col">入口</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in dashboardRows" :key="row.name">
              <td>{{ row.name }}</td>
              <td>{{ row.status }}</td>
              <td>{{ row.next }}</td>
              <td>
                <RouterLink class="text-button" :to="row.path">进入</RouterLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </section>
</template>
