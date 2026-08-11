<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { confirmOcrReview } from '@/api/ocrWorkflow';
import { useOcrWorkflowStore } from '@/stores/ocrWorkflow';

const workflowStore = useOcrWorkflowStore();
const isConfirming = ref(false);
const errorMessage = ref('');

const reviewDraft = computed(() => workflowStore.reviewDraft);
const confirmedSnapshot = computed(() => workflowStore.confirmedSnapshot);

async function confirmReview() {
  if (!reviewDraft.value) {
    return;
  }

  isConfirming.value = true;
  errorMessage.value = '';

  try {
    const snapshot = await confirmOcrReview({
      ocrTaskId: reviewDraft.value.ocrTaskId,
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
      ]
    });

    workflowStore.setConfirmedSnapshot(snapshot);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '人工确认失败';
  } finally {
    isConfirming.value = false;
  }
}
</script>

<template>
  <section class="workflow-page" aria-labelledby="ocr-review-title">
    <div class="page-heading">
      <div>
        <p class="page-heading__eyebrow">OcrReviewWizard</p>
        <h2 id="ocr-review-title">OCR 人工确认</h2>
      </div>
      <p class="page-heading__notice">确认后 sourceType 固定为 USER_SCREENSHOT_CONFIRMED</p>
    </div>

    <div class="policy-panel" role="note">
      <strong>确认原则</strong>
      <p>
        只有用户确认后的比赛、玩法、赔率、预算和风险偏好才能成为结构化快照。
        未确认字段保持待确认状态，不允许进入 AI 分析。
      </p>
    </div>

    <div v-if="!reviewDraft" class="state-panel">
      <div>
        <strong>暂无待确认 OCR 任务</strong>
        <p>请先上传虚构截图样例并生成本地 OCR 待确认结果。</p>
      </div>
      <RouterLink class="external-link" to="/screenshot-upload">返回上传</RouterLink>
    </div>

    <template v-else>
      <div class="workflow-grid">
        <section class="tool-panel" aria-labelledby="field-review-title">
          <h3 id="field-review-title">1. 识别字段</h3>
          <table class="link-table workflow-table">
            <caption>
              OCR 字段候选。字段需要人工确认后才能进入后续分析。
            </caption>
            <thead>
              <tr>
                <th scope="col">字段</th>
                <th scope="col">识别值</th>
                <th scope="col">置信度</th>
                <th scope="col">来源区域</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="field in reviewDraft.fields" :key="field.fieldName">
                <td>{{ field.fieldName }}</td>
                <td>{{ field.fieldValue }}</td>
                <td>{{ Math.round(field.confidence * 100) }}%</td>
                <td>{{ field.sourceRegion }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="tool-panel" aria-labelledby="snapshot-confirm-title">
          <h3 id="snapshot-confirm-title">2. 确认快照</h3>
          <dl class="meta-list">
            <div>
              <dt>OCR 状态</dt>
              <dd>{{ reviewDraft.status }}</dd>
            </div>
            <div>
              <dt>AI 分析</dt>
              <dd>确认前不可用</dd>
            </div>
            <div>
              <dt>预算</dt>
              <dd>20 CNY</dd>
            </div>
            <div>
              <dt>风险偏好</dt>
              <dd>BALANCED</dd>
            </div>
          </dl>

          <button
            type="button"
            class="action-button"
            data-testid="confirm-ocr-button"
            :disabled="isConfirming"
            @click="confirmReview"
          >
            {{ isConfirming ? '确认中...' : '确认并生成用户快照' }}
          </button>

          <div v-if="errorMessage" class="state-panel state-panel--error" role="alert">
            <strong>人工确认失败</strong>
            <p>{{ errorMessage }}</p>
          </div>
        </section>
      </div>

      <div v-if="confirmedSnapshot" class="state-panel state-panel--success" aria-live="polite">
        <div>
          <strong>{{ confirmedSnapshot.sourceType }}</strong>
          <p>{{ confirmedSnapshot.snapshotStatus }} · 现在允许进入 AI 分析。</p>
          <p>
            {{ confirmedSnapshot.matches[0]?.homeTeam }} vs
            {{ confirmedSnapshot.matches[0]?.awayTeam }}
          </p>
        </div>
        <span class="policy-tag">analysisAllowed={{ confirmedSnapshot.analysisAllowed }}</span>
      </div>
    </template>
  </section>
</template>

