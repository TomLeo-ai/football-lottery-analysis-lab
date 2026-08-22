<script setup lang="ts">
import { computed } from 'vue';

import {
  addDraftMatch,
  addWinDrawLossMarket,
  cloneLocalReviewDraft,
  moveDraftMatch,
  removeDraftMarket,
  removeDraftMatch,
  updateDraftMarket,
  updateDraftMatch,
  validateReviewDraft,
} from '@/review/reviewDraftValidation';
import type { LocalReviewDraft, LocalReviewDraftMarket, LocalReviewDraftMatch } from '@/types/ocrWorkflow';
import type { RiskPreference } from '@/types/strategyParameter';

import ReviewMatchCard from './ReviewMatchCard.vue';

const props = defineProps<{
  readonly modelValue: LocalReviewDraft;
}>();

const emit = defineEmits<{
  'update:modelValue': [draft: LocalReviewDraft];
}>();

const validation = computed(() => validateReviewDraft(props.modelValue));

function edit(mutator: (draft: LocalReviewDraft) => void): void {
  const next = cloneLocalReviewDraft(props.modelValue);
  mutator(next);
  emit('update:modelValue', next);
}

function updateDraft(changes: Partial<Pick<LocalReviewDraft, 'budgetAmount' | 'riskPreference'>>): void {
  edit((draft) => {
    Object.assign(draft, changes);
  });
}

function onUpdateMatch(
  draftMatchKey: string,
  changes: Partial<Omit<LocalReviewDraftMatch, 'draftMatchKey' | 'evidence'>>,
): void {
  edit((draft) => updateDraftMatch(draft, draftMatchKey, changes));
}

function onUpdateMarket(
  draftMarketKey: string,
  changes: Partial<Omit<LocalReviewDraftMarket, 'draftMarketKey' | 'evidence'>>,
): void {
  edit((draft) => updateDraftMarket(draft, draftMarketKey, changes));
}

function onAddMatch(): void {
  edit((draft) => {
    addDraftMatch(draft);
  });
}

function onAddMarket(draftMatchKey: string): void {
  edit((draft) => {
    addWinDrawLossMarket(draft, draftMatchKey);
  });
}

function onDeleteMatch(draftMatchKey: string): void {
  edit((draft) => {
    removeDraftMatch(draft, draftMatchKey);
  });
}

function onDeleteMarket(draftMarketKey: string): void {
  edit((draft) => {
    removeDraftMarket(draft, draftMarketKey);
  });
}

function onMoveMatch(draftMatchKey: string, direction: 'UP' | 'DOWN'): void {
  edit((draft) => {
    moveDraftMatch(draft, draftMatchKey, direction);
  });
}

function readBudget(event: Event): number {
  return Number((event.target as HTMLInputElement).value);
}

function readRisk(event: Event): RiskPreference {
  return (event.target as HTMLSelectElement).value as RiskPreference;
}
</script>

<template>
  <section class="workflow-grid" aria-label="本地 Review Draft 编辑器">
    <section class="tool-panel" aria-labelledby="local-draft-summary-title">
      <div class="section-heading">
        <h3 id="local-draft-summary-title">本地草稿</h3>
        <span class="policy-tag">{{ modelValue.status }}</span>
      </div>
      <dl class="meta-list">
        <div>
          <dt>来源声明</dt>
          <dd>{{ modelValue.sourceDeclaration }}</dd>
        </div>
        <div>
          <dt>候选字段</dt>
          <dd>{{ modelValue.candidateBatch.fields.length }}</dd>
        </div>
        <div>
          <dt>平均置信度</dt>
          <dd>{{ modelValue.meanConfidence === null ? '人工录入' : `${Math.round(modelValue.meanConfidence * 100)}%` }}</dd>
        </div>
        <div>
          <dt>AI 分析</dt>
          <dd>本阶段不可用</dd>
        </div>
      </dl>
    </section>

    <section class="tool-panel" aria-labelledby="local-draft-parameters-title">
      <h3 id="local-draft-parameters-title">预算与风险</h3>
      <div class="parameter-form">
        <label class="field-control" for="review-budget">
          预算
          <input
            id="review-budget"
            :value="modelValue.budgetAmount"
            data-testid="review-budget"
            type="number"
            min="1"
            step="1"
            @input="updateDraft({ budgetAmount: readBudget($event) })"
          />
        </label>

        <label class="field-control" for="review-risk">
          风险偏好
          <select
            id="review-risk"
            :value="modelValue.riskPreference"
            data-testid="review-risk"
            @change="updateDraft({ riskPreference: readRisk($event) })"
          >
            <option value="CONSERVATIVE">CONSERVATIVE</option>
            <option value="BALANCED">BALANCED</option>
            <option value="AGGRESSIVE">AGGRESSIVE</option>
          </select>
        </label>
      </div>

      <div v-if="validation.issues.length > 0" class="state-panel state-panel--error" role="alert">
        <strong>本地校验未通过</strong>
        <ul class="check-list">
          <li v-for="entry in validation.issues" :key="`${entry.path}:${entry.code}`">
            {{ entry.message }}
          </li>
        </ul>
      </div>
      <div v-if="validation.warnings.length > 0" class="state-panel" role="status">
        <strong>需要人工注意</strong>
        <ul class="check-list">
          <li v-for="entry in validation.warnings" :key="`${entry.path}:${entry.code}`">
            {{ entry.message }}
          </li>
        </ul>
      </div>
    </section>

    <section class="tool-panel tool-panel--wide" aria-labelledby="local-draft-actions-title">
      <div class="section-heading">
        <h3 id="local-draft-actions-title">比赛编辑</h3>
        <button
          type="button"
          class="action-button"
          data-testid="add-draft-match"
          @click="onAddMatch"
        >
          新增比赛
        </button>
      </div>
    </section>

    <ReviewMatchCard
      v-for="(match, index) in modelValue.matches"
      :key="match.draftMatchKey"
      :candidate-batch="modelValue.candidateBatch"
      :match="match"
      :markets="modelValue.markets.filter((market) => market.draftMatchKey === match.draftMatchKey)"
      :index="index"
      @update-match="onUpdateMatch"
      @update-market="onUpdateMarket"
      @add-market="onAddMarket"
      @delete-match="onDeleteMatch"
      @delete-market="onDeleteMarket"
      @move-match="onMoveMatch"
    />

    <section class="tool-panel tool-panel--wide" aria-labelledby="local-draft-save-title">
      <h3 id="local-draft-save-title">保存边界</h3>
      <p>Phase 3 前不会保存或确认；当前只允许在本机页面内编辑。</p>
      <div class="ocr-review-actions">
        <button
          type="button"
          class="primary-button"
          data-testid="save-review-draft"
          disabled
        >
          保存草稿暂不可用
        </button>
        <button
          type="button"
          class="action-button"
          data-testid="confirm-review-draft"
          disabled
        >
          确认快照暂不可用
        </button>
      </div>
    </section>
  </section>
</template>
