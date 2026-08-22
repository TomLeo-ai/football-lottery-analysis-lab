<script setup lang="ts">
import type { LocalReviewDraftMarket } from '@/types/ocrWorkflow';

const props = defineProps<{
  readonly market: LocalReviewDraftMarket;
  readonly index: number;
}>();

const emit = defineEmits<{
  update: [draftMarketKey: string, changes: Partial<Omit<LocalReviewDraftMarket, 'draftMarketKey' | 'evidence'>>];
  delete: [draftMarketKey: string];
}>();

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value;
}
</script>

<template>
  <section class="tool-panel" :aria-labelledby="`market-title-${index}`">
    <div class="section-heading">
      <h3 :id="`market-title-${index}`">胜平负玩法 {{ index + 1 }}</h3>
      <button
        type="button"
        class="text-button"
        :data-testid="`delete-market-${index}`"
        @click="emit('delete', props.market.draftMarketKey)"
      >
        删除玩法
      </button>
    </div>

    <div class="parameter-form">
      <label class="field-control" :for="`market-play-type-${index}`">
        玩法
        <select
          :id="`market-play-type-${index}`"
          :value="market.playType"
          :data-testid="`market-play-type-${index}`"
          @change="emit('update', market.draftMarketKey, { playType: inputValue($event) as LocalReviewDraftMarket['playType'] })"
        >
          <option value="WIN_DRAW_LOSS">WIN_DRAW_LOSS</option>
        </select>
      </label>

      <label class="field-control" :for="`market-selection-${index}`">
        选择
        <select
          :id="`market-selection-${index}`"
          :value="market.selection"
          :data-testid="`market-selection-${index}`"
          @change="emit('update', market.draftMarketKey, { selection: inputValue($event) as LocalReviewDraftMarket['selection'] })"
        >
          <option value="HOME_WIN">HOME_WIN</option>
          <option value="DRAW">DRAW</option>
          <option value="AWAY_WIN">AWAY_WIN</option>
        </select>
      </label>

      <label class="field-control" :for="`market-odds-${index}`">
        赔率
        <input
          :id="`market-odds-${index}`"
          :value="market.odds"
          :data-testid="`market-odds-${index}`"
          type="text"
          inputmode="decimal"
          @input="emit('update', market.draftMarketKey, { odds: inputValue($event) })"
        />
      </label>
    </div>
  </section>
</template>
