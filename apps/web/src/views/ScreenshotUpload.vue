<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';

import { createScreenshotTask, parseLocalOcrResult } from '@/api/ocrWorkflow';
import { useOcrWorkflowStore } from '@/stores/ocrWorkflow';

const SAMPLE_LABEL = 'DEMO DATA / FICTIONAL SAMPLE';

const workflowStore = useOcrWorkflowStore();
const selectedFile = ref<File | null>(null);
const isLoading = ref(false);
const errorMessage = ref('');
const statusMessage = ref('');

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  selectedFile.value = input.files?.[0] ?? null;
}

async function runDemoOcr() {
  isLoading.value = true;
  errorMessage.value = '';
  statusMessage.value = '';

  try {
    const file = selectedFile.value;
    const screenshotTask = await createScreenshotTask({
      fileName: file?.name ?? 'fictional-demo-slip.png',
      contentType: file?.type || 'image/png',
      fileSize: file?.size ?? 204800,
      sampleLabel: SAMPLE_LABEL
    });

    workflowStore.setScreenshotTask(screenshotTask);

    const ocrTask = await parseLocalOcrResult({
      screenshotTaskId: screenshotTask.taskId,
      ocrProvider: 'BROWSER_LOCAL_MOCK',
      rawText:
        'DEMO DATA / FICTIONAL SAMPLE\nFictional Coastal League\nNorthport United vs Lakeside City',
      fields: [
        {
          fieldName: 'league',
          fieldValue: 'Fictional Coastal League',
          confidence: 0.96,
          sourceRegion: 'x=12,y=20,w=180,h=32'
        },
        {
          fieldName: 'homeTeam',
          fieldValue: 'Northport United',
          confidence: 0.94,
          sourceRegion: 'x=12,y=64,w=180,h=32'
        },
        {
          fieldName: 'awayTeam',
          fieldValue: 'Lakeside City',
          confidence: 0.93,
          sourceRegion: 'x=220,y=64,w=160,h=32'
        }
      ]
    });

    workflowStore.setReviewDraft(ocrTask);
    statusMessage.value = ocrTask.status;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '截图 OCR 流程启动失败';
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <section class="workflow-page" aria-labelledby="screenshot-upload-title">
    <div class="page-heading">
      <div>
        <p class="page-heading__eyebrow">ScreenshotUpload</p>
        <h2 id="screenshot-upload-title">虚构截图上传与本地 OCR</h2>
      </div>
      <p class="page-heading__notice">非官方 · 仅模拟分析/复盘 · 本阶段不进入 AI 分析</p>
    </div>

    <div class="policy-panel" role="note">
      <strong>阶段边界</strong>
      <p>
        上传控件用于虚构样例或用户自有截图。服务端 OCR 默认关闭；本页只提交本地 OCR/Mock OCR
        结果，且未经人工确认，OCR 数据不会进入 AI 分析。
      </p>
    </div>

    <div class="workflow-grid">
      <section class="tool-panel" aria-labelledby="upload-panel-title">
        <h3 id="upload-panel-title">1. 上传或使用虚构样例</h3>
        <p class="helper-text">{{ SAMPLE_LABEL }}</p>

        <label class="file-control" for="fictionalScreenshot">
          <span>选择截图文件</span>
          <input id="fictionalScreenshot" type="file" accept="image/*" @change="handleFileChange" />
        </label>

        <dl class="meta-list">
          <div>
            <dt>当前文件</dt>
            <dd>{{ selectedFile?.name ?? 'fictional-demo-slip.png' }}</dd>
          </div>
          <div>
            <dt>服务端 OCR</dt>
            <dd>默认关闭</dd>
          </div>
        </dl>

        <button
          type="button"
          class="action-button"
          data-testid="demo-ocr-button"
          :disabled="isLoading"
          @click="runDemoOcr"
        >
          {{ isLoading ? '解析中...' : '使用虚构样例解析 OCR' }}
        </button>
      </section>

      <section class="tool-panel" aria-labelledby="ocr-status-title">
        <h3 id="ocr-status-title">2. OCR 待确认结果</h3>

        <div v-if="errorMessage" class="state-panel state-panel--error" role="alert">
          <strong>截图 OCR 流程启动失败</strong>
          <p>{{ errorMessage }}</p>
        </div>

        <div v-else-if="statusMessage" class="state-panel state-panel--success" aria-live="polite">
          <div>
            <strong>{{ statusMessage }}</strong>
            <p>未经人工确认，OCR 数据不会进入 AI 分析。</p>
            <p>{{ workflowStore.screenshotTask?.sampleLabel }}</p>
          </div>
          <RouterLink class="external-link" to="/ocr-review">进入人工确认</RouterLink>
        </div>

        <div v-else class="state-panel">
          <strong>等待上传</strong>
          <p>点击左侧按钮后会创建截图任务，并生成待人工确认的本地 OCR 字段。</p>
        </div>
      </section>
    </div>
  </section>
</template>

