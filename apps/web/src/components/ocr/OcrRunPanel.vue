<script setup lang="ts">
import { computed } from 'vue';

type OcrStage =
  | 'IDLE'
  | 'INITIALIZING'
  | 'RECOGNIZING'
  | 'MAPPING'
  | 'SUCCESS'
  | 'ERROR'
  | 'CANCELLED';

const props = withDefaults(
  defineProps<{
    readonly stage: OcrStage;
    readonly progress: number;
    readonly meanConfidence: number | null;
    readonly cacheWarning?: string | null;
    readonly disabled?: boolean;
    readonly canRetry?: boolean;
    readonly canCancel?: boolean;
  }>(),
  {
    cacheWarning: null,
    disabled: false,
    canRetry: false,
    canCancel: false,
  },
);

const emit = defineEmits<{
  start: [];
  cancel: [];
  retry: [];
  'manual-entry': [];
}>();

const STAGE_MESSAGES: Readonly<Record<OcrStage, string>> = {
  IDLE: '待开始本地 OCR。',
  INITIALIZING: '正在初始化本地 OCR 适配器。',
  RECOGNIZING: '正在识别图片文字。',
  MAPPING: '正在映射结构化候选字段。',
  SUCCESS: '识别完成，等待人工核对。',
  ERROR: '识别未完成，请重试或改用手工录入。',
  CANCELLED: '识别已取消，可以重新开始或改用手工录入。',
};

const isBusy = computed(() =>
  ['INITIALIZING', 'RECOGNIZING', 'MAPPING'].includes(props.stage),
);

const displayProgress = computed(() => {
  if (!Number.isFinite(props.progress)) return 0;
  return Math.min(100, Math.max(0, props.progress));
});

const normalizedConfidence = computed(() => {
  if (props.meanConfidence === null || !Number.isFinite(props.meanConfidence)) return null;
  return Math.min(1, Math.max(0, props.meanConfidence));
});

const confidencePercentage = computed(() =>
  normalizedConfidence.value === null ? null : Math.round(normalizedConfidence.value * 100),
);

const lowConfidence = computed(
  () => normalizedConfidence.value !== null && normalizedConfidence.value < 0.6,
);

const startDisabled = computed(
  () => props.disabled || !['IDLE', 'CANCELLED'].includes(props.stage),
);
const cancelDisabled = computed(
  () => props.disabled || !isBusy.value || !props.canCancel,
);
const retryDisabled = computed(
  () => props.disabled || isBusy.value || !props.canRetry,
);
const manualEntryDisabled = computed(() => props.disabled || isBusy.value);
</script>

<template>
  <section class="tool-panel ocr-run-panel" aria-labelledby="ocr-run-panel-title">
    <div class="ocr-run-panel__heading">
      <h3 id="ocr-run-panel-title">本地 OCR 运行状态</h3>
      <p>识别只生成待核对的结构化候选字段，不会自动进入模拟分析。</p>
    </div>

    <div
      class="state-panel ocr-run-panel__state"
      :class="{
        'state-panel--error': stage === 'ERROR',
        'state-panel--success': stage === 'SUCCESS',
      }"
      :role="stage === 'ERROR' ? 'alert' : 'status'"
      :aria-live="stage === 'ERROR' ? 'assertive' : 'polite'"
    >
      <p>{{ STAGE_MESSAGES[stage] }}</p>
      <span v-if="isBusy" class="state-panel__spinner" aria-hidden="true"></span>
    </div>

    <div class="ocr-run-panel__progress-wrap">
      <label for="ocr-run-progress">处理进度：{{ Math.round(displayProgress) }}%</label>
      <progress
        id="ocr-run-progress"
        class="ocr-run-panel__progress"
        aria-label="OCR 处理进度"
        max="100"
        :value="displayProgress"
      >
        {{ Math.round(displayProgress) }}%
      </progress>
    </div>

    <p
      v-if="lowConfidence"
      class="ocr-run-panel__confidence ocr-run-panel__confidence--warning"
      role="status"
    >
      识别置信度较低，请人工核对（平均置信度 {{ confidencePercentage }}%）。
    </p>
    <p v-else-if="confidencePercentage !== null" class="ocr-run-panel__confidence">
      平均置信度 {{ confidencePercentage }}%，请继续人工核对结构化字段。
    </p>

    <p
      v-if="cacheWarning"
      class="ocr-run-panel__cache-warning"
      role="status"
      data-testid="cache-warning"
    >
      缓存提示：{{ cacheWarning }}
    </p>

    <div class="ocr-run-panel__actions" aria-label="OCR 操作">
      <button
        type="button"
        class="primary-button"
        data-testid="start-ocr"
        :disabled="startDisabled"
        @click="emit('start')"
      >
        开始本地识别
      </button>
      <button
        type="button"
        class="action-button"
        data-testid="cancel-ocr"
        :disabled="cancelDisabled"
        @click="emit('cancel')"
      >
        取消当前识别
      </button>
      <button
        type="button"
        class="action-button"
        data-testid="retry-ocr"
        :disabled="retryDisabled"
        @click="emit('retry')"
      >
        重试识别
      </button>
      <button
        type="button"
        class="action-button"
        data-testid="manual-entry"
        :disabled="manualEntryDisabled"
        @click="emit('manual-entry')"
      >
        改用手工录入
      </button>
    </div>
  </section>
</template>
