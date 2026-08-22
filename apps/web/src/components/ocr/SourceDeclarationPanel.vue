<script setup lang="ts">
import { computed } from 'vue';

import type { SourceDeclaration } from '@football-lottery-analysis-lab/ocr-core';

interface SourceAcknowledgements {
  readonly sensitiveData: boolean;
  readonly officialMaterial: boolean;
  readonly humanConfirmation: boolean;
}

const props = defineProps<{
  readonly modelValue: SourceDeclaration | null;
  readonly acknowledgements: SourceAcknowledgements;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: SourceDeclaration];
  'update:acknowledgements': [value: SourceAcknowledgements];
}>();

const EMPTY_ACKNOWLEDGEMENTS: SourceAcknowledgements = {
  sensitiveData: false,
  officialMaterial: false,
  humanConfirmation: false,
};

const requiresAcknowledgements = computed(
  () => props.modelValue === 'USER_OWNED_AUTHORIZED',
);

const isValid = computed(() => {
  if (props.modelValue === null) return false;
  if (!requiresAcknowledgements.value) return true;
  return (
    props.acknowledgements.sensitiveData &&
    props.acknowledgements.officialMaterial &&
    props.acknowledgements.humanConfirmation
  );
});

const validityMessage = computed(() => {
  if (props.modelValue === null) return '请先声明图片来源，之后才能启动本地 OCR。';
  if (!isValid.value) return '请完成全部三项确认，之后才能启动本地 OCR。';
  return '来源声明已完成，可以继续本地 OCR。';
});

function handleSourceChange(event: Event): void {
  const source = (event.currentTarget as HTMLInputElement).value as SourceDeclaration;
  emit('update:modelValue', source);
  if (source !== 'USER_OWNED_AUTHORIZED') {
    emit('update:acknowledgements', EMPTY_ACKNOWLEDGEMENTS);
  }
}

function handleAcknowledgementChange(
  key: keyof SourceAcknowledgements,
  event: Event,
): void {
  emit('update:acknowledgements', {
    ...props.acknowledgements,
    [key]: (event.currentTarget as HTMLInputElement).checked,
  });
}
</script>

<template>
  <section class="tool-panel source-declaration" aria-labelledby="source-declaration-title">
    <div class="source-declaration__heading">
      <h3 id="source-declaration-title">声明图片来源</h3>
      <p>请选择与当前图片一致的来源。系统不会默认替您作出声明。</p>
    </div>

    <fieldset class="source-declaration__fieldset">
      <legend>图片来源</legend>
      <div class="source-declaration__options">
        <label class="source-declaration__option">
          <input
            type="radio"
            name="ocr-source-declaration"
            value="FICTIONAL_SAMPLE"
            :checked="modelValue === 'FICTIONAL_SAMPLE'"
            @change="handleSourceChange"
          />
          <span>
            <strong>虚构示例图片</strong>
            <small>仅用于演示本地 OCR 和人工确认流程。</small>
          </span>
        </label>
        <label class="source-declaration__option">
          <input
            type="radio"
            name="ocr-source-declaration"
            value="USER_OWNED_AUTHORIZED"
            :checked="modelValue === 'USER_OWNED_AUTHORIZED'"
            @change="handleSourceChange"
          />
          <span>
            <strong>本人拥有或已获授权的图片</strong>
            <small>继续前必须完成下方三项确认。</small>
          </span>
        </label>
      </div>
    </fieldset>

    <fieldset v-if="requiresAcknowledgements" class="source-declaration__fieldset">
      <legend>使用前确认</legend>
      <div class="source-declaration__acknowledgements">
        <label class="checkbox-control source-declaration__acknowledgement">
          <input
            type="checkbox"
            :checked="acknowledgements.sensitiveData"
            @change="handleAcknowledgementChange('sensitiveData', $event)"
          />
          <span>图片不含 API Key、Token、Cookie、支付信息或不必要的私人身份信息。</span>
        </label>
        <label class="checkbox-control source-declaration__acknowledgement">
          <input
            type="checkbox"
            :checked="acknowledgements.officialMaterial"
            @change="handleAcknowledgementChange('officialMaterial', $event)"
          />
          <span>图片不是需要复制、公开或再发布的官方彩票网站截图、Logo 或官方数据集。</span>
        </label>
        <label class="checkbox-control source-declaration__acknowledgement">
          <input
            type="checkbox"
            :checked="acknowledgements.humanConfirmation"
            @change="handleAcknowledgementChange('humanConfirmation', $event)"
          />
          <span>我理解只有人工确认的结构化字段进入后续模拟分析。</span>
        </label>
      </div>
    </fieldset>

    <aside class="state-panel source-declaration__privacy" role="note" aria-label="图片隐私说明">
      <p>图片仅在当前浏览器内处理。服务端不会接收原图、完整 OCR 文本或逐词结果；结构化候选字段会保存到本机后端供您刷新恢复，只有您确认后的快照才能进入模拟分析。</p>
    </aside>

    <p class="helper-text source-declaration__validity" aria-live="polite">
      {{ validityMessage }}
    </p>
  </section>
</template>
