<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { ApiRequestError } from '@/api/http';
import { confirmOcrReviewDraft, saveOcrReviewDraft } from '@/api/ocrWorkflow';
import TrialDataNotice from '@/components/TrialDataNotice.vue';
import ReviewDraftEditor from '@/components/ocr/ReviewDraftEditor.vue';
import {
  buildLocalReviewDraft,
  toSaveOcrReviewDraftRequest,
} from '@/review/reviewDraftValidation';
import { useLocalOcrSessionStore } from '@/stores/localOcrSession';
import { useOcrWorkflowStore } from '@/stores/ocrWorkflow';
import type { LocalReviewDraft, OcrReviewDraftResponse } from '@/types/ocrWorkflow';

const localSession = useLocalOcrSessionStore();
const workflowStore = useOcrWorkflowStore();
const localDraft = ref<LocalReviewDraft | null>(null);
const baselineJson = ref('');
const revision = ref<number | null>(null);
const statusMessage = ref<string | null>(null);
const serverErrors = ref<string[]>([]);
const busy = ref(false);

const activeOcrTaskId = computed(() => (
  workflowStore.reviewDraft?.ocrTaskId
  ?? workflowStore.persistedReviewDraft?.ocrTaskId
  ?? null
));

const dirty = computed(() => (
  localDraft.value !== null && JSON.stringify(localDraft.value) !== baselineJson.value
));

function createIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

function rememberBaseline(): void {
  baselineJson.value = localDraft.value === null ? '' : JSON.stringify(localDraft.value);
}

function describeServerError(error: unknown): string[] {
  if (error instanceof ApiRequestError) {
    if (error.fieldErrors.length > 0) {
      return error.fieldErrors.map((entry) => `${entry.fieldPath}: ${entry.message}`);
    }
    return [`${error.errorCode}: ${error.message}`];
  }
  return ['请求失败，请重试。'];
}

function restoreLocalDraft(draft: OcrReviewDraftResponse): LocalReviewDraft {
  return {
    status: 'LOCAL_EDITING',
    sourceDeclaration: null,
    analysisAllowed: false,
    budgetAmount: draft.budgetAmount ?? 20,
    currency: draft.currency ?? 'CNY',
    riskPreference: draft.riskPreference ?? 'BALANCED',
    candidateBatch: {
      schemaVersion: 'OCR_CANDIDATE_V2',
      processedImage: {
        schemaVersion: 'IMAGE_TRANSFORM_V1',
        sourceSize: { width: 0, height: 0 },
        normalizedSize: { width: 0, height: 0 },
        rotation: 0,
        crop: null,
        redactions: [],
        processedSize: { width: 0, height: 0 },
      },
      fields: [],
    },
    meanConfidence: null,
    matches: draft.matches.map((match) => ({
      draftMatchKey: match.matchId,
      matchDate: match.matchDate,
      league: match.league,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      kickoffTime: match.kickoffTime,
      evidence: {},
    })),
    markets: draft.markets.map((market) => ({
      draftMarketKey: market.marketId,
      draftMatchKey: market.matchId,
      playType: market.playType,
      selection: market.selection,
      odds: String(market.odds),
      evidence: {},
    })),
  };
}

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
    revision.value = 0;
    localSession.clear();
    return;
  }

  const persistedDraft = workflowStore.persistedReviewDraft;
  if (persistedDraft !== null) {
    localDraft.value = restoreLocalDraft(persistedDraft);
    revision.value = persistedDraft.revision;
    rememberBaseline();
    statusMessage.value = `已从服务端恢复 revision ${persistedDraft.revision}，可继续编辑或确认。`;
  }
});

async function saveDraft(): Promise<void> {
  if (localDraft.value === null || revision.value === null || activeOcrTaskId.value === null) return;
  busy.value = true;
  serverErrors.value = [];
  statusMessage.value = null;
  try {
    const response = await saveOcrReviewDraft(
      activeOcrTaskId.value,
      toSaveOcrReviewDraftRequest(localDraft.value, revision.value),
      createIdempotencyKey(),
    );
    workflowStore.setPersistedReviewDraft(response);
    revision.value = response.revision;
    rememberBaseline();
    statusMessage.value = `草稿已保存，revision ${response.revision}。`;
  } catch (error) {
    serverErrors.value = describeServerError(error);
  } finally {
    busy.value = false;
  }
}

async function confirmDraft(): Promise<void> {
  if (localDraft.value === null || revision.value === null || activeOcrTaskId.value === null || dirty.value) return;
  busy.value = true;
  serverErrors.value = [];
  statusMessage.value = null;
  try {
    const snapshot = await confirmOcrReviewDraft(
      activeOcrTaskId.value,
      { expectedRevision: revision.value },
      createIdempotencyKey(),
    );
    workflowStore.setConfirmedSnapshot(snapshot);
    statusMessage.value = `已确认快照：${snapshot.snapshotId}`;
  } catch (error) {
    serverErrors.value = describeServerError(error);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="workflow-page" aria-labelledby="ocr-review-title">
    <div class="page-heading">
      <div>
        <p class="page-heading__eyebrow">OcrReviewWizard</p>
        <h2 id="ocr-review-title">OCR 本地人工核对</h2>
      </div>
      <p class="page-heading__notice">本地草稿 · 保存后确认快照 · 不进入 AI 分析</p>
    </div>

    <TrialDataNotice compact />

    <div class="policy-panel" role="note">
      <strong>阶段边界</strong>
      <p>
        本页只编辑最小结构化候选生成的本地草稿；保存草稿后才能确认不可变快照。
        候选证据和最终人工值分开显示，确认前不会进入 AI 分析。
      </p>
    </div>

    <div v-if="!localDraft" class="state-panel" role="status">
      <div>
        <strong>本地草稿尚未持久化</strong>
        <p>当前显式工作流没有可恢复的活动草稿；不会跨工作流寻找“最新”任务，也不会生成硬编码演示数据。</p>
      </div>
      <a class="external-link" href="/screenshot-upload">返回上传</a>
    </div>

    <ReviewDraftEditor
      v-else
      v-model="localDraft"
      :revision="revision"
      :dirty="dirty"
      :busy="busy"
      :status-message="statusMessage"
      :server-errors="serverErrors"
      @save="saveDraft"
      @confirm="confirmDraft"
    />
  </section>
</template>
