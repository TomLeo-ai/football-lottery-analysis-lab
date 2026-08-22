<script setup lang="ts">
import type { CandidateBatch } from '@football-lottery-analysis-lab/ocr-core';

import type { LocalReviewDraftMarket, LocalReviewDraftMatch } from '@/types/ocrWorkflow';

import OcrCandidateEvidence from './OcrCandidateEvidence.vue';
import ReviewMarketFields from './ReviewMarketFields.vue';

const props = defineProps<{
  readonly candidateBatch: CandidateBatch;
  readonly match: LocalReviewDraftMatch;
  readonly markets: LocalReviewDraftMarket[];
  readonly index: number;
}>();

const emit = defineEmits<{
  updateMatch: [draftMatchKey: string, changes: Partial<Omit<LocalReviewDraftMatch, 'draftMatchKey' | 'evidence'>>];
  updateMarket: [draftMarketKey: string, changes: Partial<Omit<LocalReviewDraftMarket, 'draftMarketKey' | 'evidence'>>];
  addMarket: [draftMatchKey: string];
  deleteMatch: [draftMatchKey: string];
  deleteMarket: [draftMarketKey: string];
  moveMatch: [draftMatchKey: string, direction: 'UP' | 'DOWN'];
}>();

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value;
}
</script>

<template>
  <section class="tool-panel tool-panel--wide" :aria-labelledby="`match-title-${index}`">
    <div class="section-heading">
      <h3 :id="`match-title-${index}`">比赛草稿 {{ index + 1 }}</h3>
      <div class="ocr-review-actions">
        <button
          type="button"
          class="text-button"
          :data-testid="`move-match-up-${index}`"
          @click="emit('moveMatch', match.draftMatchKey, 'UP')"
        >
          上移
        </button>
        <button
          type="button"
          class="text-button"
          :data-testid="`move-match-down-${index}`"
          @click="emit('moveMatch', match.draftMatchKey, 'DOWN')"
        >
          下移
        </button>
        <button
          type="button"
          class="text-button"
          :data-testid="`delete-match-${index}`"
          @click="emit('deleteMatch', match.draftMatchKey)"
        >
          删除比赛
        </button>
      </div>
    </div>

    <div class="parameter-form">
      <label class="field-control" :for="`match-date-${index}`">
        日期
        <input
          :id="`match-date-${index}`"
          :value="match.matchDate"
          :data-testid="`match-date-${index}`"
          type="date"
          @input="emit('updateMatch', match.draftMatchKey, { matchDate: inputValue($event) })"
        />
      </label>

      <label class="field-control" :for="`match-league-${index}`">
        联赛
        <input
          :id="`match-league-${index}`"
          :value="match.league"
          :data-testid="`match-league-${index}`"
          type="text"
          @input="emit('updateMatch', match.draftMatchKey, { league: inputValue($event) })"
        />
      </label>

      <label class="field-control" :for="`match-home-${index}`">
        主队
        <input
          :id="`match-home-${index}`"
          :value="match.homeTeam"
          :data-testid="`match-home-${index}`"
          type="text"
          @input="emit('updateMatch', match.draftMatchKey, { homeTeam: inputValue($event) })"
        />
      </label>

      <label class="field-control" :for="`match-away-${index}`">
        客队
        <input
          :id="`match-away-${index}`"
          :value="match.awayTeam"
          :data-testid="`match-away-${index}`"
          type="text"
          @input="emit('updateMatch', match.draftMatchKey, { awayTeam: inputValue($event) })"
        />
      </label>

      <label class="field-control field-control--wide" :for="`match-kickoff-${index}`">
        开赛时间
        <input
          :id="`match-kickoff-${index}`"
          :value="match.kickoffTime"
          :data-testid="`match-kickoff-${index}`"
          type="text"
          @input="emit('updateMatch', match.draftMatchKey, { kickoffTime: inputValue($event) })"
        />
        <span>格式示例：2030-04-01T19:30:00+08:00</span>
      </label>
    </div>

    <OcrCandidateEvidence :candidate-batch="candidateBatch" :evidence="match.evidence" />

    <div class="workflow-grid">
      <ReviewMarketFields
        v-for="(market, marketIndex) in markets"
        :key="market.draftMarketKey"
        :market="market"
        :index="marketIndex"
        @update="(marketKey, changes) => emit('updateMarket', marketKey, changes)"
        @delete="emit('deleteMarket', $event)"
      />
    </div>

    <button
      type="button"
      class="action-button"
      :data-testid="`add-market-${index}`"
      @click="emit('addMarket', match.draftMatchKey)"
    >
      添加胜平负玩法
    </button>
  </section>
</template>
