import { defineStore } from 'pinia';

import { getConfirmedSnapshot, getOcrWorkflow } from '@/api/ocrWorkflow';
import type {
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
}

interface OcrWorkflowState {
  status: WorkflowHydrationStatus;
  activeWorkflowId: string | null;
  workflow: OcrWorkflowAggregate | null;
  screenshotTask: ScreenshotTask | null;
  reviewDraft: OcrTask | null;
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
  if (workflow.confirmedSnapshotId !== snapshot.snapshotId) return false;
  return snapshot.workflowId === undefined
    || snapshot.workflowId === null
    || snapshot.workflowId === workflow.workflowId;
}

export const useOcrWorkflowStore = defineStore('ocrWorkflow', {
  state: (): OcrWorkflowState => ({
    status: 'IDLE',
    activeWorkflowId: null,
    workflow: null,
    screenshotTask: null,
    reviewDraft: null,
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
      this.confirmedSnapshot = null;
    },
    setConfirmedSnapshot(snapshot: UserConfirmedSnapshot) {
      this.confirmedSnapshot = snapshot;
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
        this.confirmedSnapshot = null;
        this.errorMessage = error.message;
        throw error;
      }

      const fetchWorkflow = fetchers.fetchWorkflow ?? getOcrWorkflow;
      const fetchSnapshot = fetchers.fetchSnapshot ?? getConfirmedSnapshot;

      try {
        const workflow = await fetchWorkflow(workflowId);
        let snapshot: UserConfirmedSnapshot | null = null;
        if (workflow.confirmedSnapshotId !== null) {
          snapshot = await fetchSnapshot(workflow.confirmedSnapshotId);
          if (!snapshotBelongsToWorkflow(workflow, snapshot)) {
            throw new Error('工作流与确认快照不匹配，已阻断恢复。');
          }
        }
        if (token !== this.hydrationToken) return null;
        if (workflow.workflowId !== workflowId) {
          throw new Error('服务端返回了不同的工作流 ID，已阻断恢复。');
        }

        const existingDraft = this.reviewDraft?.ocrTaskId === workflow.currentOcrTaskId
          ? this.reviewDraft
          : null;

        this.workflow = workflow;
        this.activeWorkflowId = workflow.workflowId;
        this.reviewDraft = existingDraft;
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
  },
});
