package org.footballlab.analysis.persistence;

import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;
import org.footballlab.analysis.domain.AnalysisReportResponse;
import org.footballlab.analysis.domain.ProbabilityInsightResponse;
import org.footballlab.analysis.domain.RiskWarningResponse;
import org.footballlab.analysis.domain.SimulatedSelectionResponse;
import org.footballlab.strategy.domain.StrategyParameterRequest;

public record AnalysisReportV2Record(
        String workflowId,
        String reportId,
        String snapshotId,
        long authorityRevision,
        String authorityType,
        String inputSourceType,
        String engineType,
        String reportStatus,
        StrategyParameterRequest strategyParameters,
        String strategyDefaultsVersion,
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

    public static final String AUTHORITY_TYPE = "SERVER_GENERATED_ANALYSIS_V2";

    public AnalysisReportV2Record {
        requireText(workflowId, "workflowId");
        requireText(reportId, "reportId");
        requireText(snapshotId, "snapshotId");
        if (authorityRevision < 1) {
            throw new IllegalArgumentException("authorityRevision must be positive for analysis report v2.");
        }
        requireText(authorityType, "authorityType");
        if (!AUTHORITY_TYPE.equals(authorityType)) {
            throw new IllegalArgumentException("authorityType must identify a server-generated v2 report.");
        }
        requireText(inputSourceType, "inputSourceType");
        requireText(engineType, "engineType");
        requireText(reportStatus, "reportStatus");
        if (strategyParameters == null) {
            throw new IllegalArgumentException("strategyParameters are required for analysis report v2.");
        }
        requireText(strategyDefaultsVersion, "strategyDefaultsVersion");
        requireText(complianceNotice, "complianceNotice");
        requireText(generatedAt, "generatedAt");
        requireText(safetyStatus, "safetyStatus");
        probabilityAnalysis = requireList(probabilityAnalysis, "probabilityAnalysis");
        riskWarnings = requireList(riskWarnings, "riskWarnings");
        simulatedSelections = requireList(simulatedSelections, "simulatedSelections");
    }

    public AnalysisReportResponse toResponse() {
        return new AnalysisReportResponse(
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
                workflowId,
                authorityType,
                AnalysisReportPayloadV2.SCHEMA_VERSION,
                strategyDefaultsVersion,
                authorityRevision);
    }

    public AnalysisReportPayloadV2 toPayload() {
        return new AnalysisReportPayloadV2(
                AnalysisReportPayloadV2.SCHEMA_VERSION,
                workflowId,
                reportId,
                snapshotId,
                authorityRevision,
                authorityType,
                inputSourceType,
                engineType,
                reportStatus,
                strategyParameters,
                strategyDefaultsVersion,
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
                llmOutput);
    }

    public static AnalysisReportV2Record fromResponse(
            AnalysisReportResponse response,
            String workflowId,
            long authorityRevision,
            String authorityType,
            String strategyDefaultsVersion) {
        return new AnalysisReportV2Record(
                workflowId,
                response.reportId(),
                response.snapshotId(),
                authorityRevision,
                authorityType,
                response.inputSourceType(),
                response.engineType(),
                response.reportStatus(),
                response.strategyParameters(),
                strategyDefaultsVersion,
                response.probabilityAnalysis(),
                response.riskWarnings(),
                response.simulatedSelections(),
                response.complianceNotice(),
                response.generatedAt(),
                response.providerKey(),
                response.modelId(),
                response.promptVersion(),
                response.safetyStatus(),
                response.llmAuditId(),
                response.llmOutput());
    }

    private static void requireText(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(fieldName + " is required for analysis report v2.");
        }
    }

    private static <T> List<T> requireList(List<T> value, String fieldName) {
        if (value == null) {
            throw new IllegalArgumentException(fieldName + " is required for analysis report v2.");
        }
        return List.copyOf(value);
    }
}
