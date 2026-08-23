package org.footballlab.analysis.domain;

import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;
import org.footballlab.strategy.domain.StrategyParameterRequest;

public record AnalysisReportResponse(
        String reportId,
        String snapshotId,
        String inputSourceType,
        String engineType,
        String reportStatus,
        StrategyParameterRequest strategyParameters,
        List<ProbabilityInsightResponse> probabilityAnalysis,
        List<RiskWarningResponse> riskWarnings,
        List<SimulatedSelectionResponse> simulatedSelections,
        String complianceNotice,
        String generatedAt,
        String providerKey,
        String modelId,
        String promptVersion,
        String safetyStatus,
        String llmAuditId,
        JsonNode llmOutput,
        String workflowId,
        String authorityType,
        String schemaVersion,
        String strategyDefaultsVersion,
        Long authorityRevision) {

    public AnalysisReportResponse(
            String reportId,
            String snapshotId,
            String inputSourceType,
            String engineType,
            String reportStatus,
            StrategyParameterRequest strategyParameters,
            List<ProbabilityInsightResponse> probabilityAnalysis,
            List<RiskWarningResponse> riskWarnings,
            List<SimulatedSelectionResponse> simulatedSelections,
            String complianceNotice,
            String generatedAt,
            String providerKey,
            String modelId,
            String promptVersion,
            String safetyStatus,
            String llmAuditId,
            JsonNode llmOutput) {
        this(
                reportId,
                snapshotId,
                inputSourceType,
                engineType,
                reportStatus,
                strategyParameters,
                probabilityAnalysis,
                riskWarnings,
                simulatedSelections,
                complianceNotice,
                generatedAt,
                providerKey,
                modelId,
                promptVersion,
                safetyStatus,
                llmAuditId,
                llmOutput,
                null,
                null,
                "LEGACY_V1",
                null,
                null);
    }
}
