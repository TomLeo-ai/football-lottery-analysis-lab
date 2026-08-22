<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, type RouteLocationRaw } from 'vue-router';

import { useOcrWorkflowStore } from '@/stores/ocrWorkflow';

const workflowStore = useOcrWorkflowStore();
const confirmedSnapshot = computed(() => workflowStore.confirmedSnapshot);

const reviewRoute = computed<RouteLocationRaw>(() => (
  workflowStore.activeWorkflowId === null
    ? '/ocr-review'
    : { name: 'WorkflowOcrReview', params: { workflowId: workflowStore.activeWorkflowId } }
));

const analysisRoute = computed<RouteLocationRaw>(() => (
  workflowStore.activeWorkflowId === null
    ? '/strategy-simulator'
    : { name: 'WorkflowAnalysis', params: { workflowId: workflowStore.activeWorkflowId } }
));
</script>

<template>
  <section class="workflow-page" aria-labelledby="match-workspace-title">
    <div class="page-heading">
      <div>
        <p class="page-heading__eyebrow">MatchWorkspace</p>
        <h2 id="match-workspace-title">比赛工作台</h2>
      </div>
      <p class="page-heading__notice">只读用户确认快照 · 不发布 OCR 数据</p>
    </div>

    <div class="policy-panel" role="note">
      <strong>数据边界</strong>
      <p>
        比赛工作台只读取用户确认后的 `USER_SCREENSHOT_CONFIRMED` 快照，用于核对后续 Mock
        分析输入，不作为公共官方数据源发布。
      </p>
    </div>

    <div v-if="!confirmedSnapshot" class="state-panel">
      <div>
        <strong>暂无已确认快照</strong>
        <p>请先完成虚构截图 OCR 和人工确认。</p>
      </div>
      <RouterLink class="external-link" :to="reviewRoute">进入人工确认</RouterLink>
    </div>

    <template v-else>
      <div class="workflow-grid">
        <section class="tool-panel" aria-labelledby="snapshot-meta-title">
          <h3 id="snapshot-meta-title">快照信息</h3>
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
              <dt>风险偏好</dt>
              <dd>{{ confirmedSnapshot.riskPreference }}</dd>
            </div>
          </dl>
        </section>

        <section class="tool-panel" aria-labelledby="workspace-action-title">
          <h3 id="workspace-action-title">后续动作</h3>
          <p class="helper-text">确认输入无误后，可进入 Mock 规则引擎分析。</p>
          <RouterLink class="external-link" :to="analysisRoute">进入 AI 分析</RouterLink>
        </section>
      </div>

      <section class="tool-panel" aria-labelledby="confirmed-match-title">
        <h3 id="confirmed-match-title">确认比赛</h3>
        <div class="link-table-wrap">
          <table class="link-table workflow-table">
            <caption>
              用户确认比赛表。
            </caption>
            <thead>
              <tr>
                <th scope="col">比赛</th>
                <th scope="col">日期</th>
                <th scope="col">联赛</th>
                <th scope="col">主队</th>
                <th scope="col">客队</th>
                <th scope="col">开赛时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="match in confirmedSnapshot.matches" :key="match.matchId">
                <td>{{ match.matchId }}</td>
                <td>{{ match.matchDate }}</td>
                <td>{{ match.league }}</td>
                <td>{{ match.homeTeam }}</td>
                <td>{{ match.awayTeam }}</td>
                <td>{{ match.kickoffTime }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </section>
</template>
