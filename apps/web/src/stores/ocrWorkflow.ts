import { defineStore } from 'pinia';

import { getConfirmedSnapshot, getOcrReviewDraft, getOcrWorkflow } from '@/api/ocrWorkflow';
import type {
  OcrReviewDraftResponse,
  OcrTask,
  OcrWorkflowAggregate,
  ScreenshotTask,
  UserConfirmedSnapshot,
} from '@/types/ocrWorkflow';
import { clearWorkflowId, readWorkflowId, saveWorkflowId } from '@/workflow/workflowSession';

export type WorkflowHydrationStatus = 'IDLE' | 'LOADING' | 'READY' | 'ERROR';

export interface WorkflowHydrationFetchers {
  readonly fetchWorkflow?: (workflowId: string) => Promise<OcrWorkflowAggregate>;
  readonly fetchSnapshot?: (snapshotId: string) => Promise<UserConfirmedSnapshot>;
  readonly fetchDraft?: (ocrTaskId: string) => Promise<OcrReviewDraftResponse>;
}

interface OcrWorkflowState {
  status: WorkflowHydrationStatus;
  activeWorkflowId: string | null;
  workflow: OcrWorkflowAggregate | null;
  screenshotTask: ScreenshotTask | null;
  reviewDraft: OcrTask | null;
  persistedReviewDraft: OcrReviewDraftResponse | null;
  confirmedSnapshot: UserConfirmedSnapshot | null;
  snapshotsById: Record<string, UserConfirmedSnapshot>;
  errorMessage: string | null;
  hydrationToken: number;
}

const WORKFLOW_ID_PATTERN = /^workflow-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isWorkflowId(value: unknown): value is string {
  return typeof value === 'string' && WORKFLOW_ID_PATTERN.test(value);
}

function describeHydrationError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return '无法加载指定工作流。';
}

function snapshotBelongsToWorkflow(
  workflow: OcrWorkflowAggregate,
  snapshot: UserConfirmedSnapshot,
): boolean {
  return workflow.confirmedSnapshotId === snapshot.snapshotId
    && snapshot.workflowId === workflow.workflowId
    && snapshot.schemaVersion === 'CONFIRMED_SNAPSHOT_V2'
    && snapshot.authorityType === 'SERVER_CONFIRMED_V2'
    && snapshot.sourceType === 'USER_SCREENSHOT_CONFIRMED'
    && snapshot.snapshotStatus === 'CONFIRMED'
    && snapshot.analysisAllowed === true;
}

function hasId(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

function draftBelongsToWorkflow(
  workflow: OcrWorkflowAggregate,
  draft: OcrReviewDraftResponse,
): boolean {
  return workflow.currentStage === 'WAITING_USER_CONFIRMATION'
    && workflow.currentOcrTaskId === draft.ocrTaskId
    && workflow.workflowId === draft.workflowId
    && draft.draftStatus === 'ACTIVE'
    && draft.schemaVersion === 'OCR_REVIEW_DRAFT_V2';
}

function assertWorkflowAuthorityIds(workflow: OcrWorkflowAggregate): void {
  const hasSnapshot = hasId(workflow.confirmedSnapshotId);
  const hasReport = hasId(workflow.currentReportId);
  const hasPlan = hasId(workflow.currentPlanId);
  const valid = (() => {
    switch (workflow.currentStage) {
      case 'WAITING_LOCAL_OCR':
      case 'WAITING_USER_CONFIRMATION':
        return !hasSnapshot && !hasReport && !hasPlan;
      case 'CONFIRMED':
        return hasSnapshot && !hasReport && !hasPlan;
      case 'ANALYSIS_GENERATED':
        return hasSnapshot && hasReport && !hasPlan;
      case 'PLAN_GENERATED':
      case 'PENDING_RESULT':
        return hasSnapshot && hasReport && hasPlan;
      case 'ABANDONED':
        return !hasSnapshot && !hasReport && !hasPlan;
      default:
        return false;
    }
  })();
  if (!valid) throw new Error('工作流阶段与 authority ID 组合不一致，已阻断恢复。');
}

export const useOcrWorkflowStore = defineStore('ocrWorkflow', {
  state: (): OcrWorkflowState => ({
    status: 'IDLE',
    activeWorkflowId: null,
    workflow: null,
    screenshotTask: null,
    reviewDraft: null,
    persistedReviewDraft: null,
    confirmedSnapshot: null,
    snapshotsById: {},
    errorMessage: null,
    hydrationToken: 0,
  }),
  actions: {
    setScreenshotTask(task: ScreenshotTask) {
      this.screenshotTask = task;
    },
    setReviewDraft(task: OcrTask) {
      this.reviewDraft = task;
      this.persistedReviewDraft = null;
      this.confirmedSnapshot = null;
    },
    setPersistedReviewDraft(draft: OcrReviewDraftResponse) {
      this.persistedReviewDraft = draft;
    },
    setConfirmedSnapshot(snapshot: UserConfirmedSnapshot) {
      this.confirmedSnapshot = snapshot;
      this.persistedReviewDraft = null;
      this.snapshotsById[snapshot.snapshotId] = snapshot;
      if (snapshot.workflowId !== undefined && snapshot.workflowId !== null) {
        this.activeWorkflowId = snapshot.workflowId;
        saveWorkflowId(snapshot.workflowId);
      }
    },
    clearHydration() {
      this.status = 'IDLE';
      this.activeWorkflowId = null;
      this.workflow = null;
      this.reviewDraft = null;
      this.persistedReviewDraft = null;
      this.confirmedSnapshot = null;
      this.errorMessage = null;
      this.hydrationToken += 1;
      clearWorkflowId();
    },
    async hydrateWorkflow(
      workflowId: string,
      fetchers: WorkflowHydrationFetchers = {},
    ): Promise<OcrWorkflowAggregate | null> {
      const token = this.hydrationToken + 1;
      this.hydrationToken = token;
      this.status = 'LOADING';
      this.activeWorkflowId = workflowId;
      this.errorMessage = null;

      if (!isWorkflowId(workflowId)) {
        const error = new Error('工作流 ID 无效，已拒绝从 session 回退。');
        this.status = 'ERROR';
        this.workflow = null;
        this.reviewDraft = null;
        this.persistedReviewDraft = null;
        this.confirmedSnapshot = null;
        this.errorMessage = error.message;
        throw error;
      }

      const fetchWorkflow = fetchers.fetchWorkflow ?? getOcrWorkflow;
      const fetchSnapshot = fetchers.fetchSnapshot ?? getConfirmedSnapshot;
      const fetchDraft = fetchers.fetchDraft ?? getOcrReviewDraft;

      try {
        const workflow = await fetchWorkflow(workflowId);
        if (workflow.workflowId !== workflowId) {
          throw new Error('服务端返回了不同的工作流 ID，已阻断恢复。');
        }
        assertWorkflowAuthorityIds(workflow);
        let snapshot: UserConfirmedSnapshot | null = null;
        if (workflow.confirmedSnapshotId !== null) {
          snapshot = await fetchSnapshot(workflow.confirmedSnapshotId);
          if (!snapshotBelongsToWorkflow(workflow, snapshot)) {
            throw new Error('工作流与确认快照不匹配，已阻断恢复。');
          }
        }
        let persistedDraft: OcrReviewDraftResponse | null = null;
        if (
          workflow.currentStage === 'WAITING_USER_CONFIRMATION'
          && hasId(workflow.currentOcrTaskId)
        ) {
          const fetchedDraft = await fetchDraft(workflow.currentOcrTaskId);
          if (!draftBelongsToWorkflow(workflow, fetchedDraft)) {
            throw new Error('工作流与 OCR review draft 不匹配，已阻断恢复。');
          }
          // The server creates an empty revision-zero placeholder before the
          // operator has saved anything. It is authoritative, but not a
          // recoverable user draft.
          persistedDraft = fetchedDraft.revision > 0 ? fetchedDraft : null;
        }
        if (token !== this.hydrationToken) return null;

        const existingDraft = this.reviewDraft?.ocrTaskId === workflow.currentOcrTaskId
          ? this.reviewDraft
          : null;

        this.workflow = workflow;
        this.activeWorkflowId = workflow.workflowId;
        this.reviewDraft = existingDraft;
        this.persistedReviewDraft = persistedDraft;
        this.confirmedSnapshot = snapshot;
        if (snapshot !== null) this.snapshotsById[snapshot.snapshotId] = snapshot;
        this.status = 'READY';
        this.errorMessage = null;
        saveWorkflowId(workflow.workflowId);
        return workflow;
      } catch (error) {
        if (token !== this.hydrationToken) return null;
        this.status = 'ERROR';
        this.workflow = null;
        this.reviewDraft = null;
        this.persistedReviewDraft = null;
        this.confirmedSnapshot = null;
        this.errorMessage = describeHydrationError(error);
        throw error;
      }
    },
    async hydrateFromSession(
      fetchers: WorkflowHydrationFetchers = {},
    ): Promise<OcrWorkflowAggregate | null> {
      const workflowId = readWorkflowId();
      if (workflowId === null) {
        this.clearHydration();
        return null;
      }
      return this.hydrateWorkflow(workflowId, fetchers);
    },
    async refreshActiveWorkflow(
      fetchers: WorkflowHydrationFetchers = {},
    ): Promise<OcrWorkflowAggregate | null> {
      const workflowId = this.activeWorkflowId;
      if (workflowId === null || !isWorkflowId(workflowId)) return null;
      const token = this.hydrationToken + 1;
      this.hydrationToken = token;
      const fetchWorkflow = fetchers.fetchWorkflow ?? getOcrWorkflow;
      const fetchSnapshot = fetchers.fetchSnapshot ?? getConfirmedSnapshot;

      try {
        const workflow = await fetchWorkflow(workflowId);
        if (workflow.workflowId !== workflowId) {
          throw new Error('服务端返回了不同的工作流 ID，已阻断刷新。');
        }
        assertWorkflowAuthorityIds(workflow);
        let snapshot: UserConfirmedSnapshot | null = this.confirmedSnapshot;
        if (workflow.confirmedSnapshotId !== null) {
          if (snapshot === null
            || snapshot.snapshotId !== workflow.confirmedSnapshotId
            || !snapshotBelongsToWorkflow(workflow, snapshot)) {
            snapshot = await fetchSnapshot(workflow.confirmedSnapshotId);
          }
          if (!snapshotBelongsToWorkflow(workflow, snapshot)) {
            throw new Error('工作流与确认快照不匹配，已阻断刷新。');
          }
        } else {
          snapshot = null;
        }
        if (token !== this.hydrationToken) return null;

        this.workflow = workflow;
        this.activeWorkflowId = workflow.workflowId;
        if (
          workflow.currentStage !== 'WAITING_USER_CONFIRMATION'
          || workflow.currentOcrTaskId !== this.persistedReviewDraft?.ocrTaskId
        ) {
          this.persistedReviewDraft = null;
        }
        this.confirmedSnapshot = snapshot;
        if (snapshot !== null) this.snapshotsById[snapshot.snapshotId] = snapshot;
        this.errorMessage = null;
        saveWorkflowId(workflow.workflowId);
        return workflow;
      } catch (error) {
        if (token !== this.hydrationToken) return null;
        this.errorMessage = describeHydrationError(error);
        throw error;
      }
    },
  },
});
