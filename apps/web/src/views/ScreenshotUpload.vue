<script setup lang="ts">
import {
  IMAGE_POLICY,
  type CandidateBatch,
  type PixelRect,
  type SourceDeclaration,
} from '@football-lottery-analysis-lab/ocr-core';
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue';

import ImageWorkspace from '@/components/ocr/ImageWorkspace.vue';
import OcrRunPanel from '@/components/ocr/OcrRunPanel.vue';
import SourceDeclarationPanel from '@/components/ocr/SourceDeclarationPanel.vue';
import {
  BrowserImageFileError,
  inspectImageFileHeader,
  type ImageHeader,
} from '@/ocr/browserImageFile';
import {
  ImageWorkspaceController,
  ImageWorkspaceError,
  type ImageWorkspaceSnapshot,
  type ProcessedCanvasResult,
} from '@/ocr/imageWorkspace';
import {
  OcrRunController,
  OcrRunControllerError,
  type OcrCandidateDraftSeed,
} from '@/ocr/ocrRunController';
import {
  TesseractOcrAdapter,
  type OcrProgressEvent,
  type OcrWarning,
} from '@/ocr/tesseractOcrAdapter';
import { useLocalOcrSessionStore } from '@/stores/localOcrSession';

interface SourceAcknowledgements {
  readonly sensitiveData: boolean;
  readonly officialMaterial: boolean;
  readonly humanConfirmation: boolean;
}

type OcrStage =
  | 'IDLE'
  | 'INITIALIZING'
  | 'RECOGNIZING'
  | 'MAPPING'
  | 'SUCCESS'
  | 'ERROR'
  | 'CANCELLED';

interface DetachedResources {
  readonly run: OcrRunController | null;
  readonly workspace: ImageWorkspaceController | null;
}

const EMPTY_ACKNOWLEDGEMENTS: SourceAcknowledgements = {
  sensitiveData: false,
  officialMaterial: false,
  humanConfirmation: false,
};

const MANUAL_BLANK_CANDIDATE_BATCH: CandidateBatch = {
  schemaVersion: 'OCR_CANDIDATE_V2',
  processedImage: {
    schemaVersion: 'IMAGE_TRANSFORM_V1',
    sourceSize: { width: 1, height: 1 },
    normalizedSize: { width: 1, height: 1 },
    rotation: 0,
    crop: null,
    redactions: [],
    processedSize: { width: 1, height: 1 },
  },
  fields: [],
};

const localSession = useLocalOcrSessionStore();
const sourceDeclaration = ref<SourceDeclaration | null>(null);
const acknowledgements = ref<SourceAcknowledgements>({ ...EMPTY_ACKNOWLEDGEMENTS });
const selectedFile = shallowRef<File | null>(null);
const imageHeader = ref<ImageHeader | null>(null);
const workspaceController = shallowRef<ImageWorkspaceController | null>(null);
const workspaceSnapshot = ref<ImageWorkspaceSnapshot | null>(null);
const runController = shallowRef<OcrRunController | null>(null);
const stage = ref<OcrStage>('IDLE');
const progress = ref(0);
const meanConfidence = ref<number | null>(null);
const cacheWarning = ref<string | null>(null);
const errorMessage = ref<string | null>(null);
const transitionMessage = ref<string | null>(null);
const isPreparing = ref(false);
let selectionToken = 0;
let runToken = 0;

const sourceValid = computed(() => {
  if (sourceDeclaration.value === null) return false;
  if (sourceDeclaration.value === 'FICTIONAL_SAMPLE') return true;
  return (
    acknowledgements.value.sensitiveData
    && acknowledgements.value.officialMaterial
    && acknowledgements.value.humanConfirmation
  );
});

const runBusy = computed(() => (
  stage.value === 'INITIALIZING'
  || stage.value === 'RECOGNIZING'
  || stage.value === 'MAPPING'
));

const runDisabled = computed(() => (
  !sourceValid.value || workspaceSnapshot.value === null || isPreparing.value
));

function detachResources(): DetachedResources {
  const detached = {
    run: runController.value,
    workspace: workspaceController.value,
  };
  localSession.clear();
  runController.value = null;
  workspaceController.value = null;
  workspaceSnapshot.value = null;
  selectedFile.value = null;
  imageHeader.value = null;
  meanConfidence.value = null;
  cacheWarning.value = null;
  return detached;
}

function invalidateSelection(nextStage: OcrStage): DetachedResources {
  ++selectionToken;
  ++runToken;
  const detached = detachResources();
  resetMessages();
  stage.value = nextStage;
  isPreparing.value = false;
  return detached;
}

async function disposeResources(resources: DetachedResources): Promise<void> {
  if (resources.run !== null) await resources.run.dispose();
  resources.workspace?.dispose();
}

function resetMessages(): void {
  errorMessage.value = null;
  transitionMessage.value = null;
  progress.value = 0;
}

function describeLocalError(error: unknown): string {
  if (error instanceof BrowserImageFileError) {
    if (error.code === 'UNSUPPORTED_IMAGE_TYPE') return '仅支持 PNG、JPEG 或 WebP 图片。';
    if (error.code === 'IMAGE_TOO_LARGE') return '图片超过本地 OCR 允许的大小或像素限制。';
    return '无法读取图片头，请重新选择有效图片。';
  }
  if (error instanceof ImageWorkspaceError) return '无法在当前浏览器中创建本地图片工作区。';
  if (error instanceof OcrRunControllerError && error.code === 'OCR_CANCELLED') {
    return '本地 OCR 已取消。';
  }
  return '本地 OCR 未完成，请重试或改用手工录入。';
}

async function prepareFile(file: File): Promise<void> {
  if (!sourceValid.value) return;
  const sourceSnapshot = sourceDeclaration.value;
  if (sourceSnapshot === null) return;
  const detached = invalidateSelection('IDLE');
  const token = selectionToken;
  isPreparing.value = true;

  await disposeResources(detached);
  if (!isPreparationCurrent(token, sourceSnapshot)) return;

  let header: ImageHeader;
  try {
    header = await inspectImageFileHeader(file);
  } catch (error) {
    if (isPreparationCurrent(token, sourceSnapshot)) {
      errorMessage.value = describeLocalError(error);
      isPreparing.value = false;
    }
    return;
  }
  if (!isPreparationCurrent(token, sourceSnapshot)) return;

  let workspace: ImageWorkspaceController;
  try {
    workspace = await ImageWorkspaceController.create(file);
  } catch (error) {
    if (isPreparationCurrent(token, sourceSnapshot)) {
      errorMessage.value = describeLocalError(error);
      isPreparing.value = false;
    }
    return;
  }
  if (!isPreparationCurrent(token, sourceSnapshot)) {
    workspace.dispose();
    return;
  }

  selectedFile.value = file;
  imageHeader.value = header;
  workspaceController.value = workspace;
  workspaceSnapshot.value = workspace.snapshot();
  isPreparing.value = false;
}

function isPreparationCurrent(token: number, source: SourceDeclaration): boolean {
  return (
    token === selectionToken
    && sourceDeclaration.value === source
    && sourceValid.value
  );
}

function handleFileChange(event: Event): void {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  input.value = '';
  if (file !== null) void prepareFile(file);
}

function handleSourceChange(value: SourceDeclaration): void {
  const changed = sourceDeclaration.value !== value;
  if (!changed) return;
  const detached = invalidateSelection('IDLE');
  sourceDeclaration.value = value;
  if (value !== 'USER_OWNED_AUTHORIZED') {
    acknowledgements.value = { ...EMPTY_ACKNOWLEDGEMENTS };
  }
  void disposeResources(detached);
}

function handleAcknowledgements(value: SourceAcknowledgements): void {
  if (acknowledgementsEqual(acknowledgements.value, value)) return;
  const detached = invalidateSelection('IDLE');
  acknowledgements.value = value;
  void disposeResources(detached);
}

function acknowledgementsEqual(
  left: SourceAcknowledgements,
  right: SourceAcknowledgements,
): boolean {
  return (
    left.sensitiveData === right.sensitiveData
    && left.officialMaterial === right.officialMaterial
    && left.humanConfirmation === right.humanConfirmation
  );
}

async function loadFictionalSample(): Promise<void> {
  const detached = invalidateSelection('IDLE');
  sourceDeclaration.value = 'FICTIONAL_SAMPLE';
  acknowledgements.value = { ...EMPTY_ACKNOWLEDGEMENTS };
  const sourceSnapshot: SourceDeclaration = 'FICTIONAL_SAMPLE';
  const token = selectionToken;
  isPreparing.value = true;
  await disposeResources(detached);
  if (!isPreparationCurrent(token, sourceSnapshot)) return;

  try {
    const samplePath = '/ocr-samples/fictional-golden.png';
    const expectedUrl = new URL(samplePath, globalThis.location.href);
    const response = await fetch(samplePath, {
      method: 'GET',
      redirect: 'error',
      credentials: 'same-origin',
    });
    if (!isPreparationCurrent(token, sourceSnapshot)) return;
    if (!response.ok) throw new Error('fixture unavailable');
    let responseUrl: URL;
    try {
      if (response.redirected || !response.url) throw new Error('unexpected fixture response');
      responseUrl = new URL(response.url);
    } catch {
      throw new Error('unexpected fixture response');
    }
    if (
      responseUrl.origin !== globalThis.location.origin
      || responseUrl.href !== expectedUrl.href
    ) {
      throw new Error('unexpected fixture response');
    }
    const blob = await response.blob();
    if (!isPreparationCurrent(token, sourceSnapshot)) return;
    if (
      !(blob instanceof Blob)
      || blob.size <= 0
      || blob.size > IMAGE_POLICY.maxBytes
      || !(IMAGE_POLICY.acceptedMimeTypes as readonly string[]).includes(blob.type)
    ) {
      throw new Error('invalid fixture');
    }
    const file = new File([blob], 'fictional-golden.png', { type: blob.type });
    if (!isPreparationCurrent(token, sourceSnapshot)) return;
    await prepareFile(file);
  } catch {
    if (isPreparationCurrent(token, sourceSnapshot)) {
      errorMessage.value = '无法载入本地虚构样例，请稍后重试。';
      isPreparing.value = false;
    }
  }
}

function refreshWorkspace(): void {
  const controller = workspaceController.value;
  if (controller === null) return;
  workspaceSnapshot.value = controller.snapshot();
}

function runWorkspaceCommand(command: (controller: ImageWorkspaceController) => void): void {
  const controller = workspaceController.value;
  if (controller === null) return;
  try {
    command(controller);
    refreshWorkspace();
    errorMessage.value = null;
  } catch (error) {
    errorMessage.value = describeLocalError(error);
  }
}

function rotateWorkspace(direction: 'LEFT' | 'RIGHT'): void {
  runWorkspaceCommand((controller) => controller.rotate(direction));
}

function setWorkspaceCrop(crop: PixelRect | null): void {
  runWorkspaceCommand((controller) => controller.setCrop(crop));
}

function addWorkspaceRedaction(redaction: PixelRect): void {
  runWorkspaceCommand((controller) => controller.addRedaction(redaction));
}

function removeWorkspaceRedaction(index: number): void {
  runWorkspaceCommand((controller) => controller.removeRedaction(index));
}

function clearWorkspaceRedactions(): void {
  runWorkspaceCommand((controller) => controller.clearRedactions());
}

function handleProgress(
  selection: number,
  attempt: number,
  controller: OcrRunController,
  event: OcrProgressEvent,
): void {
  if (!isRunCurrent(selection, attempt, controller)) return;
  progress.value = Math.round(Math.min(1, Math.max(0, event.progress)) * 95);
  if (event.status.toLowerCase().includes('recogn')) stage.value = 'RECOGNIZING';
}

function handleWarning(
  selection: number,
  attempt: number,
  controller: OcrRunController,
  warning: OcrWarning,
): void {
  if (isRunCurrent(selection, attempt, controller)) cacheWarning.value = warning.message;
}

function createRunController(selection: number, attempt: number): OcrRunController {
  let controller!: OcrRunController;
  controller = new OcrRunController({
    createAdapter: () => {
      const adapter = new TesseractOcrAdapter({
        onProgress: (event) => handleProgress(selection, attempt, controller, event),
        onWarning: (warning) => handleWarning(selection, attempt, controller, warning),
      });
      return {
        async recognize(canvas) {
          const result = await adapter.recognize(canvas);
          if (isRunCurrent(selection, attempt, controller)) {
            stage.value = 'MAPPING';
            progress.value = 97;
          }
          return result;
        },
        terminate: () => adapter.terminate(),
      };
    },
  });
  return controller;
}

function isRunSetupCurrent(
  selection: number,
  attempt: number,
  workspace: ImageWorkspaceController,
  source: SourceDeclaration,
): boolean {
  return (
    selection === selectionToken
    && attempt === runToken
    && workspaceController.value === workspace
    && sourceDeclaration.value === source
    && sourceValid.value
  );
}

function isRunCurrent(
  selection: number,
  attempt: number,
  controller: OcrRunController,
): boolean {
  return (
    selection === selectionToken
    && attempt === runToken
    && runController.value === controller
  );
}

async function startOcr(): Promise<void> {
  const workspace = workspaceController.value;
  const source = sourceDeclaration.value;
  if (!sourceValid.value || workspace === null || source === null || runBusy.value) return;
  const selection = selectionToken;
  const attempt = ++runToken;
  const previousController = runController.value;
  runController.value = null;
  localSession.clear();
  meanConfidence.value = null;
  resetMessages();
  cacheWarning.value = null;
  stage.value = 'INITIALIZING';

  if (previousController !== null) {
    try {
      await previousController.dispose();
    } catch {
      // Controller disposal is best-effort; its attempt token is already invalid.
    }
  }
  if (!isRunSetupCurrent(selection, attempt, workspace, source)) return;

  let processed: ProcessedCanvasResult;
  try {
    processed = workspace.renderForOcr();
  } catch (error) {
    if (!isRunSetupCurrent(selection, attempt, workspace, source)) return;
    errorMessage.value = describeLocalError(error);
    stage.value = 'ERROR';
    return;
  }

  let controller: OcrRunController | null = null;
  try {
    controller = createRunController(selection, attempt);
    runController.value = controller;
    const result = await controller.run(processed);
    if (!isRunCurrent(selection, attempt, controller)) return;
    localSession.setResult(source, result);
    meanConfidence.value = result.meanConfidence;
    progress.value = 100;
    stage.value = 'SUCCESS';
  } catch (error) {
    if (controller === null || !isRunCurrent(selection, attempt, controller)) return;
    errorMessage.value = describeLocalError(error);
    stage.value = error instanceof OcrRunControllerError && error.code === 'OCR_CANCELLED'
      ? 'CANCELLED'
      : 'ERROR';
  }
}

function retryOcr(): void {
  if (stage.value === 'ERROR' && workspaceController.value !== null) void startOcr();
}

function createManualBlankResult(): OcrCandidateDraftSeed {
  return {
    candidateBatch: MANUAL_BLANK_CANDIDATE_BATCH,
    draftSeed: {
      matches: [],
      markets: [],
    },
    meanConfidence: 1,
  };
}

async function teardownSelection(nextStage: OcrStage): Promise<void> {
  const detached = invalidateSelection(nextStage);
  await disposeResources(detached);
}

async function cancelOcr(): Promise<void> {
  await teardownSelection('CANCELLED');
  transitionMessage.value = '识别已取消，本地图片和候选字段已清除。';
}

async function useManualEntry(): Promise<void> {
  const source = sourceDeclaration.value;
  if (!sourceValid.value || source === null) return;
  await teardownSelection('SUCCESS');
  localSession.setResult(source, createManualBlankResult());
  meanConfidence.value = null;
  transitionMessage.value = '已创建空白本地草稿，请继续人工核对。';
}

onBeforeUnmount(() => {
  const detached = invalidateSelection('IDLE');
  void disposeResources(detached);
});
</script>

<template>
  <section class="workflow-page" aria-labelledby="screenshot-upload-title">
    <div class="page-heading">
      <div>
        <p class="page-heading__eyebrow">ScreenshotUpload</p>
        <h2 id="screenshot-upload-title">截图本地 OCR</h2>
      </div>
      <p class="page-heading__notice">非官方 · 仅模拟分析/复盘 · 原图不上传</p>
    </div>

    <div class="policy-panel" role="note">
      <strong>阶段边界</strong>
      <p>图片、完整识别文本和逐词结果只在当前浏览器内处理；本页仅保留最小结构化候选，且不会进入 AI 分析。</p>
    </div>

    <SourceDeclarationPanel
      :model-value="sourceDeclaration"
      :acknowledgements="acknowledgements"
      @update:model-value="handleSourceChange"
      @update:acknowledgements="handleAcknowledgements"
    />

    <section class="tool-panel" aria-labelledby="upload-panel-title">
      <h3 id="upload-panel-title">选择本地图片</h3>
      <p class="helper-text">仅接受 PNG、JPEG、WebP；不会显示或保存原始文件名。</p>
      <label class="file-control" for="localOcrImage">
        <span>选择本人拥有或已获授权的图片</span>
        <input
          id="localOcrImage"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          :disabled="!sourceValid || isPreparing"
          @change="handleFileChange"
        />
      </label>
      <button
        type="button"
        class="action-button"
        data-testid="fictional-sample"
        :disabled="isPreparing || runBusy"
        @click="loadFictionalSample"
      >
        使用同源虚构样例
      </button>

      <dl v-if="imageHeader && selectedFile" class="meta-list" aria-label="本地图片元数据">
        <div><dt>内容类型</dt><dd>{{ imageHeader.mimeType }}</dd></div>
        <div><dt>字节数</dt><dd>{{ selectedFile.size }}</dd></div>
        <div><dt>图片尺寸</dt><dd>{{ imageHeader.width }} × {{ imageHeader.height }}</dd></div>
      </dl>
      <div v-if="errorMessage" class="state-panel state-panel--error" role="alert">
        <p>{{ errorMessage }}</p>
      </div>
      <p v-if="transitionMessage" class="helper-text" role="status">{{ transitionMessage }}</p>
    </section>

    <ImageWorkspace
      :workspace="workspaceSnapshot"
      :disabled="isPreparing || runBusy"
      @rotate="rotateWorkspace"
      @set-crop="setWorkspaceCrop"
      @add-redaction="addWorkspaceRedaction"
      @remove-redaction="removeWorkspaceRedaction"
      @clear-redactions="clearWorkspaceRedactions"
    />

    <OcrRunPanel
      :stage="stage"
      :progress="progress"
      :mean-confidence="meanConfidence"
      :cache-warning="cacheWarning"
      :disabled="runDisabled"
      :can-retry="stage === 'ERROR' && workspaceSnapshot !== null"
      :can-cancel="runBusy"
      @start="startOcr"
      @cancel="cancelOcr"
      @retry="retryOcr"
      @manual-entry="useManualEntry"
    />

    <section class="tool-panel" aria-labelledby="candidate-preview-title">
      <h3 id="candidate-preview-title">最小结构化候选预览</h3>
      <dl
        v-if="localSession.candidateBatch"
        class="meta-list"
        aria-label="OCR 结构化候选字段"
      >
        <div v-for="field in localSession.candidateBatch.fields" :key="field.fieldId">
          <dt>{{ field.fieldName }} · {{ Math.round(field.confidence * 100) }}%</dt>
          <dd>{{ field.fieldValue || '待人工补充' }}</dd>
        </div>
      </dl>
      <div v-else class="state-panel" role="status">
        <p>尚无结构化候选字段。</p>
      </div>
      <a
        v-if="localSession.candidateBatch"
        class="primary-button"
        data-testid="continue-review"
        href="/ocr-review"
      >
        继续人工核对
      </a>
      <button
        v-else
        type="button"
        class="primary-button"
        data-testid="continue-review-unavailable"
        disabled
      >
        等待本地候选
      </button>
    </section>
  </section>
</template>
