package org.footballlab.analysis.persistence;

import org.footballlab.analysis.domain.AnalysisReportResponse;

public final class LegacyAnalysisReportAdapter {

    private static final String LEGACY_SCHEMA_VERSION = "LEGACY_V1";

    private LegacyAnalysisReportAdapter() {
    }

    public static AnalysisReportResponse adapt(AnalysisReportResponse legacyReport) {
        if (legacyReport == null) {
            throw new IllegalArgumentException("legacyReport must not be null.");
        }
        return new AnalysisReportResponse(
                legacyReport.reportId(),
                legacyReport.snapshotId(),
                legacyReport.inputSourceType(),
                legacyReport.engineType(),
                legacyReport.reportStatus(),
                legacyReport.strategyParameters(),
                legacyReport.probabilityAnalysis(),
                legacyReport.riskWarnings(),
                legacyReport.simulatedSelections(),
                legacyReport.complianceNotice(),
                legacyReport.generatedAt(),
                legacyReport.providerKey(),
                legacyReport.modelId(),
                legacyReport.promptVersion(),
                legacyReport.safetyStatus(),
                legacyReport.llmAuditId(),
                legacyReport.llmOutput(),
                null,
                null,
                LEGACY_SCHEMA_VERSION,
                null,
                null);
    }
}
