<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import type { PixelRect } from '@football-lottery-analysis-lab/ocr-core';

import type { ImageWorkspaceSnapshot } from '@/ocr/imageWorkspace';

interface RectFields {
  x: string | number;
  y: string | number;
  width: string | number;
  height: string | number;
}

const props = withDefaults(
  defineProps<{
    readonly workspace: ImageWorkspaceSnapshot | null;
    readonly disabled?: boolean;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{
  rotate: [direction: 'LEFT' | 'RIGHT'];
  'set-crop': [crop: PixelRect | null];
  'add-redaction': [redaction: PixelRect];
  'remove-redaction': [index: number];
  'clear-redactions': [];
}>();

const cropFields = ref<RectFields>(emptyRectFields());
const redactionFields = ref<RectFields>(emptyRectFields());
const cropError = ref<string | null>(null);
const redactionError = ref<string | null>(null);

const controlsDisabled = computed(() => props.disabled || props.workspace === null);
const safePreviewUrl = computed<string | null>(() => {
  try {
    const previewUrl = props.workspace?.previewUrl;
    if (typeof previewUrl !== 'string') return null;

    const normalizedUrl = previewUrl.trim();
    if (!normalizedUrl.startsWith('blob:') || normalizedUrl.length === 'blob:'.length) {
      return null;
    }

    const parsedUrl = new URL(normalizedUrl);
    if (parsedUrl.protocol !== 'blob:' || parsedUrl.pathname.trim() === '') return null;
    return normalizedUrl;
  } catch {
    return null;
  }
});

watch(
  () => props.workspace,
  (workspace) => {
    cropFields.value = workspace?.crop
      ? {
          x: String(workspace.crop.x),
          y: String(workspace.crop.y),
          width: String(workspace.crop.width),
          height: String(workspace.crop.height),
        }
      : emptyRectFields();
    redactionFields.value = emptyRectFields();
    cropError.value = null;
    redactionError.value = null;
  },
  { immediate: true },
);

function emptyRectFields(): RectFields {
  return { x: '', y: '', width: '', height: '' };
}

function parseRect(fields: RectFields): { rect: PixelRect | null; error: string | null } {
  const rawValues = [fields.x, fields.y, fields.width, fields.height];
  if (rawValues.some((value) => String(value).trim() === '')) {
    return { rect: null, error: '请完整填写 x、y、宽度和高度。' };
  }

  const [x, y, width, height] = rawValues.map(Number);
  if (![x, y, width, height].every(Number.isFinite)) {
    return { rect: null, error: '坐标和尺寸必须是有限数字。' };
  }
  if (x < 0 || y < 0) {
    return { rect: null, error: 'x 和 y 不能小于 0。' };
  }
  if (width <= 0 || height <= 0) {
    return { rect: null, error: '宽度和高度必须大于 0。' };
  }
  if (!Number.isFinite(x + width) || !Number.isFinite(y + height)) {
    return { rect: null, error: '坐标和尺寸超出可处理范围。' };
  }
  return { rect: { x, y, width, height }, error: null };
}

function applyCrop(): void {
  const result = parseRect(cropFields.value);
  cropError.value = result.error;
  if (result.rect !== null) emit('set-crop', result.rect);
}

function clearCrop(): void {
  cropFields.value = emptyRectFields();
  cropError.value = null;
  emit('set-crop', null);
}

function addRedaction(): void {
  const result = parseRect(redactionFields.value);
  redactionError.value = result.error;
  if (result.rect === null) return;
  emit('add-redaction', result.rect);
  redactionFields.value = emptyRectFields();
}
</script>

<template>
  <section class="tool-panel image-workspace" aria-labelledby="image-workspace-title">
    <div class="image-workspace__heading">
      <h3 id="image-workspace-title">本地图片工作区</h3>
      <p>以下控件只发送几何操作命令，不会自行裁剪、旋转或上传图片。</p>
    </div>

    <div v-if="workspace" class="image-workspace__content">
      <figure class="image-workspace__preview">
        <img
          v-if="safePreviewUrl"
          :src="safePreviewUrl"
          alt="待处理的本地 OCR 图片预览"
        />
        <div
          v-else
          class="state-panel state-panel--error image-workspace__empty"
          role="alert"
          data-testid="invalid-preview"
        >
          <p>无法显示本地图片预览。仅接受当前浏览器生成的非空 blob: URL。</p>
        </div>
        <figcaption v-if="safePreviewUrl">
          本地预览，仅用于当前浏览器会话中的人工检查。
        </figcaption>
      </figure>

      <dl class="image-workspace__summary" aria-label="图片工作区状态">
        <div>
          <dt>标准化尺寸</dt>
          <dd>{{ workspace.normalizedWidth }} × {{ workspace.normalizedHeight }}</dd>
        </div>
        <div>
          <dt>当前旋转</dt>
          <dd>{{ workspace.rotation }}°</dd>
        </div>
        <div>
          <dt>裁剪区域</dt>
          <dd>{{ workspace.crop ? '已设置' : '未设置' }}</dd>
        </div>
        <div>
          <dt>遮挡区域</dt>
          <dd>{{ workspace.redactions.length }} 处</dd>
        </div>
      </dl>
    </div>
    <div v-else class="state-panel image-workspace__empty" role="status">
      <p>尚未载入本地图片。选择并通过校验后，预览和几何控件会显示在这里。</p>
    </div>

    <fieldset class="image-workspace__fieldset" :disabled="controlsDisabled">
      <legend>旋转</legend>
      <div class="image-workspace__actions">
        <button
          type="button"
          class="action-button"
          data-testid="rotate-left"
          :disabled="controlsDisabled"
          @click="emit('rotate', 'LEFT')"
        >
          向左旋转 90°
        </button>
        <button
          type="button"
          class="action-button"
          data-testid="rotate-right"
          :disabled="controlsDisabled"
          @click="emit('rotate', 'RIGHT')"
        >
          向右旋转 90°
        </button>
      </div>
    </fieldset>

    <fieldset class="image-workspace__fieldset" :disabled="controlsDisabled">
      <legend>裁剪区域</legend>
      <div class="image-workspace__rect-grid">
        <label class="field-control image-workspace__field" for="ocr-crop-x">
          x 坐标
          <input id="ocr-crop-x" v-model="cropFields.x" type="number" min="0" step="any" />
        </label>
        <label class="field-control image-workspace__field" for="ocr-crop-y">
          y 坐标
          <input id="ocr-crop-y" v-model="cropFields.y" type="number" min="0" step="any" />
        </label>
        <label class="field-control image-workspace__field" for="ocr-crop-width">
          宽度
          <input id="ocr-crop-width" v-model="cropFields.width" type="number" min="0" step="any" />
        </label>
        <label class="field-control image-workspace__field" for="ocr-crop-height">
          高度
          <input id="ocr-crop-height" v-model="cropFields.height" type="number" min="0" step="any" />
        </label>
      </div>
      <p v-if="cropError" class="image-workspace__error" role="alert">{{ cropError }}</p>
      <div class="image-workspace__actions">
        <button
          type="button"
          class="primary-button"
          data-testid="apply-crop"
          :disabled="controlsDisabled"
          @click="applyCrop"
        >
          应用裁剪区域
        </button>
        <button
          type="button"
          class="action-button"
          data-testid="clear-crop"
          :disabled="controlsDisabled"
          @click="clearCrop"
        >
          清除裁剪区域
        </button>
      </div>
    </fieldset>

    <fieldset class="image-workspace__fieldset" :disabled="controlsDisabled">
      <legend>新增隐私遮挡区域</legend>
      <div class="image-workspace__rect-grid">
        <label class="field-control image-workspace__field" for="ocr-redaction-x">
          x 坐标
          <input id="ocr-redaction-x" v-model="redactionFields.x" type="number" min="0" step="any" />
        </label>
        <label class="field-control image-workspace__field" for="ocr-redaction-y">
          y 坐标
          <input id="ocr-redaction-y" v-model="redactionFields.y" type="number" min="0" step="any" />
        </label>
        <label class="field-control image-workspace__field" for="ocr-redaction-width">
          宽度
          <input id="ocr-redaction-width" v-model="redactionFields.width" type="number" min="0" step="any" />
        </label>
        <label class="field-control image-workspace__field" for="ocr-redaction-height">
          高度
          <input id="ocr-redaction-height" v-model="redactionFields.height" type="number" min="0" step="any" />
        </label>
      </div>
      <p v-if="redactionError" class="image-workspace__error" role="alert">
        {{ redactionError }}
      </p>
      <div class="image-workspace__actions">
        <button
          type="button"
          class="primary-button"
          data-testid="add-redaction"
          :disabled="controlsDisabled"
          @click="addRedaction"
        >
          添加遮挡区域
        </button>
      </div>
    </fieldset>

    <fieldset class="image-workspace__fieldset" :disabled="controlsDisabled">
      <legend>现有隐私遮挡区域</legend>
      <p v-if="workspace?.redactions.length === 0" class="image-workspace__helper">
        当前没有遮挡区域。
      </p>
      <ol v-else class="image-workspace__redaction-list">
        <li v-for="(redaction, index) in workspace?.redactions" :key="index">
          <span>
            第 {{ index + 1 }} 处：x {{ redaction.x }}，y {{ redaction.y }}，宽
            {{ redaction.width }}，高 {{ redaction.height }}
          </span>
          <button
            type="button"
            class="action-button"
            :data-testid="`remove-redaction-${index}`"
            :disabled="controlsDisabled"
            @click="emit('remove-redaction', index)"
          >
            移除第 {{ index + 1 }} 处
          </button>
        </li>
      </ol>
      <button
        type="button"
        class="action-button image-workspace__clear-redactions"
        data-testid="clear-redactions"
        :disabled="controlsDisabled || !workspace?.redactions.length"
        @click="emit('clear-redactions')"
      >
        清除全部遮挡区域
      </button>
    </fieldset>
  </section>
</template>
