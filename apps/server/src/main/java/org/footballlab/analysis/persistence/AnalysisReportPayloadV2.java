package org.footballlab.analysis.persistence;

import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;
import org.footballlab.analysis.domain.ProbabilityInsightResponse;
import org.footballlab.analysis.domain.RiskWarningResponse;
import org.footballlab.analysis.domain.SimulatedSelectionResponse;
import org.footballlab.strategy.domain.StrategyParameterRequest;

public record AnalysisReportPayloadV2(
        String schemaVersion,
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

    public static final String SCHEMA_VERSION = "ANALYSIS_REPORT_V2";
}
