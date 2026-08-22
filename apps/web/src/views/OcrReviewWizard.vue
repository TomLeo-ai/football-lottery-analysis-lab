<script setup lang="ts">
import { onMounted, ref } from 'vue';

import ReviewDraftEditor from '@/components/ocr/ReviewDraftEditor.vue';
import { buildLocalReviewDraft } from '@/review/reviewDraftValidation';
import { useLocalOcrSessionStore } from '@/stores/localOcrSession';
import type { LocalReviewDraft } from '@/types/ocrWorkflow';

const localSession = useLocalOcrSessionStore();
const localDraft = ref<LocalReviewDraft | null>(null);

onMounted(() => {
  if (
    localSession.sourceDeclaration !== null
    && localSession.candidateBatch !== null
    && localSession.draftSeed !== null
  ) {
    localDraft.value = buildLocalReviewDraft({
      sourceDeclaration: localSession.sourceDeclaration,
      candidateBatch: localSession.candidateBatch,
      draftSeed: localSession.draftSeed,
      meanConfidence: localSession.meanConfidence,
    });
    localSession.clear();
  }
});
</script>

<template>
  <section class="workflow-page" aria-labelledby="ocr-review-title">
    <div class="page-heading">
      <div>
        <p class="page-heading__eyebrow">OcrReviewWizard</p>
        <h2 id="ocr-review-title">OCR 本地人工核对</h2>
      </div>
      <p class="page-heading__notice">本地草稿 · 尚未持久化 · 不进入 AI 分析</p>
    </div>

    <div class="policy-panel" role="note">
      <strong>阶段边界</strong>
      <p>
        本页只编辑最小结构化候选生成的本地草稿；不会保存、确认或调用后端接口。
        候选证据和最终人工值分开显示。
      </p>
    </div>

    <div v-if="!localDraft" class="state-panel" role="status">
      <div>
        <strong>本地草稿尚未持久化</strong>
        <p>刷新或直接进入此页后，本阶段不会恢复“最新”任务，也不会生成硬编码演示数据。</p>
      </div>
      <a class="external-link" href="/screenshot-upload">返回上传</a>
    </div>

    <ReviewDraftEditor
      v-else
      v-model="localDraft"
    />
  </section>
</template>
