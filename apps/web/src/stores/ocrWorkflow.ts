import { defineStore } from 'pinia';

import type { OcrTask, ScreenshotTask, UserConfirmedSnapshot } from '@/types/ocrWorkflow';

interface OcrWorkflowState {
  screenshotTask: ScreenshotTask | null;
  reviewDraft: OcrTask | null;
  confirmedSnapshot: UserConfirmedSnapshot | null;
}

export const useOcrWorkflowStore = defineStore('ocrWorkflow', {
  state: (): OcrWorkflowState => ({
    screenshotTask: null,
    reviewDraft: null,
    confirmedSnapshot: null
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
    }
  }
});

