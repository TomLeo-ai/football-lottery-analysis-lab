package org.footballlab.plan.domain;

import java.math.BigDecimal;
import java.util.List;

import org.footballlab.analysis.domain.ProbabilityInsightResponse;
import org.footballlab.analysis.domain.RiskWarningResponse;
import org.footballlab.analysis.domain.SimulatedSelectionResponse;
import org.footballlab.strategy.domain.StrategyParameterRequest;

public record StrategySimulationRequest(
        String reportId,
        String snapshotId,
        String inputSourceType,
        String engineType,
        String reportStatus,
        String currency,
        BigDecimal budgetAmount,
        StrategyParameterRequest strategyParameters,
        List<ProbabilityInsightResponse> probabilityAnalysis,
        List<RiskWarningResponse> riskWarnings,
        List<SimulatedSelectionResponse> simulatedSelections) {
}
