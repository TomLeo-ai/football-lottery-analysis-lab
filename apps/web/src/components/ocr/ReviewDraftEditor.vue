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
import type {
  LocalReviewDraft,
  LocalReviewDraftMarket,
  LocalReviewDraftMatch,
  OcrDraftRiskPreference,
} from '@/types/ocrWorkflow';

import ReviewMatchCard from './ReviewMatchCard.vue';

const props = defineProps<{
  readonly modelValue: LocalReviewDraft;
  readonly revision?: number | null;
  readonly dirty?: boolean;
  readonly busy?: boolean;
  readonly statusMessage?: string | null;
  readonly serverErrors?: readonly string[];
}>();

const emit = defineEmits<{
  'update:modelValue': [draft: LocalReviewDraft];
  save: [];
  confirm: [];
}>();

const validation = computed(() => validateReviewDraft(props.modelValue));
const canSave = computed(() => validation.value.issues.length === 0 && props.busy !== true);
const canConfirm = computed(() => (
  canSave.value
  && props.dirty === false
  && props.revision !== null
  && props.revision !== undefined
));

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

function readRisk(event: Event): OcrDraftRiskPreference {
  return (event.target as HTMLSelectElement).value as OcrDraftRiskPreference;
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
            <option value="LOW">LOW</option>
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
      <p>保存草稿只写入最小结构化数据；确认快照只提交当前 revision，不提交比赛/玩法正文。</p>
      <p v-if="revision !== null && revision !== undefined" class="helper-text">
        当前服务端草稿 revision：{{ revision }}{{ dirty ? '（有未保存编辑）' : '（已保存）' }}
      </p>
      <div v-if="serverErrors && serverErrors.length > 0" class="state-panel state-panel--error" role="alert">
        <strong>服务端校验反馈</strong>
        <ul class="check-list">
          <li v-for="entry in serverErrors" :key="entry">{{ entry }}</li>
        </ul>
      </div>
      <p v-if="statusMessage" class="helper-text" role="status">{{ statusMessage }}</p>
      <div class="ocr-review-actions">
        <button
          type="button"
          class="primary-button"
          data-testid="save-review-draft"
          :disabled="!canSave"
          @click="emit('save')"
        >
          {{ busy ? '保存中…' : '保存草稿' }}
        </button>
        <button
          type="button"
          class="action-button"
          data-testid="confirm-review-draft"
          :disabled="!canConfirm"
          @click="emit('confirm')"
        >
          确认快照
        </button>
      </div>
    </section>
  </section>
</template>
