package org.footballlab.analysis.domain;

import java.math.BigDecimal;
import java.util.List;

import org.footballlab.strategy.domain.StrategyParameterRequest;

public record AnalysisGenerateRequest(
        String snapshotId,
        String sourceType,
        boolean analysisAllowed,
        String riskPreference,
        BigDecimal budgetAmount,
        String currency,
        String engineMode,
        String providerKey,
        String modelId,
        String promptVersion,
        StrategyParameterRequest strategyParameters,
        List<AnalysisMatchRequest> matches,
        List<AnalysisMarketRequest> markets) {
}
