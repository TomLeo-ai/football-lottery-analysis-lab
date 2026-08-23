import { defineStore } from 'pinia';

import type { AnalysisReport } from '@/types/analysis';

interface AnalysisReportState {
  reportsById: Record<string, AnalysisReport>;
}

export const useAnalysisReportStore = defineStore('analysisReport', {
  state: (): AnalysisReportState => ({
    reportsById: {},
  }),
  actions: {
    cacheReport(report: AnalysisReport) {
      this.reportsById[report.reportId] = report;
    },
    getReport(reportId: string): AnalysisReport | null {
      return this.reportsById[reportId] ?? null;
    },
  },
});

