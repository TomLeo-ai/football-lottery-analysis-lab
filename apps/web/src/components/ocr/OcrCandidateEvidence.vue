<script setup lang="ts">
import { computed } from 'vue';

import type { CandidateBatch, DraftEvidence } from '@football-lottery-analysis-lab/ocr-core';

const props = defineProps<{
  readonly candidateBatch: CandidateBatch;
  readonly evidence: Partial<Record<string, DraftEvidence>>;
}>();

const evidenceRows = computed(() => Object.entries(props.evidence).flatMap(([fieldName, evidence]) => {
  if (evidence === undefined) return [];
  const candidate = props.candidateBatch.fields.find((field) => field.fieldId === evidence.fieldId);
  return [{
    fieldName,
    value: candidate?.fieldValue ?? '候选值不可用',
    confidence: evidence.confidence,
    low: evidence.confidence < 0.6,
  }];
}));
</script>

<template>
  <div v-if="evidenceRows.length > 0" class="state-panel" aria-label="OCR 候选证据">
    <strong>候选证据</strong>
    <p
      v-if="evidenceRows.some((row) => row.low)"
      data-testid="low-confidence-evidence"
    >
      低置信度证据，请人工核对。
    </p>
    <ul class="check-list">
      <li v-for="row in evidenceRows" :key="row.fieldName">
        {{ row.fieldName }} · {{ Math.round(row.confidence * 100) }}% · {{ row.value }}
      </li>
    </ul>
  </div>
</template>
