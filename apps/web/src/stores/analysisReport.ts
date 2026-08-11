import { defineStore } from 'pinia';

import type { AnalysisReport } from '@/types/analysis';

interface AnalysisReportState {
  currentReport: AnalysisReport | null;
}

export const useAnalysisReportStore = defineStore('analysisReport', {
  state: (): AnalysisReportState => ({
    currentReport: null
  }),
  actions: {
    setReport(report: AnalysisReport) {
      this.currentReport = report;
    }
  }
});

