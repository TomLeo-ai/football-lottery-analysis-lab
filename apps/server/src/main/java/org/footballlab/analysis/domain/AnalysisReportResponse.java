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
        JsonNode llmOutput) {
}
